import { useMemo, useState } from 'react';
import { ArrowRight, Braces, Plus, Trash2, Workflow } from 'lucide-react';
import type { Device, Rule } from '@/api/types';
import { deviceLabel } from '@/capabilities/device';
import { formatValue } from '@/capabilities/format';
import {
  ACTIONS,
  TRIGGERS,
  actionsFor,
  buildRule,
  describeRule,
  triggersFor,
  type RuleDraft,
} from '@/capabilities/rules';
import { useDevices, useRuleMutations, useRules } from '@/hooks/queries';
import { useClient } from '@/api/clientContext';
import { timeAgo } from '@/lib/time';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Select } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';

export default function Automations() {
  const rules = useRules();
  const devices = useDevices();
  const { remove, setEnabled, canToggle } = useRuleMutations();
  const client = useClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [viewing, setViewing] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const byId = useMemo(() => new Map(devices.data?.map((d) => [d.deviceId, d])), [devices.data]);

  if (rules.isLoading || devices.isLoading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Automations"
        description={
          client.kind === 'mock'
            ? 'Rules API automations. The demo home evaluates them live — try the Simulate panel on a sensor.'
            : 'Rules created through the SmartThings Rules API with this token.'
        }
        actions={
          <Button variant="primary" onClick={() => setBuilderOpen(true)}>
            <Plus className="h-4 w-4" /> New automation
          </Button>
        }
      />

      {!rules.data?.length ? (
        <EmptyState
          icon={Workflow}
          title="No automations yet"
          description="Build one with a trigger and an action — it's saved as a standard Rules API rule."
          action={
            <Button variant="primary" onClick={() => setBuilderOpen(true)}>
              <Plus className="h-4 w-4" /> New automation
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rules.data.map((rule) => {
            const text = describeRule(rule, byId);
            const enabled = rule.enabled !== false;
            return (
              <li key={rule.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{rule.name}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {rule.executionLocation ?? 'Cloud'} · updated{' '}
                      {timeAgo(rule.dateUpdated ?? rule.dateCreated)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canToggle ? (
                      <Toggle
                        checked={enabled}
                        label={`${rule.name} enabled`}
                        onChange={(next) => setEnabled.mutate({ ruleId: rule.id, enabled: next })}
                      />
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setViewing(rule)}
                      aria-label={`View JSON for ${rule.name}`}
                    >
                      <Braces className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleting(rule)}
                      aria-label={`Delete ${rule.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div
                  className={`mt-4 flex flex-col gap-2 text-sm md:flex-row md:items-center ${enabled ? '' : 'opacity-50'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">When</Badge>
                    <span>{text.triggers.join(' and ') || 'Always'}</span>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-subtle md:block" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">Then</Badge>
                    <span>{text.actions.join(', ')}</span>
                  </div>
                  {!enabled ? <Badge>Paused</Badge> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RuleBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} devices={devices.data ?? []} />

      <Dialog
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        description="Rules API representation"
        size="lg"
      >
        <pre className="overflow-auto rounded-xl bg-surface-2 p-4 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(viewing, null, 2)}
        </pre>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.name}”?`}
        description="The rule is removed from the location. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function RuleBuilder({ open, onClose, devices }: { open: boolean; onClose: () => void; devices: Device[] }) {
  const { create } = useRuleMutations();
  const triggerDevices = devices.filter((d) => triggersFor(d).length);
  const actionDevices = devices.filter((d) => actionsFor(d).length);
  const [draft, setDraft] = useState<RuleDraft>(() => emptyDraft());
  const [nameTouched, setNameTouched] = useState(false);

  const triggerDevice = devices.find((d) => d.deviceId === draft.trigger.deviceId);
  const actionDevice = devices.find((d) => d.deviceId === draft.action.deviceId);
  const triggerOptions = triggerDevice ? triggersFor(triggerDevice) : [];
  const trigger = TRIGGERS.find(
    (t) => t.capability === draft.trigger.capability && t.attribute === draft.trigger.attribute,
  );
  const actionOptions = actionDevice ? actionsFor(actionDevice) : [];
  const action = ACTIONS.find((a) => a.id === draft.action.actionId);

  const autoName =
    trigger && triggerDevice && action && actionDevice
      ? `${deviceLabel(triggerDevice)} ${trigger.label.toLowerCase()} ${draft.trigger.operator === 'equals' ? formatValue(draft.trigger.value).toLowerCase() : `${draft.trigger.operator === 'greaterThan' ? '>' : '<'} ${draft.trigger.value}`} → ${action.label.toLowerCase()} ${deviceLabel(actionDevice)}`
      : '';
  const name = nameTouched ? draft.name : autoName;

  const valid = !!(
    trigger &&
    action &&
    draft.trigger.deviceId &&
    draft.action.deviceId &&
    draft.trigger.value !== '' &&
    name.trim()
  );
  let preview = '';
  if (valid) {
    try {
      preview = JSON.stringify(buildRule({ ...draft, name }), null, 2);
    } catch {
      preview = '';
    }
  }

  const close = () => {
    setDraft(emptyDraft());
    setNameTouched(false);
    onClose();
  };

  const setTriggerDevice = (deviceId: string) => {
    const d = devices.find((x) => x.deviceId === deviceId);
    const first = d ? triggersFor(d)[0] : undefined;
    setDraft((s) => ({
      ...s,
      trigger: {
        deviceId,
        capability: first?.capability ?? '',
        attribute: first?.attribute ?? '',
        operator: first?.kind === 'number' ? 'greaterThan' : 'equals',
        value: first?.options?.[0] ?? '',
      },
    }));
  };
  const setActionDevice = (deviceId: string) => {
    const d = devices.find((x) => x.deviceId === deviceId);
    const first = d ? actionsFor(d)[0] : undefined;
    setDraft((s) => ({ ...s, action: { deviceId, actionId: first?.id ?? '', arg: first?.arg?.default } }));
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New automation"
      description="If this happens, then do that — saved as a Rules API rule."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={create.isPending}
            onClick={() => create.mutate(buildRule({ ...draft, name }), { onSuccess: close })}
          >
            Create automation
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Badge tone="info">1</Badge> When…
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Device" htmlFor="trigger-device">
              <Select
                id="trigger-device"
                value={draft.trigger.deviceId}
                onChange={(e) => setTriggerDevice(e.target.value)}
              >
                <option value="">Choose a device</option>
                {triggerDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reading" htmlFor="trigger-attr">
              <Select
                id="trigger-attr"
                value={`${draft.trigger.capability}.${draft.trigger.attribute}`}
                disabled={!triggerOptions.length}
                onChange={(e) => {
                  const t = triggerOptions.find((o) => `${o.capability}.${o.attribute}` === e.target.value);
                  if (!t) return;
                  setDraft((s) => ({
                    ...s,
                    trigger: {
                      ...s.trigger,
                      capability: t.capability,
                      attribute: t.attribute,
                      operator: t.kind === 'number' ? 'greaterThan' : 'equals',
                      value: t.options?.[0] ?? '',
                    },
                  }));
                }}
              >
                {triggerOptions.map((t) => (
                  <option key={`${t.capability}.${t.attribute}`} value={`${t.capability}.${t.attribute}`}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            {trigger?.kind === 'number' ? (
              <>
                <Field label="Condition" htmlFor="trigger-op">
                  <Select
                    id="trigger-op"
                    value={draft.trigger.operator}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        trigger: {
                          ...s.trigger,
                          operator: e.target.value as RuleDraft['trigger']['operator'],
                        },
                      }))
                    }
                  >
                    <option value="greaterThan">Rises above</option>
                    <option value="lessThan">Drops below</option>
                    <option value="equals">Equals</option>
                  </Select>
                </Field>
                <Field label={`Value${trigger.unit ? ` (${trigger.unit})` : ''}`} htmlFor="trigger-value">
                  <Input
                    id="trigger-value"
                    type="number"
                    inputMode="decimal"
                    value={draft.trigger.value}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, trigger: { ...s.trigger, value: e.target.value } }))
                    }
                  />
                </Field>
              </>
            ) : trigger ? (
              <Field label="Becomes" htmlFor="trigger-value">
                <Select
                  id="trigger-value"
                  value={draft.trigger.value}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, trigger: { ...s.trigger, value: e.target.value } }))
                  }
                >
                  {trigger.options?.map((o) => (
                    <option key={o} value={o}>
                      {formatValue(o)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Badge tone="accent">2</Badge> Then…
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Device" htmlFor="action-device">
              <Select
                id="action-device"
                value={draft.action.deviceId}
                onChange={(e) => setActionDevice(e.target.value)}
              >
                <option value="">Choose a device</option>
                {actionDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Action" htmlFor="action-cmd">
              <Select
                id="action-cmd"
                value={draft.action.actionId}
                disabled={!actionOptions.length}
                onChange={(e) => {
                  const a = actionOptions.find((o) => o.id === e.target.value);
                  setDraft((s) => ({
                    ...s,
                    action: { ...s.action, actionId: e.target.value, arg: a?.arg?.default },
                  }));
                }}
              >
                {actionOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            {action?.arg ? (
              <Field
                label={`${action.label}${action.arg.unit ? ` (${action.arg.unit})` : ''}`}
                htmlFor="action-arg"
              >
                <Input
                  id="action-arg"
                  type="number"
                  min={action.arg.min}
                  max={action.arg.max}
                  step={action.arg.step ?? 1}
                  value={draft.action.arg ?? action.arg.default}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, action: { ...s.action, arg: Number(e.target.value) } }))
                  }
                />
              </Field>
            ) : null}
          </div>
        </fieldset>

        <Field label="Name" htmlFor="rule-name">
          <Input
            id="rule-name"
            value={name}
            placeholder="Describe the automation"
            onChange={(e) => {
              setNameTouched(true);
              setDraft((s) => ({ ...s, name: e.target.value }));
            }}
          />
        </Field>

        {preview ? (
          <details className="rounded-xl border border-line">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-muted">
              Request body (POST /rules)
            </summary>
            <pre className="max-h-64 overflow-auto border-t border-line bg-surface-2 p-4 font-mono text-[11px]">
              {preview}
            </pre>
          </details>
        ) : null}
      </div>
    </Dialog>
  );
}

function emptyDraft(): RuleDraft {
  return {
    name: '',
    trigger: { deviceId: '', capability: '', attribute: '', operator: 'equals', value: '' },
    action: { deviceId: '', actionId: '' },
  };
}
