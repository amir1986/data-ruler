import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, errorResponse } from '@/lib/api-utils';
import path from 'path';
import fs from 'fs';

const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(process.cwd(), '../../data/uploads');

const CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.md': 'text/markdown; charset=utf-8',
};

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const fileName = req.nextUrl.searchParams.get('file');
    const userId = req.nextUrl.searchParams.get('userId');

    if (!fileName || !userId) {
      return errorResponse('Missing file or userId parameter', 400);
    }

    // Security: verify the userId matches the authenticated user
    if (userId !== user.id) {
      return errorResponse('Forbidden', 403);
    }

    // Security: prevent path traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return errorResponse('Invalid file name', 400);
    }

    const exportDir = path.join(UPLOAD_PATH, user.id, 'exports');
    const filePath = path.join(exportDir, fileName);

    // Verify the resolved path is inside the export directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(exportDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
      return errorResponse('Invalid file path', 400);
    }

    if (!fs.existsSync(filePath)) {
      return errorResponse('Export file not found', 404);
    }

    const ext = path.extname(fileName).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return errorResponse('Internal server error', 500);
  }
}
