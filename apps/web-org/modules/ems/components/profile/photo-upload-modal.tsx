'use client';

import React, { useState, useRef } from 'react';
import { useEmployee } from '../../hooks/use-employee';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PhotoUploadModal({ isOpen, onClose }: PhotoUploadModalProps) {
  const { employee, updateAvatar } = useEmployee();
  const [previewUrl, setPreviewUrl] = useState<string | null>(employee?.avatarUrl ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Please select a valid image file (PNG, JPG, or WEBP).');
      return;
    }

    // Validate size (< 4MB)
    if (file.size > 4 * 1024 * 1024) {
      setErrorMessage('File size exceeds 4MB. Please choose a smaller image.');
      return;
    }

    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    updateAvatar(previewUrl);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 800);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    updateAvatar(null);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative bg-white rounded-[8px] shadow-2xl border border-slate-200 w-full max-w-md z-10 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-sky-100 text-sky-700 flex items-center justify-center border border-sky-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="!text-sm !font-bold !text-slate-900 !m-0">
              Update Profile Photo
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-center">
          {/* Avatar Preview */}
          <div className="flex justify-center">
            <div className="relative h-28 w-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-slate-900 flex items-center justify-center text-white text-3xl font-bold">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Profile Preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{employee.firstName.charAt(0)}</span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 font-medium">
            Upload a high-resolution photo in PNG, JPG, or WEBP format (max 4MB).
          </p>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
          />

          {/* Upload Button */}
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded border border-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <svg className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Choose Photo</span>
            </button>

            {previewUrl && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded font-medium">
              {errorMessage}
            </div>
          )}

          {/* Success Message */}
          {isSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-semibold flex items-center justify-center gap-2">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Profile photo updated successfully!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white rounded shadow-xs transition-colors"
          >
            Save Photo
          </button>
        </div>
      </div>
    </div>
  );
}
