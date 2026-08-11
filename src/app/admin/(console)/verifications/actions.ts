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
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendPlatformNotification } from '@/lib/platform-notify';
import { listKycDocsForShop, type KycDocView } from '@/lib/verification-docs';

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

    const admin = getSupabaseAdmin();
    // Capture request context BEFORE the decision (kind/subject drive the email).
    const { data: reqRow } = await admin
        .from('verification_requests')
        .select('kind, shop_id, profile_id')
        .eq('id', input.requestId)
        .maybeSingle();

    const supabase = await getSupabaseServer();
    const { error } = await supabase.schema('rollout').rpc('decide_verification', {
        p_request_id: input.requestId,
        p_approve: input.approve,
        p_note: input.note?.trim() || null,
        p_registry: input.registry ?? {},
    });

    if (error) return { ok: false, error: error.message };

    // Best-effort approved/rejected email to the applicant/nominee.
    const req = reqRow as any;
    if (req) {
        let shopName = '';
        if (req.shop_id != null) {
            const { data: s } = await admin.from('shops').select('name').eq('id', req.shop_id).maybeSingle();
            shopName = (s as any)?.name ?? '';
        }
        const ctaUrl =
            req.kind === 'host'
                ? 'https://rollout.club/me/events'
                : 'https://rollout.club/shop';
        await sendPlatformNotification({
            template: input.approve ? 'platform_application_approved' : 'platform_application_rejected',
            toProfileId: req.profile_id,
            shopId: req.shop_id ?? null,
            vars: { kind: req.kind, shop_name: shopName, note: input.note?.trim() || '', cta_url: ctaUrl },
        });
    }

    revalidatePath('/admin/verifications');
    revalidatePath('/admin/shops');
    return { ok: true };
}

/**
 * Admin-only KYC document viewer: returns short-TTL signed URLs for a shop's
 * uploaded verification documents. Guarded by requirePlatformAdmin — the bucket
 * is private, so these ephemeral URLs are the only way to view a document.
 */
export async function getKycDocuments(
    shopId: number,
): Promise<{ ok: boolean; docs?: KycDocView[]; error?: string }> {
    await requirePlatformAdmin();
    try {
        const docs = await listKycDocsForShop(shopId, 300);
        return { ok: true, docs };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not load documents.' };
    }
}
