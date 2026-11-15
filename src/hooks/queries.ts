import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClient } from '@/api/clientContext';
import { describeError } from '@/api/client';
import type {
  Device,
  DeviceCommand,
  DeviceHealth,
  DeviceStatus,
  HistoryQuery,
  RuleRequest,
} from '@/api/types';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toasts';
import { applyOptimistic } from './optimistic';

export const keys = {
  locations: ['locations'] as const,
  rooms: (locationId: string) => ['rooms', locationId] as const,
  devices: (locationId: string) => ['devices', locationId] as const,
  status: (deviceId: string) => ['status', deviceId] as const,
  health: (deviceId: string) => ['health', deviceId] as const,
  scenes: (locationId: string) => ['scenes', locationId] as const,
  modes: (locationId: string) => ['modes', locationId] as const,
  mode: (locationId: string) => ['mode', locationId] as const,
  rules: (locationId: string) => ['rules', locationId] as const,
  history: (query: HistoryQuery) => ['history', query] as const,
};

/** Polling only matters for the live API — the demo pushes updates. */
function usePoll(liveMs: number) {
  const client = useClient();
  return client.kind === 'live' ? liveMs : false;
}

export function useLocations() {
  const client = useClient();
  return useQuery({ queryKey: keys.locations, queryFn: () => client.listLocations(), staleTime: 5 * 60_000 });
}

/** The selected location (persisted), falling back to the first one available. */
export function useCurrentLocation() {
  const locations = useLocations();
  const selected = useSettings((s) => s.locationId);
  const location = locations.data?.find((l) => l.locationId === selected) ?? locations.data?.[0];
  return { ...locations, location, locationId: location?.locationId };
}

export function useRooms() {
  const client = useClient();
  const { locationId } = useCurrentLocation();
  return useQuery({
    queryKey: keys.rooms(locationId ?? ''),
    queryFn: () => client.listRooms(locationId!),
    enabled: !!locationId,
    staleTime: 5 * 60_000,
  });
}

export function useDevices() {
  const client = useClient();
  const { locationId } = useCurrentLocation();
  return useQuery({
    queryKey: keys.devices(locationId ?? ''),
    queryFn: () => client.listDevices(locationId!),
    enabled: !!locationId,
    staleTime: 60_000,
  });
}

export function useDevice(deviceId: string | undefined) {
  const devices = useDevices();
  return { ...devices, device: devices.data?.find((d) => d.deviceId === deviceId) };
}

export function useDeviceStatus(deviceId: string | undefined) {
  const client = useClient();
  const poll = usePoll(30_000);
  return useQuery({
    queryKey: keys.status(deviceId ?? ''),
    queryFn: () => client.getDeviceStatus(deviceId!),
    enabled: !!deviceId,
    refetchInterval: poll,
  });
}

export function useDeviceHealth(deviceId: string | undefined) {
  const client = useClient();
  const poll = usePoll(5 * 60_000);
  return useQuery({
    queryKey: keys.health(deviceId ?? ''),
    queryFn: () => client.getDeviceHealth(deviceId!),
    enabled: !!deviceId,
    refetchInterval: poll,
    staleTime: 30_000,
  });
}

export interface DeviceSnapshot {
  device: Device;
  status: DeviceStatus | undefined;
  health: DeviceHealth | undefined;
}

/** Devices joined with their status and health — what most screens render. */
export function useDeviceSnapshots() {
  const client = useClient();
  const devices = useDevices();
  const poll = usePoll(60_000);
  const list = useMemo(() => devices.data ?? [], [devices.data]);

  const statuses = useQueries({
    queries: list.map((d) => ({
      queryKey: keys.status(d.deviceId),
      queryFn: () => client.getDeviceStatus(d.deviceId),
      refetchInterval: poll,
    })),
  });
  const healths = useQueries({
    queries: list.map((d) => ({
      queryKey: keys.health(d.deviceId),
      queryFn: () => client.getDeviceHealth(d.deviceId),
      staleTime: 30_000,
      refetchInterval: poll ? 5 * 60_000 : false,
    })),
  });

  const snapshots: DeviceSnapshot[] = list.map((device, i) => ({
    device,
    status: statuses[i]?.data,
    health: healths[i]?.data,
  }));

  return {
    snapshots,
    isLoading: devices.isLoading,
    isStatusLoading: statuses.some((s) => s.isLoading),
    error: devices.error,
    refetch: devices.refetch,
  };
}

/**
 * Sends device commands with an optimistic cache update and automatic rollback.
 */
export function useDeviceCommand(device: Device | undefined) {
  const client = useClient();
  const queryClient = useQueryClient();
  const deviceId = device?.deviceId ?? '';

  return useMutation({
    mutationFn: (commands: DeviceCommand[]) => client.executeCommands(deviceId, commands),
    onMutate: async (commands) => {
      await queryClient.cancelQueries({ queryKey: keys.status(deviceId) });
      const previous = queryClient.getQueryData<DeviceStatus>(keys.status(deviceId));
      if (previous) queryClient.setQueryData(keys.status(deviceId), applyOptimistic(previous, commands));
      return { previous };
    },
    onError: (error, _commands, context) => {
      if (context?.previous) queryClient.setQueryData(keys.status(deviceId), context.previous);
      toast.error(`Couldn't update ${device?.label ?? 'device'}`, describeError(error));
    },
    onSettled: () => {
      if (client.kind === 'live') {
        // Give the cloud a beat to reflect the new state before refetching.
        setTimeout(() => queryClient.invalidateQueries({ queryKey: keys.status(deviceId) }), 1500);
      }
    },
  });
}

export function useScenes() {
  const client = useClient();
  const { locationId } = useCurrentLocation();
  return useQuery({
    queryKey: keys.scenes(locationId ?? ''),
    queryFn: () => client.listScenes(locationId!),
    enabled: !!locationId,
  });
}

export function useRunScene() {
  const client = useClient();
  const queryClient = useQueryClient();
  const { locationId } = useCurrentLocation();
  return useMutation({
    mutationFn: (scene: { sceneId: string; sceneName: string }) => client.executeScene(scene.sceneId),
    onSuccess: (_data, scene) => {
      toast.success(`${scene.sceneName} is running`);
      queryClient.invalidateQueries({ queryKey: keys.scenes(locationId ?? '') });
      queryClient.invalidateQueries({ queryKey: keys.mode(locationId ?? '') });
      if (client.kind === 'live')
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['status'] }), 2000);
    },
    onError: (error, scene) => toast.error(`${scene.sceneName} failed`, describeError(error)),
  });
}

export function useModes() {
  const client = useClient();
  const { locationId } = useCurrentLocation();
  const modes = useQuery({
    queryKey: keys.modes(locationId ?? ''),
    queryFn: () => client.listModes(locationId!),
    enabled: !!locationId,
    staleTime: 5 * 60_000,
  });
  const current = useQuery({
    queryKey: keys.mode(locationId ?? ''),
    queryFn: () => client.getCurrentMode(locationId!),
    enabled: !!locationId,
    refetchInterval: usePoll(60_000),
  });
  return { modes, current };
}

export function useSetMode() {
  const client = useClient();
  const queryClient = useQueryClient();
  const { locationId } = useCurrentLocation();
  return useMutation({
    mutationFn: (modeId: string) => client.setCurrentMode(locationId!, modeId),
    onSuccess: (mode) => {
      queryClient.setQueryData(keys.mode(locationId ?? ''), mode);
      toast.success(`Mode set to ${mode.label}`);
    },
    onError: (error) => toast.error("Couldn't change mode", describeError(error)),
  });
}

export function useRules() {
  const client = useClient();
  const { locationId } = useCurrentLocation();
  return useQuery({
    queryKey: keys.rules(locationId ?? ''),
    queryFn: () => client.listRules(locationId!),
    enabled: !!locationId,
  });
}

export function useRuleMutations() {
  const client = useClient();
  const queryClient = useQueryClient();
  const { locationId } = useCurrentLocation();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.rules(locationId ?? '') });

  const create = useMutation({
    mutationFn: (rule: RuleRequest) => client.createRule(locationId!, rule),
    onSuccess: (rule) => {
      toast.success('Automation created', rule.name);
      invalidate();
    },
    onError: (error) => toast.error("Couldn't create automation", describeError(error)),
  });
  const remove = useMutation({
    mutationFn: (ruleId: string) => client.deleteRule(locationId!, ruleId),
    onSuccess: () => {
      toast.success('Automation deleted');
      invalidate();
    },
    onError: (error) => toast.error("Couldn't delete automation", describeError(error)),
  });
  const setEnabled = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      if (!client.setRuleEnabled) throw new Error('Pausing automations is not available in the public API.');
      return client.setRuleEnabled(locationId!, ruleId, enabled);
    },
    onSuccess: (rule) => {
      toast.info(rule.enabled ? 'Automation enabled' : 'Automation paused', rule.name);
      invalidate();
    },
    onError: (error) => toast.error("Couldn't update automation", describeError(error)),
  });
  return { create, remove, setEnabled, canToggle: !!client.setRuleEnabled };
}

export function useHistory(
  query: Omit<HistoryQuery, 'locationId'>,
  options: { enabled?: boolean; refetchMs?: number } = {},
) {
  const client = useClient();
  const { locationId } = useCurrentLocation();
  const full: HistoryQuery = { ...query, locationId: locationId ?? '' };
  return useQuery({
    queryKey: keys.history(full),
    queryFn: () => client.getHistory(full),
    enabled: !!locationId && (options.enabled ?? true),
    refetchInterval: options.refetchMs ?? (client.kind === 'live' ? 60_000 : 15_000),
    placeholderData: (previous) => previous,
  });
}

export function useFavorites(snapshots: DeviceSnapshot[]) {
  const stored = useSettings((s) => s.favorites);
  const toggle = useSettings((s) => s.toggleFavorite);
  const client = useClient();
  const defaults = useMemo(() => {
    if (client.kind === 'mock') {
      const preferred = [
        'Ceiling Light',
        'Floor Lamp',
        'Living Room TV',
        'Refrigerator',
        'Thermostat',
        'Front Door Lock',
        'Washer',
        'Cabin Thermostat',
        'Cabin Door Lock',
      ];
      return snapshots.filter((s) => preferred.includes(s.device.label ?? '')).map((s) => s.device.deviceId);
    }
    return snapshots.slice(0, 6).map((s) => s.device.deviceId);
  }, [client.kind, snapshots]);
  const ids = stored ?? defaults;
  return {
    ids,
    isFavorite: (deviceId: string) => ids.includes(deviceId),
    toggle: (deviceId: string) => toggle(deviceId, defaults),
  };
}
