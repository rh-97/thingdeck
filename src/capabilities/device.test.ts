import { describe, expect, it } from 'vitest';
import { HomeEngine } from '@/api/mock/engine';
import { deviceAlerts, deviceSummary, primaryAction } from './device';
import { formatTemperature } from './format';

const engine = new HomeEngine({ backfillDays: 0, now: () => Date.parse('2026-11-16T12:00:00Z') });
const home = engine.getLocations()[0]!.locationId;
const device = (key: string) => engine.getDevices(home).find((d) => d.deviceId === engine.idFor(key))!;
const snapshot = (key: string) => {
  const id = engine.idFor(key);
  return [device(key), engine.getStatus(id), engine.getHealth(id)] as const;
};

describe('device helpers', () => {
  it('picks a sensible primary action', () => {
    const [lock, lockStatus] = snapshot('entry-lock');
    expect(primaryAction(lock, lockStatus)).toMatchObject({ label: 'Unlock', sensitive: true });
    const [lamp, lampStatus] = snapshot('living-lamp');
    expect(primaryAction(lamp, lampStatus)).toMatchObject({ label: 'Turn on', active: false });
    const [sensor, sensorStatus] = snapshot('entry-smoke');
    expect(primaryAction(sensor, sensorStatus)).toBeNull();
  });

  it('summarises multi-component devices', () => {
    const [fridge, status] = snapshot('kitchen-fridge');
    expect(deviceSummary(fridge, status, 'C').text).toBe('Fridge 3.4°C · Freezer -18.2°C');
    expect(deviceSummary(fridge, status, 'F').text).toBe('Fridge 38.1°F · Freezer -0.8°F');
  });

  it('raises alerts for leaks, low batteries and offline devices', () => {
    engine.simulateAttribute(engine.idFor('kitchen-leak'), 'main', 'waterSensor', 'water', 'wet');
    const [leak, leakStatus, leakHealth] = snapshot('kitchen-leak');
    const alerts = deviceAlerts(leak, leakStatus, leakHealth, 'C').map((a) => a.severity);
    expect(alerts).toEqual(['critical', 'warning']);
    const [garage, garageStatus, garageHealth] = snapshot('garage-light');
    expect(deviceAlerts(garage, garageStatus, garageHealth, 'C')[0]!.title).toBe('Garage Light is offline');
  });

  it('formats temperatures across units', () => {
    expect(formatTemperature(20, 'C', 'F')).toBe('68.0°F');
    expect(formatTemperature(68, 'F', 'C')).toBe('20.0°C');
    expect(formatTemperature(null, 'C', 'C')).toBe('—');
  });
});
