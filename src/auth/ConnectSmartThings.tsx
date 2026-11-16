import { useState, type FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { toast } from '@/store/toasts';
import { authApi } from './api';
import { meKey } from './hooks';
import { SCOPES } from './utils';

/**
 * Token form: the server checks the token with SmartThings, encrypts it and
 * stores it on the account. The browser never keeps a copy.
 */
export function ConnectSmartThings({
  onConnected,
  submitLabel = 'Connect',
}: {
  onConnected?: () => void;
  submitLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.saveToken(token.trim());
      setToken('');
      await queryClient.invalidateQueries({ queryKey: meKey });
      toast.success('SmartThings connected');
      onConnected?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Open{' '}
          <a
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            href="https://account.smartthings.com/tokens"
            target="_blank"
            rel="noreferrer noopener"
          >
            account.smartthings.com/tokens <ExternalLink className="h-3 w-3" />
          </a>{' '}
          and generate a new token.
        </li>
        <li>
          Tick these scopes: <span className="font-mono text-xs break-words">{SCOPES.join(' ')}</span>
        </li>
        <li>Paste it below. Tokens last 24 hours; ThingsDeck will ask for a new one when it expires.</li>
      </ol>
      <Field
        label="Personal access token"
        htmlFor="st-token"
        hint="Checked with SmartThings, then stored encrypted on your account."
      >
        <Input
          id="st-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setError(null);
          }}
        />
      </Field>
      {error ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={busy} disabled={!token.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}
