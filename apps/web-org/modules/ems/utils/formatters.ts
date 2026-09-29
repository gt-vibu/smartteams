import { formatDate } from '@smarteam/contracts';
/**
 * Centralized Formatter Utilities for Smarteam EMS
 */

export function formatINR(amount: number): string {
  if (Number.isNaN(amount)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = formatDateLabel(startDate);
  const end = formatDateLabel(endDate);
  return start && end ? `${start} – ${end}` : `${startDate} – ${endDate}`;
}

export function formatDateLabel(dateValue: string): string {
  return formatDate(dateValue);
}

export function formatDateRangeFromValues(values: string[]): string {
  const dates = values.filter((value) => !Number.isNaN(new Date(value).getTime())).sort();
  if (dates.length === 0) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first && last ? formatDateRange(first, last) : '';
}

export function formatLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/** "Good morning" until noon, "Good afternoon" until five, then "Good evening". */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}
