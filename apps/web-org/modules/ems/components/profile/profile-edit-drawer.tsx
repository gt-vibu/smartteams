'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@smarteam/ui';
import { useEmployee } from '../../hooks/use-employee';

interface ProfileEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileEditDrawer({ isOpen, onClose }: ProfileEditDrawerProps) {
  const { employee, updateProfile } = useEmployee();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) return;
    setFirstName(employee.firstName);
    setLastName(employee.lastName);
    setPhone(employee.phone ?? '');
  }, [employee]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      // Persists via PATCH and refetches, so the drawer closes on confirmed server state.
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      setIsSaved(true);
      window.setTimeout(() => {
        setIsSaved(false);
        onClose();
      }, 700);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  // The profile has not loaded, or this account has no employee record in the tenant.
  if (!employee) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col p-0 sm:max-w-md bg-card">
        <div className="p-6 pb-4 border-b border-border">
          <SheetHeader>
            <SheetTitle className="text-base font-bold text-foreground">Edit Profile</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Update your contact and personal details.
            </SheetDescription>
          </SheetHeader>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col justify-between">
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-first-name" className="text-xs font-semibold">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="profile-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-last-name" className="text-xs font-semibold">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email" className="text-xs font-semibold">
                Work Email (Read Only)
              </Label>
              <Input id="profile-email" type="email" value={employee.workEmail ?? ''} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone" className="text-xs font-semibold">
                Contact Phone
              </Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-department" className="text-xs font-semibold">
                Department (Read Only)
              </Label>
              <Input id="profile-department" value={employee.department ?? 'Not set'} disabled />
            </div>
            {saveError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive"
              >
                {saveError}
              </p>
            )}
            {isSaved && (
              <p
                role="status"
                className="rounded-md border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success-foreground"
              >
                Profile details updated successfully.
              </p>
            )}
          </div>
          <div className="p-4 border-t border-border bg-muted/20">
            <SheetFooter className="flex sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </SheetFooter>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
