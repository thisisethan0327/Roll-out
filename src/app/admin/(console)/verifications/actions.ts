'use server';

/**
 * Platform-admin decisions on verification requests. The write goes through the
 * SECURITY DEFINER `rollout.decide_verification` RPC, called with the anon SSR
 * client so auth.uid() resolves to the logged-in admin (the RPC re-checks
 * is_platform_admin() internally; requirePlatformAdmin here is defense-in-depth).
 * The RPC records the immutable decision + applies all side effects (status
 * flips, commerce registry wiring, host_status).
 */
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseServer } from '@/lib/supabase/server';

export type CommerceRegistry = {
    sells_products?: boolean;
    commerce_tier?: number;
    medusa_category_handles?: string[];
    sender_email?: string;
};

export async function decideVerification(input: {
    requestId: string;
    approve: boolean;
    note?: string;
    registry?: CommerceRegistry;
}): Promise<{ ok: boolean; error?: string }> {
    await requirePlatformAdmin();

    const supabase = await getSupabaseServer();
    const { error } = await supabase.schema('rollout').rpc('decide_verification', {
        p_request_id: input.requestId,
        p_approve: input.approve,
        p_note: input.note?.trim() || null,
        p_registry: input.registry ?? {},
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath('/admin/verifications');
    revalidatePath('/admin/shops');
    return { ok: true };
}
