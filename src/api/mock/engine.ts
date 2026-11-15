import { ApiError, Emitter } from '../client';
import type {
  AttributeState,
  AttributeValue,
  Device,
  DeviceCommand,
  DeviceEvent,
  DeviceHealth,
  DeviceStatus,
  HistoryQuery,
  Location,
  Mode,
  Room,
  Rule,
  RuleAction,
  RuleCondition,
  RuleOperand,
  RuleRequest,
  Scene,
} from '../types';
import { createRng, gaussian, hashString, round, clamp, stableUuid, type Rng } from './random';
import { CAPABILITY_DEFAULTS, LOCATIONS, type DeviceSeed, type LocationSeed, type SceneSeed } from './seed';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const HISTORY_CAP = 60_000;

export interface EngineOptions {
  seed?: number;
  now?: () => number;
  /** Days of synthetic history to generate at boot (0 disables). */
  backfillDays?: number;
  locations?: LocationSeed[];
}

interface Runtime {
  seed: DeviceSeed;
  device: Device;
  status: DeviceStatus;
  health: DeviceHealth;
  rng: Rng;
  /** Countdown timers in simulated ms. */
  timers: Partial<Record<'motion' | 'contact' | 'door' | 'vacuum' | 'vacuumHoming' | 'compressor', number>>;
  washer?: { remainingMs: number; totalMs: number; running: boolean };
  energyWh: number;
  compressorOn: boolean;
}

interface SceneRuntime {
  scene: Scene;
  seed: SceneSeed;
  location: LocationSeed;
}

type ConditionWithBranches = RuleCondition & { then: RuleAction[]; else?: RuleAction[] };

/**
 * An in-memory SmartThings home: device state, commands, scenes, modes, a
 * subset of the Rules API, history, and a physics-ish simulation that keeps
 * sensors moving so the UI always has something live to show.
 */
export class HomeEngine {
  readonly events = new Emitter<DeviceEvent>();
  readonly ruleRuns = new Emitter<{ rule: Rule; trigger: DeviceEvent }>();

  private readonly now: () => number;
  private readonly rng: Rng;
  private readonly locationSeeds: LocationSeed[];
  private readonly locations: Location[] = [];
  private readonly rooms: Room[] = [];
  private readonly runtimes = new Map<string, Runtime>();
  private readonly scenes = new Map<string, SceneRuntime>();
  private readonly modes = new Map<string, Mode[]>();
  private readonly currentMode = new Map<string, string>();
  private readonly rules = new Map<string, Rule[]>();
  private readonly ruleState = new Map<string, boolean>();
  private readonly keyToId = new Map<string, string>();
  private history: DeviceEvent[] = [];
  private ruleCounter = 0;

  constructor(options: EngineOptions = {}) {
    this.now = options.now ?? Date.now;
    this.rng = createRng(options.seed ?? 20261116);
    this.locationSeeds = options.locations ?? LOCATIONS;
    this.boot();
    const days = options.backfillDays ?? 7;
    if (days > 0) this.backfill(days);
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */

  getLocations(): Location[] {
    return structuredClone(this.locations);
  }

  getRooms(locationId: string): Room[] {
    this.assertLocation(locationId);
    return structuredClone(this.rooms.filter((r) => r.locationId === locationId));
  }

  getDevices(locationId: string): Device[] {
    this.assertLocation(locationId);
    return [...this.runtimes.values()]
      .filter((rt) => rt.device.locationId === locationId)
      .map((rt) => structuredClone(rt.device));
  }

  getStatus(deviceId: string): DeviceStatus {
    return structuredClone(this.runtime(deviceId).status);
  }

  getHealth(deviceId: string): DeviceHealth {
    return structuredClone(this.runtime(deviceId).health);
  }

  getScenes(locationId: string): Scene[] {
    this.assertLocation(locationId);
    return [...this.scenes.values()]
      .filter((s) => s.scene.locationId === locationId)
      .map((s) => structuredClone(s.scene));
  }

  getModes(locationId: string): Mode[] {
    this.assertLocation(locationId);
    return structuredClone(this.modes.get(locationId) ?? []);
  }

  getCurrentMode(locationId: string): Mode {
    const modes = this.getModes(locationId);
    const id = this.currentMode.get(locationId);
    const mode = modes.find((m) => m.id === id) ?? modes[0];
    if (!mode) throw new ApiError(404, `/locations/${locationId}/modes/current`, 'No modes configured');
    return mode;
  }

  getRules(locationId: string): Rule[] {
    this.assertLocation(locationId);
    return structuredClone(this.rules.get(locationId) ?? []);
  }

  getHistory(query: HistoryQuery): DeviceEvent[] {
    const limit = query.limit ?? 200;
    const out: DeviceEvent[] = [];
    for (let i = this.history.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.history[i]!;
      if (query.since !== undefined && e.epoch < query.since) break;
      if (e.locationId !== query.locationId) continue;
      if (query.deviceId && e.deviceId !== query.deviceId) continue;
      if (query.capability && e.capability !== query.capability) continue;
      if (query.attribute && e.attribute !== query.attribute) continue;
      out.push(e);
    }
    return structuredClone(out);
  }

  /** Resolve a seed key (e.g. "entry-lock") to its device id. Handy for tests. */
  idFor(key: string): string {
    const id = this.keyToId.get(key);
    if (!id) throw new Error(`Unknown device key ${key}`);
    return id;
  }

  /* ------------------------------------------------------------------ */
  /* Mutations                                                           */
  /* ------------------------------------------------------------------ */

  executeCommands(deviceId: string, commands: DeviceCommand[], depth = 0) {
    const rt = this.runtime(deviceId);
    if (rt.health.state !== 'ONLINE') {
      throw new ApiError(409, `/devices/${deviceId}/commands`, `${rt.device.label} is offline`);
    }
    for (const command of commands) this.applyCommand(rt, command, depth);
    this.updatePower(rt, depth);
  }

  executeScene(sceneId: string) {
    const entry = this.scenes.get(sceneId);
    if (!entry) throw new ApiError(404, `/scenes/${sceneId}/execute`, 'Scene not found');
    for (const action of entry.seed.actions) {
      const id = this.keyToId.get(action.device);
      if (!id) continue;
      const rt = this.runtimes.get(id);
      if (!rt || rt.health.state !== 'ONLINE') continue; // scenes skip unreachable devices
      for (const c of action.commands) this.applyCommand(rt, c, 0);
      this.updatePower(rt, 0);
    }
    if (entry.seed.mode) {
      const mode = this.modes.get(entry.scene.locationId)?.find((m) => m.name === entry.seed.mode);
      if (mode) this.currentMode.set(entry.scene.locationId, mode.id);
    }
    entry.scene.lastExecutedDate = new Date(this.now()).toISOString();
  }

  setMode(locationId: string, modeId: string): Mode {
    const mode = this.getModes(locationId).find((m) => m.id === modeId);
    if (!mode) throw new ApiError(404, `/locations/${locationId}/modes/current`, 'Mode not found');
    this.currentMode.set(locationId, modeId);
    return mode;
  }

  createRule(locationId: string, request: RuleRequest): Rule {
    this.assertLocation(locationId);
    validateRule(request);
    const at = new Date(this.now()).toISOString();
    const rule: Rule = {
      id: stableUuid(`rule-${locationId}-${++this.ruleCounter}-${this.now()}`),
      name: request.name,
      actions: structuredClone(request.actions),
      executionLocation: 'Cloud',
      dateCreated: at,
      dateUpdated: at,
      enabled: true,
    };
    this.rules.set(locationId, [...(this.rules.get(locationId) ?? []), rule]);
    this.primeRule(rule);
    return structuredClone(rule);
  }

  deleteRule(locationId: string, ruleId: string) {
    const list = this.rules.get(locationId) ?? [];
    if (!list.some((r) => r.id === ruleId)) throw new ApiError(404, `/rules/${ruleId}`, 'Rule not found');
    this.rules.set(
      locationId,
      list.filter((r) => r.id !== ruleId),
    );
  }

  setRuleEnabled(locationId: string, ruleId: string, enabled: boolean): Rule {
    const rule = (this.rules.get(locationId) ?? []).find((r) => r.id === ruleId);
    if (!rule) throw new ApiError(404, `/rules/${ruleId}`, 'Rule not found');
    rule.enabled = enabled;
    rule.dateUpdated = new Date(this.now()).toISOString();
    if (enabled) this.primeRule(rule);
    return structuredClone(rule);
  }

  /** Force a sensor reading — powers the "Simulate" controls in demo mode. */
  simulateAttribute(
    deviceId: string,
    component: string,
    capability: string,
    attribute: string,
    value: AttributeValue,
  ) {
    const rt = this.runtime(deviceId);
    this.set(rt, component, capability, attribute, value, undefined, 0);
    if (capability === 'motionSensor' && value === 'active') rt.timers.motion = 45_000;
    if (capability === 'contactSensor' && value === 'open') rt.timers.contact = undefined;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */

  /** Advance the simulation by `dtMs` of simulated time. */
  tick(dtMs: number) {
    const now = this.now();
    const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
    for (const rt of this.runtimes.values()) {
      if (rt.health.state !== 'ONLINE') continue;
      const loc = this.locationSeeds.find((l) => this.locationId(l) === rt.device.locationId);
      const away = loc ? this.isAway(rt.device.locationId) : false;
      this.tickDevice(rt, dtMs, hour, away);
    }
  }

  private tickDevice(rt: Runtime, dt: number, hour: number, away: boolean) {
    const has = (cap: string, component = 'main') => hasCapability(rt.device, cap, component);
    const read = (cap: string, attr: string, component = 'main') =>
      rt.status.components[component]?.[cap]?.[attr]?.value;
    const p = (perMinute: number) => rt.rng() < 1 - Math.exp((-perMinute * dt) / MINUTE);

    // Temperatures on every component that measures them.
    for (const component of rt.device.components) {
      if (!has('temperatureMeasurement', component.id)) continue;
      const current = Number(read('temperatureMeasurement', 'temperature', component.id) ?? 21);
      let target = this.ambientTarget(rt, component.id, hour);
      if (has('thermostatOperatingState')) {
        const op = read('thermostatOperatingState', 'thermostatOperatingState');
        if (op === 'heating') target = current + 2;
        if (op === 'cooling') target = current - 2;
      }
      const rate = has('thermostatOperatingState') ? 0.04 : 0.01;
      const next = current + (target - current) * Math.min(1, (rate * dt) / 2000) + gaussian(rt.rng) * 0.015;
      this.set(rt, component.id, 'temperatureMeasurement', 'temperature', round(next, 1), 'C');
    }

    if (has('thermostatOperatingState')) this.runThermostat(rt);

    if (has('relativeHumidityMeasurement')) {
      const h = Number(read('relativeHumidityMeasurement', 'humidity') ?? 45);
      const next = clamp(h + (45 - h) * 0.002 * (dt / 1000) + gaussian(rt.rng) * 0.35, 28, 68);
      this.set(rt, 'main', 'relativeHumidityMeasurement', 'humidity', Math.round(next), '%');
    }

    if (has('illuminanceMeasurement')) {
      const daylight = Math.max(0, Math.sin(((hour - 6) / 13) * Math.PI));
      const lux = Math.round(15 + 520 * daylight + gaussian(rt.rng) * 6);
      const prev = Number(read('illuminanceMeasurement', 'illuminance') ?? 0);
      if (Math.abs(lux - prev) >= 10)
        this.set(rt, 'main', 'illuminanceMeasurement', 'illuminance', lux, 'lux');
    }

    if (has('motionSensor')) {
      if (rt.timers.motion !== undefined) {
        rt.timers.motion -= dt;
        if (rt.timers.motion <= 0) {
          rt.timers.motion = undefined;
          this.set(rt, 'main', 'motionSensor', 'motion', 'inactive');
        }
      } else if (p(away ? 0.02 : 0.5)) {
        rt.timers.motion = 20_000 + rt.rng() * 40_000;
        this.set(rt, 'main', 'motionSensor', 'motion', 'active');
      }
    }

    if (has('contactSensor') && !has('doorControl')) {
      const rate =
        rt.seed.category === 'Refrigerator' ? 0.08 : rt.seed.category === 'ContactSensor' ? 0.06 : 0;
      if (rt.timers.contact !== undefined) {
        rt.timers.contact -= dt;
        if (rt.timers.contact <= 0) {
          rt.timers.contact = undefined;
          this.set(rt, 'main', 'contactSensor', 'contact', 'closed');
        }
      } else if (rate > 0 && !away && p(rate) && read('contactSensor', 'contact') === 'closed') {
        rt.timers.contact = 4_000 + rt.rng() * 12_000;
        this.set(rt, 'main', 'contactSensor', 'contact', 'open');
      }
    }

    if (has('doorControl') && rt.timers.door !== undefined) {
      rt.timers.door -= dt;
      if (rt.timers.door <= 0) {
        rt.timers.door = undefined;
        const final = read('doorControl', 'door') === 'opening' ? 'open' : 'closed';
        this.set(rt, 'main', 'doorControl', 'door', final);
        if (has('contactSensor')) this.set(rt, 'main', 'contactSensor', 'contact', final);
      }
    }

    if (has('carbonDioxideMeasurement')) {
      const co2 = Number(read('carbonDioxideMeasurement', 'carbonDioxide') ?? 600);
      const occupied = !away && hour > 8 && hour < 19;
      const target = occupied ? 900 : 520;
      const next = clamp(co2 + (target - co2) * 0.004 * (dt / 1000) + gaussian(rt.rng) * 9, 420, 1600);
      const rounded = Math.round(next / 5) * 5;
      if (rounded !== co2) this.set(rt, 'main', 'carbonDioxideMeasurement', 'carbonDioxide', rounded, 'ppm');
    }

    if (has('airQualitySensor')) {
      const aq = Number(read('airQualitySensor', 'airQuality') ?? 20);
      const purifying = has('fanSpeed') && read('switch', 'switch') === 'on';
      const target = purifying ? 12 : 30;
      const next = clamp(aq + (target - aq) * 0.003 * (dt / 1000) + gaussian(rt.rng) * 0.6, 3, 95);
      this.set(rt, 'main', 'airQualitySensor', 'airQuality', Math.round(next), 'CAQI');
    }

    if (rt.washer?.running) {
      rt.washer.remainingMs -= dt;
      if (rt.washer.remainingMs <= 0) {
        rt.washer = { remainingMs: 0, totalMs: rt.washer.totalMs, running: false };
        this.set(rt, 'main', 'washerOperatingState', 'machineState', 'stop');
        this.set(rt, 'main', 'washerOperatingState', 'washerJobState', 'finish');
        this.set(rt, 'main', 'washerOperatingState', 'completionTime', null);
      } else {
        const progress = 1 - rt.washer.remainingMs / rt.washer.totalMs;
        const job = progress < 0.55 ? 'wash' : progress < 0.8 ? 'rinse' : 'spin';
        this.set(rt, 'main', 'washerOperatingState', 'washerJobState', job);
        this.setCompletionTime(rt);
      }
    }

    if (has('robotCleanerMovement')) this.runVacuum(rt, dt);

    if (rt.seed.category === 'Refrigerator') {
      rt.timers.compressor = (rt.timers.compressor ?? 0) - dt;
      if (rt.timers.compressor <= 0) {
        rt.compressorOn = !rt.compressorOn;
        rt.timers.compressor = (rt.compressorOn ? 6 : 10) * MINUTE * (0.6 + rt.rng() * 0.8);
      }
    }

    if (has('powerMeter')) {
      this.updatePower(rt, 0, true);
      if (has('energyMeter')) {
        const watts = Number(read('powerMeter', 'power') ?? 0);
        rt.energyWh += (watts * dt) / HOUR;
        if (rt.energyWh >= 10) {
          const kwh = Number(read('energyMeter', 'energy') ?? 0);
          const add = Math.floor(rt.energyWh / 10) * 0.01;
          rt.energyWh -= add * 1000;
          this.set(rt, 'main', 'energyMeter', 'energy', round(kwh + add, 2), 'kWh');
        }
      }
    }
  }

  private runThermostat(rt: Runtime) {
    const v = (cap: string, attr: string) => rt.status.components.main?.[cap]?.[attr]?.value;
    const temp = Number(v('temperatureMeasurement', 'temperature'));
    const mode = String(v('thermostatMode', 'thermostatMode'));
    const heat = Number(v('thermostatHeatingSetpoint', 'heatingSetpoint'));
    const cool = Number(v('thermostatCoolingSetpoint', 'coolingSetpoint'));
    const current = String(v('thermostatOperatingState', 'thermostatOperatingState'));
    let next = current;
    const canHeat = mode === 'heat' || mode === 'auto';
    const canCool = mode === 'cool' || mode === 'auto';
    if (canHeat && temp < heat - 0.3) next = 'heating';
    else if (canCool && temp > cool + 0.3) next = 'cooling';
    else if (current === 'heating' && (!canHeat || temp >= heat + 0.2)) next = 'idle';
    else if (current === 'cooling' && (!canCool || temp <= cool - 0.2)) next = 'idle';
    if (mode === 'off') next = 'idle';
    this.set(rt, 'main', 'thermostatOperatingState', 'thermostatOperatingState', next);
  }

  private runVacuum(rt: Runtime, dt: number) {
    const movement = rt.status.components.main?.robotCleanerMovement?.robotCleanerMovement?.value;
    const battery = Number(rt.status.components.main?.battery?.battery?.value ?? 100);
    if (movement === 'cleaning') {
      rt.timers.vacuum = (rt.timers.vacuum ?? 25 * MINUTE) - dt;
      const drained = battery - (dt / MINUTE) * 1.2;
      this.set(rt, 'main', 'battery', 'battery', Math.max(5, Math.round(drained)), '%');
      if (rt.timers.vacuum <= 0 || drained < 20) {
        rt.timers.vacuum = undefined;
        rt.timers.vacuumHoming = 20_000;
        this.set(rt, 'main', 'robotCleanerMovement', 'robotCleanerMovement', 'homing');
      }
    } else if (movement === 'homing') {
      rt.timers.vacuumHoming = (rt.timers.vacuumHoming ?? 20_000) - dt;
      if (rt.timers.vacuumHoming <= 0) {
        rt.timers.vacuumHoming = undefined;
        this.set(rt, 'main', 'robotCleanerMovement', 'robotCleanerMovement', 'charging');
      }
    } else if (movement === 'charging' && battery < 100) {
      this.set(rt, 'main', 'battery', 'battery', Math.min(100, Math.round(battery + (dt / MINUTE) * 2)), '%');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Commands                                                            */
  /* ------------------------------------------------------------------ */

  private applyCommand(rt: Runtime, c: DeviceCommand, depth: number) {
    const component = c.component || 'main';
    const args = c.arguments ?? [];
    const path = `/devices/${rt.device.deviceId}/commands`;
    if (!hasCapability(rt.device, c.capability, component)) {
      throw new ApiError(422, path, `${rt.device.label} has no ${c.capability} on component ${component}`);
    }
    const set = (cap: string, attr: string, value: AttributeValue, unit?: string) =>
      this.set(rt, component, cap, attr, value, unit, depth);
    const turnOn = () => {
      if (hasCapability(rt.device, 'switch', component)) set('switch', 'switch', 'on');
    };
    const num = (i = 0) => {
      const n = Number(args[i]);
      if (!Number.isFinite(n)) throw new ApiError(422, path, `${c.capability}.${c.command} expects a number`);
      return n;
    };

    switch (`${c.capability}.${c.command}`) {
      case 'switch.on':
        set('switch', 'switch', 'on');
        break;
      case 'switch.off':
        set('switch', 'switch', 'off');
        if (hasCapability(rt.device, 'mediaPlayback')) set('mediaPlayback', 'playbackStatus', 'stopped');
        break;
      case 'switchLevel.setLevel': {
        const level = Math.round(clamp(num(), 0, 100));
        set('switchLevel', 'level', level, '%');
        if (hasCapability(rt.device, 'switch', component)) set('switch', 'switch', level > 0 ? 'on' : 'off');
        break;
      }
      case 'colorTemperature.setColorTemperature':
        set('colorTemperature', 'colorTemperature', Math.round(clamp(num(), 2000, 6500)), 'K');
        turnOn();
        break;
      case 'colorControl.setColor': {
        const color = (args[0] ?? {}) as { hue?: number; saturation?: number };
        if (color.hue !== undefined) set('colorControl', 'hue', round(clamp(color.hue, 0, 100), 1));
        if (color.saturation !== undefined)
          set('colorControl', 'saturation', round(clamp(color.saturation, 0, 100), 1));
        turnOn();
        break;
      }
      case 'colorControl.setHue':
        set('colorControl', 'hue', round(clamp(num(), 0, 100), 1));
        turnOn();
        break;
      case 'colorControl.setSaturation':
        set('colorControl', 'saturation', round(clamp(num(), 0, 100), 1));
        turnOn();
        break;
      case 'lock.lock':
        set('lock', 'lock', 'locked');
        break;
      case 'lock.unlock':
        set('lock', 'lock', 'unlocked');
        break;
      case 'thermostatMode.setThermostatMode':
      case 'thermostatMode.heat':
      case 'thermostatMode.cool':
      case 'thermostatMode.auto':
      case 'thermostatMode.off': {
        const mode = c.command === 'setThermostatMode' ? String(args[0]) : c.command;
        const supported = rt.status.components[component]?.thermostatMode?.supportedThermostatModes?.value;
        if (Array.isArray(supported) && !supported.includes(mode)) {
          throw new ApiError(422, path, `Unsupported thermostat mode "${mode}"`);
        }
        set('thermostatMode', 'thermostatMode', mode);
        this.runThermostat(rt);
        break;
      }
      case 'thermostatHeatingSetpoint.setHeatingSetpoint':
        set('thermostatHeatingSetpoint', 'heatingSetpoint', round(clamp(num(), 5, 32), 1), 'C');
        this.runThermostat(rt);
        break;
      case 'thermostatCoolingSetpoint.setCoolingSetpoint':
        set('thermostatCoolingSetpoint', 'coolingSetpoint', round(clamp(num(), 10, 35), 1), 'C');
        this.runThermostat(rt);
        break;
      case 'windowShade.open':
        set('windowShadeLevel', 'shadeLevel', 100, '%');
        set('windowShade', 'windowShade', 'open');
        break;
      case 'windowShade.close':
        set('windowShadeLevel', 'shadeLevel', 0, '%');
        set('windowShade', 'windowShade', 'closed');
        break;
      case 'windowShade.pause':
        break;
      case 'windowShadeLevel.setShadeLevel': {
        const level = Math.round(clamp(num(), 0, 100));
        set('windowShadeLevel', 'shadeLevel', level, '%');
        set('windowShade', 'windowShade', level === 0 ? 'closed' : level === 100 ? 'open' : 'partially open');
        break;
      }
      case 'audioVolume.setVolume':
        set('audioVolume', 'volume', Math.round(clamp(num(), 0, 100)), '%');
        break;
      case 'audioVolume.volumeUp':
      case 'audioVolume.volumeDown': {
        const v = Number(rt.status.components[component]?.audioVolume?.volume?.value ?? 0);
        set('audioVolume', 'volume', clamp(v + (c.command === 'volumeUp' ? 5 : -5), 0, 100), '%');
        break;
      }
      case 'audioMute.mute':
        set('audioMute', 'mute', 'muted');
        break;
      case 'audioMute.unmute':
        set('audioMute', 'mute', 'unmuted');
        break;
      case 'audioMute.setMute':
        set('audioMute', 'mute', String(args[0]) === 'muted' ? 'muted' : 'unmuted');
        break;
      case 'mediaPlayback.play':
        turnOn();
        set('mediaPlayback', 'playbackStatus', 'playing');
        break;
      case 'mediaPlayback.pause':
        set('mediaPlayback', 'playbackStatus', 'paused');
        break;
      case 'mediaPlayback.stop':
        set('mediaPlayback', 'playbackStatus', 'stopped');
        break;
      case 'mediaInputSource.setInputSource':
        turnOn();
        set('mediaInputSource', 'inputSource', String(args[0]));
        break;
      case 'fanSpeed.setFanSpeed': {
        const speed = Math.round(clamp(num(), 0, 4));
        set('fanSpeed', 'fanSpeed', speed);
        if (hasCapability(rt.device, 'switch', component)) set('switch', 'switch', speed > 0 ? 'on' : 'off');
        break;
      }
      case 'washerOperatingState.setMachineState':
        this.setWasher(rt, String(args[0]), depth);
        break;
      case 'robotCleanerMovement.setRobotCleanerMovement': {
        const movement = String(args[0]);
        if (movement === 'cleaning') rt.timers.vacuum = 25 * MINUTE;
        if (movement === 'homing') rt.timers.vacuumHoming = 20_000;
        set('robotCleanerMovement', 'robotCleanerMovement', movement);
        break;
      }
      case 'robotCleanerCleaningMode.setRobotCleanerCleaningMode':
        set('robotCleanerCleaningMode', 'robotCleanerCleaningMode', String(args[0]));
        break;
      case 'doorControl.open':
      case 'doorControl.close': {
        const target = c.command === 'open' ? 'open' : 'closed';
        if (rt.status.components.main?.doorControl?.door?.value === target) break;
        rt.timers.door = 8_000;
        set('doorControl', 'door', c.command === 'open' ? 'opening' : 'closing');
        break;
      }
      case 'refresh.refresh':
        break;
      default:
        throw new ApiError(422, path, `Unsupported command ${c.capability}.${c.command}`);
    }
  }

  private setWasher(rt: Runtime, state: string, depth: number) {
    const set = (attr: string, value: AttributeValue) =>
      this.set(rt, 'main', 'washerOperatingState', attr, value, undefined, depth);
    if (state === 'run') {
      if (!rt.washer || rt.washer.remainingMs <= 0)
        rt.washer = { remainingMs: 52 * MINUTE, totalMs: 52 * MINUTE, running: true };
      rt.washer.running = true;
      if (hasCapability(rt.device, 'switch'))
        this.set(rt, 'main', 'switch', 'switch', 'on', undefined, depth);
      set('machineState', 'run');
      set('washerJobState', 'wash');
      this.setCompletionTime(rt, true);
    } else if (state === 'pause') {
      if (rt.washer) rt.washer.running = false;
      set('machineState', 'pause');
    } else if (state === 'stop') {
      rt.washer = undefined;
      set('machineState', 'stop');
      set('washerJobState', 'none');
      set('completionTime', null);
    } else {
      throw new ApiError(422, `/devices/${rt.device.deviceId}/commands`, `Unknown machine state "${state}"`);
    }
  }

  private setCompletionTime(rt: Runtime, force = false) {
    if (!rt.washer) return;
    const done = this.now() + rt.washer.remainingMs;
    const iso = new Date(Math.ceil(done / MINUTE) * MINUTE).toISOString();
    const current = rt.status.components.main?.washerOperatingState?.completionTime?.value;
    if (force || current !== iso) this.set(rt, 'main', 'washerOperatingState', 'completionTime', iso);
  }

  private updatePower(rt: Runtime, depth: number, jitter = false) {
    if (!hasCapability(rt.device, 'powerMeter')) return;
    const main = rt.status.components.main ?? {};
    const rated = rt.seed.ratedPowerW ?? 10;
    const standby = rt.seed.standbyPowerW ?? 0.5;
    let watts = standby;
    if (rt.seed.category === 'Refrigerator') {
      watts = rt.compressorOn ? rated : 4.2;
    } else if (rt.seed.category === 'Washer') {
      const running = main.washerOperatingState?.machineState?.value === 'run';
      const job = main.washerOperatingState?.washerJobState?.value;
      watts = running ? (job === 'spin' ? rated : job === 'wash' ? rated * 0.45 : rated * 0.2) : standby;
    } else if (main.switch?.switch?.value === 'on') {
      const level = main.switchLevel?.level?.value;
      const fan = main.fanSpeed?.fanSpeed?.value;
      watts = rated;
      if (typeof level === 'number') watts = rated * (0.15 + 0.85 * (level / 100));
      if (typeof fan === 'number') watts = rated * (0.25 + 0.75 * (fan / 4));
      if (rt.seed.category === 'SmartPlug' && rt.seed.key.includes('coffee'))
        watts = rated * (rt.rng() < 0.3 ? 1 : 0.08);
    }
    if (jitter && watts > standby) watts *= 1 + gaussian(rt.rng) * 0.025;
    const value = round(Math.max(0, watts), watts < 10 ? 1 : 0);
    const prev = Number(main.powerMeter?.power?.value ?? 0);
    if (!jitter || Math.abs(value - prev) >= Math.max(0.5, prev * 0.02)) {
      this.set(rt, 'main', 'powerMeter', 'power', value, 'W', depth);
    }
  }

  /* ------------------------------------------------------------------ */
  /* State + events                                                      */
  /* ------------------------------------------------------------------ */

  private set(
    rt: Runtime,
    component: string,
    capability: string,
    attribute: string,
    value: AttributeValue,
    unit?: string,
    depth = 0,
  ) {
    const comp = (rt.status.components[component] ??= {});
    const cap = (comp[capability] ??= {});
    const prev = cap[attribute];
    if (prev && sameValue(prev.value, value)) return;
    const now = this.now();
    const time = new Date(now).toISOString();
    cap[attribute] = {
      value,
      ...((unit ?? prev?.unit) ? { unit: unit ?? prev?.unit } : {}),
      timestamp: time,
    };
    rt.health.lastUpdatedDate = time;
    const event: DeviceEvent = {
      deviceId: rt.device.deviceId,
      deviceName: rt.device.label ?? rt.device.name,
      locationId: rt.device.locationId,
      component,
      capability,
      attribute,
      value,
      ...(cap[attribute]?.unit ? { unit: cap[attribute]?.unit } : {}),
      time,
      epoch: now,
    };
    this.record(event);
    this.events.emit(event);
    this.evaluateRules(event, depth);
  }

  private record(event: DeviceEvent) {
    this.history.push(event);
    if (this.history.length > HISTORY_CAP) this.history = this.history.slice(-Math.floor(HISTORY_CAP * 0.9));
  }

  /* ------------------------------------------------------------------ */
  /* Rules                                                               */
  /* ------------------------------------------------------------------ */

  private evaluateRules(trigger: DeviceEvent, depth: number) {
    if (depth > 4) return;
    for (const rule of this.rules.get(trigger.locationId) ?? []) {
      if (rule.enabled === false) continue;
      rule.actions.forEach((action, index) => {
        if (!('if' in action)) return;
        const condition = action.if as ConditionWithBranches;
        if (!references(condition, trigger)) return;
        const key = `${rule.id}:${index}`;
        const result = this.evaluateCondition(condition);
        const previous = this.ruleState.get(key) ?? false;
        this.ruleState.set(key, result);
        const branch =
          result && !previous ? condition.then : !result && previous ? condition.else : undefined;
        if (branch?.length) {
          this.runActions(branch, depth + 1);
          rule.dateUpdated = rule.dateUpdated ?? rule.dateCreated;
          this.ruleRuns.emit({ rule: structuredClone(rule), trigger });
        }
      });
    }
  }

  private primeRule(rule: Rule) {
    rule.actions.forEach((action, index) => {
      if ('if' in action)
        this.ruleState.set(`${rule.id}:${index}`, this.evaluateCondition(action.if as ConditionWithBranches));
    });
  }

  private evaluateCondition(condition: RuleCondition): boolean {
    const [op, comparison] =
      'equals' in condition
        ? (['equals', condition.equals] as const)
        : 'greaterThan' in condition
          ? (['greaterThan', condition.greaterThan] as const)
          : (['lessThan', condition.lessThan] as const);
    const left = this.operandValue(comparison.left);
    const right = this.operandValue(comparison.right);
    if (left === undefined || right === undefined) return false;
    if (op === 'equals') return String(left) === String(right);
    const l = Number(left);
    const r = Number(right);
    if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
    return op === 'greaterThan' ? l > r : l < r;
  }

  private operandValue(operand: RuleOperand): AttributeValue | undefined {
    if ('device' in operand) {
      const id = operand.device.devices[0];
      const rt = id ? this.runtimes.get(id) : undefined;
      return rt?.status.components[operand.device.component]?.[operand.device.capability]?.[
        operand.device.attribute
      ]?.value;
    }
    if ('string' in operand) return operand.string;
    if ('integer' in operand) return operand.integer;
    return operand.decimal;
  }

  private runActions(actions: RuleAction[], depth: number) {
    for (const action of actions) {
      if ('command' in action) {
        for (const deviceId of action.command.devices) {
          const rt = this.runtimes.get(deviceId);
          if (!rt || rt.health.state !== 'ONLINE') continue;
          for (const c of action.command.commands) {
            try {
              this.applyCommand(rt, c, depth);
            } catch {
              // A rule targeting an unsupported command should not break the simulation.
            }
          }
          this.updatePower(rt, depth);
        }
      } else if ('if' in action) {
        const condition = action.if as ConditionWithBranches;
        const branch = this.evaluateCondition(condition) ? condition.then : condition.else;
        if (branch) this.runActions(branch, depth + 1);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot + backfill                                                     */
  /* ------------------------------------------------------------------ */

  private locationId(seed: LocationSeed) {
    return stableUuid(`location-${seed.key}`);
  }

  private boot() {
    const created = new Date(this.now() - 400 * DAY).toISOString();
    for (const loc of this.locationSeeds) {
      const locationId = this.locationId(loc);
      this.locations.push({
        locationId,
        name: loc.name,
        countryCode: loc.countryCode,
        timeZoneId: loc.timeZoneId,
        temperatureScale: loc.temperatureScale,
      });
      const roomIds = new Map<string, string>();
      for (const room of loc.rooms) {
        const roomId = stableUuid(`room-${loc.key}-${room.key}`);
        roomIds.set(room.key, roomId);
        this.rooms.push({ roomId, locationId, name: room.name });
      }
      for (const seed of loc.devices) {
        const deviceId = stableUuid(`device-${seed.key}`);
        this.keyToId.set(seed.key, deviceId);
        const components = seed.components ?? [{ id: 'main', capabilities: seed.capabilities ?? [] }];
        const device: Device = {
          deviceId,
          name: seed.name,
          label: seed.label,
          manufacturerName: seed.manufacturer,
          presentationId: `${seed.manufacturer.replace(/\W+/g, '').slice(0, 6).toUpperCase()}-${seed.model}`,
          deviceManufacturerCode: seed.model,
          locationId,
          roomId: roomIds.get(seed.room),
          type: seed.type,
          createTime: created,
          components: components.map((c) => ({
            id: c.id,
            ...(c.label ? { label: c.label } : {}),
            capabilities: c.capabilities.map((id) => ({ id, version: 1 })),
            categories: [{ name: c.category ?? seed.category, categoryType: 'manufacturer' }],
          })),
        };
        const timestamp = new Date(this.now() - 5 * MINUTE).toISOString();
        const status: DeviceStatus = { components: {} };
        for (const c of components) {
          const compStatus: Record<string, Record<string, AttributeState>> = {};
          for (const cap of c.capabilities) {
            const defaults = structuredClone(CAPABILITY_DEFAULTS[cap] ?? {});
            const overrides = seed.state?.[c.id]?.[cap] ?? {};
            for (const [attr, value] of Object.entries(overrides)) {
              defaults[attr] = { ...(defaults[attr] ?? {}), value };
            }
            for (const state of Object.values(defaults)) state.timestamp = timestamp;
            compStatus[cap] = defaults;
          }
          status.components[c.id] = compStatus;
        }
        const rt: Runtime = {
          seed,
          device,
          status,
          health: {
            deviceId,
            state: seed.offline ? 'OFFLINE' : 'ONLINE',
            lastUpdatedDate: seed.offline
              ? new Date(this.now() - 2 * DAY - 3 * HOUR).toISOString()
              : timestamp,
          },
          rng: createRng(hashString(seed.key) ^ Math.floor(this.rng() * 1e9)),
          timers: {},
          energyWh: 0,
          compressorOn: false,
        };
        this.runtimes.set(deviceId, rt);
        this.updatePowerSilently(rt);
      }

      this.modes.set(
        locationId,
        loc.modes.map((m) => ({ id: stableUuid(`mode-${loc.key}-${m.key}`), label: m.label, name: m.key })),
      );
      this.currentMode.set(locationId, stableUuid(`mode-${loc.key}-${loc.initialMode}`));

      for (const scene of loc.scenes) {
        const sceneId = stableUuid(`scene-${loc.key}-${scene.key}`);
        this.scenes.set(sceneId, {
          seed: scene,
          location: loc,
          scene: {
            sceneId,
            sceneName: scene.name,
            sceneIcon: scene.icon,
            sceneColor: scene.color,
            locationId,
            lastExecutedDate: new Date(this.now() - (1 + Math.floor(this.rng() * 70)) * HOUR).toISOString(),
          },
        });
      }

      const id = (key: string) => this.idFor(key);
      const rules: Rule[] = loc.rules.map((r) => ({
        id: stableUuid(`rule-${loc.key}-${r.key}`),
        name: r.name,
        actions: r.build(id),
        executionLocation: 'Cloud',
        dateCreated: new Date(this.now() - 30 * DAY).toISOString(),
        dateUpdated: new Date(this.now() - 3 * DAY).toISOString(),
        enabled: r.enabled,
      }));
      this.rules.set(locationId, rules);
      rules.forEach((r) => this.primeRule(r));
    }

    // Start the demo with a wash cycle already running so there is a live countdown.
    const washer = this.runtimes.get(this.keyToId.get('laundry-washer') ?? '');
    if (washer) {
      washer.washer = { remainingMs: 31 * MINUTE, totalMs: 52 * MINUTE, running: true };
      const main = washer.status.components.main!;
      main.washerOperatingState!.machineState!.value = 'run';
      main.washerOperatingState!.washerJobState!.value = 'wash';
      main.washerOperatingState!.completionTime!.value = new Date(
        Math.ceil((this.now() + 31 * MINUTE) / MINUTE) * MINUTE,
      ).toISOString();
      this.updatePowerSilently(washer);
    }
  }

  private updatePowerSilently(rt: Runtime) {
    const main = rt.status.components.main;
    if (!main?.powerMeter) return;
    const rated = rt.seed.ratedPowerW ?? 10;
    const standby = rt.seed.standbyPowerW ?? 0.5;
    let watts = main.switch?.switch?.value === 'on' ? rated : standby;
    if (rt.seed.category === 'Refrigerator') watts = 4.2;
    if (rt.seed.category === 'Washer')
      watts = main.washerOperatingState?.machineState?.value === 'run' ? rated * 0.45 : standby;
    const level = main.switchLevel?.level?.value;
    if (main.switch?.switch?.value === 'on' && typeof level === 'number')
      watts = rated * (0.15 + 0.85 * (level / 100));
    const fan = main.fanSpeed?.fanSpeed?.value;
    if (main.switch?.switch?.value === 'on' && typeof fan === 'number')
      watts = rated * (0.25 + 0.75 * (fan / 4));
    main.powerMeter.power = {
      value: round(watts, watts < 10 ? 1 : 0),
      unit: 'W',
      timestamp: new Date(this.now()).toISOString(),
    };
  }

  private ambientTarget(rt: Runtime, component: string, hour: number) {
    if (component === 'cooler') return 3.5;
    if (component === 'freezer') return -18;
    const cabin = rt.device.locationId === this.locationIdByKey('cabin');
    const base = cabin ? 12.5 : 21.2;
    return (
      base + 1.1 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + (rt.seed.category === 'LeakSensor' ? -1.5 : 0)
    );
  }

  private locationIdByKey(key: string) {
    return stableUuid(`location-${key}`);
  }

  private isAway(locationId: string) {
    const id = this.currentMode.get(locationId);
    return this.modes.get(locationId)?.find((m) => m.id === id)?.name === 'away';
  }

  /** Synthesises `days` of plausible history so charts have something to show on first load. */
  private backfill(days: number) {
    const end = this.now();
    const start = end - days * DAY;
    const events: DeviceEvent[] = [];
    const push = (
      rt: Runtime,
      component: string,
      capability: string,
      attribute: string,
      value: AttributeValue,
      epoch: number,
      unit?: string,
    ) => {
      events.push({
        deviceId: rt.device.deviceId,
        deviceName: rt.device.label ?? rt.device.name,
        locationId: rt.device.locationId,
        component,
        capability,
        attribute,
        value,
        ...(unit ? { unit } : {}),
        time: new Date(epoch).toISOString(),
        epoch,
      });
    };

    for (const rt of this.runtimes.values()) {
      const rng = createRng(hashString(`backfill-${rt.seed.key}`));
      const has = (cap: string, component = 'main') => hasCapability(rt.device, cap, component);
      const cabin = rt.device.locationId === this.locationIdByKey('cabin');
      let lastSwitch: string | undefined;
      const energy = Number(rt.status.components.main?.energyMeter?.energy?.value ?? 0);
      const energyPoints: Array<{ epoch: number; wh: number }> = [];
      let lastLock: string | undefined;

      for (let t = start; t < end - 10 * MINUTE; t += 15 * MINUTE) {
        const d = new Date(t);
        const hour = d.getHours() + d.getMinutes() / 60;
        const weekday = d.getDay() >= 1 && d.getDay() <= 5;
        const halfHour = d.getMinutes() % 30 === 0;
        const onHour = d.getMinutes() === 0;
        const dayIndex = Math.floor((t - start) / DAY);

        if (halfHour) {
          for (const component of rt.device.components) {
            if (!has('temperatureMeasurement', component.id)) continue;
            const value =
              this.ambientTarget(rt, component.id, hour) +
              gaussian(rng) * (component.id === 'main' ? 0.25 : 0.3);
            push(rt, component.id, 'temperatureMeasurement', 'temperature', round(value, 1), t, 'C');
          }
          if (has('relativeHumidityMeasurement')) {
            const value = 44 + 6 * Math.sin(((hour - 4) / 24) * 2 * Math.PI) + gaussian(rng) * 2;
            push(rt, 'main', 'relativeHumidityMeasurement', 'humidity', Math.round(value), t, '%');
          }
          if (has('carbonDioxideMeasurement')) {
            const occupied = weekday && hour > 8.5 && hour < 18.5;
            const value =
              (occupied ? 880 : 540) +
              gaussian(rng) * 60 +
              (occupied ? 120 * Math.sin(((hour - 8.5) / 10) * Math.PI) : 0);
            push(
              rt,
              'main',
              'carbonDioxideMeasurement',
              'carbonDioxide',
              Math.round(value / 5) * 5,
              t,
              'ppm',
            );
          }
          if (has('airQualitySensor')) {
            push(
              rt,
              'main',
              'airQualitySensor',
              'airQuality',
              Math.round(18 + gaussian(rng) * 5 + (hour > 17 && hour < 20 ? 14 : 0)),
              t,
              'CAQI',
            );
          }
        }
        if (onHour && has('illuminanceMeasurement')) {
          const daylight = Math.max(0, Math.sin(((hour - 6) / 13) * Math.PI));
          push(
            rt,
            'main',
            'illuminanceMeasurement',
            'illuminance',
            Math.round(15 + 520 * daylight * (0.7 + rng() * 0.3)),
            t,
            'lux',
          );
        }

        // Discrete events
        if (has('motionSensor') && !cabin) {
          const activity = hour > 6.5 && hour < 23 ? 0.35 : 0.03;
          if (rng() < activity) {
            const at = t + rng() * 10 * MINUTE;
            push(rt, 'main', 'motionSensor', 'motion', 'active', at);
            push(rt, 'main', 'motionSensor', 'motion', 'inactive', at + 30_000 + rng() * 90_000);
          }
        }
        if (has('contactSensor') && rt.seed.category === 'ContactSensor' && !cabin) {
          const busy =
            rt.seed.key === 'entry-door' && ((hour > 7.5 && hour < 9) || (hour > 17 && hour < 19.5));
          if (rng() < (busy ? 0.3 : 0.02)) {
            const at = t + rng() * 10 * MINUTE;
            push(rt, 'main', 'contactSensor', 'contact', 'open', at);
            push(rt, 'main', 'contactSensor', 'contact', 'closed', at + 8_000 + rng() * 40_000);
          }
        }
        if (has('lock') && !cabin) {
          const want = (hour >= 8.25 && hour < 17.75) || hour >= 22.5 || hour < 6.75 ? 'locked' : 'unlocked';
          if (want !== lastLock) {
            if (lastLock !== undefined) push(rt, 'main', 'lock', 'lock', want, t + rng() * 8 * MINUTE);
            lastLock = want;
          }
        }

        // Power + switch schedule
        if (has('powerMeter') || (has('switch') && rt.seed.category === 'Light')) {
          const on = this.scheduledOn(rt, hour, weekday, dayIndex, cabin, rng);
          if (has('switch')) {
            const sw = on ? 'on' : 'off';
            if (sw !== lastSwitch) {
              if (lastSwitch !== undefined) push(rt, 'main', 'switch', 'switch', sw, t + rng() * 5 * MINUTE);
              lastSwitch = sw;
            }
          }
          if (has('powerMeter')) {
            const rated = rt.seed.ratedPowerW ?? 10;
            const standby = rt.seed.standbyPowerW ?? 0.5;
            let watts = on ? rated * (0.85 + rng() * 0.2) : standby;
            if (rt.seed.category === 'Refrigerator') watts = rng() < 0.4 ? rated * (0.9 + rng() * 0.2) : 4.2;
            if (rt.seed.key === 'kitchen-coffee' && on) watts = rng() < 0.5 ? rated : rated * 0.08;
            watts = round(watts, watts < 10 ? 1 : 0);
            push(rt, 'main', 'powerMeter', 'power', watts, t, 'W');
            energyPoints.push({ epoch: t, wh: watts * 0.25 });
          }
        }
      }

      if (has('energyMeter') && energyPoints.length) {
        const total = energyPoints.reduce((sum, p) => sum + p.wh, 0) / 1000;
        let running = Math.max(0, energy - total);
        energyPoints.forEach((p, i) => {
          running += p.wh / 1000;
          if (i % 4 === 3) push(rt, 'main', 'energyMeter', 'energy', round(running, 2), p.epoch, 'kWh');
        });
      }

      if (has('battery')) {
        const current = Number(rt.status.components.main?.battery?.battery?.value ?? 100);
        for (let dayIdx = 0; dayIdx < days; dayIdx++) {
          const value = Math.min(100, Math.round(current + (days - dayIdx) * 0.4));
          push(rt, 'main', 'battery', 'battery', value, start + dayIdx * DAY + 3 * HOUR, '%');
        }
      }
    }

    events.sort((a, b) => a.epoch - b.epoch);
    this.history = events.filter((e) => e.epoch < end);
  }

  private scheduledOn(
    rt: Runtime,
    hour: number,
    weekday: boolean,
    dayIndex: number,
    cabin: boolean,
    rng: Rng,
  ) {
    const k = rt.seed.key;
    if (cabin) return k === 'cabin-deck-light' ? dayIndex % 3 === 0 && hour > 19 && hour < 23 : false;
    if (rt.seed.category === 'Refrigerator') return true;
    if (k === 'living-purifier') return true;
    if (k === 'laundry-washer') return dayIndex % 2 === 0 && hour >= 10 && hour < 11;
    if (k === 'kitchen-coffee') return hour >= 6.75 && hour < 7.25;
    if (k === 'office-desk') return weekday && hour >= 8.75 && hour < 18;
    if (k === 'office-light') return weekday && hour >= 8.75 && hour < 17.5 && rng() < 0.97;
    if (k === 'living-tv') return hour >= 19.5 && hour < 22.75;
    if (k === 'living-ceiling') return (hour >= 6.5 && hour < 8) || (hour >= 17.5 && hour < 22.5);
    if (k === 'living-lamp') return hour >= 19 && hour < 23;
    if (k === 'bedroom-lamp') return (hour >= 6.25 && hour < 6.75) || (hour >= 22 && hour < 23.25);
    if (k === 'garage-light') return false;
    return false;
  }

  private runtime(deviceId: string): Runtime {
    const rt = this.runtimes.get(deviceId);
    if (!rt) throw new ApiError(404, `/devices/${deviceId}`, 'Device not found');
    return rt;
  }

  private assertLocation(locationId: string) {
    if (!this.locations.some((l) => l.locationId === locationId)) {
      throw new ApiError(404, `/locations/${locationId}`, 'Location not found');
    }
  }
}

/* -------------------------------------------------------------------- */
/* Helpers                                                               */
/* -------------------------------------------------------------------- */

export function hasCapability(device: Device, capability: string, component = 'main') {
  return device.components.some(
    (c) => c.id === component && c.capabilities.some((cap) => cap.id === capability),
  );
}

function sameValue(a: AttributeValue, b: AttributeValue) {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function references(condition: RuleCondition, event: DeviceEvent) {
  const comparison =
    'equals' in condition
      ? condition.equals
      : 'greaterThan' in condition
        ? condition.greaterThan
        : condition.lessThan;
  return [comparison.left, comparison.right].some(
    (operand) =>
      'device' in operand &&
      operand.device.devices.includes(event.deviceId) &&
      operand.device.capability === event.capability &&
      operand.device.attribute === event.attribute,
  );
}

export function validateRule(rule: RuleRequest) {
  if (!rule.name?.trim()) throw new ApiError(422, '/rules', 'A rule needs a name');
  if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
    throw new ApiError(422, '/rules', 'A rule needs at least one action');
  }
}
