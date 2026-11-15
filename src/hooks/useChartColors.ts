import { useEffect, useState } from 'react';

const NAMES = ['accent', 'muted', 'subtle', 'line', 'fg', 'good', 'warn', 'bad', 'info', 'surface'] as const;
type ChartColors = Record<(typeof NAMES)[number], string>;

function read(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    NAMES.map((n) => [n, style.getPropertyValue(`--${n}`).trim() || '#888']),
  ) as ChartColors;
}

/** Resolved design-token colours for SVG charts, updated when the theme flips. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

/** Categorical palette for multi-series charts (works in light and dark). */
export const SERIES_PALETTE = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];
