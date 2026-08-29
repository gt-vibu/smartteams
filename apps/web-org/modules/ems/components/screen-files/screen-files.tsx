'use client';

import React, { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  Input,
  Label,
  Select,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ConfirmDialog,
} from '@smarteam/ui';
import filesFixture from '../../data/fixtures/files.json';

export function ScreenFiles() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [fileList, setFileList] = useState(filesFixture.files);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deletingFile, setDeletingFile] = useState<any | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFileCategory, setNewFileCategory] = useState('company');
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const { categories } = filesFixture;

  const filteredFiles = fileList.filter((f) => {
    const matchesCat = activeCategory === 'all' || f.category === activeCategory;
    const matchesSearch = !search || f.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFileName.trim()) {
      const newFile = {
        id: `file-${Date.now()}`,
        name: newFileName.trim().endsWith('.pdf')
          ? newFileName.trim()
          : `${newFileName.trim()}.pdf`,
        category: newFileCategory,
        size: '1.2 MB',
        fileType: 'PDF',
        uploadedAt: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        uploadedBy: 'Self',
        security: 'CONFIDENTIAL',
        downloadUrl: '#',
      };
      setFileList([newFile, ...fileList]);
      setNewFileName('');
      setIsUploadModalOpen(false);
    }
  };

  const handleDownload = (fileName: string) => {
    setDownloadToast(`Preparing ${fileName} for secure download...`);
    setTimeout(() => setDownloadToast(null), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {downloadToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          <span>{downloadToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Document Vault & Statutory Files
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Encrypted corporate policies, tax forms, Form 16, appointment letters, and employee KYC
            credentials.
          </p>
        </div>
        <Button
          onClick={() => setIsUploadModalOpen(true)}
          className="self-start sm:self-auto text-xs"
        >
          <span>+ Upload Document</span>
        </Button>
      </div>

      {/* Categories & Search Strip */}
      <Card className="p-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <Button
                  key={cat.id}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveCategory(cat.id)}
                  className="text-xs shrink-0"
                >
                  {cat.label}
                </Button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="pl-8 text-xs h-8"
            />
          </div>
        </div>
      </Card>

      {/* Files Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredFiles.map((file) => (
          <Card
            key={file.id}
            className="p-4 hover:border-sky-400/80 dark:hover:border-sky-600 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                  <svg
                    className="h-4.5 w-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                  </svg>
                </div>
                <Badge variant="secondary" className="text-[9px]">
                  {file.security}
                </Badge>
              </div>

              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-[#0284C7] dark:group-hover:text-sky-400 transition-colors">
                {file.name}
              </h3>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 space-y-0.5 font-mono">
                <div>
                  Size: {file.size} · Uploaded: {file.uploadedAt}
                </div>
                <div>Source: {file.uploadedBy}</div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-3 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingFile(file)}
                className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-0 h-7"
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(file.name)}
                className="text-xs text-[#0284C7] dark:text-sky-400"
              >
                Download File ↓
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Vault Document</DialogTitle>
            <DialogDescription>
              Select category and title for your encrypted file upload.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Document Name</Label>
              <Input
                type="text"
                required
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="e.g. Health_Insurance_Card.pdf"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={newFileCategory} onChange={(e) => setNewFileCategory(e.target.value)}>
                <option value="company">Company Policies</option>
                <option value="statutory">Statutory & Tax (Form 16)</option>
                <option value="letters">Employment Letters</option>
                <option value="identity">Identity & KYC Proofs</option>
              </Select>
            </div>
            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUploadModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* shadcn ConfirmDialog for Delete Confirmation */}
      {deletingFile && (
        <ConfirmDialog
          open={Boolean(deletingFile)}
          title="Delete Vault Document"
          description={`Are you sure you want to delete "${deletingFile.name}"? This action will remove the encrypted file from company storage and cannot be undone.`}
          confirmText="Yes, Delete Document"
          cancelText="Cancel"
          variant="destructive"
          onConfirm={() => {
            setFileList((prev) => prev.filter((f) => f.id !== deletingFile.id));
            setDownloadToast(`Deleted "${deletingFile.name}" from document vault.`);
            setDeletingFile(null);
            setTimeout(() => setDownloadToast(null), 3000);
          }}
          onCancel={() => setDeletingFile(null)}
        />
      )}
    </div>
  );
}
