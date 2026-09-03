'use client';

import React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from '@smarteam/ui';
import { useEmployee } from '../../hooks/use-employee';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Profile photo.
 *
 * The backend has no avatar capability: `Employee` has no image field, and while the files
 * module can store an upload there is nothing to associate it with. The previous version wrote
 * a data URL to localStorage, which looked like it saved but was per-browser and invisible to
 * anyone else.
 *
 * Rather than keep a control that silently fails, this states the position plainly. The rest of
 * the product renders initials, which is a complete and consistent identity treatment.
 */
export function PhotoUploadModal({ isOpen, onClose }: PhotoUploadModalProps) {
  const { initials } = useEmployee();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Profile photo</DialogTitle>
          <DialogDescription>
            Photo uploads are not available yet. Your initials are shown across Smarteam in the
            meantime.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <span
            aria-hidden="true"
            className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary"
          >
            {initials}
          </span>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Icon className="mt-0.5 size-4 shrink-0" name="warning" />
            <span>
              We will enable photo uploads once avatar storage is available. Nothing is lost — there
              is no photo saved today.
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
