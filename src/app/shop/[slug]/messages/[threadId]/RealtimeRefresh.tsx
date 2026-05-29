'use client';
/**
 * Subscribes to chat_messages INSERTs on this thread_id and calls
 * router.refresh() so the server-rendered messages list and "last read"
 * state stay in sync. Renders nothing.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

export function RealtimeRefresh({ threadId }: { threadId: string }) {
    const router = useRouter();
    useEffect(() => {
        if (!isSupabaseConfigured()) return;
        const supabase = getSupabaseBrowser();
        const channel = supabase
            .channel(`shop-msg-${threadId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: 'INSERT',
                    schema: 'rollout',
                    table: 'chat_messages',
                    filter: `thread_id=eq.${threadId}`,
                },
                () => router.refresh(),
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [threadId, router]);
    return null;
}
