import { create } from 'zustand';
import type { ApiLogEntry, DeviceEvent } from '@/api/types';

const MAX_EVENTS = 200;
const MAX_REQUESTS = 300;

interface ActivityState {
  /** Most recent live events, newest first (fed by the client subscription). */
  events: DeviceEvent[];
  requests: ApiLogEntry[];
  addEvent: (event: DeviceEvent) => void;
  addRequest: (entry: ApiLogEntry) => void;
  clearRequests: () => void;
  reset: () => void;
}

export const useActivity = create<ActivityState>()((set) => ({
  events: [],
  requests: [],
  addEvent: (event) => set((s) => ({ events: [event, ...s.events].slice(0, MAX_EVENTS) })),
  addRequest: (entry) => set((s) => ({ requests: [entry, ...s.requests].slice(0, MAX_REQUESTS) })),
  clearRequests: () => set({ requests: [] }),
  reset: () => set({ events: [], requests: [] }),
}));
