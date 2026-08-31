'use client';

import React, { useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@smarteam/ui';
import { useEmployee } from '../../hooks/use-employee';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PhotoUploadModal({ isOpen, onClose }: PhotoUploadModalProps) {
  const { employee, updateAvatar } = useEmployee();
  const [previewUrl, setPreviewUrl] = useState<string | null>(employee.avatarUrl ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorMessage('Please select a valid PNG, JPG, or WEBP image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErrorMessage('File size exceeds 4MB. Please choose a smaller image.');
      return;
    }
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    updateAvatar(previewUrl);
    onClose();
  };

  const handleRemove = () => {
    updateAvatar(null);
    setPreviewUrl(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Profile Photo</DialogTitle>
          <DialogDescription>Upload a PNG, JPG, or WEBP image up to 4MB.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-slate-900 text-3xl font-bold text-white shadow-md">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Profile preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                employee.firstName.charAt(0)
              )}
            </div>
          </div>
          <Input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
          />
          <div className="flex justify-center gap-3">
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose Photo
            </Button>
            {previewUrl && (
              <Button type="button" variant="outline" onClick={handleRemove}>
                Remove
              </Button>
            )}
          </div>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={Boolean(errorMessage)}>
            Save Photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
