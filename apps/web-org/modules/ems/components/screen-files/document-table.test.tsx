import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { StoredDocument } from '@smarteam/contracts';
import { DocumentTable } from './document-table';

const document = (overrides: Partial<StoredDocument> = {}): StoredDocument => ({
  id: '0b6c1f9e-0000-4000-8000-000000000001',
  name: 'Employee_Handbook.pdf',
  purpose: 'OTHER',
  scope: 'ORGANIZATION',
  contentType: 'application/pdf',
  byteSize: 2048,
  uploadedAt: '2026-09-18T05:00:00.000Z',
  uploadedBy: 'Docs Admin',
  employee: null,
  team: null,
  allowDownload: false,
  access: { view: true, download: false, manage: false, share: false, reason: 'ORGANIZATION' },
  ...overrides,
});

const renderTable = (documents: StoredDocument[]) =>
  render(
    <DocumentTable
      busy={false}
      documents={documents}
      onDelete={vi.fn()}
      onDownload={vi.fn()}
      onShare={vi.fn()}
      onView={vi.fn()}
    />,
  );

describe('the documents table', () => {
  it('says who a document is for and why the reader can see it', () => {
    renderTable([document()]);
    expect(screen.getByText('Everyone')).toBeInTheDocument();
    expect(screen.getByText('Company-wide')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('offers only the actions the server allows', () => {
    renderTable([document()]);
    const row = screen.getByText('Employee_Handbook.pdf').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('shows a private file as private, with the owner’s full set of actions', () => {
    renderTable([
      document({
        name: 'PersonalDocument.pdf',
        scope: 'PERSONAL',
        access: { view: true, download: true, manage: true, share: true, reason: 'OWNER' },
      }),
    ]);
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Private to you')).toBeInTheDocument();
    for (const name of ['View', 'Download', 'Share', 'Delete'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });
});
