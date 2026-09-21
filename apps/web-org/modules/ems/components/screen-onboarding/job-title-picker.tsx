'use client';

import React, { useMemo } from 'react';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { PicklistSelect } from '../common/picklist-select';

/**
 * A job title from the company's list: the standard titles, those the company added, and any a
 * current employee already holds, so the same role is not spelt five ways. "+ Add a title" saves
 * a new one for everyone at once, not only when the employee it was typed for is created.
 */
export function JobTitlePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const directory = useEmployeeDirectory();
  const inUse = useMemo(
    () =>
      [
        ...new Set(
          directory.entries
            .map((entry) => entry.jobTitle?.trim())
            .filter((title): title is string => Boolean(title)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [directory.entries],
  );
  return (
    <PicklistSelect
      addLabel="+ Add a title"
      extra={inUse}
      kind="job-titles"
      onChange={onChange}
      value={value}
    />
  );
}
