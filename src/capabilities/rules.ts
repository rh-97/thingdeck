import type { Device, Rule, RuleAction, RuleCondition, RuleOperand, RuleRequest } from '@/api/types';
import { deviceLabel, has } from './device';
import { attributeLabel } from './events';
import { formatValue } from './format';

export interface TriggerOption {
  capability: string;
  attribute: string;
  label: string;
  kind: 'enum' | 'number';
  options?: string[];
  unit?: string;
}

export const TRIGGERS: TriggerOption[] = [
  {
    capability: 'motionSensor',
    attribute: 'motion',
    label: 'Motion',
    kind: 'enum',
    options: ['active', 'inactive'],
  },
  {
    capability: 'contactSensor',
    attribute: 'contact',
    label: 'Contact',
    kind: 'enum',
    options: ['open', 'closed'],
  },
  { capability: 'waterSensor', attribute: 'water', label: 'Water', kind: 'enum', options: ['wet', 'dry'] },
  {
    capability: 'smokeDetector',
    attribute: 'smoke',
    label: 'Smoke',
    kind: 'enum',
    options: ['detected', 'clear'],
  },
  {
    capability: 'presenceSensor',
    attribute: 'presence',
    label: 'Presence',
    kind: 'enum',
    options: ['present', 'not present'],
  },
  { capability: 'lock', attribute: 'lock', label: 'Lock', kind: 'enum', options: ['locked', 'unlocked'] },
  { capability: 'switch', attribute: 'switch', label: 'Power', kind: 'enum', options: ['on', 'off'] },
  { capability: 'doorControl', attribute: 'door', label: 'Door', kind: 'enum', options: ['open', 'closed'] },
  {
    capability: 'temperatureMeasurement',
    attribute: 'temperature',
    label: 'Temperature',
    kind: 'number',
    unit: '°C',
  },
  {
    capability: 'relativeHumidityMeasurement',
    attribute: 'humidity',
    label: 'Humidity',
    kind: 'number',
    unit: '%',
  },
  {
    capability: 'carbonDioxideMeasurement',
    attribute: 'carbonDioxide',
    label: 'CO₂',
    kind: 'number',
    unit: 'ppm',
  },
  { capability: 'powerMeter', attribute: 'power', label: 'Power draw', kind: 'number', unit: 'W' },
  {
    capability: 'illuminanceMeasurement',
    attribute: 'illuminance',
    label: 'Light level',
    kind: 'number',
    unit: 'lux',
  },
  { capability: 'battery', attribute: 'battery', label: 'Battery', kind: 'number', unit: '%' },
];

export interface ActionOption {
  id: string;
  capability: string;
  command: string;
  label: string;
  arg?: { min: number; max: number; step?: number; default: number; unit: string };
}

export const ACTIONS: ActionOption[] = [
  { id: 'on', capability: 'switch', command: 'on', label: 'Turn on' },
  { id: 'off', capability: 'switch', command: 'off', label: 'Turn off' },
  {
    id: 'level',
    capability: 'switchLevel',
    command: 'setLevel',
    label: 'Set brightness',
    arg: { min: 0, max: 100, default: 60, unit: '%' },
  },
  { id: 'lock', capability: 'lock', command: 'lock', label: 'Lock' },
  { id: 'unlock', capability: 'lock', command: 'unlock', label: 'Unlock' },
  { id: 'shade-open', capability: 'windowShade', command: 'open', label: 'Open shade' },
  { id: 'shade-close', capability: 'windowShade', command: 'close', label: 'Close shade' },
  {
    id: 'fan',
    capability: 'fanSpeed',
    command: 'setFanSpeed',
    label: 'Set fan speed',
    arg: { min: 0, max: 4, default: 3, unit: '' },
  },
  {
    id: 'heat',
    capability: 'thermostatHeatingSetpoint',
    command: 'setHeatingSetpoint',
    label: 'Heat to',
    arg: { min: 5, max: 30, step: 0.5, default: 21, unit: '°C' },
  },
  { id: 'door-open', capability: 'doorControl', command: 'open', label: 'Open door' },
  { id: 'door-close', capability: 'doorControl', command: 'close', label: 'Close door' },
  {
    id: 'vacuum',
    capability: 'robotCleanerMovement',
    command: 'setRobotCleanerMovement',
    label: 'Start cleaning',
  },
];

export const triggersFor = (device: Device) => TRIGGERS.filter((t) => has(device, t.capability));
export const actionsFor = (device: Device) => ACTIONS.filter((a) => has(device, a.capability));

export interface RuleDraft {
  name: string;
  trigger: {
    deviceId: string;
    capability: string;
    attribute: string;
    operator: 'equals' | 'greaterThan' | 'lessThan';
    value: string;
  };
  action: { deviceId: string; actionId: string; arg?: number };
}

/** Turns the builder's draft into a Rules API request body. */
export function buildRule(draft: RuleDraft): RuleRequest {
  const trigger = TRIGGERS.find(
    (t) => t.capability === draft.trigger.capability && t.attribute === draft.trigger.attribute,
  );
  const action = ACTIONS.find((a) => a.id === draft.action.actionId);
  if (!trigger || !action) throw new Error('Pick a trigger and an action');
  const right: RuleOperand =
    trigger.kind === 'number'
      ? Number.isInteger(Number(draft.trigger.value))
        ? { integer: Number(draft.trigger.value) }
        : { decimal: Number(draft.trigger.value) }
      : { string: draft.trigger.value };
  const args =
    action.command === 'setRobotCleanerMovement'
      ? ['cleaning']
      : action.arg
        ? [draft.action.arg ?? action.arg.default]
        : undefined;
  const comparison = {
    left: {
      device: {
        devices: [draft.trigger.deviceId],
        component: 'main',
        capability: trigger.capability,
        attribute: trigger.attribute,
      },
    },
    right,
  };
  const condition = { [draft.trigger.operator]: comparison } as RuleCondition;
  return {
    name: draft.name.trim(),
    actions: [
      {
        if: {
          ...condition,
          then: [
            {
              command: {
                devices: [draft.action.deviceId],
                commands: [
                  {
                    component: 'main',
                    capability: action.capability,
                    command: action.command,
                    ...(args ? { arguments: args } : {}),
                  },
                ],
              },
            },
          ],
        },
      } as RuleAction,
    ],
  };
}

const RULE_VALUES: Record<string, string> = {
  active: 'detected',
  inactive: 'clear',
  wet: 'wet',
  dry: 'dry',
  detected: 'detected',
  'not present': 'away',
  present: 'home',
};

const OPERATOR_TEXT = { equals: 'is', greaterThan: 'rises above', lessThan: 'drops below' } as const;

function operandText(operand: RuleOperand, devices: Map<string, Device>) {
  if ('device' in operand) {
    const d = devices.get(operand.device.devices[0] ?? '');
    return `${d ? deviceLabel(d) : 'a device'} ${attributeLabel(operand.device.attribute).toLowerCase()}`;
  }
  if ('string' in operand) return RULE_VALUES[operand.string] ?? formatValue(operand.string).toLowerCase();
  if ('integer' in operand) return String(operand.integer);
  return String(operand.decimal);
}

function commandText(action: RuleAction, devices: Map<string, Device>): string[] {
  if ('command' in action) {
    return action.command.devices.flatMap((id) => {
      const d = devices.get(id);
      return action.command.commands.map((c) => {
        const known = ACTIONS.find((a) => a.capability === c.capability && a.command === c.command);
        const verb = known?.label ?? `${c.capability}.${c.command}`;
        const arg = c.arguments?.length && known?.arg ? ` ${c.arguments[0]}${known.arg.unit}` : '';
        return `${verb}${arg} — ${d ? deviceLabel(d) : 'unknown device'}`;
      });
    });
  }
  if ('if' in action) return ['Nested condition'];
  return [];
}

/** Plain-English rendering of a rule, e.g. "When Front Door contact is open → Turn on Ceiling Light". */
export function describeRule(rule: Rule, devices: Map<string, Device>) {
  const triggers: string[] = [];
  const actions: string[] = [];
  for (const a of rule.actions) {
    if ('if' in a) {
      const cond = a.if;
      const op = 'equals' in cond ? 'equals' : 'greaterThan' in cond ? 'greaterThan' : 'lessThan';
      const cmp = 'equals' in cond ? cond.equals : 'greaterThan' in cond ? cond.greaterThan : cond.lessThan;
      triggers.push(
        `${operandText(cmp.left, devices)} ${OPERATOR_TEXT[op]} ${operandText(cmp.right, devices)}`,
      );
      for (const t of cond.then) actions.push(...commandText(t, devices));
    } else {
      actions.push(...commandText(a, devices));
    }
  }
  return { triggers, actions };
}
