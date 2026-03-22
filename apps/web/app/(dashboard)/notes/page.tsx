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
  Filter,
  Bold,
  Italic,
  List,
  Code,
  Eye,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import { safeFormatDate } from '@/lib/utils';
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
      <div className="w-80 shrink-0 border-e border-border flex flex-col bg-background">
        {/* List header */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.notes.notesExplorer}
            </h2>
            <button className="p-1 rounded text-muted-foreground hover:text-white transition-colors">
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-auto px-2">
          {loading ? (
            <div className="p-2 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 bg-card rounded-lg" />
              ))}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-8 text-center">
              <StickyNote className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? t.notes.noMatchingNotes : t.notes.noNotesYet}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setActiveNote(note)}
                  className={`w-full text-start rounded-lg p-3 transition-colors ${
                    activeNote?.id === note.id
                      ? 'bg-card border border-border'
                      : 'hover:bg-card/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-white truncate">
                      {note.title || t.notes.untitledNote}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {safeFormatDate(note.updated_at, "h'h' 'ago'")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {note.content
                      ? note.content.slice(0, 120).replace(/[#*_`]/g, '')
                      : t.notes.emptyNote}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      {note.file_id && (
                        <>
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <BarChart3 className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                    </div>
                    {activeNote?.id === note.id && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {t.notes.synced}
                      </span>
                    )}
                  </div>
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
            <div className="border-b border-border px-6 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Auto-save badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {t.notes.autoSaved} {safeFormatDate(activeNote.updated_at, 'HH:mm')}
                  </span>
                </div>

                {/* Formatting toolbar */}
                <div className="flex items-center gap-0.5 ms-4">
                  <button className="p-1.5 rounded text-muted-foreground hover:text-white hover:bg-secondary transition-colors">
                    <Bold className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded text-muted-foreground hover:text-white hover:bg-secondary transition-colors">
                    <Italic className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded text-muted-foreground hover:text-white hover:bg-secondary transition-colors">
                    <List className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded text-muted-foreground hover:text-white hover:bg-secondary transition-colors">
                    <Code className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-white hover:bg-secondary transition-colors">
                  <Eye className="h-3.5 w-3.5" />
                  {t.dashboards.preview}
                </button>
                {deleteConfirm === activeNote.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t.notes.deleteNote}</span>
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
                      className="text-muted-foreground"
                    >
                      {t.cancel}
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(activeNote.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-secondary transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Linked assets */}
            {activeNote.file_id && (
              <div className="px-6 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {t.notes.linkedAssets}
                </p>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Global_Market_Report.pdf
                  </span>
                  <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Trend_Analysis_Matrix.xlsx
                  </span>
                </div>
              </div>
            )}

            {/* Title input */}
            <div className="px-6 pt-6">
              <input
                value={activeNote.title}
                onChange={(e) =>
                  updateNote(activeNote.id, { title: e.target.value })
                }
                placeholder={t.notes.titlePlaceholder}
                className="w-full text-3xl font-bold text-white bg-transparent border-none outline-none placeholder-muted-foreground/30"
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
                className="w-full h-full resize-none text-sm text-zinc-300 bg-transparent border-none outline-none placeholder-muted-foreground/30 leading-relaxed"
              />
            </div>

            {/* Bottom stats */}
            <div className="border-t border-border px-6 py-3">
              <div className="flex items-center justify-end gap-6">
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.notes.sentimentShift}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">+2.4%</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.notes.tokensProcessed}
                  </p>
                  <p className="text-sm font-bold text-white mt-1">
                    1,242 <span className="text-muted-foreground font-normal text-xs">K</span>
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <StickyNote className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-muted-foreground font-medium">{t.notes.selectNote}</p>
              <p className="text-muted-foreground/60 text-sm mt-1">
                {t.notes.orCreateNew}
              </p>
              <Button
                onClick={handleCreate}
                className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                <Plus className="h-4 w-4" />
                {t.notes.newNote}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
