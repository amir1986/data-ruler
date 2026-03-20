'use client';

import React from 'react';
import {
  FileText, Table2, Database, Image, Film, Music, Archive,
  Code, Globe, Braces, Mail, Settings, FileQuestion,
  MoreVertical, Trash2, Eye, MessageSquare, RefreshCw,
} from 'lucide-react';
import { useFileStore, type FileItem } from '@/stores/file-store';
import { useChatStore } from '@/stores/chat-store';
import { formatDistanceToNow } from 'date-fns';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  tabular: Table2,
  document: FileText,
  presentation: FileText,
  database: Database,
  image: Image,
  video: Film,
  audio: Music,
  archive: Archive,
  code: Code,
  geospatial: Globe,
  structured_data: Braces,
  config: Settings,
  email: Mail,
  log: FileText,
  statistical: Table2,
  financial: Table2,
  healthcare: FileText,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  queued: 'bg-yellow-500/20 text-yellow-400',
  processing: 'bg-blue-500/20 text-blue-400',
  ready: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  partial: 'bg-orange-500/20 text-orange-400',
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface FileRowProps {
  file: FileItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onAddToChat: () => void;
}

function FileRow({ file, isSelected, onSelect, onDelete, onAddToChat }: FileRowProps) {
  const Icon = CATEGORY_ICONS[file.file_category] || FileQuestion;
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition cursor-pointer
        ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''}
      `}
      onClick={onSelect}
    >
      <Icon className="w-5 h-5 text-zinc-400 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">
            {file.original_name}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[file.processing_status] || STATUS_COLORS.pending}`}>
            {file.processing_status}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-zinc-500 uppercase">{file.file_type}</span>
          <span className="text-xs text-zinc-500">{formatSize(file.size_bytes)}</span>
          {file.row_count && (
            <span className="text-xs text-zinc-500">{file.row_count.toLocaleString()} rows</span>
          )}
          <span className="text-xs text-zinc-600">
            {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {file.quality_score !== null && (
        <div className="flex-shrink-0">
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              file.quality_score >= 80
                ? 'bg-green-500/20 text-green-400'
                : file.quality_score >= 50
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            Q:{Math.round(file.quality_score)}
          </span>
        </div>
      )}

      {file.tags && file.tags.length > 0 && (
        <div className="flex gap-1 flex-shrink-0">
          {file.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-8 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              <Eye className="w-4 h-4" /> View Details
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToChat();
                setShowMenu(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              <MessageSquare className="w-4 h-4" /> Add to Chat
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
            >
              <RefreshCw className="w-4 h-4" /> Reprocess
            </button>
            <hr className="border-zinc-700 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FileList() {
  const { files, selectedFiles, toggleSelect, deleteFile, loading } = useFileStore();
  const { setContextFile, setOpen } = useChatStore();

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-16">
        <FileQuestion className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm">No files uploaded yet</p>
        <p className="text-zinc-600 text-xs mt-1">Drop files above or click to upload</p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900/70 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
        <span className="flex-1">Name</span>
        <span className="w-16 text-right">Quality</span>
        <span className="w-20">Tags</span>
        <span className="w-8"></span>
      </div>
      {files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          isSelected={selectedFiles.has(file.id)}
          onSelect={() => toggleSelect(file.id)}
          onDelete={() => deleteFile(file.id)}
          onAddToChat={() => {
            setContextFile(file.id);
            setOpen(true);
          }}
        />
      ))}
    </div>
  );
}
