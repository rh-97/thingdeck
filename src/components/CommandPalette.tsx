import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { CornerDownLeft, Search, Sparkles, Zap } from 'lucide-react';
import { useClient } from '@/api/clientContext';
import { deviceKind, deviceLabel, primaryAction } from '@/capabilities/device';
import { useDeviceSnapshots, useRunScene, useScenes } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/hooks/queries';
import { applyOptimistic } from '@/hooks/optimistic';
import { toast } from '@/store/toasts';
import { describeError } from '@/api/client';
import { cn } from '@/lib/cn';
import { NAV } from './layout/nav';
import type { LucideIcon } from 'lucide-react';
import type { DeviceStatus } from '@/api/types';

interface Item {
  id: string;
  group: 'Actions' | 'Devices' | 'Scenes' | 'Pages';
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Mounting fresh on every open resets the query and selection.
  return open ? <PaletteBody onClose={onClose} /> : null;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const client = useClient();
  const queryClient = useQueryClient();
  const { snapshots } = useDeviceSnapshots();
  const scenes = useScenes();
  const runScene = useRunScene();

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const { device, status, health } of snapshots) {
      const candidate = health?.state === 'ONLINE' ? primaryAction(device, status) : null;
      // Unlocking or opening doors always goes through the device page's confirmation.
      const action = candidate && !candidate.sensitive ? candidate : null;
      const kind = deviceKind(device);
      if (action) {
        out.push({
          id: `act-${device.deviceId}`,
          group: 'Actions',
          label: `${action.label} ${deviceLabel(device)}`,
          icon: Zap,
          run: () => {
            const key = keys.status(device.deviceId);
            const prev = queryClient.getQueryData<DeviceStatus>(key);
            if (prev) queryClient.setQueryData(key, applyOptimistic(prev, action.next));
            client
              .executeCommands(device.deviceId, action.next)
              .then(() => toast.success(`${deviceLabel(device)}: ${action.label.toLowerCase()}`))
              .catch((e) => {
                if (prev) queryClient.setQueryData(key, prev);
                toast.error(`Couldn't update ${deviceLabel(device)}`, describeError(e));
              });
          },
        });
      }
      out.push({
        id: `dev-${device.deviceId}`,
        group: 'Devices',
        label: deviceLabel(device),
        hint: kind.label,
        icon: kind.icon,
        run: () => navigate(`/devices/${device.deviceId}`),
      });
    }
    for (const scene of scenes.data ?? []) {
      out.push({
        id: `scene-${scene.sceneId}`,
        group: 'Scenes',
        label: `Run “${scene.sceneName}”`,
        icon: Sparkles,
        run: () => runScene.mutate(scene),
      });
    }
    for (const nav of NAV) {
      out.push({
        id: `nav-${nav.to}`,
        group: 'Pages',
        label: nav.label,
        icon: nav.icon,
        run: () => navigate(nav.to),
      });
    }
    return out;
  }, [snapshots, scenes.data, client, queryClient, navigate, runScene]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = terms.length
      ? items.filter((i) =>
          terms.every((t) => `${i.label} ${i.hint ?? ''} ${i.group}`.toLowerCase().includes(t)),
        )
      : items.filter((i) => i.group !== 'Actions');
    return list.slice(0, 40);
  }, [items, query]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(filtered.length - 1, a + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            choose(filtered[active]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-subtle" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Type a device, scene or action — e.g. “lock”, “movie”"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={filtered[active]?.id}
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-subtle">esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {snapshots.length ? 'No matches' : 'Loading devices…'}
            </li>
          ) : null}
          {filtered.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                {header ? (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                    {header}
                  </div>
                ) : null}
                <button
                  id={item.id}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                    index === active ? 'bg-accent-soft text-accent' : 'text-fg',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint ? <span className="text-xs text-subtle">{item.hint}</span> : null}
                  {index === active ? <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
