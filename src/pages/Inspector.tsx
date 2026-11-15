import { useMemo, useState } from 'react';
import { Check, Copy, Terminal, Trash2 } from 'lucide-react';
import { useClient } from '@/api/clientContext';
import type { ApiLogEntry } from '@/api/types';
import { useActivity } from '@/store/activity';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';

const methodTone = { GET: 'info', POST: 'accent', PUT: 'warn', DELETE: 'bad' } as const;

export default function Inspector() {
  const client = useClient();
  const requests = useActivity((s) => s.requests);
  const clear = useActivity((s) => s.clearRequests);
  const [filter, setFilter] = useState<'all' | 'writes' | 'errors'>('all');
  const [selected, setSelected] = useState<ApiLogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const list = useMemo(
    () =>
      requests.filter((r) =>
        filter === 'writes'
          ? r.method !== 'GET'
          : filter === 'errors'
            ? r.status >= 400 || r.status === 0
            : true,
      ),
    [requests, filter],
  );
  const stats = useMemo(() => {
    const durations = requests.map((r) => r.durationMs).sort((a, b) => a - b);
    const p = (q: number) => durations[Math.min(durations.length - 1, Math.floor(q * durations.length))] ?? 0;
    return {
      count: requests.length,
      errors: requests.filter((r) => r.status >= 400 || r.status === 0).length,
      p50: p(0.5),
      p95: p(0.95),
    };
  }, [requests]);

  const active = selected ?? list[0] ?? null;
  const curl = active
    ? [
        `curl -X ${active.method} 'https://api.smartthings.com/v1${active.path}'`,
        `  -H 'Authorization: Bearer $SMARTTHINGS_TOKEN'`,
        `  -H 'Accept: application/json'`,
      ].join(' \\\n')
    : '';

  return (
    <div>
      <PageHeader
        title="API Inspector"
        description={
          client.kind === 'mock'
            ? 'Every call the UI makes, shown with the real SmartThings REST paths the demo home emulates.'
            : 'Every call made to api.smartthings.com in this session.'
        }
        actions={
          <Button variant="outline" onClick={clear} disabled={!requests.length}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Requests', stats.count],
          ['Errors', stats.errors],
          ['p50 latency', `${stats.p50} ms`],
          ['p95 latency', `${stats.p95} ms`],
        ].map(([label, v]) => (
          <div key={String(label)} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {!requests.length ? (
        <EmptyState
          icon={Terminal}
          title="No requests yet"
          description="Navigate around the app and calls will stream in here."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="min-w-0 overflow-hidden lg:col-span-3">
            <CardHeader
              title="Requests"
              action={
                <Segmented
                  size="sm"
                  label="Filter requests"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'writes', label: 'Writes' },
                    { value: 'errors', label: 'Errors' },
                  ]}
                />
              }
            />
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto border-t border-line font-mono text-xs">
              {list.map((r) => (
                <li key={`${r.id}-${r.at}`}>
                  <button
                    onClick={() => setSelected(r)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2',
                      active === r && 'bg-accent-soft',
                    )}
                  >
                    <Badge
                      tone={methodTone[r.method as keyof typeof methodTone] ?? 'neutral'}
                      className="w-14 justify-center font-mono"
                    >
                      {r.method}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">{r.path}</span>
                    <span
                      className={cn(
                        'tabular-nums',
                        r.status >= 400 || r.status === 0 ? 'text-bad' : 'text-good',
                      )}
                    >
                      {r.status || 'ERR'}
                    </span>
                    <span className="w-14 text-right text-subtle tabular-nums">{r.durationMs} ms</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="min-w-0 lg:col-span-2">
            <CardHeader
              title="Request"
              description={active ? new Date(active.at).toLocaleTimeString() : undefined}
            />
            {active ? (
              <div className="space-y-4 px-5 pb-5">
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <dt className="text-muted">Method</dt>
                  <dd className="col-span-2 font-mono">{active.method}</dd>
                  <dt className="text-muted">Path</dt>
                  <dd className="col-span-2 font-mono break-all">/v1{active.path}</dd>
                  <dt className="text-muted">Status</dt>
                  <dd className="col-span-2 font-mono">{active.status || 'network error'}</dd>
                  <dt className="text-muted">Duration</dt>
                  <dd className="col-span-2 font-mono">{active.durationMs} ms</dd>
                  {active.error ? (
                    <>
                      <dt className="text-muted">Error</dt>
                      <dd className="col-span-2 text-bad">{active.error}</dd>
                    </>
                  ) : null}
                </dl>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Equivalent curl</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        navigator.clipboard?.writeText(curl).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1200);
                        })
                      }
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">
                    {curl}
                  </pre>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
