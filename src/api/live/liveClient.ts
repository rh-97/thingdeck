import { ApiError, Emitter, type SmartThingsClient } from '../client';
import type {
  ApiLogEntry,
  Device,
  DeviceCommand,
  DeviceEvent,
  DeviceHealth,
  DeviceStatus,
  HistoryQuery,
  Location,
  Mode,
  PagedResult,
  Room,
  Rule,
  RuleRequest,
  Scene,
} from '../types';

export interface LiveClientOptions {
  token: string;
  /** Same-origin proxy prefix that forwards to https://api.smartthings.com/v1 */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Max parallel requests; keeps us well under per-device rate limits. */
  concurrency?: number;
}

const API_ORIGIN = 'https://api.smartthings.com/v1';

export function defaultProxyBase() {
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/st-api`;
}

/**
 * Thin, dependency-free client for the SmartThings REST API, authenticated with
 * a personal access token. Requests go through a same-origin proxy (Vite in dev,
 * nginx in the Docker image) because the API does not allow browser CORS.
 */
export class LiveClient implements SmartThingsClient {
  readonly kind = 'live' as const;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requests = new Emitter<ApiLogEntry>();
  private readonly concurrency: number;
  private active = 0;
  private queue: Array<() => void> = [];
  private requestId = 0;

  constructor(options: LiveClientOptions) {
    this.token = options.token.trim();
    this.baseUrl = options.baseUrl ?? defaultProxyBase();
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.concurrency = options.concurrency ?? 4;
  }

  onRequest(listener: (entry: ApiLogEntry) => void) {
    return this.requests.on(listener);
  }

  listLocations() {
    return this.list<Location>('/locations');
  }

  listRooms(locationId: string) {
    return this.list<Room>(`/locations/${enc(locationId)}/rooms`);
  }

  listDevices(locationId: string) {
    return this.list<Device>(`/devices?locationId=${enc(locationId)}`);
  }

  getDeviceStatus(deviceId: string) {
    return this.request<DeviceStatus>('GET', `/devices/${enc(deviceId)}/status`);
  }

  getDeviceHealth(deviceId: string) {
    return this.request<DeviceHealth>('GET', `/devices/${enc(deviceId)}/health`);
  }

  async executeCommands(deviceId: string, commands: DeviceCommand[]) {
    await this.request('POST', `/devices/${enc(deviceId)}/commands`, { commands });
  }

  listScenes(locationId: string) {
    return this.list<Scene>(`/scenes?locationId=${enc(locationId)}`);
  }

  async executeScene(sceneId: string) {
    await this.request('POST', `/scenes/${enc(sceneId)}/execute`);
  }

  listModes(locationId: string) {
    return this.list<Mode>(`/locations/${enc(locationId)}/modes`);
  }

  getCurrentMode(locationId: string) {
    return this.request<Mode>('GET', `/locations/${enc(locationId)}/modes/current`);
  }

  setCurrentMode(locationId: string, modeId: string) {
    return this.request<Mode>('PUT', `/locations/${enc(locationId)}/modes/current`, { modeId });
  }

  listRules(locationId: string) {
    return this.list<Rule>(`/rules?locationId=${enc(locationId)}`);
  }

  createRule(locationId: string, rule: RuleRequest) {
    return this.request<Rule>('POST', `/rules?locationId=${enc(locationId)}`, rule);
  }

  async deleteRule(locationId: string, ruleId: string) {
    await this.request('DELETE', `/rules/${enc(ruleId)}?locationId=${enc(locationId)}`);
  }

  async getHistory(query: HistoryQuery): Promise<DeviceEvent[]> {
    const params = new URLSearchParams({ locationId: query.locationId, limit: String(query.limit ?? 200) });
    if (query.deviceId) params.set('deviceId', query.deviceId);
    const page = await this.request<PagedResult<Partial<DeviceEvent> & { epoch?: number; time?: string }>>(
      'GET',
      `/history/devices?${params}`,
    );
    return (page.items ?? [])
      .map((e) => normalizeEvent(e, query.locationId))
      .filter((e) => (query.capability ? e.capability === query.capability : true))
      .filter((e) => (query.attribute ? e.attribute === query.attribute : true))
      .filter((e) => (query.since !== undefined ? e.epoch >= query.since : true));
  }

  /* ------------------------------------------------------------------ */

  private async list<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = path;
    let guard = 0;
    while (next && guard++ < 20) {
      const page: PagedResult<T> = await this.request<PagedResult<T>>('GET', next);
      items.push(...(page.items ?? []));
      const href = page._links?.next?.href;
      next = href ? toRelative(href) : undefined;
    }
    return items;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    await this.acquire();
    const id = ++this.requestId;
    const started = performance.now();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (cause) {
        const error = new ApiError(0, path, cause instanceof Error ? cause.message : 'Network error');
        this.log(id, method, path, 0, started, error.message);
        throw error;
      }
      const text = await response.text();
      const data = text ? safeJson(text) : undefined;
      if (!response.ok) {
        const message = extractMessage(data) ?? response.statusText ?? 'Request failed';
        this.log(id, method, path, response.status, started, message);
        throw new ApiError(response.status, path, message);
      }
      this.log(id, method, path, response.status, started);
      return data as T;
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => (this.active++, resolve())));
  }

  private release() {
    this.active--;
    this.queue.shift()?.();
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

function enc(value: string) {
  return encodeURIComponent(value);
}

function toRelative(href: string) {
  return href.startsWith(API_ORIGIN)
    ? href.slice(API_ORIGIN.length)
    : href.replace(/^https?:\/\/[^/]+\/v1/, '');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object')
    return typeof data === 'string' && data ? data.slice(0, 200) : undefined;
  const record = data as {
    error?: { message?: string; details?: Array<{ message?: string }> };
    message?: string;
  };
  return record.error?.details?.[0]?.message ?? record.error?.message ?? record.message;
}

function normalizeEvent(
  e: Partial<DeviceEvent> & { epoch?: number; time?: string },
  locationId: string,
): DeviceEvent {
  const epoch = e.epoch ?? (e.time ? Date.parse(e.time) : Date.now());
  return {
    deviceId: e.deviceId ?? '',
    deviceName: e.deviceName ?? 'Device',
    locationId: e.locationId ?? locationId,
    component: e.component ?? 'main',
    capability: e.capability ?? '',
    attribute: e.attribute ?? '',
    value: e.value ?? null,
    ...(e.unit ? { unit: e.unit } : {}),
    time: e.time ?? new Date(epoch).toISOString(),
    epoch,
    ...(e.text ? { text: e.text } : {}),
  };
}
