import {
  Activity,
  BarChart3,
  Cpu,
  DoorOpen,
  LayoutDashboard,
  Settings,
  Sparkles,
  Terminal,
  Workflow,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/rooms', label: 'Rooms', icon: DoorOpen },
  { to: '/scenes', label: 'Scenes', icon: Sparkles },
  { to: '/automations', label: 'Automations', icon: Workflow },
  { to: '/energy', label: 'Energy', icon: BarChart3 },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/inspector', label: 'API Inspector', icon: Terminal },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const MOBILE_NAV = NAV.filter((n) => ['/', '/devices', '/scenes', '/energy'].includes(n.to));
