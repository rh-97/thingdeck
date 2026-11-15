import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { useRunScene, useScenes } from '@/hooks/queries';
import { sceneIcon } from './sceneIcon';
import { Skeleton } from './ui/Skeleton';

export function SceneStrip() {
  const scenes = useScenes();
  const run = useRunScene();
  if (scenes.isLoading) return <Skeleton className="h-14" />;
  if (!scenes.data?.length) return null;
  return (
    <section aria-labelledby="scenes-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="scenes-heading" className="text-sm font-semibold">
          Scenes
        </h2>
        <Link to="/scenes" className="text-xs font-medium text-accent hover:underline">
          Manage
        </Link>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {scenes.data.map((scene) => {
          const Icon = sceneIcon(scene.sceneIcon);
          const pending = run.isPending && run.variables?.sceneId === scene.sceneId;
          return (
            <button
              key={scene.sceneId}
              onClick={() => run.mutate(scene)}
              disabled={pending}
              className="group flex shrink-0 items-center gap-2.5 rounded-xl border border-line bg-surface py-2 pr-4 pl-2 text-sm font-medium shadow-card transition hover:border-accent/50 disabled:opacity-60"
            >
              <span
                className="rounded-lg p-1.5 text-white"
                style={{ background: scene.sceneColor ?? 'var(--accent)' }}
              >
                {pending ? (
                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden />
                )}
              </span>
              {scene.sceneName}
              <Play
                className="h-3 w-3 text-subtle opacity-0 transition group-hover:opacity-100"
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
