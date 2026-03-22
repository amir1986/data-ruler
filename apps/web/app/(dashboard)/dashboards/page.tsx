'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardStore } from '@/stores/dashboard-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LayoutDashboard,
  Plus,
  Sparkles,
  Clock,
  BarChart3,
  Trash2,
  TrendingUp,
  Activity,
  Cpu,
  Zap,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { safeFormatDate } from '@/lib/utils';
import { useLanguageStore } from '@/stores/language-store';

export default function DashboardsPage() {
  const router = useRouter();
  const {
    dashboards,
    loading,
    fetchDashboards,
    createDashboard,
    deleteDashboard,
  } = useDashboardStore();
  const { t, isRtl } = useLanguageStore();

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  const handleCreate = async () => {
    const dashboard = await createDashboard(t.dashboards.untitledDashboard);
    if (dashboard) {
      router.push(`/dashboards/${dashboard.id}`);
    }
  };

  // Mock stats based on actual data
  const totalVisuals = dashboards.reduce((acc, d) => acc + (d.widgets || []).length, 0) || 128;
  const activeStreams = dashboards.length || 42;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <nav className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          <span>{t.dashboards.breadcrumb}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-primary">{t.nav.dashboards}</span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{t.dashboards.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t.dashboards.subtitle}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2"
          >
            <Plus className="h-4 w-4" />
            {t.dashboards.createDashboard}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-5">
        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t.dashboards.totalVisuals}
            </p>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-white">{totalVisuals}</span>
              <span className="flex items-center gap-1 text-sm text-emerald-400 font-medium">
                +12%
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t.dashboards.activeStreams}
            </p>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-white">{activeStreams}</span>
              <span className="flex items-center gap-1 text-sm text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {t.dashboards.live}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t.dashboards.systemPerformance}
            </p>
            <p className="text-base font-semibold text-white mb-1">{t.dashboards.aiCoreUtilization}</p>
            <p className="text-xs text-muted-foreground">Optimization level at 98.2% across clusters.</p>
            <div className="flex gap-0.5 mt-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-6 flex-1 rounded-sm ${i < 7 ? 'bg-emerald-500/70' : 'bg-emerald-500/30'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-secondary rounded-lg border border-border">
              <SlidersIcon className="h-3.5 w-3.5" />
              {t.dashboards.allTypes}
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-white rounded-lg hover:bg-secondary/50 transition-colors">
              {t.dashboards.recentlyUpdated}
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-white rounded-lg hover:bg-secondary/50 transition-colors">
              {t.dashboards.shared}
            </button>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t.dashboards.showingDashboards} {dashboards.length || 12} {t.dashboards.dashboardsLabel}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 bg-card rounded-xl" />
            ))}
          </div>
        ) : dashboards.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-border bg-card">
            <LayoutDashboard className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">{t.dashboards.noDashboards}</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              {t.dashboards.createToStart}
            </p>
            <Button
              onClick={handleCreate}
              className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            >
              <Plus className="h-4 w-4" />
              {t.dashboards.createFirst}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboards.map((dashboard, index) => {
                const visibilityLabels = ['public', 'private', 'internal'] as const;
                const visibility = visibilityLabels[index % 3];
                const badgeColors: Record<string, string> = {
                  public: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                  private: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
                  internal: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                };

                return (
                  <div
                    key={dashboard.id}
                    onClick={() => router.push(`/dashboards/${dashboard.id}`)}
                    className="group relative rounded-xl border border-border bg-card p-5 cursor-pointer hover:border-muted-foreground/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                        <BarChart3 className="h-5 w-5 text-accent" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${badgeColors[visibility]} border text-[10px] font-semibold uppercase tracking-wider`}>
                          {t.dashboards[visibility]}
                        </Badge>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded text-muted-foreground hover:text-white transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {dashboard.title}
                    </h3>
                    {dashboard.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {dashboard.description}
                      </p>
                    )}

                    {/* Mini chart preview */}
                    <div className="flex gap-1 items-end h-10 mb-4">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-accent/30"
                          style={{ height: `${20 + Math.random() * 80}%` }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-3 border-t border-border">
                      <span className="flex items-center gap-1">
                        <LayoutDashboard className="h-3 w-3" />
                        {(dashboard.widgets || []).length} {t.dashboards.widgets}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t.dashboards.updated} {safeFormatDate(dashboard.updated_at, "h'H' 'AGO'")}
                      </span>
                    </div>

                    {/* Delete button on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t.dashboards.deleteDashboard)) {
                          deleteDashboard(dashboard.id);
                        }
                      }}
                      className="absolute top-3 end-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 hover:bg-secondary transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}

              {/* Create New View card */}
              <div
                onClick={handleCreate}
                className="group rounded-xl border border-dashed border-border bg-card/30 p-5 cursor-pointer hover:border-muted-foreground/30 transition-colors flex flex-col items-center justify-center min-h-[220px]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-white">{t.dashboards.createNewView}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  {t.dashboards.emptyWorkspace}
                </p>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-1 pt-4">
              <button className="h-8 w-8 rounded-lg text-muted-foreground hover:text-white flex items-center justify-center transition-colors">
                {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <button className="h-8 w-8 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
                1
              </button>
              <button className="h-8 w-8 rounded-lg text-muted-foreground hover:text-white text-sm flex items-center justify-center transition-colors">
                2
              </button>
              <button className="h-8 w-8 rounded-lg text-muted-foreground hover:text-white text-sm flex items-center justify-center transition-colors">
                3
              </button>
              <button className="h-8 w-8 rounded-lg text-muted-foreground hover:text-white flex items-center justify-center transition-colors">
                {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Small filter icon component
function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </svg>
  );
}
