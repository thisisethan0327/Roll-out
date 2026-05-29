'use client';
/**
 * Side-effect-only client component that subscribes to Realtime changes on
 * `rollout.appointment_requests` filtered by shop_id, and calls
 * `router.refresh()` whenever a relevant INSERT/UPDATE comes in. That re-runs
 * the server component and repopulates the inbox table.
 *
 * Renders nothing. Mount once near the top of the inbox page JSX.
 *
 * Note: `appointment_requests` is included in the supabase_realtime publication
 * per migration 011's final block, so these events do fan out.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

export function RealtimeRefresh({ shopId }: { shopId: number }) {
    const router = useRouter();
    useEffect(() => {
        if (!isSupabaseConfigured()) return;
        const supabase = getSupabaseBrowser();
        const channel = supabase
            .channel(`inbox-${shopId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: 'INSERT',
                    schema: 'rollout',
                    table: 'appointment_requests',
                    filter: `shop_id=eq.${shopId}`,
                },
                () => router.refresh(),
            )
            .on(
                'postgres_changes' as any,
                {
                    event: 'UPDATE',
                    schema: 'rollout',
                    table: 'appointment_requests',
                    filter: `shop_id=eq.${shopId}`,
                },
                () => router.refresh(),
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [shopId, router]);
    return null;
}
