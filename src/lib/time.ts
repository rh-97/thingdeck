import { formatDistanceToNowStrict } from 'date-fns';

export function timeAgo(value: string | number | undefined | null) {
  if (value === undefined || value === null) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  if (diff < 10_000 && diff > -10_000) return 'just now';
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function clockTime(epoch: number) {
  return new Date(epoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function shortDateTime(epoch: number) {
  return new Date(epoch).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
