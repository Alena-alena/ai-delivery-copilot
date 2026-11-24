/** One date style for the whole app (docs/design/decisions.md): "24 Nov 2026" and "24 Nov 2026, 15:26". */
const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export const formatDate = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-GB', DATE);

export const formatDateTime = (value: string | Date) =>
  new Date(value).toLocaleString('en-GB', { ...DATE, hour: '2-digit', minute: '2-digit' });
