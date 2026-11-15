import type { AttributeValue } from '@/api/types';
import type { TemperatureUnit } from '@/store/settings';

export function toTemperature(value: number, from: string | undefined, to: TemperatureUnit) {
  const source = from === 'F' ? 'F' : 'C';
  if (source === to) return value;
  return to === 'F' ? value * (9 / 5) + 32 : (value - 32) * (5 / 9);
}

/** Converts a value in the user's display unit back to the device's unit (for setpoint commands). */
export function fromDisplayTemperature(
  value: number,
  deviceUnit: string | undefined,
  display: TemperatureUnit,
) {
  const target = deviceUnit === 'F' ? 'F' : 'C';
  if (target === display) return value;
  return target === 'F' ? value * (9 / 5) + 32 : (value - 32) * (5 / 9);
}

export function formatTemperature(
  value: unknown,
  unit: string | undefined,
  display: TemperatureUnit,
  digits = 1,
) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return '—';
  return `${toTemperature(n, unit, display).toFixed(digits)}°${display}`;
}

export function formatNumber(value: unknown, digits = 0) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatPower(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} kW`;
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} W`;
}

export function formatEnergy(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(n < 10 ? 2 : 1)} kWh`;
}

export function formatMoney(amount: number, currency: string) {
  return `${currency}${amount.toFixed(2)}`;
}

export function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const VALUE_LABELS: Record<string, string> = {
  on: 'On',
  off: 'Off',
  locked: 'Locked',
  unlocked: 'Unlocked',
  open: 'Open',
  closed: 'Closed',
  opening: 'Opening…',
  closing: 'Closing…',
  'partially open': 'Partially open',
  active: 'Detected',
  inactive: 'Clear',
  dry: 'Dry',
  wet: 'Leak detected',
  clear: 'Clear',
  detected: 'Smoke detected',
  tested: 'Tested',
  present: 'Home',
  'not present': 'Away',
  playing: 'Playing',
  paused: 'Paused',
  stopped: 'Stopped',
  heating: 'Heating',
  cooling: 'Cooling',
  idle: 'Idle',
  muted: 'Muted',
  unmuted: 'Sound on',
  run: 'Running',
  pause: 'Paused',
  stop: 'Stopped',
  cleaning: 'Cleaning',
  homing: 'Returning to dock',
  charging: 'Charging',
};

export function formatValue(value: AttributeValue | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return VALUE_LABELS[value] ?? titleCase(value);
  if (typeof value === 'number') return formatNumber(value, 1);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => formatValue(v as AttributeValue)).join(', ');
  return JSON.stringify(value);
}

/** A display string for any attribute, honouring units and preferences. */
export function formatAttribute(
  capability: string,
  attribute: string,
  value: AttributeValue | undefined,
  unit: string | undefined,
  temperatureUnit: TemperatureUnit,
): string {
  if (value === null || value === undefined) return '—';
  if (/temperature|setpoint/i.test(attribute) && attribute !== 'colorTemperature') {
    return formatTemperature(value, unit, temperatureUnit);
  }
  switch (attribute) {
    case 'power':
      return formatPower(value);
    case 'energy':
      return formatEnergy(value);
    case 'colorTemperature':
      return `${formatNumber(value)} K`;
    case 'illuminance':
      return `${formatNumber(value)} lux`;
    case 'carbonDioxide':
      return `${formatNumber(value)} ppm`;
    case 'airQuality':
      return `${formatNumber(value)} CAQI`;
    case 'hue':
    case 'saturation':
      return formatNumber(value, 0);
    case 'completionTime':
      return typeof value === 'string'
        ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : '—';
    default:
      break;
  }
  if (typeof value === 'number')
    return `${formatNumber(value, 1)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  void capability;
  return formatValue(value);
}

export function airQualityLabel(caqi: number) {
  if (caqi < 25) return { label: 'Very good', tone: 'good' as const };
  if (caqi < 50) return { label: 'Good', tone: 'good' as const };
  if (caqi < 75) return { label: 'Moderate', tone: 'warn' as const };
  if (caqi < 100) return { label: 'Poor', tone: 'bad' as const };
  return { label: 'Very poor', tone: 'bad' as const };
}

export function co2Label(ppm: number) {
  if (ppm < 800) return { label: 'Fresh', tone: 'good' as const };
  if (ppm < 1000) return { label: 'OK', tone: 'warn' as const };
  return { label: 'Stuffy — ventilate', tone: 'bad' as const };
}

/** SmartThings expresses hue as 0–100; CSS wants degrees. */
export function hueToCss(hue: number, saturation: number) {
  return `hsl(${Math.round((hue / 100) * 360)} ${Math.round(saturation)}% 55%)`;
}
