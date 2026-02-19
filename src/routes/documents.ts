import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import pool from '../db';
import logger, { auditLogger } from '../logger';
import { authorize } from '../middleware/authorize';
import { uploadFile } from '../storage';
import { User } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Validation schemas
const uploadSchema = z.object({
  patientId: z.string().min(1, 'patientId is required'),
});

const idParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// Helper to get user from request
function getUser(req: Request): User {
  return (req as any).user;
}

// POST /documents — upload a new document
router.post('/', authorize('admin', 'doctor'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    // Validate input
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'file is required' });
      return;
    }

    const { patientId } = parsed.data;

    // Upload file to storage (S3 mock)
    const fileKey = await uploadFile(req.file.buffer, req.file.originalname);

    // Save metadata to database
    const result = await pool.query(
      `INSERT INTO documents (patient_id, doctor_id, file_key)
       VALUES ($1, $2, $3)
       RETURNING id, patient_id, doctor_id, file_key, created_at`,
      [patientId, user.id, fileKey]
    );

    logger.info('Document uploaded', {
      docId: result.rows[0].id,
      patientId,
      doctorId: user.id,
      fileKey,
    });

    auditLogger.info('DOCUMENT_CREATED', {
      action: 'create',
      docId: result.rows[0].id,
      patientId,
      actorId: user.id,
      actorRole: user.role,
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error uploading document', { error: (error as Error).message });
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

    logger.info('Documents listed', { userId: user.id, role: user.role, count: result.rows.length });

    auditLogger.info('DOCUMENTS_LISTED', {
      action: 'list',
      actorId: user.id,
      actorRole: user.role,
      count: result.rows.length,
    });

    res.json(result.rows);
  } catch (error) {
    logger.error('Error listing documents', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /documents/:id — get a single document's metadata
router.get('/:id', authorize('admin', 'doctor', 'patient'), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    // Validate that id is a valid UUID
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { id } = parsed.data;

    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const doc = result.rows[0];

    // Check resource-level access
    if (user.role === 'doctor' && doc.doctor_id !== user.id) {
      logger.warn('Access denied: doctor tried accessing another doctor doc', { userId: user.id, docId: id });
      auditLogger.warn('ACCESS_DENIED', { action: 'read', docId: id, actorId: user.id, actorRole: 'doctor' });
      res.status(403).json({ error: 'You can only view documents you created' });
      return;
    }

    if (user.role === 'patient' && doc.patient_id !== user.id) {
      logger.warn('Access denied: patient tried accessing another patient doc', { userId: user.id, docId: id });
      auditLogger.warn('ACCESS_DENIED', { action: 'read', docId: id, actorId: user.id, actorRole: 'patient' });
      res.status(403).json({ error: 'You can only view your own documents' });
      return;
    }

    // Admin passes through — no extra check needed
    logger.info('Document retrieved', { docId: id, userId: user.id });

    auditLogger.info('DOCUMENT_ACCESSED', {
      action: 'read',
      docId: id,
      patientId: doc.patient_id,
      actorId: user.id,
      actorRole: user.role,
    });

    res.json(doc);
  } catch (error) {
    logger.error('Error getting document', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
