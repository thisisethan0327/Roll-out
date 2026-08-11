'use server';
/**
 * "Sell on NeferStock" — commerce-KYC application actions (P2 item 8).
 *
 * Upload model (inverse of kiosk-storage's signed DOWNLOAD): the client asks
 * the server for a single-use SIGNED UPLOAD URL for a server-chosen path in the
 * PRIVATE verification-docs bucket, then PUTs the bytes straight to Storage. The
 * server records the kyc_documents metadata row and drives the apply_commerce
 * RPC. Every action re-checks the caller owns the shop.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendPlatformNotification } from '@/lib/platform-notify';
import {
    createKycUploadUrl,
    recordKycDocument,
    type KycDocType,
} from '@/lib/verification-docs';

const OWNER_ROLES = new Set(['owner', 'admin']);
const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const VALID_DOC_TYPES = new Set<KycDocType>([
    'business_license',
    'reseller_certificate',
    'ubi_proof',
    'other',
]);
const UBI_RE = /^\d{9}$/;

async function requireOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!OWNER_ROLES.has(role)) throw new Error('Only a shop owner can apply to sell.');
    return profile;
}

/** Mint a single-use signed upload URL for a KYC document. Owner-gated. */
export async function createCommerceUploadUrl(
    shopId: number,
    docType: string,
    mime: string,
): Promise<{ ok: boolean; path?: string; signedUrl?: string; token?: string; error?: string }> {
    try {
        await requireOwner(shopId);
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Not authorized.' };
    }
    if (!VALID_DOC_TYPES.has(docType as KycDocType)) {
        return { ok: false, error: 'Invalid document type.' };
    }
    if (!ALLOWED_MIME.has(mime)) {
        return { ok: false, error: 'Only PDF, JPG, PNG, or WEBP files are accepted.' };
    }
    try {
        const { path, signedUrl, token } = await createKycUploadUrl(
            shopId,
            docType as KycDocType,
            mime,
        );
        return { ok: true, path, signedUrl, token };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not create upload URL.' };
    }
}

export type SubmitDoc = {
    docType: string;
    path: string;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
};

/**
 * Finalize the commerce application: call apply_commerce (creates the pending
 * commerce request + flips commerce_status→pending), then record kyc_documents
 * rows linked to that request. Best-effort "received" email.
 */
export async function submitCommerceApplication(
    shopId: number,
    slug: string,
    input: { ubi: string; legalName: string; docs: SubmitDoc[] },
): Promise<{ ok: boolean; error?: string }> {
    let owner;
    try {
        owner = await requireOwner(shopId);
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Not authorized.' };
    }

    const ubi = (input.ubi ?? '').replace(/\D/g, '');
    const legalName = (input.legalName ?? '').trim();
    if (ubi && !UBI_RE.test(ubi)) {
        return { ok: false, error: 'UBI must be 9 digits.' };
    }
    const docs = (input.docs ?? []).filter(
        (d) => d && d.path && VALID_DOC_TYPES.has(d.docType as KycDocType),
    );
    if (docs.length === 0) {
        return { ok: false, error: 'Upload at least one document (business license or reseller certificate).' };
    }

    // apply_commerce via SSR client (auth.uid() = owner; RPC re-checks
    // ownership + verified + merchant-feature gating).
    const supabase = await getSupabaseServer();
    const { data: reqId, error } = await supabase.schema('rollout').rpc('apply_commerce', {
        p_shop_id: shopId,
        p_payload: { ubi: ubi || null, legal_name: legalName || null, docs_pending: false },
    });
    if (error) {
        const msg = /merchant feature/i.test(error.message)
            ? 'This shop needs the merchant feature enabled before applying to sell.'
            : /must be verified/i.test(error.message)
              ? 'Your shop must be verified on Rollout before applying to sell.'
              : error.message;
        return { ok: false, error: msg };
    }

    // Record metadata rows for the uploaded documents.
    try {
        for (const d of docs) {
            await recordKycDocument({
                shopId,
                verificationRequestId: (reqId as string) ?? null,
                uploadedBy: owner.profileId,
                docType: d.docType as KycDocType,
                storagePath: d.path,
                originalName: d.originalName ?? null,
                mimeType: d.mimeType ?? null,
                sizeBytes: d.sizeBytes ?? null,
            });
        }
    } catch (e: any) {
        // The application still exists; surface a soft warning.
        return { ok: false, error: `Application filed, but a document record failed: ${e?.message ?? 'unknown'}. Contact support.` };
    }

    // Best-effort acknowledgement.
    const admin = getSupabaseAdmin();
    const { data: shopRow } = await admin.from('shops').select('name').eq('id', shopId).maybeSingle();
    await sendPlatformNotification({
        template: 'platform_application_received',
        toProfileId: owner.profileId,
        shopId,
        vars: {
            kind: 'commerce',
            shop_name: (shopRow as any)?.name ?? '',
            applicant_name: owner.displayName || owner.handle,
        },
    });

    revalidatePath(`/shop/${slug}/sell`, 'page');
    return { ok: true };
}
