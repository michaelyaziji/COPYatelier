'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Trash2, ChevronDown, ChevronUp, Paperclip, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSessionStore } from '@/store/session';
import { clsx } from 'clsx';

interface ReferenceFile {
  id: string;
  filename: string;
  content: string;
  description: string;
  fileType: string;
  wordCount: number;
  isExpanded: boolean;
}

export function ReferenceMaterials() {
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setReferenceDocuments, referenceInstructions, setReferenceInstructions } = useSessionStore();

  // Update the store whenever files change
  const updateStore = (updatedFiles: ReferenceFile[]) => {
    const docs: Record<string, string> = {};
    updatedFiles.forEach((file) => {
      const contentWithDescription = file.description
        ? `[${file.filename}]\nDescription: ${file.description}\n\n${file.content}`
        : `[${file.filename}]\n\n${file.content}`;
      docs[file.filename] = contentWithDescription;
    });
    setReferenceDocuments(docs);
  };

  // Process files (shared between input and drag/drop)
  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesToProcess = Array.from(fileList);
    if (filesToProcess.length === 0) return;

    // Validate file types
    const allowedExtensions = ['.docx', '.pdf', '.txt', '.md'];
    const invalidFiles = filesToProcess.filter(
      (f) => !allowedExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    );

    if (invalidFiles.length > 0) {
      setError(`Invalid file type(s): ${invalidFiles.map((f) => f.name).join(', ')}. Allowed: Word, PDF, Text, Markdown`);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      for (const file of filesToProcess) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://localhost:8000/api/v1/files/parse', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Failed to parse file');
        }

        const result = await response.json();

        const newFile: ReferenceFile = {
          id: Math.random().toString(36).substring(2, 9),
          filename: result.filename,
          content: result.content,
          description: '',
          fileType: result.file_type,
          wordCount: result.word_count,
          isExpanded: false,
        };

        setFiles((prev) => {
          const updated = [...prev, newFile];
          updateStore(updated);
          return updated;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    await processFiles(selectedFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      await processFiles(droppedFiles);
    }
  }, [processFiles]);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      updateStore(updated);
      return updated;
    });
  };

  const updateDescription = (id: string, description: string) => {
    setFiles((prev) => {
      const updated = prev.map((f) =>
        f.id === id ? { ...f, description } : f
      );
      updateStore(updated);
      return updated;
    });
  };

  const toggleExpanded = (id: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isExpanded: !f.isExpanded } : f))
    );
  };

  const getFileTypeColor = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return 'bg-rose-100 text-rose-600';
      case 'docx':
        return 'bg-blue-100 text-blue-600';
      case 'txt':
      case 'md':
        return 'bg-zinc-100 text-zinc-600';
      default:
        return 'bg-zinc-100 text-zinc-600';
    }
  };

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
            <Paperclip className="h-5 w-5 text-zinc-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-900">Reference Materials</h3>
            <p className="text-sm text-zinc-500">Optional - upload context documents</p>
          </div>
          {files.length > 0 && (
            <span className="px-2.5 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Upload Area with Drag/Drop */}
        <div
          className={clsx(
            'border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 cursor-pointer',
            isDragging
              ? 'border-violet-500 bg-violet-100 scale-[1.02]'
              : isUploading
              ? 'border-violet-400 bg-violet-50'
              : 'border-zinc-200 hover:border-violet-300 hover:bg-violet-50/30'
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,.txt,.md"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className={clsx(
            "w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors",
            isDragging ? "bg-violet-200" : "bg-zinc-100"
          )}>
            <Upload className={clsx(
              "h-6 w-6 transition-colors",
              isDragging ? "text-violet-600" : isUploading ? "text-violet-500" : "text-zinc-400"
            )} />
          </div>
          <p className="text-sm text-zinc-600">
            {isDragging ? (
              <span className="text-violet-600 font-medium">Drop files here...</span>
            ) : isUploading ? (
              <span className="text-violet-600">Processing...</span>
            ) : (
              <>
                <span className="font-medium text-violet-600">Click to upload</span>{' '}
                or drag and drop
              </>
            )}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Word, PDF, Text, or Markdown
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="border border-zinc-200 rounded-xl overflow-hidden bg-white"
              >
                {/* File Header */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      getFileTypeColor(file.fileType)
                    )}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-zinc-900">
                        {file.filename}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {file.wordCount.toLocaleString()} words
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(file.id)}
                    >
                      {file.isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.id)}
                      className="text-zinc-400 hover:text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* File Details (expandable) */}
                {file.isExpanded && (
                  <div className="p-3 space-y-3 border-t border-zinc-100 bg-zinc-50/50">
                    <Textarea
                      label="Description"
                      value={file.description}
                      onChange={(e) => updateDescription(file.id, e.target.value)}
                      placeholder="Describe what this file contains..."
                      rows={2}
                    />

                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                        Preview
                      </label>
                      <div className="bg-white rounded-lg p-3 max-h-40 overflow-y-auto border border-zinc-200">
                        <pre className="text-xs text-zinc-600 whitespace-pre-wrap font-sans">
                          {file.content.substring(0, 800)}
                          {file.content.length > 800 && '...'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reference Instructions - shown when files are uploaded */}
        {files.length > 0 && (
          <div className="mt-4">
            <Textarea
              label="How should the agents use these materials?"
              value={referenceInstructions}
              onChange={(e) => setReferenceInstructions(e.target.value)}
              placeholder="Example: The Atlantic article is a style model - match its tone and structure. The research PDF contains data to cite. The outline shows the required sections."
              rows={3}
            />
          </div>
        )}

        {/* Tips */}
        {files.length === 0 && (
          <div className="mt-4 flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
            <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Upload style guides, outlines, or related documents to help agents
              maintain consistency in your writing.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
