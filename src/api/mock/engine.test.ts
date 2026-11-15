import { describe, expect, it } from 'vitest';
import { ApiError } from '../client';
import { HomeEngine } from './engine';

const NOW = Date.parse('2026-11-16T18:30:00Z');

function engine(backfillDays = 0) {
  let now = NOW;
  const e = new HomeEngine({ now: () => now, backfillDays });
  const home = e.getLocations()[0]!;
  return { e, home, advance: (ms: number) => ((now += ms), e.tick(ms)) };
}

const status = (e: HomeEngine, key: string) => e.getStatus(e.idFor(key)).components.main!;

describe('HomeEngine', () => {
  it('boots two locations with rooms, devices, scenes and modes', () => {
    const { e, home } = engine();
    expect(e.getLocations().map((l) => l.name)).toEqual(['Maple Street Home', 'Lake Cabin']);
    expect(e.getRooms(home.locationId)).toHaveLength(7);
    expect(e.getDevices(home.locationId).length).toBeGreaterThan(20);
    expect(e.getScenes(home.locationId).map((s) => s.sceneName)).toContain('Movie Night');
    expect(e.getCurrentMode(home.locationId).label).toBe('Home');
  });

  it('is deterministic for a given seed', () => {
    const a = engine(1).e;
    const b = engine(1).e;
    const home = a.getLocations()[0]!.locationId;
    expect(a.getDevices(home)).toEqual(b.getDevices(home));
    expect(a.getHistory({ locationId: home, limit: 50 })).toEqual(
      b.getHistory({ locationId: home, limit: 50 }),
    );
  });

  it('executes switch and level commands and emits events', () => {
    const { e } = engine();
    const events: string[] = [];
    e.events.on((ev) => events.push(`${ev.capability}.${ev.attribute}=${String(ev.value)}`));
    const lamp = e.idFor('living-lamp');
    e.executeCommands(lamp, [
      { component: 'main', capability: 'switchLevel', command: 'setLevel', arguments: [55] },
    ]);
    expect(status(e, 'living-lamp').switch!.switch!.value).toBe('on');
    expect(status(e, 'living-lamp').switchLevel!.level!.value).toBe(55);
    expect(events).toContain('switchLevel.level=55');
    expect(events).toContain('switch.switch=on');
  });

  it('updates power draw when a plug turns on', () => {
    const { e } = engine();
    const desk = e.idFor('office-desk');
    e.executeCommands(desk, [{ component: 'main', capability: 'switch', command: 'off' }]);
    expect(status(e, 'office-desk').powerMeter!.power!.value).toBeLessThan(5);
    e.executeCommands(desk, [{ component: 'main', capability: 'switch', command: 'on' }]);
    expect(status(e, 'office-desk').powerMeter!.power!.value).toBeGreaterThan(100);
  });

  it('rejects commands for offline devices and unsupported capabilities', () => {
    const { e } = engine();
    expect(() =>
      e.executeCommands(e.idFor('garage-light'), [
        { component: 'main', capability: 'switch', command: 'on' },
      ]),
    ).toThrow(ApiError);
    expect(() =>
      e.executeCommands(e.idFor('entry-lock'), [{ component: 'main', capability: 'switch', command: 'on' }]),
    ).toThrow(/no switch/);
  });

  it('fires a rule on the rising edge of its condition', () => {
    const { e } = engine();
    const runs: string[] = [];
    e.ruleRuns.on(({ rule }) => runs.push(rule.name));
    const lamp = e.idFor('living-lamp');
    e.executeCommands(lamp, [{ component: 'main', capability: 'switch', command: 'off' }]);
    e.simulateAttribute(e.idFor('living-motion'), 'main', 'motionSensor', 'motion', 'active');
    expect(status(e, 'living-lamp').switch!.switch!.value).toBe('on');
    expect(runs).toEqual(['Motion turns on the floor lamp']);

    // Still active → no second run.
    e.executeCommands(lamp, [{ component: 'main', capability: 'switch', command: 'off' }]);
    e.simulateAttribute(e.idFor('living-motion'), 'main', 'temperatureMeasurement', 'temperature', 22);
    expect(status(e, 'living-lamp').switch!.switch!.value).toBe('off');
  });

  it('skips disabled rules and supports numeric comparisons', () => {
    const { e, home } = engine();
    const rules = e.getRules(home.locationId);
    const co2 = rules.find((r) => r.name.includes('CO₂'))!;
    e.executeCommands(e.idFor('living-purifier'), [
      { component: 'main', capability: 'switch', command: 'off' },
    ]);
    e.setRuleEnabled(home.locationId, co2.id, false);
    e.simulateAttribute(e.idFor('office-air'), 'main', 'carbonDioxideMeasurement', 'carbonDioxide', 1200);
    expect(status(e, 'living-purifier').switch!.switch!.value).toBe('off');

    e.simulateAttribute(e.idFor('office-air'), 'main', 'carbonDioxideMeasurement', 'carbonDioxide', 700);
    e.setRuleEnabled(home.locationId, co2.id, true);
    e.simulateAttribute(e.idFor('office-air'), 'main', 'carbonDioxideMeasurement', 'carbonDioxide', 1250);
    expect(status(e, 'living-purifier').switch!.switch!.value).toBe('on');
    expect(status(e, 'living-purifier').fanSpeed!.fanSpeed!.value).toBe(3);
  });

  it('creates and deletes rules', () => {
    const { e, home } = engine();
    const before = e.getRules(home.locationId).length;
    const rule = e.createRule(home.locationId, {
      name: 'Door opens → garage light',
      actions: [
        {
          command: {
            devices: [e.idFor('living-ceiling')],
            commands: [{ component: 'main', capability: 'switch', command: 'on' }],
          },
        },
      ],
    });
    expect(e.getRules(home.locationId)).toHaveLength(before + 1);
    e.deleteRule(home.locationId, rule.id);
    expect(e.getRules(home.locationId)).toHaveLength(before);
    expect(() => e.createRule(home.locationId, { name: '', actions: [] })).toThrow(ApiError);
  });

  it('runs scenes and switches mode', () => {
    const { e, home } = engine();
    const scene = e.getScenes(home.locationId).find((s) => s.sceneName === 'Leaving Home')!;
    e.executeCommands(e.idFor('entry-lock'), [{ component: 'main', capability: 'lock', command: 'unlock' }]);
    e.executeScene(scene.sceneId);
    expect(status(e, 'entry-lock').lock!.lock!.value).toBe('locked');
    expect(status(e, 'living-tv').switch!.switch!.value).toBe('off');
    expect(e.getCurrentMode(home.locationId).label).toBe('Away');
  });

  it('counts down the washer and finishes the cycle', () => {
    const { e, advance } = engine();
    expect(status(e, 'laundry-washer').washerOperatingState!.machineState!.value).toBe('run');
    for (let i = 0; i < 40; i++) advance(60_000);
    const washer = status(e, 'laundry-washer').washerOperatingState!;
    expect(washer.machineState!.value).toBe('stop');
    expect(washer.washerJobState!.value).toBe('finish');
  });

  it('opens the garage door through a transition', () => {
    const { e, advance } = engine();
    e.executeCommands(e.idFor('garage-door'), [
      { component: 'main', capability: 'doorControl', command: 'open' },
    ]);
    expect(status(e, 'garage-door').doorControl!.door!.value).toBe('opening');
    advance(10_000);
    expect(status(e, 'garage-door').doorControl!.door!.value).toBe('open');
    expect(status(e, 'garage-door').contactSensor!.contact!.value).toBe('open');
  });

  it('backfills a week of history and filters it', () => {
    const { e, home } = engine(7);
    const fridge = e.idFor('kitchen-fridge');
    const temps = e.getHistory({
      locationId: home.locationId,
      deviceId: fridge,
      attribute: 'temperature',
      limit: 10_000,
    });
    expect(temps.length).toBeGreaterThan(600);
    expect(temps.every((t) => t.deviceId === fridge)).toBe(true);
    // Newest first
    expect(temps[0]!.epoch).toBeGreaterThanOrEqual(temps[temps.length - 1]!.epoch);
    const since = NOW - 24 * 3600_000;
    expect(
      e.getHistory({ locationId: home.locationId, since, limit: 100_000 }).every((ev) => ev.epoch >= since),
    ).toBe(true);
  });

  it('keeps simulated sensors in plausible ranges', () => {
    const { e, advance } = engine();
    for (let i = 0; i < 300; i++) advance(2000);
    const fridge = e.getStatus(e.idFor('kitchen-fridge')).components;
    expect(Number(fridge.cooler!.temperatureMeasurement!.temperature!.value)).toBeGreaterThan(1);
    expect(Number(fridge.cooler!.temperatureMeasurement!.temperature!.value)).toBeLessThan(6);
    expect(Number(fridge.freezer!.temperatureMeasurement!.temperature!.value)).toBeLessThan(-14);
    const co2 = Number(status(e, 'office-air').carbonDioxideMeasurement!.carbonDioxide!.value);
    expect(co2).toBeGreaterThanOrEqual(420);
    expect(co2).toBeLessThanOrEqual(1600);
  });
});
