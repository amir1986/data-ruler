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
} from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [aiModel, setAiModel] = useState('qwen2.5:7b');
  const [saved, setSaved] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [storageUsed, setStorageUsed] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setEmail(user.email);
    }
    // Check current theme
    const dark = document.documentElement.classList.contains('dark');
    setIsDark(dark);

    // Estimate storage (placeholder)
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const used = est.usage || 0;
        const quota = est.quota || 0;
        setStorageUsed(
          `${formatStorage(used)} / ${formatStorage(quota)}`
        );
      });
    } else {
      setStorageUsed('N/A');
    }
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

  const handleSaveProfile = () => {
    // Placeholder: would call an API to update user profile
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearCache = () => {
    if (confirm('Clear all cached data? This cannot be undone.')) {
      // Clear local storage and caches
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
        <Skeleton className="h-8 w-48 bg-zinc-800" />
        <Skeleton className="h-64 bg-zinc-800 rounded-xl" />
        <Skeleton className="h-48 bg-zinc-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage your account and application preferences
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">
          {/* Profile Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">Profile</h2>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Email</Label>
                <Input
                  value={email}
                  disabled
                  className="bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed"
                />
                <p className="text-xs text-zinc-600">
                  Email cannot be changed
                </p>
              </div>
              <Button
                onClick={handleSaveProfile}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              {isDark ? (
                <Moon className="h-5 w-5 text-zinc-400" />
              ) : (
                <Sun className="h-5 w-5 text-zinc-400" />
              )}
              <h2 className="text-lg font-semibold text-white">Appearance</h2>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Dark Mode</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Toggle between dark and light themes
                  </p>
                </div>
                <Switch
                  checked={isDark}
                  onCheckedChange={handleToggleTheme}
                />
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">AI Configuration</h2>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Ollama Base URL</Label>
                <Input
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 font-mono text-sm"
                />
                <p className="text-xs text-zinc-600">
                  The base URL for your Ollama instance (OLLAMA_BASE_URL)
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Model Selection</Label>
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="qwen2.5:7b">Qwen 2.5 7B (Default)</SelectItem>
                    <SelectItem value="qwen2.5-coder:7b">Qwen 2.5 Coder 7B</SelectItem>
                    <SelectItem value="llama3.1:8b">Llama 3.1 8B</SelectItem>
                    <SelectItem value="llama3.1:70b">Llama 3.1 70B</SelectItem>
                    <SelectItem value="mistral:7b">Mistral 7B</SelectItem>
                    <SelectItem value="mixtral:8x7b">Mixtral 8x7B</SelectItem>
                    <SelectItem value="codellama:13b">Code Llama 13B</SelectItem>
                    <SelectItem value="nomic-embed-text">Nomic Embed Text</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-600">
                  Choose which AI model powers your data analysis and chat
                </p>
              </div>
            </div>
          </section>

          {/* Data Management */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <HardDrive className="h-5 w-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">
                Data Management
              </h2>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    Storage Usage
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {storageUsed || 'Calculating...'}
                  </p>
                </div>
                {storageUsed && (
                  <div className="h-2 w-32 rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: '30%' }}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleClearCache}
                  className="border-zinc-700 text-zinc-300 hover:text-red-400 hover:border-red-500/50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Cache
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm('Reprocess all uploaded files? This may take a while.')) {
                      setReprocessing(true);
                      // Placeholder: would call an API to reprocess all files
                      setTimeout(() => setReprocessing(false), 3000);
                    }
                  }}
                  disabled={reprocessing}
                  className="border-zinc-700 text-zinc-300 hover:text-blue-400 hover:border-blue-500/50"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${reprocessing ? 'animate-spin' : ''}`} />
                  {reprocessing ? 'Reprocessing...' : 'Reprocess All Files'}
                </Button>
              </div>
              <p className="text-xs text-zinc-600 mt-2">
                Clear Cache removes cached data and temporary files. Reprocess
                re-analyzes all uploaded files with the current AI model.
              </p>
            </div>
          </section>

          {/* About */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">About</h2>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-300">App Version</p>
                <p className="text-sm font-mono text-zinc-400">0.1.0</p>
              </div>
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <a
                  href="https://github.com/data-ruler/data-ruler"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  GitHub Repository
                </a>
                <a
                  href="https://github.com/data-ruler/data-ruler/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Report an Issue
                </a>
                <a
                  href="https://github.com/data-ruler/data-ruler/wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Documentation
                </a>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <p className="text-xs text-zinc-600">
                  Data Ruler - AI-powered data analysis platform. Built with Next.js, Ollama, and love.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
