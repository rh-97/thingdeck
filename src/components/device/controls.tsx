import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Minus, Pause, Play, Plus, Square, Volume2, VolumeX } from 'lucide-react';
import type { Device, DeviceCommand, DeviceStatus } from '@/api/types';
import { attr, has, minutesUntil, value } from '@/capabilities/device';
import {
  airQualityLabel,
  co2Label,
  formatAttribute,
  formatTemperature,
  formatValue,
  fromDisplayTemperature,
  hueToCss,
  toTemperature,
} from '@/capabilities/format';
import { useDeviceCommand } from '@/hooks/queries';
import { useSettings, type TemperatureUnit } from '@/store/settings';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';

type Send = (commands: DeviceCommand[]) => void;
const c = (capability: string, command: string, args?: unknown[], component = 'main'): DeviceCommand => ({
  component,
  capability,
  command,
  ...(args ? { arguments: args } : {}),
});

/** Renders every control and readout a device supports, driven purely by its capabilities. */
export function DeviceControls({
  device,
  status,
  disabled,
}: {
  device: Device;
  status: DeviceStatus | undefined;
  disabled?: boolean;
}) {
  const command = useDeviceCommand(device);
  const unit = useSettings((s) => s.temperatureUnit);
  const send: Send = (commands) => command.mutate(commands);
  if (!status) return null;
  const props = { device, status, send, unit, disabled: !!disabled };

  return (
    <div className="space-y-3">
      {has(device, 'switch') && !has(device, 'washerOperatingState') ? <SwitchControl {...props} /> : null}
      {has(device, 'switchLevel') ? <LevelControl {...props} /> : null}
      {has(device, 'colorTemperature') ? <ColorTemperatureControl {...props} /> : null}
      {has(device, 'colorControl') ? <ColorControl {...props} /> : null}
      {has(device, 'thermostatMode') ? <ThermostatControl {...props} /> : null}
      {has(device, 'lock') ? <LockControl {...props} /> : null}
      {has(device, 'doorControl') ? <DoorControl {...props} /> : null}
      {has(device, 'windowShade') ? <ShadeControl {...props} /> : null}
      {has(device, 'mediaPlayback') || has(device, 'audioVolume') ? <MediaControl {...props} /> : null}
      {has(device, 'fanSpeed') ? <FanControl {...props} /> : null}
      {has(device, 'washerOperatingState') ? <WasherControl {...props} /> : null}
      {has(device, 'robotCleanerMovement') ? <VacuumControl {...props} /> : null}
      <Readouts device={device} status={status} unit={unit} />
    </div>
  );
}

interface ControlProps {
  device: Device;
  status: DeviceStatus;
  send: Send;
  unit: TemperatureUnit;
  disabled: boolean;
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
        {hint}
      </div>
      {children}
    </div>
  );
}

/** Range slider that commits after the user pauses, not on every pixel. */
function CommitSlider({
  value: current,
  min,
  max,
  step = 1,
  onCommit,
  label,
  format,
  disabled,
  className,
  style,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  label: string;
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = local ?? current;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className={cn('range', className)}
        style={style}
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={format ? format(shown) : String(shown)}
        onChange={(e) => {
          const next = Number(e.target.value);
          setLocal(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            onCommit(next);
            setLocal(null);
          }, 350);
        }}
      />
      <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
        {format ? format(shown) : shown}
      </span>
    </div>
  );
}

function SwitchControl({ status, send, disabled, device }: ControlProps) {
  const on = value(status, 'switch', 'switch') === 'on';
  return (
    <Row label="Power" hint={<Badge tone={on ? 'accent' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{on ? 'Device is on' : 'Device is off'}</span>
        <Toggle
          checked={on}
          onChange={(next) => send([c('switch', next ? 'on' : 'off')])}
          label={`${device.label} power`}
          disabled={disabled}
        />
      </div>
    </Row>
  );
}

function LevelControl({ status, send, disabled }: ControlProps) {
  const level = Number(value(status, 'switchLevel', 'level') ?? 0);
  return (
    <Row label="Brightness">
      <CommitSlider
        value={level}
        min={0}
        max={100}
        label="Brightness"
        format={(v) => `${v}%`}
        disabled={disabled}
        onCommit={(v) => send([c('switchLevel', 'setLevel', [v])])}
      />
    </Row>
  );
}

function ColorTemperatureControl({ status, send, disabled }: ControlProps) {
  const k = Number(value(status, 'colorTemperature', 'colorTemperature') ?? 3000);
  return (
    <Row label="White temperature">
      <CommitSlider
        value={k}
        min={2000}
        max={6500}
        step={100}
        label="Color temperature"
        format={(v) => `${v} K`}
        disabled={disabled}
        className="bg-gradient-to-r from-[#ffb46b] via-[#fff1dc] to-[#cfe3ff]"
        onCommit={(v) => send([c('colorTemperature', 'setColorTemperature', [v])])}
      />
    </Row>
  );
}

const SWATCHES = [
  { name: 'Warm red', hue: 0, saturation: 90 },
  { name: 'Amber', hue: 8, saturation: 85 },
  { name: 'Gold', hue: 14, saturation: 80 },
  { name: 'Green', hue: 33, saturation: 70 },
  { name: 'Teal', hue: 50, saturation: 70 },
  { name: 'Blue', hue: 62, saturation: 80 },
  { name: 'Violet', hue: 72, saturation: 75 },
  { name: 'Pink', hue: 87, saturation: 70 },
];

function ColorControl({ status, send, disabled }: ControlProps) {
  const hue = Number(value(status, 'colorControl', 'hue') ?? 0);
  const saturation = Number(value(status, 'colorControl', 'saturation') ?? 0);
  return (
    <Row
      label="Color"
      hint={
        <span
          className="h-4 w-4 rounded-full border border-line"
          style={{ background: hueToCss(hue, saturation) }}
        />
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {SWATCHES.map((s) => {
          const selected = Math.abs(s.hue - hue) < 2 && Math.abs(s.saturation - saturation) < 6;
          return (
            <button
              key={s.name}
              type="button"
              disabled={disabled}
              onClick={() =>
                send([c('colorControl', 'setColor', [{ hue: s.hue, saturation: s.saturation }])])
              }
              className={cn(
                'h-8 w-8 rounded-full border-2 transition',
                selected ? 'scale-110 border-fg' : 'border-transparent',
              )}
              style={{ background: hueToCss(s.hue, s.saturation) }}
              aria-label={s.name}
              aria-pressed={selected}
            />
          );
        })}
      </div>
      <CommitSlider
        value={hue}
        min={0}
        max={100}
        label="Hue"
        format={(v) => `${Math.round((v / 100) * 360)}°`}
        disabled={disabled}
        style={{ background: 'linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)' }}
        onCommit={(v) => send([c('colorControl', 'setColor', [{ hue: v, saturation }])])}
      />
    </Row>
  );
}

function ThermostatControl({ status, send, unit, disabled }: ControlProps) {
  const mode = String(value(status, 'thermostatMode', 'thermostatMode') ?? 'off');
  const supported = (value(status, 'thermostatMode', 'supportedThermostatModes') as string[] | undefined) ?? [
    'off',
    'heat',
    'cool',
    'auto',
  ];
  const op = String(value(status, 'thermostatOperatingState', 'thermostatOperatingState') ?? 'idle');
  const temp = attr(status, 'temperatureMeasurement', 'temperature');
  const heat = attr(status, 'thermostatHeatingSetpoint', 'heatingSetpoint');
  const cool = attr(status, 'thermostatCoolingSetpoint', 'coolingSetpoint');
  const step = unit === 'F' ? 1 : 0.5;

  const setpoint = (kind: 'heat' | 'cool', delta: number) => {
    const s = kind === 'heat' ? heat : cool;
    if (!s) return;
    const display = toTemperature(Number(s.value), s.unit, unit) + delta;
    const target = Math.round(fromDisplayTemperature(display, s.unit, unit) * 10) / 10;
    send([
      kind === 'heat'
        ? c('thermostatHeatingSetpoint', 'setHeatingSetpoint', [target])
        : c('thermostatCoolingSetpoint', 'setCoolingSetpoint', [target]),
    ]);
  };

  return (
    <Row
      label="Climate"
      hint={
        <Badge tone={op === 'heating' ? 'warn' : op === 'cooling' ? 'info' : 'neutral'}>
          {formatValue(op)}
        </Badge>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-4xl font-semibold tabular-nums">
            {formatTemperature(temp?.value, temp?.unit, unit)}
          </div>
          <div className="text-xs text-muted">Current temperature</div>
        </div>
        <Segmented
          label="Thermostat mode"
          value={mode}
          disabled={disabled}
          options={supported.map((m) => ({ value: m, label: formatValue(m) }))}
          onChange={(m) => send([c('thermostatMode', 'setThermostatMode', [m])])}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['heat', 'cool'] as const).map((kind) => {
          const s = kind === 'heat' ? heat : cool;
          const relevant = mode === 'auto' || mode === kind;
          return (
            <div
              key={kind}
              className={cn(
                'flex items-center justify-between rounded-lg bg-surface-2 p-3',
                !relevant && 'opacity-50',
              )}
            >
              <div>
                <div className="text-xs text-muted">{kind === 'heat' ? 'Heat to' : 'Cool to'}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatTemperature(s?.value, s?.unit, unit)}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setpoint(kind, -step)}
                  aria-label={`Lower ${kind} setpoint`}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => setpoint(kind, step)}
                  aria-label={`Raise ${kind} setpoint`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Row>
  );
}

function LockControl({ status, send, disabled }: ControlProps) {
  const locked = value(status, 'lock', 'lock') === 'locked';
  return (
    <Row label="Lock" hint={<Badge tone={locked ? 'good' : 'warn'}>{locked ? 'Locked' : 'Unlocked'}</Badge>}>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={locked ? 'primary' : 'outline'}
          disabled={disabled || locked}
          onClick={() => send([c('lock', 'lock')])}
        >
          Lock
        </Button>
        <Button
          variant={!locked ? 'primary' : 'outline'}
          disabled={disabled || !locked}
          onClick={() => send([c('lock', 'unlock')])}
        >
          Unlock
        </Button>
      </div>
    </Row>
  );
}

function DoorControl({ status, send, disabled }: ControlProps) {
  const door = String(value(status, 'doorControl', 'door') ?? 'closed');
  const moving = door === 'opening' || door === 'closing';
  return (
    <Row label="Door" hint={<Badge tone={door === 'closed' ? 'good' : 'warn'}>{formatValue(door)}</Badge>}>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={disabled || moving || door === 'open'}
          onClick={() => send([c('doorControl', 'open')])}
        >
          Open
        </Button>
        <Button
          variant="outline"
          disabled={disabled || moving || door === 'closed'}
          onClick={() => send([c('doorControl', 'close')])}
        >
          Close
        </Button>
      </div>
    </Row>
  );
}

function ShadeControl({ status, send, disabled }: ControlProps) {
  const level = Number(value(status, 'windowShadeLevel', 'shadeLevel') ?? 0);
  return (
    <Row label="Shade" hint={<Badge>{formatValue(value(status, 'windowShade', 'windowShade'))}</Badge>}>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => send([c('windowShade', 'open')])}
        >
          Open
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => send([c('windowShade', 'pause')])}
        >
          Pause
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => send([c('windowShade', 'close')])}
        >
          Close
        </Button>
      </div>
      {attr(status, 'windowShadeLevel', 'shadeLevel') ? (
        <CommitSlider
          value={level}
          min={0}
          max={100}
          label="Shade level"
          format={(v) => `${v}%`}
          disabled={disabled}
          onCommit={(v) => send([c('windowShadeLevel', 'setShadeLevel', [v])])}
        />
      ) : null}
    </Row>
  );
}

function MediaControl({ device, status, send, disabled }: ControlProps) {
  const playback = String(value(status, 'mediaPlayback', 'playbackStatus') ?? 'stopped');
  const volume = Number(value(status, 'audioVolume', 'volume') ?? 0);
  const muted = value(status, 'audioMute', 'mute') === 'muted';
  const sources = (value(status, 'mediaInputSource', 'supportedInputSources') as string[] | undefined) ?? [];
  const source = String(value(status, 'mediaInputSource', 'inputSource') ?? '');
  const off = has(device, 'switch') && value(status, 'switch', 'switch') !== 'on';
  return (
    <Row
      label="Media"
      hint={<Badge tone={playback === 'playing' ? 'accent' : 'neutral'}>{formatValue(playback)}</Badge>}
    >
      {has(device, 'mediaPlayback') ? (
        <div className="mb-4 flex gap-2">
          <Button
            size="icon"
            variant={playback === 'playing' ? 'primary' : 'outline'}
            disabled={disabled}
            onClick={() => send([c('mediaPlayback', 'play')])}
            aria-label="Play"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={playback === 'paused' ? 'primary' : 'outline'}
            disabled={disabled || off}
            onClick={() => send([c('mediaPlayback', 'pause')])}
            aria-label="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={disabled || off}
            onClick={() => send([c('mediaPlayback', 'stop')])}
            aria-label="Stop"
          >
            <Square className="h-4 w-4" />
          </Button>
          {sources.length ? (
            <select
              aria-label="Input source"
              className="ml-auto h-9 rounded-lg border border-line bg-surface px-2 text-sm"
              value={source}
              disabled={disabled}
              onChange={(e) => send([c('mediaInputSource', 'setInputSource', [e.target.value])])}
            >
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
      {has(device, 'audioVolume') ? (
        <div className="flex items-center gap-2">
          {has(device, 'audioMute') ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled}
              onClick={() => send([c('audioMute', muted ? 'unmute' : 'mute')])}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          ) : null}
          <div className="flex-1">
            <CommitSlider
              value={volume}
              min={0}
              max={100}
              label="Volume"
              format={(v) => `${v}%`}
              disabled={disabled}
              onCommit={(v) => send([c('audioVolume', 'setVolume', [v])])}
            />
          </div>
        </div>
      ) : null}
    </Row>
  );
}

function FanControl({ status, send, disabled }: ControlProps) {
  const speed = Number(value(status, 'fanSpeed', 'fanSpeed') ?? 0);
  return (
    <Row label="Fan speed">
      <Segmented
        label="Fan speed"
        value={speed}
        disabled={disabled}
        options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: v === 0 ? 'Off' : String(v) }))}
        onChange={(v) => send([c('fanSpeed', 'setFanSpeed', [v])])}
      />
    </Row>
  );
}

function WasherControl({ status, send, disabled }: ControlProps) {
  const machine = String(value(status, 'washerOperatingState', 'machineState') ?? 'stop');
  const job = String(value(status, 'washerOperatingState', 'washerJobState') ?? 'none');
  const completion = value(status, 'washerOperatingState', 'completionTime');
  const mins = minutesUntil(completion);
  const stages = ['wash', 'rinse', 'spin', 'finish'];
  const stageIndex = stages.indexOf(job);
  return (
    <Row
      label="Cycle"
      hint={<Badge tone={machine === 'run' ? 'accent' : 'neutral'}>{formatValue(machine)}</Badge>}
    >
      <ol className="mb-4 grid grid-cols-4 gap-1" aria-label="Cycle progress">
        {stages.map((s, i) => (
          <li key={s} className="text-center">
            <div className={cn('h-1.5 rounded-full', i <= stageIndex ? 'bg-accent' : 'bg-surface-2')} />
            <div
              className={cn('mt-1 text-[11px]', i === stageIndex ? 'font-semibold text-fg' : 'text-subtle')}
            >
              {formatValue(s)}
            </div>
          </li>
        ))}
      </ol>
      {machine === 'run' && mins !== null ? (
        <p className="mb-3 text-sm">
          <span className="text-2xl font-semibold tabular-nums">{mins}</span> min left · done at{' '}
          {formatAttribute('washerOperatingState', 'completionTime', completion, undefined, 'C')}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Button
          size="sm"
          variant={machine === 'run' ? 'primary' : 'outline'}
          disabled={disabled || machine === 'run'}
          onClick={() => send([c('washerOperatingState', 'setMachineState', ['run'])])}
        >
          {machine === 'pause' ? 'Resume' : 'Start'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || machine !== 'run'}
          onClick={() => send([c('washerOperatingState', 'setMachineState', ['pause'])])}
        >
          Pause
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || machine === 'stop'}
          onClick={() => send([c('washerOperatingState', 'setMachineState', ['stop'])])}
        >
          Stop
        </Button>
      </div>
    </Row>
  );
}

function VacuumControl({ status, send, disabled }: ControlProps) {
  const movement = String(value(status, 'robotCleanerMovement', 'robotCleanerMovement') ?? 'idle');
  const mode = String(value(status, 'robotCleanerCleaningMode', 'robotCleanerCleaningMode') ?? 'auto');
  return (
    <Row
      label="Robot vacuum"
      hint={<Badge tone={movement === 'cleaning' ? 'accent' : 'neutral'}>{formatValue(movement)}</Badge>}
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant={movement === 'cleaning' ? 'primary' : 'outline'}
          disabled={disabled || movement === 'cleaning'}
          onClick={() => send([c('robotCleanerMovement', 'setRobotCleanerMovement', ['cleaning'])])}
        >
          Start cleaning
        </Button>
        <Button
          variant="outline"
          disabled={disabled || movement === 'charging' || movement === 'homing'}
          onClick={() => send([c('robotCleanerMovement', 'setRobotCleanerMovement', ['homing'])])}
        >
          Send to dock
        </Button>
      </div>
      <Segmented
        label="Cleaning mode"
        size="sm"
        value={mode}
        disabled={disabled}
        options={['auto', 'part', 'repeat', 'manual'].map((m) => ({ value: m, label: formatValue(m) }))}
        onChange={(m) => send([c('robotCleanerCleaningMode', 'setRobotCleanerCleaningMode', [m])])}
      />
    </Row>
  );
}

const READOUTS: Array<[capability: string, attribute: string, label: string]> = [
  ['temperatureMeasurement', 'temperature', 'Temperature'],
  ['relativeHumidityMeasurement', 'humidity', 'Humidity'],
  ['illuminanceMeasurement', 'illuminance', 'Light level'],
  ['carbonDioxideMeasurement', 'carbonDioxide', 'CO₂'],
  ['airQualitySensor', 'airQuality', 'Air quality'],
  ['powerMeter', 'power', 'Power'],
  ['energyMeter', 'energy', 'Energy'],
  ['motionSensor', 'motion', 'Motion'],
  ['contactSensor', 'contact', 'Contact'],
  ['waterSensor', 'water', 'Water'],
  ['smokeDetector', 'smoke', 'Smoke'],
  ['presenceSensor', 'presence', 'Presence'],
  ['battery', 'battery', 'Battery'],
];

function Readouts({ device, status, unit }: { device: Device; status: DeviceStatus; unit: TemperatureUnit }) {
  const tiles: Array<{
    key: string;
    label: string;
    text: string;
    sub?: string;
    tone?: 'good' | 'warn' | 'bad';
  }> = [];
  for (const component of device.components) {
    for (const [capability, attribute, label] of READOUTS) {
      if (!has(device, capability, component.id)) continue;
      const s = attr(status, capability, attribute, component.id);
      if (!s) continue;
      let sub: string | undefined;
      let tone: 'good' | 'warn' | 'bad' | undefined;
      if (attribute === 'airQuality') ({ label: sub, tone } = airQualityLabel(Number(s.value)));
      if (attribute === 'carbonDioxide') ({ label: sub, tone } = co2Label(Number(s.value)));
      if (attribute === 'battery' && Number(s.value) < 20)
        ({ sub, tone } = { sub: 'Replace soon', tone: 'warn' });
      if (attribute === 'water' && s.value === 'wet') tone = 'bad';
      if (attribute === 'smoke' && s.value === 'detected') tone = 'bad';
      tiles.push({
        key: `${component.id}.${capability}.${attribute}`,
        label: component.id === 'main' ? label : `${component.label ?? component.id} · ${label}`,
        text: formatAttribute(capability, attribute, s.value, s.unit, unit),
        sub,
        tone,
      });
    }
  }
  if (!tiles.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.key} className="rounded-xl border border-line bg-surface p-3">
          <div className="text-[11px] font-medium text-muted">{t.label}</div>
          <div className={cn('mt-1 text-lg font-semibold tabular-nums', t.tone === 'bad' && 'text-bad')}>
            {t.text}
          </div>
          {t.sub ? (
            <div
              className={cn(
                'text-xs',
                t.tone === 'good'
                  ? 'text-good'
                  : t.tone === 'warn'
                    ? 'text-warn'
                    : t.tone === 'bad'
                      ? 'text-bad'
                      : 'text-muted',
              )}
            >
              {t.sub}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
