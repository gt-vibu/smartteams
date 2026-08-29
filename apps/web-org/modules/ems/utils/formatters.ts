/**
 * Centralized Formatter Utilities for Smarteam EMS
 */

export function formatINR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateRange(startDate: string, endDate: string): string {
  try {
    const start = new Date(startDate).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const end = new Date(endDate).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `${start} – ${end}`;
  } catch {
    return `${startDate} – ${endDate}`;
  }
}
