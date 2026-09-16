import type React from 'react';

/** One row of the command palette. */
export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Actions' | 'People' | 'Projects';
  icon: React.ReactNode;
  badge?: string;
  onSelect: () => void;
}
