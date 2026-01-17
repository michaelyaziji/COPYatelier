'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Plus, ChevronRight, ChevronDown, MoreHorizontal, Archive, Trash2, Edit2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, Project } from '@/lib/api';
import { clsx } from 'clsx';

interface ProjectSidebarProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onSelectAllSessions: () => void;
}

export function ProjectSidebar({
  selectedProjectId,
  onSelectProject,
  onSelectAllSessions,
}: ProjectSidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await api.listProjects();
      setProjects(response.projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const project = await api.createProject({ name: newProjectName.trim() });
      setProjects([project, ...projects]);
      setNewProjectName('');
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const handleRenameProject = async (projectId: string, newName: string) => {
    try {
      const updated = await api.updateProject(projectId, { name: newName });
      setProjects(projects.map(p => p.id === projectId ? updated : p));
      setEditingProject(null);
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      await api.archiveProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));
      if (selectedProjectId === projectId) {
        onSelectAllSessions();
      }
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Failed to archive project:', err);
    }
  };

  const toggleExpanded = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  return (
    <div className="w-64 bg-zinc-50 border-r border-zinc-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">Projects</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="h-8 w-8 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* All Sessions */}
        <button
          onClick={onSelectAllSessions}
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors mb-1',
            selectedProjectId === null
              ? 'bg-violet-100 text-violet-900'
              : 'text-zinc-700 hover:bg-zinc-100'
          )}
        >
          <FileText className="h-4 w-4" />
          <span className="flex-1">All Sessions</span>
        </button>

        {loading ? (
          <div className="px-3 py-4 text-sm text-zinc-500">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="px-3 py-4 text-sm text-zinc-500">
            No projects yet. Create one to organize your sessions.
          </div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="mb-1">
              <div
                className={clsx(
                  'group flex items-center gap-1 px-2 py-2 rounded-lg transition-colors',
                  selectedProjectId === project.id
                    ? 'bg-violet-100 text-violet-900'
                    : 'text-zinc-700 hover:bg-zinc-100'
                )}
              >
                <button
                  onClick={() => toggleExpanded(project.id)}
                  className="p-1 hover:bg-zinc-200 rounded"
                >
                  {expandedProjects.has(project.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>

                <button
                  onClick={() => onSelectProject(project.id)}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  <FolderOpen className="h-4 w-4" />
                  {editingProject?.id === project.id ? (
                    <input
                      type="text"
                      defaultValue={project.name}
                      autoFocus
                      onBlur={(e) => handleRenameProject(project.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameProject(project.id, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          setEditingProject(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-white border border-violet-300 rounded px-1 py-0.5 text-sm outline-none"
                    />
                  ) : (
                    <span className="flex-1 truncate text-sm">{project.name}</span>
                  )}
                  <span className="text-xs text-zinc-400">({project.session_count})</span>
                </button>

                {/* Menu */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenFor(menuOpenFor === project.id ? null : project.id);
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 rounded transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {menuOpenFor === project.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(project);
                          setMenuOpenFor(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        <Edit2 className="h-4 w-4" />
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveProject(project.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">Create Project</h3>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') setShowCreateModal(false);
              }}
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Close menu on click outside */}
      {menuOpenFor && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setMenuOpenFor(null)}
        />
      )}
    </div>
  );
}
