import { fileDisplayName } from './file-naming';

describe('fileDisplayName', () => {
  it('gives identity documents and payslips a standard name', () => {
    expect(fileDisplayName('EMPLOYEE_DOCUMENT', 'scan 12.pdf', 'AADHAAR', 'application/pdf')).toBe(
      'AADHAAR_CARD.pdf',
    );
    expect(fileDisplayName('PAYSLIP', 'x.pdf', undefined, 'application/pdf')).toBe('PAYSLIP.pdf');
  });

  it('keeps the name a company document was uploaded with', () => {
    expect(fileDisplayName('OTHER', 'Leave policy 2026.pdf', undefined, 'application/pdf')).toBe(
      'Leave policy 2026.pdf',
    );
    expect(fileDisplayName('EMPLOYEE_DOCUMENT', 'Offer letter.pdf')).toBe('Offer letter.pdf');
  });

  it('drops path parts and control characters from an uploaded name', () => {
    expect(fileDisplayName('OTHER', 'C:\\Users\\me\\hand\u0007book.txt')).toBe('handbook.txt');
    expect(fileDisplayName('OTHER', '../../etc/passwd')).toBe('passwd');
  });

  it('falls back to the purpose when there is no usable name', () => {
    expect(fileDisplayName('OTHER', '', undefined, 'application/pdf')).toBe('OTHER.pdf');
  });
});
