'use server';
/**
 * Event verification decisions + coin enablement (066 RPCs, called as the
 * admin user so is_platform_admin() is checked inside the function;
 * requirePlatformAdmin here is defense-in-depth).
 */
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseServer } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

export async function decideEventVerification(input: { eventId: string; status: 'verified' | 'rejected' | 'revoked'; note?: string }): Promise<Result> {
    await requirePlatformAdmin();
    const supabase = await getSupabaseServer();
    const { error } = await supabase.schema('rollout').rpc('decide_event_verification', {
        p_event: input.eventId,
        p_status: input.status,
        p_notes: input.note?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin/verifications');
    revalidatePath('/admin/events');
    return { ok: true };
}

export async function enableEventCoins(input: { eventId: string; cap: number; finish: 'standard' | 'premium'; artworkUrl: string | null }): Promise<Result & { cap?: number }> {
    await requirePlatformAdmin();
    if (!Number.isInteger(input.cap) || input.cap < 1 || input.cap > 5000) return { ok: false, error: 'Cap must be a whole number from 1 to 5000.' };
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.schema('rollout').rpc('enable_event_coins', {
        p_event: input.eventId,
        p_cap: input.cap,
        p_finish: input.finish,
        p_artwork_url: input.artworkUrl,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin/verifications');
    return { ok: true, cap: Number(data ?? input.cap) };
}
