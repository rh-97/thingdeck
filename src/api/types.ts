/**
 * Types modelled on the public SmartThings REST API (https://developer.smartthings.com/docs/api/public).
 * Only the fields this app uses are declared; the API returns more.
 */

export type ISODate = string;

export interface PagedResult<T> {
  items: T[];
  _links?: { next?: { href: string } | null };
}

export interface Location {
  locationId: string;
  name: string;
  countryCode?: string;
  timeZoneId?: string;
  temperatureScale?: 'C' | 'F';
  latitude?: number;
  longitude?: number;
}

export interface Room {
  roomId: string;
  locationId: string;
  name: string;
}

export interface CapabilityReference {
  id: string;
  version: number;
}

export interface DeviceCategory {
  name: string;
  categoryType?: 'manufacturer' | 'user';
}

export interface DeviceComponent {
  id: string;
  label?: string;
  capabilities: CapabilityReference[];
  categories: DeviceCategory[];
}

export type DeviceIntegrationType =
  'ZIGBEE' | 'ZWAVE' | 'MATTER' | 'LAN' | 'OCF' | 'VIPER' | 'MOBILE' | 'VIRTUAL' | 'ENDPOINT_APP' | 'HUB';

export interface Device {
  deviceId: string;
  name: string;
  label?: string;
  manufacturerName?: string;
  presentationId?: string;
  deviceManufacturerCode?: string;
  locationId: string;
  roomId?: string;
  components: DeviceComponent[];
  type?: DeviceIntegrationType;
  createTime?: ISODate;
}

export type AttributeValue = string | number | boolean | null | Record<string, unknown> | unknown[];

export interface AttributeState {
  value: AttributeValue;
  unit?: string;
  timestamp?: ISODate;
  data?: Record<string, unknown>;
}

/** componentId -> capabilityId -> attributeName -> state */
export type ComponentStatus = Record<string, Record<string, AttributeState>>;

export interface DeviceStatus {
  components: Record<string, ComponentStatus>;
}

export type HealthState = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface DeviceHealth {
  deviceId: string;
  state: HealthState;
  lastUpdatedDate?: ISODate;
}

export interface DeviceCommand {
  component: string;
  capability: string;
  command: string;
  arguments?: unknown[];
}

export interface Scene {
  sceneId: string;
  sceneName: string;
  sceneIcon?: string;
  sceneColor?: string;
  locationId: string;
  lastExecutedDate?: ISODate;
}

export interface Mode {
  id: string;
  label: string;
  name: string;
}

/* ----------------------------- Rules API ----------------------------- */

export interface RuleDeviceOperand {
  device: {
    devices: string[];
    component: string;
    capability: string;
    attribute: string;
    trigger?: 'Always' | 'Auto' | 'Never';
  };
}

export type RuleLiteralOperand = { string: string } | { integer: number } | { decimal: number };

export type RuleOperand = RuleDeviceOperand | RuleLiteralOperand;

export interface RuleComparison {
  left: RuleOperand;
  right: RuleOperand;
}

export type RuleCondition =
  { equals: RuleComparison } | { greaterThan: RuleComparison } | { lessThan: RuleComparison };

export interface RuleCommandAction {
  command: {
    devices: string[];
    commands: DeviceCommand[];
  };
}

export interface RuleIfAction {
  if: RuleCondition & {
    then: RuleAction[];
    else?: RuleAction[];
  };
}

export type RuleAction = RuleIfAction | RuleCommandAction;

export interface Rule {
  id: string;
  name: string;
  actions: RuleAction[];
  executionLocation?: 'Cloud' | 'Local';
  dateCreated?: ISODate;
  dateUpdated?: ISODate;
  /** Not part of the public API — tracked by the demo home only. */
  enabled?: boolean;
}

export type RuleRequest = Pick<Rule, 'name' | 'actions'>;

/* ----------------------------- History ----------------------------- */

export interface DeviceEvent {
  deviceId: string;
  deviceName: string;
  locationId: string;
  component: string;
  capability: string;
  attribute: string;
  value: AttributeValue;
  unit?: string;
  time: ISODate;
  epoch: number;
  /** Human readable summary, e.g. "Front Door was unlocked". */
  text?: string;
}

export interface HistoryQuery {
  locationId: string;
  deviceId?: string;
  capability?: string;
  attribute?: string;
  /** epoch ms, inclusive */
  since?: number;
  limit?: number;
}

/* ----------------------------- Telemetry ----------------------------- */

export interface ApiLogEntry {
  id: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: number;
  error?: string;
}
