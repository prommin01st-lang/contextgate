import { useState, useEffect, useMemo, useRef, type DragEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  File as FileIcon,
  Upload,
  FolderPlus,
  RefreshCw,
  Trash2,
  Pencil,
  Save,
  X as XIcon,
  ChevronRight,
  Home,
  Download,
  Eye,
} from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Pagination } from '../ui/Pagination';
import { usePagination } from '../../lib/usePagination';

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────
interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string | null;
}

interface ListResponse {
  data: {
    connector: { id: string; name: string; readOnly: boolean };
    path: string;
    items: FileItem[];
    config: {
      allowedExtensions: string[] | null;
      maxFileSize: number | null;
    };
  };
}

interface ContentResponse {
  data: {
    path: string;
    size: number;
    modifiedAt: string;
    content: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectorId: string;
  connectorName: string;
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

// ───────────────────────────────────────────────────────────────
// Main Component
// ───────────────────────────────────────────────────────────────
export function FileBrowserDialog({ open, onOpenChange, connectorId, connectorName }: Props) {
  const [currentPath, setCurrentPath] = useState('');
  const [editorState, setEditorState] = useState<{
    open: boolean;
    path: string;
    content: string;
    original: string;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentPath('');
      setEditorState(null);
    }
  }, [open]);

  // ─── Queries ──────────────────────────────────────────────────
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['files', connectorId, currentPath],
    queryFn: async () => {
      const res = await api
        .get(`api/files/${connectorId}`, {
          searchParams: { path: currentPath },
        })
        .json<ListResponse>();
      return res.data;
    },
    enabled: open,
  });

  const isReadOnly = data?.connector.readOnly ?? false;
  const allowedExtsHint = data?.config.allowedExtensions?.join(', ');

  // ─── Mutations ────────────────────────────────────────────────
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['files', connectorId] });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      formData.append('path', currentPath);
      for (const file of files) formData.append('file', file);
      // ky doesn't auto-set boundary when using `body: FormData`
      return api
        .post(`api/files/${connectorId}/upload`, { body: formData })
        .json<{ data: { uploaded: { name: string; size: number }[] } }>();
    },
    onSuccess: (res) => {
      toast.success(`Uploaded ${res.data.uploaded.length} file(s)`);
      invalidate();
    },
    onError: async (err: unknown) => {
      const msg = await extractError(err);
      toast.error('Upload failed', msg);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const folderPath = joinPath(currentPath, name);
      return api
        .post(`api/files/${connectorId}/folder`, { json: { path: folderPath } })
        .json();
    },
    onSuccess: () => {
      toast.success('Folder created');
      setNewFolderName(null);
      invalidate();
    },
    onError: async (err) => {
      toast.error('Failed to create folder', await extractError(err));
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) =>
      api
        .patch(`api/files/${connectorId}/rename`, { json: { from, to } })
        .json(),
    onSuccess: () => {
      toast.success('Renamed');
      setRenameTarget(null);
      invalidate();
    },
    onError: async (err) => {
      toast.error('Rename failed', await extractError(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (relPath: string) =>
      api
        .delete(`api/files/${connectorId}`, { searchParams: { path: relPath } })
        .json(),
    onSuccess: () => {
      toast.success('Deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: async (err) => {
      toast.error('Delete failed', await extractError(err));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) =>
      api
        .put(`api/files/${connectorId}/content`, { json: { path, content } })
        .json(),
    onSuccess: () => {
      toast.success('File saved');
      setEditorState((s) => (s ? { ...s, original: s.content } : null));
      invalidate();
    },
    onError: async (err) => {
      toast.error('Save failed', await extractError(err));
    },
  });

  // ─── Open file (preview/edit) ─────────────────────────────────
  const openFile = async (name: string) => {
    const filePath = joinPath(currentPath, name);
    try {
      const res = await api
        .get(`api/files/${connectorId}/content`, { searchParams: { path: filePath } })
        .json<ContentResponse>();
      setEditorState({
        open: true,
        path: filePath,
        content: res.data.content,
        original: res.data.content,
      });
    } catch (err) {
      toast.error('Cannot open file', await extractError(err));
    }
  };

  // ─── Drag & drop ──────────────────────────────────────────────
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (isReadOnly) {
      toast.warning('Connector is read-only');
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadMutation.mutate(files);
  };

  const handleFilePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadMutation.mutate(files);
    e.target.value = '';
  };

  // ─── Breadcrumbs ──────────────────────────────────────────────
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return [{ name: 'root', path: '' }, ...parts.map((p, i) => ({
      name: p,
      path: parts.slice(0, i + 1).join('/'),
    }))];
  }, [currentPath]);

  const items = data?.items ?? [];

  // Sort directories first then alphabetically — keeps pagination predictable
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  const { page, setPage, total, totalPages, pageItems, start, end, reset } =
    usePagination(sortedItems, 25);

  // Reset to page 1 when navigating into a different folder
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  return (
    <>
      <Dialog open={open && !editorState} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{connectorName} — Files</DialogTitle>
            <DialogDescription>
              {isReadOnly
                ? 'This connector is read-only. Files can be viewed but not modified.'
                : 'Upload, edit, and organize files. Changes are visible to AI agents immediately.'}
            </DialogDescription>
          </DialogHeader>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReadOnly || uploadMutation.isPending}
            >
              <Upload className="w-4 h-4" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFilePicker}
            />

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setNewFolderName('')}
              disabled={isReadOnly}
            >
              <FolderPlus className="w-4 h-4" />
              New folder
            </Button>

            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw
                className={cn('w-4 h-4', isLoading && 'animate-spin')}
              />
              Refresh
            </Button>

            <span className="ml-auto text-xs text-muted-foreground">
              {allowedExtsHint
                ? `Allowed: ${allowedExtsHint}`
                : 'All extensions allowed'}
            </span>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
                <button
                  onClick={() => setCurrentPath(b.path)}
                  className={cn(
                    'px-1.5 py-0.5 rounded hover:bg-muted transition-colors',
                    i === breadcrumbs.length - 1
                      ? 'text-foreground font-medium'
                      : ''
                  )}
                >
                  {i === 0 ? <Home className="w-3.5 h-3.5" /> : b.name}
                </button>
              </span>
            ))}
          </div>

          {/* New folder input row */}
          {newFolderName !== null && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted">
              <FolderPlus className="w-4 h-4 text-primary" />
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    createFolderMutation.mutate(newFolderName.trim());
                  }
                  if (e.key === 'Escape') setNewFolderName(null);
                }}
              />
              <Button
                size="sm"
                onClick={() => newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())}
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewFolderName(null)}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* File list */}
          <div
            className={cn(
              'flex-1 min-h-[300px] overflow-y-auto rounded-xl border border-border bg-card relative',
              dragActive && 'ring-2 ring-primary ring-offset-2'
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              if (!isReadOnly) setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isReadOnly) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {isLoading && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Loading…
              </div>
            )}
            {error && (
              <div className="p-8 text-center text-red-600 dark:text-red-400 text-sm">
                Failed to load files
              </div>
            )}
            {!isLoading && !error && items.length === 0 && (
              <div className="p-12 text-center">
                <Folder className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm font-medium text-foreground">
                  {currentPath ? 'Empty folder' : 'No files yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isReadOnly
                    ? 'Files added on disk will appear here'
                    : 'Drag files here or click Upload'}
                </p>
              </div>
            )}
            {items.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">
                      Name
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase w-24">
                      Size
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase w-44">
                      Modified
                    </th>
                    <th className="px-4 py-2 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    const itemPath = joinPath(currentPath, item.name);
                    return (
                      <tr
                        key={item.name}
                        className="border-t border-border hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() =>
                              item.type === 'directory'
                                ? setCurrentPath(itemPath)
                                : openFile(item.name)
                            }
                            className="flex items-center gap-2 text-left text-foreground hover:text-primary transition-colors"
                          >
                            {item.type === 'directory' ? (
                              <Folder className="w-4 h-4 text-primary shrink-0" />
                            ) : (
                              <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="truncate">{item.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {item.type === 'directory' ? '—' : formatBytes(item.size)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {formatDate(item.modifiedAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {item.type === 'file' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openFile(item.name)}
                                title="View / Edit"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {!isReadOnly && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setRenameTarget(item)}
                                  title="Rename"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeleteTarget(item)}
                                  title="Delete"
                                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Drag overlay */}
            {dragActive && !isReadOnly && (
              <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium text-primary">
                    Drop files to upload to /{currentPath || 'root'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {uploadMutation.isPending && (
            <p className="text-xs text-muted-foreground">Uploading…</p>
          )}

          {total > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              start={start}
              end={end}
              onPageChange={setPage}
              itemLabel="files"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* File editor */}
      {editorState && (
        <FileEditorDialog
          open={editorState.open}
          path={editorState.path}
          content={editorState.content}
          original={editorState.original}
          readOnly={isReadOnly}
          saving={saveMutation.isPending}
          onChange={(content) => setEditorState((s) => (s ? { ...s, content } : null))}
          onSave={() =>
            saveMutation.mutate({
              path: editorState.path,
              content: editorState.content,
            })
          }
          onClose={() => setEditorState(null)}
        />
      )}

      {/* Rename */}
      <RenameDialog
        target={renameTarget}
        currentPath={currentPath}
        loading={renameMutation.isPending}
        onClose={() => setRenameTarget(null)}
        onRename={(newName) => {
          if (!renameTarget) return;
          renameMutation.mutate({
            from: joinPath(currentPath, renameTarget.name),
            to: joinPath(currentPath, newName),
          });
        }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type === 'directory' ? 'folder' : 'file'}?`}
        description={
          deleteTarget?.type === 'directory'
            ? `This will permanently delete "${deleteTarget?.name}" and everything inside it.`
            : `This will permanently delete "${deleteTarget?.name}".`
        }
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(joinPath(currentPath, deleteTarget.name));
          }
        }}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────────
// File Editor Dialog
// ───────────────────────────────────────────────────────────────
function FileEditorDialog({
  open,
  path,
  content,
  original,
  readOnly,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  open: boolean;
  path: string;
  content: string;
  original: string;
  readOnly: boolean;
  saving: boolean;
  onChange: (c: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const dirty = content !== original;

  const downloadFile = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() ?? 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-base truncate">{path}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'View only — connector is read-only'
              : 'Edit and save. AI agents will see the new content immediately.'}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className="flex-1 min-h-[400px] font-mono text-xs"
          spellCheck={false}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {content.length.toLocaleString()} chars
            {dirty && (
              <span className="ml-2 text-amber-600">• unsaved</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={downloadFile}>
              <Download className="w-3.5 h-3.5" />
              Download
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              <XIcon className="w-3.5 h-3.5" />
              Close
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────
// Rename Dialog
// ───────────────────────────────────────────────────────────────
function RenameDialog({
  target,
  loading,
  onClose,
  onRename,
}: {
  target: FileItem | null;
  currentPath: string;
  loading: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Rename {target?.type === 'directory' ? 'folder' : 'file'}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim() && name !== target?.name) {
              onRename(name.trim());
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => onRename(name.trim())}
            disabled={loading || !name.trim() || name === target?.name}
          >
            {loading ? 'Renaming…' : 'Rename'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────
// Error helper
// ───────────────────────────────────────────────────────────────
async function extractError(err: unknown): Promise<string> {
  const e = err as { response?: { json?: () => Promise<{ error?: string }> }; message?: string };
  try {
    const body = await e.response?.json?.();
    return body?.error ?? e.message ?? 'Unknown error';
  } catch {
    return e.message ?? 'Unknown error';
  }
}
