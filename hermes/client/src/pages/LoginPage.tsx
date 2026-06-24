import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/AuthContext';
import { BrandMark, Button, Spinner } from '~/components/ui';

const inputClass =
  'mt-1.5 w-full rounded-[10px] border border-black/10 bg-surface-input px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';

export default function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email, password });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex h-full items-center justify-center px-4 text-ink"
      style={{
        background:
          'radial-gradient(1200px 600px at 50% -10%, rgba(99,102,241,0.10), transparent 60%), #ffffff',
      }}
    >
      <div className="w-[380px] max-w-full animate-hm-fade">
        <div className="mb-7 flex items-center justify-center gap-3">
          <BrandMark size={34} radius={9} />
          <span className="text-[19px] font-semibold tracking-tight">Hermes</span>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-black/[0.08] bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
        >
          <h1 className="text-lg font-semibold tracking-tight">Welcome back</h1>
          <p className="mb-5 mt-1 text-[13px] text-ink-muted">Sign in to Hermes Chat</p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          <label className="block text-xs font-medium text-ink-muted">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="mt-3.5 block text-xs font-medium text-ink-muted">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <Button type="submit" className="mt-5 w-full" disabled={busy}>
            {busy ? <Spinner /> : 'Sign in'}
          </Button>
          <p className="mt-4 text-center text-[13px] text-ink-muted">
            No account?{' '}
            <Link to="/register" className="font-medium text-brand-dark hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
