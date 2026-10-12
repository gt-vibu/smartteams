import { fileSafe, INK, MUTED, newDocument, rule, saveDocument } from './pdf-kit';

/** Download the currently filtered report rows as a readable, paginated PDF. */
export async function downloadReportPdf(title: string, columns: string[], rows: Array<Array<string | number>>) {
  const doc = await newDocument('landscape');
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const available = pageWidth - margin * 2;
  const colWidth = available / Math.max(columns.length, 1);
  const rowHeight = 26;
  let y = margin;

  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(title, margin, y + 16, { maxWidth: available });
    y += 30;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
    y += 14;
    rule(doc, margin, y, pageWidth - margin);
    y += 16;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    columns.forEach((column, index) => {
      doc.text(doc.splitTextToSize(column, colWidth - 8)[0] ?? '', margin + index * colWidth, y, { maxWidth: colWidth - 8 });
    });
    y += 10;
    rule(doc, margin, y, pageWidth - margin);
    y += 8;
  };

  header();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  for (const row of rows) {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      header();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
    }
    row.forEach((cell, index) => {
      const text = doc.splitTextToSize(String(cell ?? ''), colWidth - 8) as string[];
      doc.text(text.slice(0, 2), margin + index * colWidth, y + 2, { maxWidth: colWidth - 8 });
    });
    y += rowHeight;
    rule(doc, margin, y, pageWidth - margin);
  }

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`${rows.length} records`, pageWidth - margin, pageHeight - 18, { align: 'right' });
  saveDocument(doc, `${fileSafe(title)}.pdf`);
}
