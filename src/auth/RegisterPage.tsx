import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { authApi } from './api';
import { AuthLayout, Splash } from './AuthLayout';
import { meKey, useMe, useSignupConfig } from './hooks';
import { safeNext } from './utils';

export default function RegisterPage() {
  const me = useMe();
  const config = useSignupConfig();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('next'));

  if (me.isLoading || config.isLoading) return <Splash />;
  if (me.data) return <Navigate to={next} replace />;

  if (config.data?.signup === 'closed') {
    return (
      <AuthLayout
        title="Registration is closed"
        description="Ask the person who runs this ThingsDeck server for an account."
      >
        <Link to="/login" className="text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  const tooShort = form.password.length > 0 && form.password.length < 8;
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tooShort || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.register({ name: form.name, email: form.email, password: form.password });
      await queryClient.invalidateQueries({ queryKey: meKey });
      navigate(next, { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthLayout
      title="Create your account"
      description="One account keeps your settings and SmartThings connection on every device."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="name">
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={
            tooShort ? <span className="text-bad">At least 8 characters.</span> : 'At least 8 characters.'
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="confirm"
          hint={mismatch ? <span className="text-bad">Passwords don’t match.</span> : undefined}
        >
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
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
          disabled={!form.email || !form.password || tooShort || mismatch || !form.confirm}
        >
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
