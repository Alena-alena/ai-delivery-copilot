import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('date format', () => {
  it('shows day, short month and year whatever the browser locale is', () => {
    expect(formatDate('2026-11-24T10:00:00')).toBe('24 Nov 2026');
  });
  it('adds a 24-hour time', () => {
    expect(formatDateTime('2026-11-24T15:26:00')).toBe('24 Nov 2026, 15:26');
  });
});
