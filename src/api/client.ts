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
  /** Machine-readable code from the ThingsDeck server, e.g. TOKEN_EXPIRED. */
  readonly code?: string;

  constructor(status: number, path: string, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.code = code;
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
    if (error.code === 'TOKEN_EXPIRED')
      return 'Your SmartThings token has expired. Personal access tokens last 24 hours — paste a new one to continue.';
    if (error.code === 'UNAUTHENTICATED') return 'Your ThingsDeck session ended. Please sign in again.';
    if (error.code === 'TOKEN_MISSING') return 'Connect a SmartThings token to use live mode.';
    // Other ThingsDeck server errors (bad credentials, closed sign-up…) carry their own wording.
    if (error.code) return error.message;
    if (error.status === 401) return 'SmartThings rejected the request. Try reconnecting your token.';
    if (error.status === 403) return 'This token is missing a required scope for that action.';
    if (error.status === 429) return 'Too many requests. Give it a minute and try again.';
    if (error.status === 0) return 'Could not reach the ThingsDeck server.';
    return error.message;
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
