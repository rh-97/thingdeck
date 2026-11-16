import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { ClientProvider } from '@/api/ClientProvider';
import type { SmartThingsClient } from '@/api/client';
import { AppShell } from '@/components/layout/AppShell';
import { PageSkeleton } from '@/components/PageSkeleton';
import { RequireAuth } from '@/auth/RequireAuth';
import { meKey } from '@/auth/hooks';
import { STATIC_DEMO } from '@/lib/env';

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
const LoginPage = lazy(() => import('@/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/auth/RegisterPage'));

const page = (node: ReactNode) => <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;

const appRoutes = [
  {
    path: '/',
    // The static GitHub Pages build has no server, so it skips accounts entirely.
    element: STATIC_DEMO ? (
      <AppShell />
    ) : (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
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

const routes = STATIC_DEMO
  ? appRoutes
  : [
      { path: '/login', element: <Suspense fallback={null}>{<LoginPage />}</Suspense> },
      { path: '/register', element: <Suspense fallback={null}>{<RegisterPage />}</Suspense> },
      ...appRoutes,
    ];

function createQueryClient() {
  // An expired SmartThings token or ended session anywhere re-runs the auth gate,
  // which then shows the reconnect or sign-in screen.
  const onError = (error: unknown) => {
    if (error instanceof ApiError && (error.code === 'TOKEN_EXPIRED' || error.code === 'UNAUTHENTICATED')) {
      void client.invalidateQueries({ queryKey: meKey });
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // The session query reporting 401 is the gate's own signal, not something to retry.
      onError: (error, query) => (query.queryKey[0] === meKey[0] ? undefined : onError(error)),
    }),
    mutationCache: new MutationCache({ onError }),
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
  return client;
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
