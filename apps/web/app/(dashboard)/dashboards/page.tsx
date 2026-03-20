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
} from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardsPage() {
  const router = useRouter();
  const {
    dashboards,
    loading,
    fetchDashboards,
    createDashboard,
    deleteDashboard,
  } = useDashboardStore();

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  const handleCreate = async () => {
    const dashboard = await createDashboard('Untitled Dashboard');
    if (dashboard) {
      router.push(`/dashboards/${dashboard.id}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboards</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Visualize and explore your data
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Dashboard
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 bg-zinc-800 rounded-xl" />
            ))}
          </div>
        ) : dashboards.length === 0 ? (
          <div className="text-center py-16">
            <LayoutDashboard className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400 font-medium">No dashboards yet</p>
            <p className="text-zinc-500 text-sm mt-1">
              Create a dashboard to start visualizing your data
            </p>
            <Button
              onClick={handleCreate}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Dashboard
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                onClick={() => router.push(`/dashboards/${dashboard.id}`)}
                className="group relative rounded-xl border border-zinc-800 bg-zinc-900 p-5 cursor-pointer hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                    <BarChart3 className="h-5 w-5 text-blue-400" />
                  </div>
                  {dashboard.is_auto_generated && (
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Auto
                    </Badge>
                  )}
                </div>

                <h3 className="text-base font-semibold text-white mb-1 truncate">
                  {dashboard.title}
                </h3>
                {dashboard.description && (
                  <p className="text-sm text-zinc-400 line-clamp-2 mb-3">
                    {dashboard.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-zinc-500 mt-auto pt-3 border-t border-zinc-800">
                  <span className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" />
                    {dashboard.widgets.length} widget{dashboard.widgets.length !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(dashboard.updated_at), 'MMM d, yyyy')}
                  </span>
                </div>

                {/* Delete button on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this dashboard?')) {
                      deleteDashboard(dashboard.id);
                    }
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
