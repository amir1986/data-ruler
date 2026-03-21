'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguageStore } from '@/stores/language-store';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const { t } = useLanguageStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/files');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">{t.appName}</h1>
          <p className="text-muted-foreground mt-2">{t.appTagline}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">{t.auth.signIn}</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t.auth.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
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
                className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder={t.auth.passwordPlaceholder}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium rounded-lg transition"
            >
              {loading ? t.auth.signingIn : t.auth.signIn}
            </button>
          </form>

          <p className="text-muted-foreground text-sm text-center mt-6">
            {t.auth.noAccount}{' '}
            <Link href="/register" className="text-primary hover:text-primary/80 transition">
              {t.auth.createOne}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
