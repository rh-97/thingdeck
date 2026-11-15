import type { AttributeValue, DeviceCommand, DeviceStatus } from '@/api/types';

type Patch = Array<[capability: string, attribute: string, value: AttributeValue]>;

/** Predicts the state a command will produce so the UI responds instantly. */
export function predict(command: DeviceCommand): Patch {
  const [a0] = command.arguments ?? [];
  switch (`${command.capability}.${command.command}`) {
    case 'switch.on':
      return [['switch', 'switch', 'on']];
    case 'switch.off':
      return [['switch', 'switch', 'off']];
    case 'switchLevel.setLevel':
      return [['switchLevel', 'level', Number(a0)]];
    case 'colorTemperature.setColorTemperature':
      return [['colorTemperature', 'colorTemperature', Number(a0)]];
    case 'colorControl.setColor': {
      const c = (a0 ?? {}) as { hue?: number; saturation?: number };
      const patch: Patch = [];
      if (c.hue !== undefined) patch.push(['colorControl', 'hue', c.hue]);
      if (c.saturation !== undefined) patch.push(['colorControl', 'saturation', c.saturation]);
      return patch;
    }
    case 'lock.lock':
      return [['lock', 'lock', 'locked']];
    case 'lock.unlock':
      return [['lock', 'lock', 'unlocked']];
    case 'thermostatMode.setThermostatMode':
      return [['thermostatMode', 'thermostatMode', String(a0)]];
    case 'thermostatHeatingSetpoint.setHeatingSetpoint':
      return [['thermostatHeatingSetpoint', 'heatingSetpoint', Number(a0)]];
    case 'thermostatCoolingSetpoint.setCoolingSetpoint':
      return [['thermostatCoolingSetpoint', 'coolingSetpoint', Number(a0)]];
    case 'windowShadeLevel.setShadeLevel':
      return [['windowShadeLevel', 'shadeLevel', Number(a0)]];
    case 'audioVolume.setVolume':
      return [['audioVolume', 'volume', Number(a0)]];
    case 'audioMute.mute':
      return [['audioMute', 'mute', 'muted']];
    case 'audioMute.unmute':
      return [['audioMute', 'mute', 'unmuted']];
    case 'mediaPlayback.play':
      return [['mediaPlayback', 'playbackStatus', 'playing']];
    case 'mediaPlayback.pause':
      return [['mediaPlayback', 'playbackStatus', 'paused']];
    case 'mediaPlayback.stop':
      return [['mediaPlayback', 'playbackStatus', 'stopped']];
    case 'mediaInputSource.setInputSource':
      return [['mediaInputSource', 'inputSource', String(a0)]];
    case 'fanSpeed.setFanSpeed':
      return [['fanSpeed', 'fanSpeed', Number(a0)]];
    case 'robotCleanerMovement.setRobotCleanerMovement':
      return [['robotCleanerMovement', 'robotCleanerMovement', String(a0)]];
    case 'robotCleanerCleaningMode.setRobotCleanerCleaningMode':
      return [['robotCleanerCleaningMode', 'robotCleanerCleaningMode', String(a0)]];
    default:
      return [];
  }
}

export function applyOptimistic(status: DeviceStatus, commands: DeviceCommand[]): DeviceStatus {
  const next: DeviceStatus = structuredClone(status);
  for (const command of commands) {
    const component = (next.components[command.component || 'main'] ??= {});
    for (const [capability, attribute, value] of predict(command)) {
      const cap = component[capability];
      if (!cap) continue; // never invent capabilities the device doesn't report
      cap[attribute] = { ...(cap[attribute] ?? {}), value, timestamp: new Date().toISOString() };
    }
  }
  return next;
}

/** Applies a pushed event to a cached status object. */
export function applyEvent(
  status: DeviceStatus,
  event: {
    component: string;
    capability: string;
    attribute: string;
    value: AttributeValue;
    unit?: string;
    time: string;
  },
): DeviceStatus {
  const next: DeviceStatus = { components: { ...status.components } };
  const component = { ...(next.components[event.component] ?? {}) };
  const capability = { ...(component[event.capability] ?? {}) };
  capability[event.attribute] = {
    ...(capability[event.attribute] ?? {}),
    value: event.value,
    ...(event.unit ? { unit: event.unit } : {}),
    timestamp: event.time,
  };
  component[event.capability] = capability;
  next.components[event.component] = component;
  return next;
}
