'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileUp, Loader2 } from 'lucide-react';
import { useFileStore } from '@/stores/file-store';

const FILE_CATEGORY_ICONS: Record<string, string> = {
  tabular: 'Table',
  document: 'FileText',
  database: 'Database',
  image: 'Image',
  audio: 'Music',
  video: 'Film',
  archive: 'Archive',
  code: 'Code',
  structured_data: 'Braces',
  geospatial: 'Globe',
  config: 'Settings',
  email: 'Mail',
};

function detectCategory(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const typeMap: Record<string, string> = {
    csv: 'tabular', tsv: 'tabular', xlsx: 'tabular', xls: 'tabular', parquet: 'tabular', ods: 'tabular',
    pdf: 'document', docx: 'document', doc: 'document', txt: 'document', md: 'document', rtf: 'document',
    pptx: 'document', ppt: 'document',
    db: 'database', sqlite: 'database', sqlite3: 'database', sql: 'database', accdb: 'database',
    json: 'structured_data', xml: 'structured_data', yaml: 'structured_data', yml: 'structured_data', toml: 'structured_data',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image',
    mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio',
    mp4: 'video', avi: 'video', mov: 'video', mkv: 'video', webm: 'video',
    zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive',
    py: 'code', js: 'code', ts: 'code', java: 'code', cpp: 'code', go: 'code', rs: 'code',
    geojson: 'geospatial', shp: 'geospatial', kml: 'geospatial', gpx: 'geospatial',
    env: 'config', ini: 'config', cfg: 'config', conf: 'config',
    eml: 'email', msg: 'email', mbox: 'email',
  };
  return typeMap[ext] || 'unknown';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function UploadZone() {
  const { uploading, uploadFiles, uploadProgress } = useFileStore();
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setPendingFiles(acceptedFiles);
      await uploadFiles(acceptedFiles);
      setPendingFiles([]);
    },
    [uploadFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: 500 * 1024 * 1024, // 500MB
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200 ease-out
          ${
            isDragActive
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-900'
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          ) : isDragActive ? (
            <FileUp className="w-10 h-10 text-blue-400" />
          ) : (
            <Upload className="w-10 h-10 text-zinc-500" />
          )}
          <div>
            <p className="text-sm font-medium text-zinc-300">
              {isDragActive
                ? 'Drop files here...'
                : uploading
                ? 'Uploading...'
                : 'Drag & drop files here, or click to browse'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Supports all file types up to 500MB each
            </p>
          </div>
        </div>
      </div>

      {pendingFiles.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
          {pendingFiles.map((file, idx) => {
            const category = detectCategory(file);
            const progress = uploadProgress[file.name] || 0;
            return (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                  {category}
                </span>
                <span className="text-zinc-300 truncate flex-1">{file.name}</span>
                <span className="text-zinc-500 text-xs">{formatSize(file.size)}</span>
                {uploading && (
                  <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
