import { describe, expect, it } from 'vitest';
import { BOM, parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('reads quoted commas, doubled quotes and line breaks', () => {
    const rows = parseCsv(`${BOM}Name,Note\r\n"Rao, Asha","said ""hi""\nthen left"\r\n`);
    expect(rows).toEqual([
      ['Name', 'Note'],
      ['Rao, Asha', 'said "hi"\nthen left'],
    ]);
  });
  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n,\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('round-trips what it writes', () => {
    const data = [
      ['Name', 'Team'],
      ['Zoë "Z" Ali', 'Ops, North'],
    ];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
  it('never lets a spreadsheet run a cell as a formula', () => {
    expect(toCsv([['=HYPERLINK("x")']])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
