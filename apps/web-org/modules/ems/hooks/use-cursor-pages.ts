'use client';

import { useState } from 'react';

/** Cursor history belongs to the exact filter; a changed search starts on its first page. */
export function useCursorPages(key: string) {
  const [saved, setSaved] = useState<{ key: string; cursors: Array<string | undefined> }>({
    key,
    cursors: [undefined],
  });
  if (saved.key !== key) setSaved({ key, cursors: [undefined] });
  const cursors = saved.key === key ? saved.cursors : [undefined];
  return {
    cursor: cursors.at(-1),
    page: cursors.length,
    previous: () => setSaved({ key, cursors: cursors.slice(0, Math.max(1, cursors.length - 1)) }),
    next: (cursor: string) => setSaved({ key, cursors: [...cursors, cursor] }),
  };
}
