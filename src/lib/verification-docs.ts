/**
 * Commerce-KYC document vault — server-side broker for the PRIVATE
 * `verification-docs` storage bucket (migration 040).
 *
 * The bucket is private (public=false) with NO storage.objects RLS policies, so
 * a client JWT can never read or write it. Everything is brokered here with the
 * service-role client, AFTER an ownership/authorization check by the caller:
 *
 *   • uploads → a single-use SIGNED UPLOAD URL minted for a server-chosen path
 *     (the client PUTs bytes straight to Storage; we never proxy the file). This
 *     is the INVERSE of kiosk-storage's signed-DOWNLOAD flow.
 *   • admin review → a short-TTL SIGNED URL (default 300s) so a platform admin
 *     can view a document without the bucket ever being public.
 *
 * Metadata rows live in rollout.kyc_documents; file bytes live in the bucket.
 */
import 'server-only';
import { getSupabasePublicAdmin, getSupabaseAdmin } from './supabase/admin';

export const VERIFICATION_BUCKET = 'verification-docs';

export type KycDocType =
    | 'business_license'
    | 'reseller_certificate'
    | 'ubi_proof'
    | 'other';

const EXT_BY_MIME: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
};

export function extForMime(mime: string): string {
    return EXT_BY_MIME[mime] ?? 'bin';
}

/** Path convention: verification-docs/shop-<id>/<docType>-<timestamp>.<ext> */
export function kycPath(shopId: number, docType: KycDocType, ext: string): string {
    return `shop-${shopId}/${docType}-${Date.now()}.${ext}`;
}

/**
 * Mint a single-use signed UPLOAD URL for a KYC document path. The CALLER must
 * have already authorized the actor (shop owner) — this function does not
 * re-check membership. Returns the path + signed URL + token the client uses.
 */
export async function createKycUploadUrl(
    shopId: number,
    docType: KycDocType,
    mime: string,
): Promise<{ path: string; signedUrl: string; token: string }> {
    const path = kycPath(shopId, docType, extForMime(mime));
    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin.storage
        .from(VERIFICATION_BUCKET)
        .createSignedUploadUrl(path);
    if (error || !data) {
        throw new Error(`Could not create upload URL: ${error?.message ?? 'unknown'}`);
    }
    return { path, signedUrl: data.signedUrl, token: data.token };
}

/** Record a kyc_documents metadata row (service role). */
export async function recordKycDocument(row: {
    shopId: number;
    verificationRequestId?: string | null;
    uploadedBy: string;
    docType: KycDocType;
    storagePath: string;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
}): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('kyc_documents').insert({
        shop_id: row.shopId,
        verification_request_id: row.verificationRequestId ?? null,
        uploaded_by: row.uploadedBy,
        doc_type: row.docType,
        storage_path: row.storagePath,
        original_name: row.originalName ?? null,
        mime_type: row.mimeType ?? null,
        size_bytes: row.sizeBytes ?? null,
    });
    if (error) throw new Error(error.message);
}

export type KycDocView = {
    id: string;
    docType: string;
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    /** Short-TTL signed URL (null if the object is missing). */
    signedUrl: string | null;
};

/**
 * List a shop's KYC docs with short-TTL signed view URLs. CALLER must be a
 * platform admin (or shop owner) — this does not re-check. TTL defaults to 5m.
 */
export async function listKycDocsForShop(
    shopId: number,
    ttlSeconds = 300,
): Promise<KycDocView[]> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('kyc_documents')
        .select('id, doc_type, original_name, mime_type, size_bytes, storage_path, created_at')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });
    const rows = (data as any[]) ?? [];
    if (rows.length === 0) return [];

    const pub = getSupabasePublicAdmin();
    const out: KycDocView[] = [];
    for (const r of rows) {
        let signedUrl: string | null = null;
        const { data: sig } = await pub.storage
            .from(VERIFICATION_BUCKET)
            .createSignedUrl(r.storage_path, ttlSeconds);
        signedUrl = sig?.signedUrl ?? null;
        out.push({
            id: r.id,
            docType: r.doc_type,
            originalName: r.original_name,
            mimeType: r.mime_type,
            sizeBytes: r.size_bytes,
            createdAt: r.created_at,
            signedUrl,
        });
    }
    return out;
}
