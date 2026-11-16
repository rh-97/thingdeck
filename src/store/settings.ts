import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { local } from '@/lib/storage';

export type DataMode = 'demo' | 'live';
export type Theme = 'system' | 'light' | 'dark';
export type TemperatureUnit = 'C' | 'F';

/** Preferences that are saved on the user's ThingsDeck account. */
export interface SyncedPreferences {
  mode: DataMode;
  theme: Theme;
  temperatureUnit: TemperatureUnit;
  simulationSpeed: number;
  failureRate: number;
  locationId: string | null;
  /** null until the user customises favourites; the app then falls back to defaults. */
  favorites: string[] | null;
  energyRate: number;
  currency: string;
}

export const SYNCED_KEYS = [
  'mode',
  'theme',
  'temperatureUnit',
  'simulationSpeed',
  'failureRate',
  'locationId',
  'favorites',
  'energyRate',
  'currency',
] as const satisfies ReadonlyArray<keyof SyncedPreferences>;

export interface SettingsState extends SyncedPreferences {
  /** True when the signed-in user has a SmartThings token the server accepts. */
  liveReady: boolean;
  /** Which account's preferences are loaded (null for the static demo build). */
  hydratedUserId: number | null;

  setMode: (mode: DataMode) => void;
  setTheme: (theme: Theme) => void;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  setSimulationSpeed: (speed: number) => void;
  setFailureRate: (rate: number) => void;
  setLocationId: (id: string | null) => void;
  toggleFavorite: (deviceId: string, defaults: string[]) => void;
  setEnergyRate: (rate: number, currency?: string) => void;
  setLiveReady: (ready: boolean) => void;
  /** Replace preferences with the ones stored on an account. */
  hydrate: (userId: number, prefs: Partial<SyncedPreferences>) => void;
}

export const DEFAULT_PREFERENCES: SyncedPreferences = {
  mode: 'demo',
  theme: 'system',
  temperatureUnit: 'C',
  simulationSpeed: 1,
  failureRate: 0,
  locationId: null,
  favorites: null,
  energyRate: 0.18,
  currency: '$',
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,
      liveReady: false,
      hydratedUserId: null,

      setMode: (mode) => set({ mode, locationId: null }),
      setTheme: (theme) => set({ theme }),
      setTemperatureUnit: (temperatureUnit) => set({ temperatureUnit }),
      setSimulationSpeed: (simulationSpeed) => set({ simulationSpeed }),
      setFailureRate: (failureRate) => set({ failureRate }),
      setLocationId: (locationId) => set({ locationId }),
      toggleFavorite: (deviceId, defaults) => {
        const current = get().favorites ?? defaults;
        set({
          favorites: current.includes(deviceId)
            ? current.filter((id) => id !== deviceId)
            : [...current, deviceId],
        });
      },
      setEnergyRate: (energyRate, currency) => set({ energyRate, ...(currency ? { currency } : {}) }),
      setLiveReady: (liveReady) => set({ liveReady }),
      hydrate: (userId, prefs) => set({ ...DEFAULT_PREFERENCES, ...prefs, hydratedUserId: userId }),
    }),
    {
      name: 'thingsdeck.settings',
      version: 2,
      storage: createJSONStorage(() => ({
        getItem: (key) => local.get(key),
        setItem: (key, value) => local.set(key, value),
        removeItem: (key) => local.remove(key),
      })),
      // Only the theme is cached locally (to paint the right colours before sign-in);
      // everything else lives on the account.
      partialize: ({ theme }) => ({ theme }),
    },
  ),
);
