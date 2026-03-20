'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const router = useRouter();
  const { user, loading, fetchUser } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/files');
      } else {
        router.replace('/login');
      }
    }
  }, [loading, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="text-center space-y-4">
        <Skeleton className="h-8 w-48 bg-zinc-800 mx-auto" />
        <Skeleton className="h-4 w-64 bg-zinc-800 mx-auto" />
      </div>
    </div>
  );
}
