import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { ClientProvider } from '@/api/ClientProvider';
import type { SmartThingsClient } from '@/api/client';
import { AppShell } from '@/components/layout/AppShell';
import { PageSkeleton } from '@/components/PageSkeleton';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Devices = lazy(() => import('@/pages/Devices'));
const DeviceDetail = lazy(() => import('@/pages/DeviceDetail'));
const Rooms = lazy(() => import('@/pages/Rooms'));
const Scenes = lazy(() => import('@/pages/Scenes'));
const Automations = lazy(() => import('@/pages/Automations'));
const Energy = lazy(() => import('@/pages/Energy'));
const ActivityPage = lazy(() => import('@/pages/Activity'));
const Inspector = lazy(() => import('@/pages/Inspector'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const page = (node: ReactNode) => <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;

const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: page(<Dashboard />) },
      { path: 'devices', element: page(<Devices />) },
      { path: 'devices/:deviceId', element: page(<DeviceDetail />) },
      { path: 'rooms', element: page(<Rooms />) },
      { path: 'scenes', element: page(<Scenes />) },
      { path: 'automations', element: page(<Automations />) },
      { path: 'energy', element: page(<Energy />) },
      { path: 'activity', element: page(<ActivityPage />) },
      { path: 'inspector', element: page(<Inspector />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: '*', element: page(<NotFound />) },
    ],
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          if (error instanceof ApiError && (error.isAuthError || error.status === 404 || error.status === 0))
            return false;
          return count < 2;
        },
      },
    },
  });
}

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });
const queryClient = createQueryClient();

export function App({ client }: { client?: SmartThingsClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ClientProvider client={client}>
        <RouterProvider router={router} />
      </ClientProvider>
    </QueryClientProvider>
  );
}
