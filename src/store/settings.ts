import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { local, session } from '@/lib/storage';

export type DataMode = 'demo' | 'live';
export type Theme = 'system' | 'light' | 'dark';
export type TemperatureUnit = 'C' | 'F';

export interface SettingsState {
  mode: DataMode;
  token: string;
  rememberToken: boolean;
  theme: Theme;
  temperatureUnit: TemperatureUnit;
  simulationSpeed: number;
  failureRate: number;
  locationId: string | null;
  /** null until the user customises favourites; the app then falls back to defaults. */
  favorites: string[] | null;
  energyRate: number;
  currency: string;

  setMode: (mode: DataMode) => void;
  setToken: (token: string, remember: boolean) => void;
  clearToken: () => void;
  setTheme: (theme: Theme) => void;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  setSimulationSpeed: (speed: number) => void;
  setFailureRate: (rate: number) => void;
  setLocationId: (id: string | null) => void;
  toggleFavorite: (deviceId: string, defaults: string[]) => void;
  setEnergyRate: (rate: number, currency?: string) => void;
}

const SESSION_TOKEN_KEY = 'thingdeck.token';

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      mode: 'demo',
      token: session.get(SESSION_TOKEN_KEY) ?? '',
      rememberToken: false,
      theme: 'system',
      temperatureUnit: 'C',
      simulationSpeed: 1,
      failureRate: 0,
      locationId: null,
      favorites: null,
      energyRate: 0.18,
      currency: '$',

      setMode: (mode) => set({ mode, locationId: null }),
      setToken: (token, remember) => {
        if (remember) session.remove(SESSION_TOKEN_KEY);
        else session.set(SESSION_TOKEN_KEY, token);
        set({ token, rememberToken: remember });
      },
      clearToken: () => {
        session.remove(SESSION_TOKEN_KEY);
        set({ token: '', rememberToken: false, mode: 'demo', locationId: null });
      },
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
    }),
    {
      name: 'thingdeck.settings',
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (key) => local.get(key),
        setItem: (key, value) => local.set(key, value),
        removeItem: (key) => local.remove(key),
      })),
      // The token only reaches localStorage when the user explicitly opts in.
      partialize: ({ token, rememberToken, ...rest }) => ({
        ...rest,
        rememberToken,
        ...(rememberToken ? { token } : {}),
      }),
    },
  ),
);
