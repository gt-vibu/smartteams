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
  const [firstName, setFirstName] = useState(employee.firstName);
  const [lastName, setLastName] = useState(employee.lastName);
  const [phone, setPhone] = useState(employee.phone);
  const [location, setLocation] = useState(employee.location);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setFirstName(employee.firstName);
    setLastName(employee.lastName);
    setPhone(employee.phone);
    setLocation(employee.location);
  }, [employee]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone, location });
    setIsSaved(true);
    window.setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 700);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetHeader>
        <SheetTitle>Edit Employee Profile</SheetTitle>
        <SheetDescription>Update editable contact and personal details.</SheetDescription>
      </SheetHeader>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <SheetContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-first-name">
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
              <Label htmlFor="profile-last-name">
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
            <Label htmlFor="profile-email">Work Email (Read Only)</Label>
            <Input id="profile-email" type="email" value={employee.workEmail} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">Contact Phone</Label>
            <Input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-location">Work Location</Label>
            <Input
              id="profile-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Bangalore Office"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-department">Department (Read Only)</Label>
            <Input id="profile-department" value={employee.department} disabled />
          </div>
          {isSaved && (
            <p
              role="status"
              className="rounded-md border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success-foreground"
            >
              Profile details updated successfully.
            </p>
          )}
        </SheetContent>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save Changes</Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
}
