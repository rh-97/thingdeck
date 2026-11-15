import {
  AirVent,
  Blinds,
  Bot,
  Cpu,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  Lamp,
  Lightbulb,
  Lock,
  type LucideIcon,
  Plug,
  Radar,
  Refrigerator,
  Smartphone,
  ThermometerSun,
  ToggleRight,
  Tv,
  Warehouse,
  WashingMachine,
  Wind,
} from 'lucide-react';
import type {
  AttributeState,
  AttributeValue,
  Device,
  DeviceCommand,
  DeviceHealth,
  DeviceStatus,
} from '@/api/types';
import type { TemperatureUnit } from '@/store/settings';
import {
  airQualityLabel,
  co2Label,
  formatAttribute,
  formatPower,
  formatTemperature,
  formatValue,
} from './format';

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info';

export interface DeviceKind {
  icon: LucideIcon;
  label: string;
}

const KINDS: Record<string, DeviceKind> = {
  Light: { icon: Lightbulb, label: 'Light' },
  Television: { icon: Tv, label: 'TV' },
  Blind: { icon: Blinds, label: 'Shade' },
  MotionSensor: { icon: Radar, label: 'Motion sensor' },
  AirPurifier: { icon: Fan, label: 'Air purifier' },
  Refrigerator: { icon: Refrigerator, label: 'Refrigerator' },
  SmartPlug: { icon: Plug, label: 'Smart plug' },
  LeakSensor: { icon: Droplets, label: 'Leak sensor' },
  Thermostat: { icon: ThermometerSun, label: 'Thermostat' },
  ContactSensor: { icon: DoorOpen, label: 'Contact sensor' },
  AirQualityDetector: { icon: Wind, label: 'Air quality' },
  SmartLock: { icon: Lock, label: 'Lock' },
  SmokeDetector: { icon: Flame, label: 'Smoke alarm' },
  MobilePresence: { icon: Smartphone, label: 'Presence' },
  Washer: { icon: WashingMachine, label: 'Washer' },
  RobotCleaner: { icon: Bot, label: 'Robot vacuum' },
  GarageDoor: { icon: Warehouse, label: 'Garage door' },
  Switch: { icon: ToggleRight, label: 'Switch' },
  Lamp: { icon: Lamp, label: 'Lamp' },
  Fan: { icon: AirVent, label: 'Fan' },
};

export function deviceCategory(device: Device) {
  return device.components.find((c) => c.id === 'main')?.categories[0]?.name ?? 'Other';
}

export function deviceKind(device: Device): DeviceKind {
  return KINDS[deviceCategory(device)] ?? { icon: Cpu, label: deviceCategory(device) };
}

export function deviceLabel(device: Device) {
  return device.label || device.name;
}

export function capabilitiesOf(device: Device, component = 'main') {
  return device.components.find((c) => c.id === component)?.capabilities.map((c) => c.id) ?? [];
}

export function has(device: Device, capability: string, component = 'main') {
  return capabilitiesOf(device, component).includes(capability);
}

export function attr(
  status: DeviceStatus | undefined,
  capability: string,
  attribute: string,
  component = 'main',
): AttributeState | undefined {
  return status?.components[component]?.[capability]?.[attribute];
}

export function value(
  status: DeviceStatus | undefined,
  capability: string,
  attribute: string,
  component = 'main',
) {
  return attr(status, capability, attribute, component)?.value;
}

/* -------------------------------------------------------------------- */
/* Primary action (the one-tap control on a device card)                 */
/* -------------------------------------------------------------------- */

export interface PrimaryAction {
  active: boolean;
  label: string;
  next: DeviceCommand[];
  /** Locks and garage doors deserve a confirmation before opening. */
  sensitive?: boolean;
}

export function primaryAction(device: Device, status: DeviceStatus | undefined): PrimaryAction | null {
  if (has(device, 'lock')) {
    const locked = value(status, 'lock', 'lock') === 'locked';
    return {
      active: !locked,
      label: locked ? 'Unlock' : 'Lock',
      next: [{ component: 'main', capability: 'lock', command: locked ? 'unlock' : 'lock' }],
      sensitive: locked,
    };
  }
  if (has(device, 'doorControl')) {
    const door = value(status, 'doorControl', 'door');
    const closed = door === 'closed' || door === 'closing';
    return {
      active: !closed,
      label: closed ? 'Open' : 'Close',
      next: [{ component: 'main', capability: 'doorControl', command: closed ? 'open' : 'close' }],
      sensitive: closed,
    };
  }
  if (has(device, 'switch')) {
    const on = value(status, 'switch', 'switch') === 'on';
    return {
      active: on,
      label: on ? 'Turn off' : 'Turn on',
      next: [{ component: 'main', capability: 'switch', command: on ? 'off' : 'on' }],
    };
  }
  if (has(device, 'windowShade')) {
    const level = Number(value(status, 'windowShadeLevel', 'shadeLevel') ?? 0);
    const open = value(status, 'windowShade', 'windowShade') !== 'closed' && level > 0;
    return {
      active: open,
      label: open ? 'Close' : 'Open',
      next: [{ component: 'main', capability: 'windowShade', command: open ? 'close' : 'open' }],
    };
  }
  if (has(device, 'robotCleanerMovement')) {
    const cleaning = value(status, 'robotCleanerMovement', 'robotCleanerMovement') === 'cleaning';
    return {
      active: cleaning,
      label: cleaning ? 'Send home' : 'Start cleaning',
      next: [
        {
          component: 'main',
          capability: 'robotCleanerMovement',
          command: 'setRobotCleanerMovement',
          arguments: [cleaning ? 'homing' : 'cleaning'],
        },
      ],
    };
  }
  return null;
}

/* -------------------------------------------------------------------- */
/* Summary line                                                          */
/* -------------------------------------------------------------------- */

export interface Summary {
  text: string;
  tone: Tone;
}

export function minutesUntil(iso: AttributeValue | undefined, now = Date.now()) {
  if (typeof iso !== 'string') return null;
  return Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
}

export function deviceSummary(
  device: Device,
  status: DeviceStatus | undefined,
  unit: TemperatureUnit,
): Summary {
  if (!status) return { text: 'Loading…', tone: 'neutral' };
  const v = (cap: string, a: string, c = 'main') => value(status, cap, a, c);
  const temp = (c = 'main') => {
    const s = attr(status, 'temperatureMeasurement', 'temperature', c);
    return formatTemperature(s?.value, s?.unit, unit);
  };

  if (v('waterSensor', 'water') === 'wet') return { text: 'Leak detected', tone: 'bad' };
  if (v('smokeDetector', 'smoke') === 'detected') return { text: 'Smoke detected', tone: 'bad' };

  if (has(device, 'washerOperatingState')) {
    const state = v('washerOperatingState', 'machineState');
    if (state === 'run') {
      const mins = minutesUntil(v('washerOperatingState', 'completionTime'));
      const job = formatValue(v('washerOperatingState', 'washerJobState'));
      return { text: `${job} · ${mins ?? '?'} min left`, tone: 'accent' };
    }
    if (v('washerOperatingState', 'washerJobState') === 'finish')
      return { text: 'Cycle finished', tone: 'good' };
    return { text: formatValue(state), tone: 'neutral' };
  }
  if (has(device, 'robotCleanerMovement')) {
    const m = v('robotCleanerMovement', 'robotCleanerMovement');
    return {
      text: `${formatValue(m)} · ${formatValue(v('battery', 'battery'))}%`,
      tone: m === 'cleaning' ? 'accent' : 'neutral',
    };
  }
  if (has(device, 'thermostatMode')) {
    const op = v('thermostatOperatingState', 'thermostatOperatingState');
    const mode = v('thermostatMode', 'thermostatMode');
    const sp =
      mode === 'cool'
        ? attr(status, 'thermostatCoolingSetpoint', 'coolingSetpoint')
        : attr(status, 'thermostatHeatingSetpoint', 'heatingSetpoint');
    return {
      text: `${temp()} · ${op === 'idle' ? `${formatValue(mode)} to` : formatValue(op) + ' to'} ${formatTemperature(sp?.value, sp?.unit, unit, 1)}`,
      tone: op === 'heating' ? 'warn' : op === 'cooling' ? 'info' : 'neutral',
    };
  }
  if (deviceCategory(device) === 'Refrigerator') {
    return { text: `Fridge ${temp('cooler')} · Freezer ${temp('freezer')}`, tone: 'neutral' };
  }
  if (has(device, 'lock')) {
    const locked = v('lock', 'lock') === 'locked';
    return { text: locked ? 'Locked' : 'Unlocked', tone: locked ? 'good' : 'warn' };
  }
  if (has(device, 'doorControl')) {
    const door = v('doorControl', 'door');
    return { text: formatValue(door), tone: door === 'closed' ? 'good' : 'warn' };
  }
  if (has(device, 'mediaPlayback') && v('switch', 'switch') === 'on') {
    return {
      text: `${formatValue(v('mediaPlayback', 'playbackStatus'))} · ${v('mediaInputSource', 'inputSource') ?? ''} · Vol ${v('audioVolume', 'volume')}`,
      tone: 'accent',
    };
  }
  if (has(device, 'switch')) {
    const on = v('switch', 'switch') === 'on';
    const parts = [on ? 'On' : 'Off'];
    if (on && has(device, 'switchLevel')) parts.push(`${v('switchLevel', 'level')}%`);
    if (on && has(device, 'fanSpeed')) parts.push(`Fan ${v('fanSpeed', 'fanSpeed')}`);
    if (on && has(device, 'powerMeter')) parts.push(formatPower(v('powerMeter', 'power')));
    if (has(device, 'airQualitySensor'))
      parts.push(airQualityLabel(Number(v('airQualitySensor', 'airQuality'))).label);
    return { text: parts.join(' · '), tone: on ? 'accent' : 'neutral' };
  }
  if (has(device, 'windowShade')) {
    return {
      text: `${formatValue(v('windowShade', 'windowShade'))} · ${v('windowShadeLevel', 'shadeLevel')}%`,
      tone: 'neutral',
    };
  }
  if (has(device, 'carbonDioxideMeasurement')) {
    const ppm = Number(v('carbonDioxideMeasurement', 'carbonDioxide'));
    const label = co2Label(ppm);
    return { text: `${ppm} ppm · ${label.label} · ${temp()}`, tone: label.tone };
  }
  if (has(device, 'motionSensor')) {
    const active = v('motionSensor', 'motion') === 'active';
    return { text: `${active ? 'Motion' : 'No motion'} · ${temp()}`, tone: active ? 'accent' : 'neutral' };
  }
  if (has(device, 'contactSensor')) {
    const open = v('contactSensor', 'contact') === 'open';
    return { text: open ? 'Open' : 'Closed', tone: open ? 'warn' : 'neutral' };
  }
  if (has(device, 'waterSensor')) return { text: `Dry · ${temp()}`, tone: 'good' };
  if (has(device, 'smokeDetector')) return { text: 'Clear', tone: 'good' };
  if (has(device, 'presenceSensor')) {
    const home = v('presenceSensor', 'presence') === 'present';
    return { text: home ? 'Home' : 'Away', tone: home ? 'good' : 'neutral' };
  }
  if (has(device, 'temperatureMeasurement')) return { text: temp(), tone: 'neutral' };
  return { text: 'Ready', tone: 'neutral' };
}

/* -------------------------------------------------------------------- */
/* Alerts                                                                */
/* -------------------------------------------------------------------- */

export interface DeviceAlert {
  id: string;
  deviceId: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
}

export function deviceAlerts(
  device: Device,
  status: DeviceStatus | undefined,
  health: DeviceHealth | undefined,
  unit: TemperatureUnit,
): DeviceAlert[] {
  const alerts: DeviceAlert[] = [];
  const name = deviceLabel(device);
  const push = (key: string, severity: DeviceAlert['severity'], title: string, detail: string) =>
    alerts.push({ id: `${device.deviceId}:${key}`, deviceId: device.deviceId, severity, title, detail });

  if (health?.state === 'OFFLINE') {
    push('offline', 'warning', `${name} is offline`, 'Check power or the hub connection.');
    return alerts;
  }
  if (!status) return alerts;
  if (value(status, 'waterSensor', 'water') === 'wet')
    push('leak', 'critical', `Leak at ${name}`, 'Water detected.');
  if (value(status, 'smokeDetector', 'smoke') === 'detected')
    push('smoke', 'critical', `Smoke at ${name}`, 'Smoke detected.');
  const battery = value(status, 'battery', 'battery');
  if (typeof battery === 'number' && battery < 20)
    push('battery', 'warning', `${name} battery low`, `${battery}% remaining.`);
  const co2 = value(status, 'carbonDioxideMeasurement', 'carbonDioxide');
  if (typeof co2 === 'number' && co2 >= 1000)
    push('co2', 'warning', `High CO₂ in ${name}`, `${co2} ppm — open a window.`);
  const freezer = attr(status, 'temperatureMeasurement', 'temperature', 'freezer');
  if (freezer && typeof freezer.value === 'number' && freezer.value > -12) {
    push(
      'freezer',
      'warning',
      'Freezer is warm',
      formatAttribute('temperatureMeasurement', 'temperature', freezer.value, freezer.unit, unit),
    );
  }
  if (has(device, 'lock') && value(status, 'lock', 'lock') === 'unlocked')
    push('unlocked', 'info', `${name} is unlocked`, 'Tap to lock it.');
  if (has(device, 'doorControl') && value(status, 'doorControl', 'door') === 'open')
    push('door', 'info', `${name} is open`, '');
  if (
    has(device, 'washerOperatingState') &&
    value(status, 'washerOperatingState', 'washerJobState') === 'finish'
  ) {
    push('washer', 'info', 'Laundry is done', 'The wash cycle finished.');
  }
  return alerts;
}

/* -------------------------------------------------------------------- */
/* Chartable attributes                                                  */
/* -------------------------------------------------------------------- */

export interface Series {
  key: string;
  component: string;
  capability: string;
  attribute: string;
  label: string;
}

const NUMERIC: Array<[string, string, string]> = [
  ['temperatureMeasurement', 'temperature', 'Temperature'],
  ['relativeHumidityMeasurement', 'humidity', 'Humidity'],
  ['powerMeter', 'power', 'Power'],
  ['energyMeter', 'energy', 'Energy'],
  ['carbonDioxideMeasurement', 'carbonDioxide', 'CO₂'],
  ['airQualitySensor', 'airQuality', 'Air quality'],
  ['illuminanceMeasurement', 'illuminance', 'Illuminance'],
  ['battery', 'battery', 'Battery'],
];

export function chartableSeries(device: Device): Series[] {
  const out: Series[] = [];
  for (const component of device.components) {
    for (const [capability, attribute, label] of NUMERIC) {
      if (component.capabilities.some((c) => c.id === capability)) {
        out.push({
          key: `${component.id}.${capability}.${attribute}`,
          component: component.id,
          capability,
          attribute,
          label:
            component.id === 'main' ? label : `${component.label ?? component.id} ${label.toLowerCase()}`,
        });
      }
    }
  }
  return out;
}

export function isSensorOnly(device: Device) {
  return (
    primaryAction(device, undefined) === null &&
    !has(device, 'washerOperatingState') &&
    !has(device, 'thermostatMode')
  );
}
