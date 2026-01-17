'use client';

import { useState } from 'react';
import { X, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, Project } from '@/lib/api';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function CreateProjectModal({ isOpen, onClose, onCreated }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const project = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });
      onCreated(project);
      handleClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create project';
      setError(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setInstructions('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <FolderPlus className="h-5 w-5 text-violet-600" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">Create New Project</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Research Paper, Blog Posts, Client Work"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                maxLength={200}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the project (optional)"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Project Instructions
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                These instructions will be included in every session within this project.
                You can also add or edit these later.
              </p>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Write in a formal academic style. Use APA citations. Target audience is graduate students..."
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none h-24"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || creating}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
