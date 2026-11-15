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
  Room,
  Rule,
  RuleRequest,
  Scene,
} from './types';

/**
 * The single seam between the UI and a SmartThings backend.
 * Both the in-browser demo home and the real REST API implement it, so every
 * screen works identically in either mode.
 */
export interface SmartThingsClient {
  readonly kind: 'mock' | 'live';

  listLocations(): Promise<Location[]>;
  listRooms(locationId: string): Promise<Room[]>;
  listDevices(locationId: string): Promise<Device[]>;
  getDeviceStatus(deviceId: string): Promise<DeviceStatus>;
  getDeviceHealth(deviceId: string): Promise<DeviceHealth>;
  executeCommands(deviceId: string, commands: DeviceCommand[]): Promise<void>;

  listScenes(locationId: string): Promise<Scene[]>;
  executeScene(sceneId: string): Promise<void>;

  listModes(locationId: string): Promise<Mode[]>;
  getCurrentMode(locationId: string): Promise<Mode>;
  setCurrentMode(locationId: string, modeId: string): Promise<Mode>;

  listRules(locationId: string): Promise<Rule[]>;
  createRule(locationId: string, rule: RuleRequest): Promise<Rule>;
  deleteRule(locationId: string, ruleId: string): Promise<void>;
  /** Demo-only today: the public API has no enable/disable toggle. */
  setRuleEnabled?(locationId: string, ruleId: string, enabled: boolean): Promise<Rule>;

  getHistory(query: HistoryQuery): Promise<DeviceEvent[]>;

  /**
   * Push-style updates. The demo home emits events as its simulation runs; the
   * live client returns null and the UI falls back to polling.
   */
  subscribe?(listener: (event: DeviceEvent) => void): () => void;

  /** Request log for the API inspector. */
  onRequest(listener: (entry: ApiLogEntry) => void): () => void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'Your token was rejected. Personal access tokens expire after 24 hours — create a new one in Settings.';
    if (error.status === 403) return 'This token is missing a required scope for that action.';
    if (error.status === 429) return 'SmartThings rate limit reached. Give it a minute and try again.';
    if (error.status === 0)
      return 'Could not reach the SmartThings API. Live mode needs the dev server or Docker image proxy.';
    return `${error.message} (HTTP ${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

/** Tiny typed event emitter shared by both clients. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T) {
    for (const listener of this.listeners) listener(value);
  }

  get size() {
    return this.listeners.size;
  }
}
