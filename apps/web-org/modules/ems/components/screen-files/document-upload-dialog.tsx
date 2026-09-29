'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { employeeDisplayName } from '@smarteam/contracts';
import type { DocumentsState } from '../../hooks/use-documents';
import { useEmployees, useTeams } from '../../hooks/use-workforce';
import { authRepository } from '../../repositories/auth.repository';
import { activeByName } from '../../lib/pickable';

type Audience = 'PERSONAL' | 'EMPLOYEE_SELF' | 'EMPLOYEE' | 'TEAM' | 'ORGANIZATION';

const LABELS: Record<Audience, { title: string; detail: string }> = {
  PERSONAL: { title: 'Only me', detail: 'Private. Nobody else can open it unless you share it.' },
  EMPLOYEE_SELF: {
    title: 'Send to HR',
    detail: 'You and HR can open it, for example an ID proof.',
  },
  EMPLOYEE: { title: 'An employee', detail: 'That employee and HR can open it.' },
  TEAM: { title: 'My team', detail: 'Everyone on the team and its team lead can open it.' },
  ORGANIZATION: { title: 'Everyone', detail: 'A company document, such as a policy or handbook.' },
};

/**
 * Choose a file and who it is for. Only the audiences the caller may publish to are offered;
 * the server checks again. Employees get their own two choices, administrators the rest.
 */
export function DocumentUploadDialog({
  open,
  onOpenChange,
  documents,
  adminWorkspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: DocumentsState;
  adminWorkspace: boolean;
}) {
  const { can } = documents;
  const employees = useEmployees();
  const teams = useTeams();
  // An employee may share only with a team they are on or lead; the server checks the same.
  const myEmployeeId = authRepository.getAuthSession()?.employeeId ?? null;
  const teamChoices = (teams.data ?? []).filter(
    (team) =>
      adminWorkspace ||
      team.teamLeadEmployeeId === myEmployeeId ||
      (team.members ?? []).some((member) => member.employeeId === myEmployeeId && !member.leftAt),
  );
  const hasTeams = teamChoices.length > 0;
  const options: Audience[] = adminWorkspace
    ? [
        ...(can.publish ? (['ORGANIZATION', 'TEAM'] as Audience[]) : []),
        ...(can.readAll ? (['EMPLOYEE'] as Audience[]) : []),
      ]
    : ['PERSONAL', 'EMPLOYEE_SELF', ...(hasTeams ? (['TEAM'] as Audience[]) : [])];
  const [audience, setAudience] = useState<Audience>(options[0] ?? 'PERSONAL');
  const [employeeId, setEmployeeId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setEmployeeId('');
      setTeamId('');
      setAllowDownload(true);
      setAudience(options[0] ?? 'PERSONAL');
    }
    // `options` follows the workspace; resetting on open/close is what matters here.
  }, [open]);

  const ready =
    file !== null &&
    (audience !== 'EMPLOYEE' || employeeId !== '') &&
    (audience !== 'TEAM' || teamId !== '');
  const shared = audience === 'EMPLOYEE' || audience === 'TEAM' || audience === 'ORGANIZATION';

  const submit = async () => {
    if (!file || !ready) return;
    const ok = await documents.upload(file, {
      scope: audience === 'EMPLOYEE_SELF' ? 'EMPLOYEE' : audience,
      purpose: audience === 'TEAM' || audience === 'ORGANIZATION' ? 'OTHER' : 'EMPLOYEE_DOCUMENT',
      ...(audience === 'EMPLOYEE' ? { employeeId } : {}),
      ...(audience === 'TEAM' ? { teamId } : {}),
      ...(shared ? { allowDownload } : {}),
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Upload file</DialogTitle>
        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold text-foreground">Who is it for?</legend>
            {options.map((option) => (
              <label
                className={`flex cursor-pointer gap-2.5 rounded-md border p-2.5 text-xs ${
                  audience === option ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                key={option}
              >
                <input
                  checked={audience === option}
                  className="mt-0.5"
                  name="audience"
                  onChange={() => setAudience(option)}
                  type="radio"
                />
                <span>
                  <span className="block font-semibold text-foreground">
                    {LABELS[option].title}
                  </span>
                  <span className="text-muted-foreground">{LABELS[option].detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {audience === 'EMPLOYEE' && (
            <div>
              <Label className="mb-1 block">Employee</Label>
              <SelectMenu onValueChange={setEmployeeId} value={employeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeByName(employees.data ?? []).map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employeeDisplayName(employee)} · {employee.employeeNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
          )}

          {audience === 'TEAM' && (
            <div>
              <Label className="mb-1 block">Team</Label>
              <SelectMenu onValueChange={setTeamId} value={teamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team" />
                </SelectTrigger>
                <SelectContent>
                  {teamChoices.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
          )}

          {shared && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                checked={allowDownload}
                onChange={(event) => setAllowDownload(event.target.checked)}
                type="checkbox"
              />
              Readers may download it (otherwise they can only view it)
            </label>
          )}

          <div>
            <input
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.csv,.txt"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              ref={input}
              type="file"
            />
            <Button onClick={() => input.current?.click()} type="button" variant="outline">
              {file ? 'Choose another file' : 'Choose a file'}
            </Button>
            {file && <p className="mt-1.5 break-all text-xs text-foreground">{file.name}</p>}
          </div>

          {documents.error && (
            <p className="text-xs text-destructive" role="alert">
              {documents.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={!ready || documents.busy} onClick={() => void submit()} type="button">
              {documents.busy ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
