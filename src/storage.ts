import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Mock S3 storage — saves files to a local folder instead of real S3.
// In production, this would use the AWS SDK to upload to an S3 bucket.

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Make sure the uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function uploadFile(fileBuffer: Buffer, originalName: string): Promise<string> {
  const ext = path.extname(originalName);
  const fileKey = `${uuidv4()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileKey);

  fs.writeFileSync(filePath, fileBuffer);

  return fileKey; // This is what we store in the database
}

export async function getFilePath(fileKey: string): Promise<string> {
  const filePath = path.join(UPLOAD_DIR, fileKey);

  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }

  return filePath;
}
