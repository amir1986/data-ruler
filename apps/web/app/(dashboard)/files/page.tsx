'use client';

import { useEffect, useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFileStore, type FileItem } from '@/stores/file-store';
import { useChatStore } from '@/stores/chat-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Search,
  Grid3X3,
  List,
  Trash2,
  Eye,
  MessageSquare,
  ChevronRight,
  Home,
  FolderOpen,
  X,
  ArrowUpDown,
} from 'lucide-react';
import { format } from 'date-fns';
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

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ready: 'bg-green-500/20 text-green-400 border-green-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[status] || 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
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
  } = useFileStore();
  const { setContextFile, setOpen: setChatOpen } = useChatStore();
  const { t } = useLanguageStore();

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
    setContextFile(file.id);
    setChatOpen(true);
  };

  // Breadcrumb parts
  const folderParts = currentFolder.split('/').filter(Boolean);

  const categories = ['all', 'document', 'tabular', 'database', 'image', 'video', 'audio', 'archive', 'code', 'geo'];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-white">{t.files.title}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t.files.subtitle}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-zinc-400">
          <button
            onClick={() => setCurrentFolder('/')}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <Home className="h-4 w-4" />
            <span>{t.files.home}</span>
          </button>
          {folderParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() =>
                  setCurrentFolder('/' + folderParts.slice(0, i + 1).join('/'))
                }
                className="hover:text-white transition-colors"
              >
                {part}
              </button>
            </span>
          ))}
        </nav>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            isDragActive
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-8 w-8 mx-auto text-zinc-500 mb-2" />
          {uploading ? (
            <p className="text-blue-400 font-medium">{t.files.uploading}</p>
          ) : isDragActive ? (
            <p className="text-blue-400 font-medium">{t.files.dropHere}</p>
          ) : (
            <>
              <p className="text-zinc-300 font-medium">
                {t.files.dragDrop}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {t.files.supportedFormats}
              </p>
            </>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-l-lg transition-colors ${
                viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-r-lg transition-colors ${
                viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.files.searchPlaceholder}
              className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500"
            />
          </div>

          {/* Sort */}
          <Select
            value={sortField}
            onValueChange={(v) => setSortField(v as SortField)}
          >
            <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300">
              <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="name">{t.files.name}</SelectItem>
              <SelectItem value="size">{t.files.size}</SelectItem>
              <SelectItem value="date">{t.files.date}</SelectItem>
              <SelectItem value="type">{t.files.type}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>

          {/* Category filter */}
          <Select
            value={filterCategory}
            onValueChange={setFilterCategory}
          >
            <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-300">
              <SelectValue placeholder={t.files.category} />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === 'all' ? t.files.allTypes : c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Bulk actions */}
          {selectedFiles.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-zinc-400">
                {selectedFiles.size} {t.files.selected}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="h-4 w-4 me-1" />
                {t.delete}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-zinc-400"
              >
                {t.clear}
              </Button>
            </div>
          )}
        </div>

        {/* Loading skeletons */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full bg-zinc-800 rounded-lg" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400 font-medium">{t.files.noFiles}</p>
            <p className="text-zinc-500 text-sm mt-1">
              {search ? t.files.tryDifferentSearch : t.files.uploadToStart}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          /* List view */
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-8">
                    <input
                      type="checkbox"
                      className="rounded border-zinc-600 bg-zinc-800"
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
                  <th className="px-4 py-3 text-start text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {t.files.name}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">
                    {t.files.type}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">
                    {t.files.size}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">
                    {t.files.date}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">
                    {t.files.status}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-zinc-500 uppercase tracking-wider hidden xl:table-cell">
                    {t.files.quality}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {t.files.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredFiles.map((file) => {
                  const Icon = getCategoryIcon(file.file_category);
                  return (
                    <tr
                      key={file.id}
                      className="hover:bg-zinc-900/60 transition-colors cursor-pointer"
                      onClick={() => setDetailFile(file)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleSelect(file.id)}
                          className="rounded border-zinc-600 bg-zinc-800"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                            <Icon className="h-4 w-4 text-zinc-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {file.original_name}
                            </p>
                            <p className="text-xs text-zinc-500 md:hidden">
                              {formatBytes(file.size_bytes)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-xs">
                          {file.file_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400 hidden lg:table-cell">
                        {formatBytes(file.size_bytes)}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400 hidden lg:table-cell">
                        {format(new Date(file.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(
                            file.processing_status
                          )}`}
                        >
                          {file.processing_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {file.quality_score !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${file.quality_score}%` }}
                              />
                            </div>
                            <span className="text-xs text-zinc-400">
                              {file.quality_score}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-600">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailFile(file)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                            title={t.files.viewDetails}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleAddToChat(file)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-colors"
                            title={t.files.addToChatContext}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteFile(file.id)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
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
              return (
                <div
                  key={file.id}
                  onClick={() => setDetailFile(file)}
                  className={`group relative rounded-xl border p-4 cursor-pointer transition-colors ${
                    selectedFiles.has(file.id)
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 mb-3">
                      <Icon className="h-6 w-6 text-zinc-400" />
                    </div>
                    <p className="text-sm font-medium text-white truncate w-full">
                      {file.original_name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {formatBytes(file.size_bytes)}
                    </p>
                    <span
                      className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(
                        file.processing_status
                      )}`}
                    >
                      {file.processing_status}
                    </span>
                  </div>
                  {/* Hover actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToChat(file);
                      }}
                      className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-blue-400"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(file.id);
                      }}
                      className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Selection checkbox */}
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(file.id);
                      }}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File detail dialog */}
      <Dialog open={!!detailFile} onOpenChange={(open) => !open && setDetailFile(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{detailFile?.original_name}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {t.files.fileDetails}
            </DialogDescription>
          </DialogHeader>
          {detailFile && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.type}</p>
                  <p className="text-zinc-200 mt-1">{detailFile.file_type}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.category}</p>
                  <p className="text-zinc-200 mt-1 capitalize">{detailFile.file_category}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.size}</p>
                  <p className="text-zinc-200 mt-1">{formatBytes(detailFile.size_bytes)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.status}</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium mt-1 ${getStatusColor(
                      detailFile.processing_status
                    )}`}
                  >
                    {detailFile.processing_status}
                  </span>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.created}</p>
                  <p className="text-zinc-200 mt-1">
                    {format(new Date(detailFile.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.quality}</p>
                  <p className="text-zinc-200 mt-1">
                    {detailFile.quality_score !== null
                      ? `${detailFile.quality_score}%`
                      : t.files.notScored}
                  </p>
                </div>
                {detailFile.row_count !== null && (
                  <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.rows}</p>
                    <p className="text-zinc-200 mt-1">
                      {detailFile.row_count?.toLocaleString()}
                    </p>
                  </div>
                )}
                {detailFile.column_count !== null && (
                  <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.files.columns}</p>
                    <p className="text-zinc-200 mt-1">{detailFile.column_count}</p>
                  </div>
                )}
              </div>

              {detailFile.ai_summary && (
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                    {t.files.aiSummary}
                  </p>
                  <p className="text-zinc-300 text-sm bg-zinc-800 rounded-lg p-3">
                    {detailFile.ai_summary}
                  </p>
                </div>
              )}

              {detailFile.tags.length > 0 && (
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{t.files.tags}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailFile.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="bg-zinc-800 text-zinc-300"
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

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => handleAddToChat(detailFile)}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <MessageSquare className="h-4 w-4 me-2" />
                  {t.files.addToChat}
                </Button>
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
