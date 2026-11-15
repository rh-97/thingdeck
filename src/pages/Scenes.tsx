import { Play, Sparkles } from 'lucide-react';
import { useRunScene, useScenes } from '@/hooks/queries';
import { timeAgo } from '@/lib/time';
import { sceneIcon } from '@/components/sceneIcon';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Scenes() {
  const scenes = useScenes();
  const run = useRunScene();

  if (scenes.isLoading) return <PageSkeleton />;
  if (!scenes.data?.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No scenes"
        description="Scenes created in the SmartThings app appear here and can be run with one tap."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Scenes"
        description="Run a group of device actions at once. Scenes can also switch the location mode."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {scenes.data.map((scene) => {
          const Icon = sceneIcon(scene.sceneIcon);
          const pending = run.isPending && run.variables?.sceneId === scene.sceneId;
          return (
            <div
              key={scene.sceneId}
              className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card"
            >
              <span
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{ background: scene.sceneColor ?? 'var(--accent)' }}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-semibold">{scene.sceneName}</h2>
              <p className="mt-0.5 text-xs text-muted">Last run {timeAgo(scene.lastExecutedDate)}</p>
              <Button className="mt-5" variant="primary" loading={pending} onClick={() => run.mutate(scene)}>
                {!pending ? <Play className="h-4 w-4" /> : null} Run scene
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
