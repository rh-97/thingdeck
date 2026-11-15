import { Clapperboard, DoorOpen, Home, Lock, Moon, Sparkles, Sunrise, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  sunrise: Sunrise,
  clapperboard: Clapperboard,
  'door-open': DoorOpen,
  moon: Moon,
  home: Home,
  lock: Lock,
};

/** Live scenes use numeric icon ids we can't map, so fall back to a sparkle. */
export function sceneIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Sparkles;
}
