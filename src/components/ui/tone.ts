import type { Tone } from '@/capabilities/device';

export const toneText: Record<Tone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
};
