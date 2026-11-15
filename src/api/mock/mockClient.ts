import { ApiError, Emitter, type SmartThingsClient } from '../client';
import type { ApiLogEntry, DeviceCommand, DeviceEvent, HistoryQuery, Rule, RuleRequest } from '../types';
import { HomeEngine, type EngineOptions } from './engine';

export interface MockClientOptions extends EngineOptions {
  /** Simulated network latency range in ms. `false` disables it (tests). */
  latency?: [number, number] | false;
  /** Probability (0–1) that a write fails with a 503, to exercise optimistic rollback. */
  failureRate?: number;
}

/**
 * Demo backend: wraps the in-memory {@link HomeEngine} behind the same async
 * interface as the REST client, including latency, failure injection and an
 * API request log that mirrors real REST paths.
 */
export class MockClient implements SmartThingsClient {
  readonly kind = 'mock' as const;
  readonly engine: HomeEngine;
  private readonly requests = new Emitter<ApiLogEntry>();
  private latency: [number, number] | false;
  private failureRate: number;
  private requestId = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private speed = 1;

  constructor(options: MockClientOptions = {}) {
    this.engine = new HomeEngine(options);
    this.latency = options.latency ?? [120, 380];
    this.failureRate = options.failureRate ?? 0;
  }

  configure(options: { failureRate?: number; latency?: [number, number] | false }) {
    if (options.failureRate !== undefined) this.failureRate = options.failureRate;
    if (options.latency !== undefined) this.latency = options.latency;
  }

  /** Start the background simulation. `speed` multiplies simulated time. */
  start(speed = 1, intervalMs = 2000) {
    this.stop();
    this.speed = speed;
    if (speed <= 0) return;
    this.timer = setInterval(() => this.engine.tick(intervalMs * this.speed), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  subscribe(listener: (event: DeviceEvent) => void) {
    return this.engine.events.on(listener);
  }

  onRuleRun(listener: (run: { rule: Rule; trigger: DeviceEvent }) => void) {
    return this.engine.ruleRuns.on(listener);
  }

  onRequest(listener: (entry: ApiLogEntry) => void) {
    return this.requests.on(listener);
  }

  listLocations() {
    return this.call('GET', '/locations', () => this.engine.getLocations());
  }

  listRooms(locationId: string) {
    return this.call('GET', `/locations/${locationId}/rooms`, () => this.engine.getRooms(locationId));
  }

  listDevices(locationId: string) {
    return this.call('GET', `/devices?locationId=${locationId}`, () => this.engine.getDevices(locationId));
  }

  getDeviceStatus(deviceId: string) {
    return this.call('GET', `/devices/${deviceId}/status`, () => this.engine.getStatus(deviceId));
  }

  getDeviceHealth(deviceId: string) {
    return this.call('GET', `/devices/${deviceId}/health`, () => this.engine.getHealth(deviceId));
  }

  executeCommands(deviceId: string, commands: DeviceCommand[]) {
    return this.call(
      'POST',
      `/devices/${deviceId}/commands`,
      () => this.engine.executeCommands(deviceId, commands),
      true,
    );
  }

  listScenes(locationId: string) {
    return this.call('GET', `/scenes?locationId=${locationId}`, () => this.engine.getScenes(locationId));
  }

  executeScene(sceneId: string) {
    return this.call('POST', `/scenes/${sceneId}/execute`, () => this.engine.executeScene(sceneId), true);
  }

  listModes(locationId: string) {
    return this.call('GET', `/locations/${locationId}/modes`, () => this.engine.getModes(locationId));
  }

  getCurrentMode(locationId: string) {
    return this.call('GET', `/locations/${locationId}/modes/current`, () =>
      this.engine.getCurrentMode(locationId),
    );
  }

  setCurrentMode(locationId: string, modeId: string) {
    return this.call(
      'PUT',
      `/locations/${locationId}/modes/current`,
      () => this.engine.setMode(locationId, modeId),
      true,
    );
  }

  listRules(locationId: string) {
    return this.call('GET', `/rules?locationId=${locationId}`, () => this.engine.getRules(locationId));
  }

  createRule(locationId: string, rule: RuleRequest) {
    return this.call(
      'POST',
      `/rules?locationId=${locationId}`,
      () => this.engine.createRule(locationId, rule),
      true,
    );
  }

  deleteRule(locationId: string, ruleId: string) {
    return this.call(
      'DELETE',
      `/rules/${ruleId}?locationId=${locationId}`,
      () => this.engine.deleteRule(locationId, ruleId),
      true,
    );
  }

  setRuleEnabled(locationId: string, ruleId: string, enabled: boolean) {
    return this.call(
      'PUT',
      `/rules/${ruleId}?locationId=${locationId}`,
      () => this.engine.setRuleEnabled(locationId, ruleId, enabled),
      true,
    );
  }

  getHistory(query: HistoryQuery) {
    const params = new URLSearchParams({ locationId: query.locationId });
    if (query.deviceId) params.set('deviceId', query.deviceId);
    if (query.limit) params.set('limit', String(query.limit));
    return this.call('GET', `/history/devices?${params}`, () => this.engine.getHistory(query));
  }

  private async call<T>(method: string, path: string, run: () => T, write = false): Promise<T> {
    const started = performance.now();
    const id = ++this.requestId;
    if (this.latency) {
      const [min, max] = this.latency;
      await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
    }
    try {
      if (write && this.failureRate > 0 && Math.random() < this.failureRate) {
        throw new ApiError(503, path, 'Simulated network failure');
      }
      const result = run();
      this.log(id, method, path, method === 'POST' ? 202 : 200, started);
      return result;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      this.log(id, method, path, status, started, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private log(id: number, method: string, path: string, status: number, started: number, error?: string) {
    if (this.requests.size === 0) return;
    this.requests.emit({
      id,
      method,
      path,
      status,
      durationMs: Math.round(performance.now() - started),
      at: Date.now(),
      ...(error ? { error } : {}),
    });
  }
}
