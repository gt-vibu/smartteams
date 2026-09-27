import type { jsPDF } from 'jspdf';

/**
 * Shared pieces for the PDFs people download: payslips and annual statements.
 *
 * The documents are drawn with jsPDF and saved straight to the device, so a download is a file,
 * not a web page opened in a new tab — which phones showed shrunk to a corner of a blank screen.
 * jsPDF is loaded on first use, so screens carry no PDF library until someone downloads one.
 */

export const INK: [number, number, number] = [28, 35, 33];
export const MUTED: [number, number, number] = [91, 102, 96];
export const RULE: [number, number, number] = [223, 229, 225];
export const BRAND: [number, number, number] = [28, 69, 50];
export const TINT: [number, number, number] = [238, 245, 241];

export async function newDocument(orientation: 'portrait' | 'landscape' = 'portrait') {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'pt', format: 'a4', orientation });
}

/**
 * Money as the PDF prints it. The built-in PDF fonts have no rupee sign, so the currency is
 * written as its code ("INR 38,200.00") rather than as a glyph that would print as garbage.
 */
export const pdfMoney = (value: number, currencyCode = 'INR') =>
  `${currencyCode} ${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Small uppercase label above a value. */
export function label(doc: jsPDF, text: string, x: number, y: number, align?: 'right') {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(text.toUpperCase(), x, y, align ? { align } : undefined);
}

/** A value in body type. */
export function value(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: { bold?: boolean; size?: number; align?: 'right'; maxWidth?: number } = {},
) {
  doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
  doc.setFontSize(options.size ?? 9.5);
  doc.setTextColor(...INK);
  const lines: string | string[] = options.maxWidth
    ? (doc.splitTextToSize(text, options.maxWidth) as string[])
    : text;
  doc.text(lines, x, y, options.align ? { align: options.align } : undefined);
}

export function rule(doc: jsPDF, x1: number, y: number, x2: number, colour = RULE, width = 0.5) {
  doc.setDrawColor(...colour);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

/** A file name made only of characters every phone and desktop accepts. */
export const fileSafe = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

/**
 * Hands the finished PDF to the device as a file download. Done here rather than with jsPDF's
 * own save, which falls back to opening the file in a new tab on some browsers.
 */
export function saveDocument(doc: jsPDF, fileName: string) {
  const url = URL.createObjectURL(doc.output('blob'));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked after the browser has taken the file; revoking at once cancels it in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
