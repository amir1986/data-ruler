'use client';

import { useEffect, useState } from 'react';
import { useNotesStore, type Note } from '@/stores/notes-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StickyNote,
  Plus,
  Trash2,
  FileText,
  Clock,
  Save,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { useLanguageStore } from '@/stores/language-store';

export default function NotesPage() {
  const {
    notes,
    activeNote,
    loading,
    saving,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    setActiveNote,
  } = useNotesStore();
  const { t } = useLanguageStore();

  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleCreate = async () => {
    const note = await createNote();
    if (note) {
      setActiveNote(note);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setDeleteConfirm(null);
  };

  const filteredNotes = notes.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full">
      {/* Left panel: note list */}
      <div className="w-80 shrink-0 border-r border-zinc-800 flex flex-col">
        {/* List header */}
        <div className="border-b border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{t.notes.title}</h2>
            <Button
              size="sm"
              onClick={handleCreate}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Plus className="h-4 w-4 me-1" />
              {t.new}
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.notes.searchPlaceholder}
              className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500 h-9 text-sm"
            />
          </div>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 bg-zinc-800 rounded-lg" />
              ))}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-8 text-center">
              <StickyNote className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-500">
                {search ? t.notes.noMatchingNotes : t.notes.noNotesYet}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setActiveNote(note)}
                  className={`w-full text-left rounded-lg p-3 transition-colors ${
                    activeNote?.id === note.id
                      ? 'bg-zinc-800 border border-zinc-700'
                      : 'hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {note.title || t.notes.untitledNote}
                    </p>
                    {note.file_id && (
                      <Badge
                        variant="secondary"
                        className="bg-zinc-800 text-zinc-400 text-[10px] shrink-0"
                      >
                        <FileText className="h-2.5 w-2.5 me-0.5" />
                        {t.notes.file}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                    {note.content
                      ? note.content.slice(0, 120).replace(/[#*_`]/g, '')
                      : t.notes.emptyNote}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-2 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {format(new Date(note.updated_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            {/* Editor toolbar */}
            <div className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {saving && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Save className="h-3 w-3 animate-pulse" />
                    {t.notes.saving}
                  </span>
                )}
                {!saving && (
                  <span className="text-xs text-zinc-600">
                    {t.notes.lastSaved}{' '}
                    {format(new Date(activeNote.updated_at), 'h:mm a')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeNote.file_id && (
                  <Badge
                    variant="secondary"
                    className="bg-zinc-800 text-zinc-400"
                  >
                    <FileText className="h-3 w-3 me-1" />
                    {t.notes.linkedToFile}
                  </Badge>
                )}
                {deleteConfirm === activeNote.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{t.notes.deleteNote}</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(activeNote.id)}
                    >
                      {t.confirm}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(null)}
                      className="text-zinc-400"
                    >
                      {t.cancel}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(activeNote.id)}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Title input */}
            <div className="px-6 pt-6">
              <input
                value={activeNote.title}
                onChange={(e) =>
                  updateNote(activeNote.id, { title: e.target.value })
                }
                placeholder={t.notes.titlePlaceholder}
                className="w-full text-2xl font-bold text-white bg-transparent border-none outline-none placeholder-zinc-600"
              />
            </div>

            {/* Content textarea */}
            <div className="flex-1 px-6 py-4">
              <textarea
                value={activeNote.content}
                onChange={(e) =>
                  updateNote(activeNote.id, { content: e.target.value })
                }
                placeholder={t.notes.contentPlaceholder}
                className="w-full h-full resize-none text-sm text-zinc-300 bg-transparent border-none outline-none placeholder-zinc-600 leading-relaxed"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <StickyNote className="h-12 w-12 mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-500 font-medium">{t.notes.selectNote}</p>
              <p className="text-zinc-600 text-sm mt-1">
                {t.notes.orCreateNew}
              </p>
              <Button
                onClick={handleCreate}
                className="mt-4 bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Plus className="h-4 w-4 me-2" />
                {t.notes.newNote}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
