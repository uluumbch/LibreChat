import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/AuthContext';
import { Button, Spinner } from '~/components/ui';

export default function RegisterPage(): JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ email, password, name: name || undefined });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-surface-dark px-4 text-zinc-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-surface-dark-muted p-8 shadow-xl"
      >
        <div>
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-400">Get started with Hermes Chat</p>
        </div>
        {error && (
          <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>
        )}
        <label className="block text-sm">
          <span className="text-zinc-400">Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-blue-500"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-blue-500"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-blue-500"
          />
          <span className="mt-1 block text-xs text-zinc-500">At least 8 characters</span>
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner /> : 'Create account'}
        </Button>
        <p className="text-center text-sm text-zinc-400">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
