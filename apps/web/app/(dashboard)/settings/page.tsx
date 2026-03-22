'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  Moon,
  Sun,
  Brain,
  HardDrive,
  Trash2,
  Save,
  Check,
  RefreshCw,
  Info,
  ExternalLink,
  Languages,
} from 'lucide-react';
import { useLanguageStore } from '@/stores/language-store';
import type { Locale } from '@/lib/i18n';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { t, locale, setLocale } = useLanguageStore();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [aiModel, setAiModel] = useState('qwen2.5:7b');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [storageUsed, setStorageUsed] = useState<string | null>(null);
  const [storagePercent, setStoragePercent] = useState(0);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setEmail(user.email);
    }
    // Check current theme
    const dark = document.documentElement.classList.contains('dark');
    setIsDark(dark);

    // Fetch real storage usage from server
    fetch('/api/settings/storage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.storage) {
          const s = data.storage;
          setFileCount(s.file_count);
          const used = s.total_disk_usage;
          setStorageUsed(
            `${formatStorage(used)} (${s.file_count} file${s.file_count !== 1 ? 's' : ''})`
          );
          // Cap percentage display at 100
          const maxStorage = 10 * 1024 * 1024 * 1024; // assume 10GB soft limit for display
          setStoragePercent(Math.min(100, Math.round((used / maxStorage) * 100)));
        } else {
          setStorageUsed('N/A');
        }
      })
      .catch(() => setStorageUsed('N/A'));
  }, [user]);

  const formatStorage = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleToggleTheme = (dark: boolean) => {
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silently handle
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = () => {
    if (confirm(t.settings.clearCacheConfirm)) {
      localStorage.clear();
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    }
  };

  if (!user) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48 bg-card" />
        <Skeleton className="h-64 bg-card rounded-xl" />
        <Skeleton className="h-48 bg-card rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <h1 className="text-3xl font-bold text-white">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t.settings.subtitle}
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="max-w-2xl space-y-8">
          {/* Profile Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-white">{t.settings.profile}</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">{t.settings.displayName}</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t.settings.displayNamePlaceholder}
                  className="bg-secondary border-border text-white placeholder-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">{t.settings.email}</Label>
                <Input
                  value={email}
                  disabled
                  className="bg-secondary/50 border-border text-muted-foreground cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground/60">
                  {t.settings.emailCannotChange}
                </p>
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4 me-2" />
                    {t.settings.saved}
                  </>
                ) : saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 me-2 animate-spin" />
                    {t.saving}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 me-2" />
                    {t.settings.saveChanges}
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              {isDark ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <h2 className="text-lg font-semibold text-white">{t.settings.appearance}</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{t.settings.darkMode}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.settings.toggleTheme}
                  </p>
                </div>
                <Switch
                  checked={isDark}
                  onCheckedChange={handleToggleTheme}
                />
              </div>
            </div>
          </section>

          {/* Language */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Languages className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-white">{t.settings.language}</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{t.settings.languageLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.settings.languageDesc}
                  </p>
                </div>
                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  <SelectTrigger className="w-[140px] bg-secondary border-border text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="en">{t.settings.english}</SelectItem>
                    <SelectItem value="he">{t.settings.hebrew}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-white">{t.settings.aiConfig}</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">{t.settings.modelSelection}</Label>
                <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary border border-border">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-white font-mono text-sm">gemini-3-flash-preview</span>
                  <span className="text-xs text-muted-foreground/60 ms-auto">Ollama Cloud</span>
                </div>
                <p className="text-xs text-muted-foreground/60">
                  {t.settings.modelDesc}
                </p>
              </div>
            </div>
          </section>

          {/* Data Management */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-white">
                {t.settings.dataManagement}
              </h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    {t.settings.storageUsage}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {storageUsed || t.settings.calculating}
                  </p>
                </div>
                {storageUsed && (
                  <div className="h-2 w-32 rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${storagePercent}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleClearCache}
                  className="border-border text-zinc-300 hover:text-red-400 hover:border-red-500/50"
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {t.settings.clearCache}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (confirm(t.settings.reprocessConfirm)) {
                      setReprocessing(true);
                      try {
                        await fetch('/api/processing/reprocess', { method: 'POST' });
                      } catch {
                        // silently handle
                      } finally {
                        setReprocessing(false);
                      }
                    }
                  }}
                  disabled={reprocessing}
                  className="border-border text-zinc-300 hover:text-primary hover:border-primary/50"
                >
                  <RefreshCw className={`h-4 w-4 me-2 ${reprocessing ? 'animate-spin' : ''}`} />
                  {reprocessing ? t.settings.reprocessing : t.settings.reprocessAll}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2">
                {t.settings.cacheDesc}
              </p>
            </div>
          </section>

          {/* About */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-white">{t.settings.about}</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-300">{t.settings.appVersion}</p>
                <p className="text-sm font-mono text-muted-foreground">0.1.0</p>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <a
                  href="https://github.com/data-ruler/data-ruler"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t.settings.githubRepo}
                </a>
                <a
                  href="https://github.com/data-ruler/data-ruler/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t.settings.reportIssue}
                </a>
                <a
                  href="https://github.com/data-ruler/data-ruler/wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t.settings.documentation}
                </a>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground/60">
                  {t.appDescription}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
