/**
 * CSV in and out, as Excel and Google Sheets read and write it.
 *
 * Quoted fields may hold commas, quotes (doubled) and line breaks; a byte-order mark at the start
 * is ignored, and one is written on export so Excel opens UTF-8 names (Kavitā, Zoë) correctly.
 * A cell that starts with =, +, - or @ is prefixed on export so a spreadsheet never runs it.
 */

/** The byte-order mark Excel needs to read UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

const cell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return `${BOM}${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Saves text as a file in the browser. */
export function downloadFile(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
