import type { DeviceEvent } from '@/api/types';
import type { TemperatureUnit } from '@/store/settings';
import { formatAttribute, titleCase } from './format';

const ATTRIBUTE_LABELS: Record<string, string> = {
  switch: 'Power',
  level: 'Brightness',
  colorTemperature: 'White temperature',
  hue: 'Hue',
  saturation: 'Saturation',
  temperature: 'Temperature',
  humidity: 'Humidity',
  illuminance: 'Light level',
  motion: 'Motion',
  contact: 'Contact',
  lock: 'Lock',
  battery: 'Battery',
  power: 'Power draw',
  energy: 'Energy',
  thermostatMode: 'Mode',
  heatingSetpoint: 'Heat setpoint',
  coolingSetpoint: 'Cool setpoint',
  thermostatOperatingState: 'Thermostat',
  windowShade: 'Shade',
  shadeLevel: 'Shade level',
  water: 'Water',
  smoke: 'Smoke',
  presence: 'Presence',
  airQuality: 'Air quality',
  carbonDioxide: 'CO₂',
  volume: 'Volume',
  mute: 'Sound',
  playbackStatus: 'Playback',
  inputSource: 'Input',
  fanSpeed: 'Fan speed',
  machineState: 'Washer',
  washerJobState: 'Cycle stage',
  completionTime: 'Finishes at',
  robotCleanerMovement: 'Vacuum',
  robotCleanerCleaningMode: 'Cleaning mode',
  door: 'Door',
};

export function attributeLabel(attribute: string) {
  return ATTRIBUTE_LABELS[attribute] ?? titleCase(attribute);
}

export function eventText(event: DeviceEvent, unit: TemperatureUnit) {
  if (event.text) return event.text;
  return `${attributeLabel(event.attribute)} · ${formatAttribute(event.capability, event.attribute, event.value, event.unit, unit)}`;
}

/** Discrete state changes are interesting in a feed; sensor noise mostly isn't. */
const FEED_ATTRIBUTES = new Set([
  'switch',
  'motion',
  'contact',
  'lock',
  'water',
  'smoke',
  'presence',
  'thermostatMode',
  'heatingSetpoint',
  'coolingSetpoint',
  'thermostatOperatingState',
  'windowShade',
  'playbackStatus',
  'inputSource',
  'machineState',
  'washerJobState',
  'robotCleanerMovement',
  'door',
  'level',
  'fanSpeed',
  'mute',
]);

export function isFeedWorthy(event: DeviceEvent) {
  return FEED_ATTRIBUTES.has(event.attribute);
}

export function eventTone(event: DeviceEvent): 'bad' | 'warn' | 'accent' | 'neutral' {
  if (
    (event.attribute === 'water' && event.value === 'wet') ||
    (event.attribute === 'smoke' && event.value === 'detected')
  )
    return 'bad';
  if (
    (event.attribute === 'lock' && event.value === 'unlocked') ||
    (event.attribute === 'contact' && event.value === 'open')
  )
    return 'warn';
  if (event.value === 'on' || event.value === 'active' || event.value === 'run' || event.value === 'cleaning')
    return 'accent';
  return 'neutral';
}
