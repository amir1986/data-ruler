'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Save, Trash2 } from 'lucide-react';
import { useNotesStore, type Note } from '@/stores/notes-store';
import { useLanguageStore } from '@/stores/language-store';

interface NoteEditorProps {
  note: Note;
}

export function NoteEditor({ note }: NoteEditorProps) {
  const { updateNote, deleteNote, saving } = useNotesStore();
  const { t } = useLanguageStore();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id, note.title, note.content]);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      updateNote(note.id, { title: value });
    },
    [note.id, updateNote]
  );

  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);
      updateNote(note.id, { content: value });
    },
    [note.id, updateNote]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-500" />
          <span className="text-xs text-zinc-500">
            {saving ? t.notes.saving : t.notes.saved}
          </span>
        </div>
        <button
          onClick={() => {
            if (confirm(t.notes.deleteNote)) {
              deleteNote(note.id);
            }
          }}
          className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        className="px-6 py-4 text-2xl font-bold text-white bg-transparent border-none outline-none placeholder-zinc-600"
        placeholder={t.notes.titlePlaceholder}
      />

      {/* Content */}
      <textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        className="flex-1 px-6 py-2 text-sm text-zinc-300 bg-transparent border-none outline-none resize-none placeholder-zinc-600 leading-relaxed font-mono"
        placeholder={t.notes.contentPlaceholder}
      />

      {/* Footer */}
      {note.file_id && (
        <div className="px-6 py-2 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">
            {t.notes.linkedToFile}: {note.file_id}
          </span>
        </div>
      )}
    </div>
  );
}
