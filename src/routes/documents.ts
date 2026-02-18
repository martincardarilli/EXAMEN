import { Router, Request, Response } from 'express';
import multer from 'multer';
import pool from '../db';
import { authorize } from '../middleware/authorize';
import { uploadFile } from '../storage';
import { User } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to get user from request
function getUser(req: Request): User {
  return (req as any).user;
}

// POST /documents — upload a new document
router.post('/', authorize('admin', 'doctor'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { patientId } = req.body;

    if (!patientId) {
      res.status(400).json({ error: 'patientId is required' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'file is required' });
      return;
    }

    // Upload file to storage (S3 mock)
    const fileKey = await uploadFile(req.file.buffer, req.file.originalname);

    // Save metadata to database
    const result = await pool.query(
      `INSERT INTO documents (patient_id, doctor_id, file_key)
       VALUES ($1, $2, $3)
       RETURNING id, patient_id, doctor_id, file_key, created_at`,
      [patientId, user.id, fileKey]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /documents — list documents accessible to the current user
router.get('/', authorize('admin', 'doctor', 'patient'), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    let result;

    if (user.role === 'admin') {
      // Admin sees everything
      result = await pool.query('SELECT * FROM documents ORDER BY created_at DESC');
    } else if (user.role === 'doctor') {
      // Doctor sees only documents they uploaded
      result = await pool.query(
        'SELECT * FROM documents WHERE doctor_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
    } else {
      // Patient sees only their own documents
      result = await pool.query(
        'SELECT * FROM documents WHERE patient_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /documents/:id — get a single document's metadata
router.get('/:id', authorize('admin', 'doctor', 'patient'), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const doc = result.rows[0];

    // Check resource-level access
    if (user.role === 'doctor' && doc.doctor_id !== user.id) {
      res.status(403).json({ error: 'You can only view documents you created' });
      return;
    }

    if (user.role === 'patient' && doc.patient_id !== user.id) {
      res.status(403).json({ error: 'You can only view your own documents' });
      return;
    }

    // Admin passes through — no extra check needed

    res.json(doc);
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
