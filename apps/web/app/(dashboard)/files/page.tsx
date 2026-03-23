'use client';

import { useEffect, useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFileStore, type FileItem } from '@/stores/file-store';
import { useChatStore } from '@/stores/chat-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  FileText,
  Table,
  Database,
  Image,
  Film,
  Music,
  Archive,
  Code,
  Globe,
  FileQuestion,
  Upload,
  Grid3X3,
  List,
  Trash2,
  Eye,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Download,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
  X,
  RefreshCw,
  FileDown,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { safeFormatDate } from '@/lib/utils';
import { useLanguageStore } from '@/stores/language-store';

// --- Helpers ---

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getCategoryIcon(category: string) {
  const icons: Record<string, React.ElementType> = {
    document: FileText,
    tabular: Table,
    database: Database,
    image: Image,
    video: Film,
    audio: Music,
    archive: Archive,
    code: Code,
    geo: Globe,
  };
  return icons[category] || FileQuestion;
}

function getCategoryStyle(category: string) {
  const styles: Record<string, { bg: string; text: string; badge: string }> = {
    document: { bg: 'bg-blue-500/15', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    tabular: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    database: { bg: 'bg-purple-500/15', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    image: { bg: 'bg-pink-500/15', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
    video: { bg: 'bg-red-500/15', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
    audio: { bg: 'bg-amber-500/15', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    archive: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', badge: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' },
    code: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    geo: { bg: 'bg-orange-500/15', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  };
  return styles[category] || { bg: 'bg-zinc-500/15', text: 'text-zinc-400', badge: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' };
}

function getStatusDot(status: string) {
  const dots: Record<string, string> = {
    pending: 'bg-yellow-400',
    processing: 'bg-purple-400',
    ready: 'bg-emerald-400',
    error: 'bg-red-400',
  };
  return dots[status] || 'bg-zinc-400';
}

function getStatusLabel(status: string, t: any) {
  const labels: Record<string, string> = {
    pending: t.files.queued,
    processing: t.files.processing,
    ready: t.files.processed,
    error: t.files.failed,
  };
  return labels[status] || status;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    pending: 'text-yellow-400',
    processing: 'text-purple-400',
    ready: 'text-emerald-400',
    error: 'text-red-400',
  };
  return colors[status] || 'text-zinc-400';
}

function getQualityColor(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

type SortField = 'name' | 'size' | 'date' | 'type';
type SortDir = 'asc' | 'desc';

export default function FilesPage() {
  const {
    files,
    loading,
    uploading,
    viewMode,
    currentFolder,
    selectedFiles,
    fetchFiles,
    uploadFiles,
    deleteFile,
    setViewMode,
    setCurrentFolder,
    toggleSelect,
    clearSelection,
    exportFile,
    reprocessFile,
  } = useFileStore();
  const { setContextFile, setOpen: setChatOpen } = useChatStore();
  const { t, isRtl } = useLanguageStore();

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [detailFile, setDetailFile] = useState<FileItem | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles, currentFolder]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        uploadFiles(acceptedFiles);
      }
    },
    [uploadFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
  });

  // Filter & sort
  const filteredFiles = files
    .filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        if (!f.original_name.toLowerCase().includes(q)) return false;
      }
      if (filterCategory !== 'all' && f.file_category !== filterCategory) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.original_name.localeCompare(b.original_name);
          break;
        case 'size':
          cmp = a.size_bytes - b.size_bytes;
          break;
        case 'date':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'type':
          cmp = a.file_category.localeCompare(b.file_category);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedFiles);
    for (const id of ids) {
      await deleteFile(id);
    }
    clearSelection();
  };

  const handleAddToChat = (file: FileItem) => {
    setDetailFile(null);
    setContextFile(file.id);
    setChatOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-3 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4">
        <nav className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          <span>{t.files.home}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-primary">{t.files.mainFiles}</span>
        </nav>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{t.files.title}</h1>
          <div className="flex items-center rounded-lg border border-border bg-card">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-s-lg transition-colors ${
                viewMode === 'list' ? 'bg-secondary text-white' : 'text-muted-foreground hover:text-white'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-e-lg transition-colors ${
                viewMode === 'grid' ? 'bg-secondary text-white' : 'text-muted-foreground hover:text-white'
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 sm:px-6 pb-6 space-y-4">
        {/* Upload zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-4 sm:p-10 text-center transition-colors cursor-pointer ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30 bg-card/50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-xl bg-secondary mb-3">
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
          {uploading ? (
            <p className="text-primary font-medium">{t.files.uploading}</p>
          ) : isDragActive ? (
            <p className="text-primary font-medium">{t.files.dropHere}</p>
          ) : (
            <>
              <p className="text-white font-semibold text-base mb-1">
                {t.files.uploadGateway}
              </p>
              <p className="text-muted-foreground text-sm">
                {t.files.dragDrop}{' '}
                <span className="text-primary/80 underline underline-offset-2 cursor-pointer">
                  {t.files.browseFiles}
                </span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full border border-border text-muted-foreground">
                  {t.files.supportedFormats}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full border border-border text-muted-foreground">
                  {t.files.maxFileSize}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {/* Select All */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-border bg-card"
                onChange={(e) => {
                  if (e.target.checked) {
                    filteredFiles.forEach((f) => {
                      if (!selectedFiles.has(f.id)) toggleSelect(f.id);
                    });
                  } else {
                    clearSelection();
                  }
                }}
              />
              {t.files.selectAll}
            </label>

            {/* Bulk actions */}
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors">
              <Download className="h-3.5 w-3.5" />
              {t.files.bulkDownload}
            </button>

            {selectedFiles.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.delete} ({selectedFiles.size})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t.files.filters}
            </button>
            <button
              onClick={() => {
                setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {t.files.sortNewest}
            </button>
          </div>
        </div>

        {/* Loading skeletons */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full bg-card rounded-lg" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-border bg-card">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">{t.files.noFiles}</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              {search ? t.files.tryDifferentSearch : t.files.uploadToStart}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          /* List view */
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-start text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8">
                    <input
                      type="checkbox"
                      className="rounded border-border bg-secondary"
                      onChange={(e) => {
                        if (e.target.checked) {
                          filteredFiles.forEach((f) => {
                            if (!selectedFiles.has(f.id)) toggleSelect(f.id);
                          });
                        } else {
                          clearSelection();
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-start text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t.files.fileName}
                  </th>
                  <th className="px-4 py-3 text-start text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    {t.files.category}
                  </th>
                  <th className="px-4 py-3 text-start text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    {t.files.size}
                  </th>
                  <th className="px-4 py-3 text-start text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                    {t.files.qualityScore}
                  </th>
                  <th className="px-4 py-3 text-start text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    {t.files.status}
                  </th>
                  <th className="px-4 py-3 text-end text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t.files.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFiles.map((file) => {
                  const Icon = getCategoryIcon(file.file_category);
                  const catStyle = getCategoryStyle(file.file_category);
                  return (
                    <tr
                      key={file.id}
                      className="hover:bg-card/80 transition-colors cursor-pointer"
                      onClick={() => setDetailFile(file)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleSelect(file.id)}
                          className="rounded border-border bg-secondary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${catStyle.bg}`}>
                            <Icon className={`h-4 w-4 ${catStyle.text}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {file.original_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {safeFormatDate(file.created_at, "'Modified' h'h' 'ago'")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${catStyle.badge}`}>
                          {file.file_category}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-white">
                          {formatBytes(file.size_bytes)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {file.quality_score !== null ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white min-w-[32px]">
                              {file.quality_score}%
                            </span>
                            <div className="h-1.5 w-16 rounded-full bg-secondary">
                              <div
                                className={`h-full rounded-full ${getQualityColor(file.quality_score)}`}
                                style={{ width: `${file.quality_score}%` }}
                              />
                            </div>
                            <span className="text-muted-foreground text-xs">&#x2022;</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground/50">{t.files.notRated}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${getStatusDot(file.processing_status)}`} />
                          <span className={`text-sm font-medium uppercase tracking-wider ${getStatusColor(file.processing_status)}`}>
                            {getStatusLabel(file.processing_status, t)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailFile(file)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-secondary transition-colors"
                            title={t.files.viewDetails}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleAddToChat(file)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                            title={t.files.addToChatContext}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteFile(file.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-secondary transition-colors"
                            title={t.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredFiles.map((file) => {
              const Icon = getCategoryIcon(file.file_category);
              const catStyle = getCategoryStyle(file.file_category);
              return (
                <div
                  key={file.id}
                  onClick={() => setDetailFile(file)}
                  className={`group relative rounded-xl border p-4 cursor-pointer transition-colors ${
                    selectedFiles.has(file.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${catStyle.bg} mb-3`}>
                      <Icon className={`h-6 w-6 ${catStyle.text}`} />
                    </div>
                    <p className="text-sm font-medium text-white truncate w-full">
                      {file.original_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatBytes(file.size_bytes)}
                    </p>
                    <span className="flex items-center gap-1.5 mt-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(file.processing_status)}`} />
                      <span className={`text-xs font-medium uppercase ${getStatusColor(file.processing_status)}`}>
                        {getStatusLabel(file.processing_status, t)}
                      </span>
                    </span>
                  </div>
                  <div className="absolute top-2 end-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToChat(file);
                      }}
                      className="p-1 rounded bg-secondary text-muted-foreground hover:text-primary"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(file.id);
                      }}
                      className="p-1 rounded bg-secondary text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="absolute top-2 start-2">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(file.id);
                      }}
                      className="rounded border-border bg-secondary"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer - showing items count + pagination */}
        {!loading && filteredFiles.length > 0 && (
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground uppercase tracking-wider">
            <span>
              {t.files.showingItems} {filteredFiles.length} {t.files.ofItems} {files.length} {t.files.items}
            </span>
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 text-muted-foreground hover:text-white transition-colors">
                {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                {t.files.previous}
              </button>
              <button className="h-7 w-7 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                1
              </button>
              <button className="h-7 w-7 rounded-md text-muted-foreground hover:text-white text-xs flex items-center justify-center">
                2
              </button>
              <button className="h-7 w-7 rounded-md text-muted-foreground hover:text-white text-xs flex items-center justify-center">
                3
              </button>
              <span className="text-muted-foreground/50 px-1">...</span>
              <button className="h-7 w-7 rounded-md text-muted-foreground hover:text-white text-xs flex items-center justify-center">
                12
              </button>
              <button className="px-2 py-1 text-muted-foreground hover:text-white transition-colors">
                {t.files.next}
                {isRtl ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* File detail dialog */}
      <Dialog open={!!detailFile} onOpenChange={(open) => !open && setDetailFile(null)}>
        <DialogContent className="bg-card border-border text-white max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white truncate">{detailFile?.original_name}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.files.fileDetails}
            </DialogDescription>
          </DialogHeader>
          {detailFile && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.type}</p>
                  <p className="text-zinc-200 mt-1">{detailFile.file_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.category}</p>
                  <p className="text-zinc-200 mt-1 capitalize">{detailFile.file_category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.size}</p>
                  <p className="text-zinc-200 mt-1">{formatBytes(detailFile.size_bytes)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.status}</p>
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className={`h-2 w-2 rounded-full ${getStatusDot(detailFile.processing_status)}`} />
                    <span className={`text-sm font-medium ${getStatusColor(detailFile.processing_status)}`}>
                      {getStatusLabel(detailFile.processing_status, t)}
                    </span>
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.created}</p>
                  <p className="text-zinc-200 mt-1">
                    {safeFormatDate(detailFile.created_at, 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.quality}</p>
                  <p className="text-zinc-200 mt-1">
                    {detailFile.quality_score !== null
                      ? `${detailFile.quality_score}%`
                      : t.files.notScored}
                  </p>
                </div>
                {detailFile.row_count !== null && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.rows}</p>
                    <p className="text-zinc-200 mt-1">
                      {detailFile.row_count?.toLocaleString()}
                    </p>
                  </div>
                )}
                {detailFile.column_count !== null && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">{t.files.columns}</p>
                    <p className="text-zinc-200 mt-1">{detailFile.column_count}</p>
                  </div>
                )}
              </div>

              {detailFile.ai_summary && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
                    {t.files.aiSummary}
                  </p>
                  <p className="text-zinc-300 text-sm bg-secondary rounded-lg p-3">
                    {detailFile.ai_summary}
                  </p>
                </div>
              )}

              {detailFile.tags?.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{t.files.tags}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailFile.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="bg-secondary text-zinc-300"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {detailFile.processing_error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{detailFile.processing_error}</p>
                </div>
              )}

              {/* Sheet tabs for multi-sheet files */}
              {(() => {
                const schema = detailFile.schema_snapshot;
                const sheetNames: string[] = [];
                if (Array.isArray(schema)) {
                  const seen = new Set<string>();
                  (schema as Array<{ sheet?: string }>).forEach((col) => {
                    if (col.sheet && !seen.has(col.sheet)) {
                      seen.add(col.sheet);
                      sheetNames.push(col.sheet);
                    }
                  });
                }
                if (sheetNames.length > 1) {
                  return (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1.5">
                        <Layers className="inline w-3 h-3 me-1" />
                        {t.files.sheets} ({sheetNames.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {sheetNames.map((name) => (
                          <Badge key={name} variant="secondary" className="bg-secondary text-zinc-300 text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Processing log */}
              {(() => {
                const fileData = detailFile as FileItem & { processing_log?: string };
                if (!fileData.processing_log) return null;
                let log: Array<{ stage: string; status: string; detail?: string }> = [];
                try {
                  log = typeof fileData.processing_log === 'string'
                    ? JSON.parse(fileData.processing_log)
                    : [];
                } catch { return null; }
                if (log.length === 0) return null;

                const stageLabels: Record<string, string> = {
                  detection: t.files.stageDetection,
                  parsing: t.files.stageParsing,
                  schema_inference: t.files.stageSchema,
                  storage: t.files.stageStorage,
                };

                // Deduplicate: show only the last entry per stage
                const lastByStage = new Map<string, typeof log[0]>();
                log.forEach((entry) => lastByStage.set(entry.stage, entry));
                const stages = Array.from(lastByStage.values()).filter(e => e.stage !== 'pipeline');

                return (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1.5">
                      {t.files.processingLog}
                    </p>
                    <div className="space-y-1">
                      {stages.map((entry, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            entry.status === 'done' ? 'bg-emerald-400' :
                            entry.status === 'error' ? 'bg-red-400' :
                            'bg-yellow-400 animate-pulse'
                          }`} />
                          <span className="text-zinc-300">
                            {stageLabels[entry.stage] || entry.stage}
                          </span>
                          {entry.detail && (
                            <span className="text-zinc-500 truncate">{entry.detail}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() => handleAddToChat(detailFile)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <MessageSquare className="h-4 w-4 me-2" />
                  {t.files.addToChat}
                </Button>

                {detailFile.processing_status === 'ready' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const result = await exportFile(detailFile.id, 'csv');
                        if (result?.downloadUrl) {
                          window.open(String(result.downloadUrl), '_blank');
                        }
                      }}
                    >
                      <FileDown className="h-4 w-4 me-2" />
                      {t.files.exportCsv}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const result = await exportFile(detailFile.id, 'json');
                        if (result?.downloadUrl) {
                          window.open(String(result.downloadUrl), '_blank');
                        }
                      }}
                    >
                      <FileDown className="h-4 w-4 me-2" />
                      {t.files.exportJson}
                    </Button>
                  </>
                )}

                {detailFile.processing_status === 'error' && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await reprocessFile(detailFile.id);
                    }}
                  >
                    <RefreshCw className="h-4 w-4 me-2" />
                    {t.files.reprocess}
                  </Button>
                )}

                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteFile(detailFile.id);
                    setDetailFile(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {t.delete}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
