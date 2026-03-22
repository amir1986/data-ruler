import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse, successResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(process.cwd(), '../../data/uploads');
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

function getFileCategory(mimeType: string, ext: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (['csv', 'tsv', 'xlsx', 'xls', 'parquet'].includes(ext)) return 'tabular';
  if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return 'structured';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'document';
  return 'other';
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return errorResponse('No files provided', 400);
    }

    const db = getDb();
    const results = [];

    for (const file of files) {
      const fileId = crypto.randomUUID().replace(/-/g, '');
      const ext = path.extname(file.name).slice(1).toLowerCase();
      const mimeType = file.type || 'application/octet-stream';
      const category = getFileCategory(mimeType, ext);

      const uploadDir = path.join(UPLOAD_PATH, user.id, fileId);
      fs.mkdirSync(uploadDir, { recursive: true });

      const buffer = Buffer.from(await file.arrayBuffer());

      const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

      const storedPath = path.join(uploadDir, file.name);
      fs.writeFileSync(storedPath, buffer);

      db.prepare(`
        INSERT INTO files (
          id, user_id, original_name, stored_path, file_type, file_category,
          mime_type, size_bytes, content_hash, storage_backend, processing_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        user.id,
        file.name,
        storedPath,
        ext,
        category,
        mimeType,
        buffer.length,
        contentHash,
        'local',
        'pending'
      );

      // Send file to AI service for processing.
      // Uses upload-and-process (sends bytes) so it works when
      // web and AI service have separate storage (e.g. Fly.io).
      try {
        const aiFormData = new FormData();
        aiFormData.append('file', new Blob([buffer]), file.name);
        aiFormData.append('file_id', fileId);
        aiFormData.append('user_id', user.id);
        aiFormData.append('original_name', file.name);

        fetch(`${AI_SERVICE_URL}/api/files/upload-and-process`, {
          method: 'POST',
          body: aiFormData,
        }).catch((err) => {
          console.error(`Failed to send file to AI service for ${fileId}:`, err);
        });
      } catch {
        console.error(`Failed to send file to AI service for ${fileId}`);
      }

      results.push({
        id: fileId,
        name: file.name,
        type: ext,
        category,
        mimeType,
        size: buffer.length,
        contentHash,
        processingStatus: 'pending',
      });
    }

    return successResponse({ files: results }, 201);
  } catch (error) {
    console.error('File upload error:', error);
    return errorResponse('Internal server error', 500);
  }
}
