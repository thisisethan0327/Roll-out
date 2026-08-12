'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Dismiss an open action item — the admin has decided it doesn't need doing
 * (or will track it elsewhere). Frees the dedupe slot so the same condition can
 * re-raise a fresh alert later. Only affects rows that are still open.
 */
export async function dismissActionItem(id: string): Promise<void> {
    const { profile } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('action_items')
        .update({
            status: 'dismissed',
            resolved_at: new Date().toISOString(),
            resolved_by: profile.profileId,
        })
        .eq('id', id)
        .eq('status', 'open');
    if (error) throw new Error(error.message);
    revalidatePath('/admin/overview');
}
