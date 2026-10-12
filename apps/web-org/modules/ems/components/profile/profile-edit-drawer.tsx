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
import { ChangePasswordSection } from './change-password-section';
import { useEmployee } from '../../hooks/use-employee';
import { LIMITS, personNameProblem } from '@smarteam/contracts';
import { PhoneField, phoneIsValid } from '../common/phone-field';
import { CheckedInput } from '../common/checked-input';

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

  // Only what was changed is checked and sent, so a name saved under older rules does not stop
  // someone correcting their phone number.
  const changes = employee
    ? {
        ...(firstName.trim() !== employee.firstName ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() !== employee.lastName ? { lastName: lastName.trim() } : {}),
        ...(phone.trim() !== (employee.phone ?? '') ? { phone: phone.trim() } : {}),
      }
    : {};
  const firstNameProblem =
    'firstName' in changes ? personNameProblem(firstName, 'First name') : null;
  const lastNameProblem = 'lastName' in changes ? personNameProblem(lastName, 'Last name') : null;
  const canSave =
    Object.keys(changes).length > 0 &&
    firstNameProblem === null &&
    lastNameProblem === null &&
    (!('phone' in changes) || phoneIsValid(phone));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Persists via PATCH and refetches, so the drawer closes on confirmed server state.
      await updateProfile(changes);
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="flex flex-col bg-card p-0 sm:max-w-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="p-6 pb-4 border-b border-border">
          <SheetHeader>
            <SheetTitle className="text-base font-bold text-foreground">Edit Profile</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {employee
                ? 'Update your contact details and your password.'
                : 'Change the password you sign in with.'}
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {/* The profile fields exist only for someone with an employee record; the password
                applies to every account, administrator or employee. */}
            {employee && (
              <form id="profile-edit-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-first-name" className="text-xs font-semibold">
                      First name <span className="text-destructive">*</span>
                    </Label>
                    <CheckedInput
                      autoComplete="given-name"
                      id="profile-first-name"
                      maxLength={LIMITS.personName}
                      onChange={setFirstName}
                      problem={firstNameProblem}
                      required
                      value={firstName}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-last-name" className="text-xs font-semibold">
                      Last name <span className="text-destructive">*</span>
                    </Label>
                    <CheckedInput
                      autoComplete="family-name"
                      id="profile-last-name"
                      maxLength={LIMITS.personName}
                      onChange={setLastName}
                      problem={lastNameProblem}
                      required
                      value={lastName}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email" className="text-xs font-semibold">
                    Work email
                  </Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={employee.workEmail ?? ''}
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone" className="text-xs font-semibold">
                    Phone
                  </Label>
                  <PhoneField id="profile-phone" onChange={setPhone} value={phone} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-department" className="text-xs font-semibold">
                    Department
                  </Label>
                  <Input
                    id="profile-department"
                    value={employee.department ?? 'Not set'}
                    disabled
                  />
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
              </form>
            )}
            <div className={employee ? 'border-t border-border pt-5' : ''}>
              <ChangePasswordSection />
            </div>
          </div>
          <div className="p-4 border-t border-border bg-muted/20">
            <SheetFooter className="flex sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {employee ? 'Cancel' : 'Close'}
              </Button>
              {employee && (
                <Button
                  form="profile-edit-form"
                  type="submit"
                  disabled={saving || !canSave}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              )}
            </SheetFooter>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
