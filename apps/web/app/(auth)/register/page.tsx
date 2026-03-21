'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguageStore } from '@/stores/language-store';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const { t } = useLanguageStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t.auth.passwordMinLength);
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName || undefined);
      router.push('/files');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.registrationFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">{t.appName}</h1>
          <p className="text-zinc-400 mt-2">{t.appTagline}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">{t.auth.createAccount}</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t.auth.displayName}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={t.auth.displayNamePlaceholder}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t.auth.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={t.auth.emailPlaceholder}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t.auth.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={t.auth.atLeast8Chars}
                required
                minLength={8}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
            >
              {loading ? t.auth.creatingAccount : t.auth.createAccount}
            </button>
          </form>

          <p className="text-zinc-400 text-sm text-center mt-6">
            {t.auth.hasAccount}{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition">
              {t.auth.signIn}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
