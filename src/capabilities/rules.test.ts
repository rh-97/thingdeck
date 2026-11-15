import { describe, expect, it } from 'vitest';
import { HomeEngine } from '@/api/mock/engine';
import { buildRule, describeRule } from './rules';

describe('rule builder', () => {
  const engine = new HomeEngine({ backfillDays: 0, now: () => Date.parse('2026-11-16T12:00:00Z') });
  const home = engine.getLocations()[0]!.locationId;
  const devices = new Map(engine.getDevices(home).map((d) => [d.deviceId, d]));

  it('builds a Rules API body the engine accepts and runs', () => {
    const body = buildRule({
      name: 'Garage opens → office light',
      trigger: {
        deviceId: engine.idFor('entry-door'),
        capability: 'contactSensor',
        attribute: 'contact',
        operator: 'equals',
        value: 'open',
      },
      action: { deviceId: engine.idFor('office-light'), actionId: 'level', arg: 35 },
    });
    expect(body.actions[0]).toMatchObject({ if: { equals: { right: { string: 'open' } } } });
    engine.createRule(home, body);
    engine.simulateAttribute(engine.idFor('entry-door'), 'main', 'contactSensor', 'contact', 'open');
    expect(engine.getStatus(engine.idFor('office-light')).components.main!.switchLevel!.level!.value).toBe(
      35,
    );
  });

  it('uses integer operands for numeric thresholds', () => {
    const body = buildRule({
      name: 'Hot',
      trigger: {
        deviceId: engine.idFor('bedroom-thermostat'),
        capability: 'temperatureMeasurement',
        attribute: 'temperature',
        operator: 'greaterThan',
        value: '25',
      },
      action: { deviceId: engine.idFor('living-purifier'), actionId: 'on' },
    });
    expect(JSON.stringify(body)).toContain('"greaterThan"');
    expect(JSON.stringify(body)).toContain('{"integer":25}');
  });

  it('describes rules in plain English', () => {
    const rule = engine.getRules(home).find((r) => r.name.startsWith('Motion'))!;
    const text = describeRule(rule, devices);
    expect(text.triggers[0]).toBe('Living Room Motion motion is detected');
    expect(text.actions[0]).toBe('Turn on — Floor Lamp');
  });
});
