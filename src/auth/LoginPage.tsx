import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { authApi } from './api';
import { AuthLayout, Splash } from './AuthLayout';
import { meKey, useMe, useSignupConfig } from './hooks';
import { safeNext } from './utils';

export default function LoginPage() {
  const me = useMe();
  const config = useSignupConfig();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('next'));

  if (me.isLoading) return <Splash />;
  if (me.data) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.login({ email, password });
      await queryClient.invalidateQueries({ queryKey: meKey });
      navigate(next, { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in" description="Welcome back to ThingsDeck.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center"
          loading={busy}
          disabled={!email || !password}
        >
          Sign in
        </Button>
      </form>
      {config.data?.signup !== 'closed' ? (
        <p className="mt-6 text-center text-sm text-muted">
          New here?{' '}
          <Link
            to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-medium text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>
      ) : null}
    </AuthLayout>
  );
}
