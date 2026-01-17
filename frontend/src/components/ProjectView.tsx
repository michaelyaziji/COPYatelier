'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, File, Upload, Trash2, Edit2, Save, X, Plus, FileText,
  Loader2, AlertCircle, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, Project, ProjectFile, ProjectStorageLimits } from '@/lib/api';
import { clsx } from 'clsx';

interface ProjectViewProps {
  projectId: string;
  onCreateSession: (projectId: string) => void;
  onBack: () => void;
}

export function ProjectView({ projectId, onCreateSession, onBack }: ProjectViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [storage, setStorage] = useState<ProjectStorageLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsValue, setInstructionsValue] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [projectData, filesData, storageData] = await Promise.all([
        api.getProject(projectId),
        api.listProjectFiles(projectId),
        api.getProjectStorage(projectId),
      ]);
      setProject(projectData);
      setFiles(filesData.files);
      setStorage(storageData);
      setInstructionsValue(projectData.instructions || '');
    } catch (err) {
      console.error('Failed to load project:', err);
      setError('Failed to load project data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(true);
      setError(null);
      const newFile = await api.uploadProjectFile(projectId, file);
      setFiles([newFile, ...files]);
      // Refresh storage info
      const storageData = await api.getProjectStorage(projectId);
      setStorage(storageData);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      setError(errorMessage);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await api.deleteProjectFile(projectId, fileId);
      setFiles(files.filter(f => f.id !== fileId));
      // Refresh storage info
      const storageData = await api.getProjectStorage(projectId);
      setStorage(storageData);
    } catch (err) {
      console.error('Failed to delete file:', err);
      setError('Failed to delete file');
    }
  };

  const handleSaveInstructions = async () => {
    try {
      setSavingInstructions(true);
      const updated = await api.updateProject(projectId, {
        instructions: instructionsValue,
      });
      setProject(updated);
      setEditingInstructions(false);
    } catch (err) {
      console.error('Failed to save instructions:', err);
      setError('Failed to save instructions');
    } finally {
      setSavingInstructions(false);
    }
  };

  const formatFileSize = (chars: number | null) => {
    if (chars === null) return '-';
    if (chars < 1000) return `${chars} chars`;
    if (chars < 1000000) return `${(chars / 1000).toFixed(1)}K chars`;
    return `${(chars / 1000000).toFixed(1)}M chars`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
          <p className="text-zinc-600">Project not found</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <FolderOpen className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-zinc-900">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-zinc-500 mt-0.5">{project.description}</p>
                )}
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => onCreateSession(projectId)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Session
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 mt-4 text-sm text-zinc-600">
            <span>{project.session_count} sessions</span>
            <span>{project.file_count} files</span>
            {storage && (
              <span className={clsx(
                storage.usage_percent > 80 ? 'text-amber-600' : ''
              )}>
                {storage.usage_percent}% storage used
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="max-w-4xl mx-auto px-6 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-red-100 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
        {/* Instructions Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-zinc-900">Project Instructions</h2>
            {!editingInstructions && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingInstructions(true)}
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
          <p className="text-sm text-zinc-500 mb-3">
            These instructions are automatically included in every session within this project.
            Use this for style guides, context, or recurring requirements.
          </p>
          <div className="bg-zinc-50 rounded-lg border border-zinc-200">
            {editingInstructions ? (
              <div>
                <textarea
                  value={instructionsValue}
                  onChange={(e) => setInstructionsValue(e.target.value)}
                  placeholder="Add instructions that will be shared across all sessions in this project..."
                  className="w-full h-40 p-4 bg-transparent resize-none focus:outline-none text-sm"
                />
                <div className="flex justify-end gap-2 p-3 border-t border-zinc-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingInstructions(false);
                      setInstructionsValue(project.instructions || '');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveInstructions}
                    disabled={savingInstructions}
                  >
                    {savingInstructions ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 min-h-[100px]">
                {project.instructions ? (
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                    {project.instructions}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 italic">
                    No instructions set. Click Edit to add project-level instructions.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Files Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-zinc-900">Project Files</h2>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || (storage && !storage.can_add_file)}
              >
                {uploadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Upload File
              </Button>
            </div>
          </div>
          <p className="text-sm text-zinc-500 mb-3">
            Files uploaded here are automatically included in every new session.
            Supported formats: PDF, DOCX, TXT, MD (max 10MB each).
          </p>

          {/* Storage indicator */}
          {storage && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>{storage.file_count} of {storage.max_files} files</span>
                <span>{formatFileSize(storage.total_chars)} of {formatFileSize(storage.max_chars)}</span>
              </div>
              <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    storage.usage_percent > 80 ? 'bg-amber-500' : 'bg-violet-500'
                  )}
                  style={{ width: `${Math.min(storage.usage_percent, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* File list */}
          <div className="bg-zinc-50 rounded-lg border border-zinc-200 divide-y divide-zinc-200">
            {files.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No files uploaded yet</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Upload reference documents to share across sessions
                </p>
              </div>
            ) : (
              files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 hover:bg-zinc-100 transition-colors"
                >
                  <div className="p-2 bg-white rounded border border-zinc-200">
                    <File className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {file.filename}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="uppercase">{file.original_file_type}</span>
                      <span>{file.word_count?.toLocaleString() || 0} words</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(file.created_at)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFile(file.id)}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
