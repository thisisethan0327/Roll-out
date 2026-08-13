/**
 * /admin/verifications — unified review queue for the verification backbone.
 * Three sections (shop listing · commerce KYC · host) fed from
 * rollout.verification_requests where state='pending'. A NeferStock-originated
 * application shows up as two linked items (shop + commerce) that are approved
 * independently. Decisions run through decideVerification → the SECURITY DEFINER
 * RPC (immutable audit + side effects).
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { VerificationRow, type VReq } from './VerificationRow';

export const metadata = { title: 'Verifications' };
export const dynamic = 'force-dynamic';

async function loadQueue(): Promise<VReq[]> {
    const admin = getSupabaseAdmin();
    const { data: reqsRaw, error: reqsError } = await admin
        .from('verification_requests')
        .select('id, kind, created_at, origin_app, payload, shop_id, profile_id, nominated_by')
        .eq('state', 'pending')
        .order('created_at', { ascending: true });
    if (reqsError) console.error('[admin/verifications] queue load failed:', reqsError.message);

    const reqs = (reqsRaw as any[]) ?? [];
    if (reqs.length === 0) return [];

    const shopIds = [...new Set(reqs.map((r) => r.shop_id).filter((x): x is number => x != null))];
    const profileIds = [
        ...new Set(
            reqs.flatMap((r) => [r.profile_id, r.nominated_by]).filter((x): x is string => !!x),
        ),
    ];

    const [shopsRes, profilesRes] = await Promise.all([
        shopIds.length
            ? admin.from('shops').select('id, slug, name, origin_app').in('id', shopIds)
            : Promise.resolve({ data: [] as any[] }),
        profileIds.length
            ? admin.from('profiles').select('id, handle, display_name').in('id', profileIds)
            : Promise.resolve({ data: [] as any[] }),
    ]);

    const shopById = new Map<number, any>();
    for (const s of (shopsRes.data as any[]) ?? []) shopById.set(s.id, s);
    const profById = new Map<string, any>();
    for (const p of (profilesRes.data as any[]) ?? []) profById.set(p.id, p);

    return reqs.map((r) => ({
        id: r.id,
        kind: r.kind,
        created_at: r.created_at,
        origin_app: r.origin_app,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        shop: r.shop_id != null ? (shopById.get(r.shop_id) ?? null) : null,
        applicant: profById.get(r.profile_id) ?? null,
        nominatedBy: r.nominated_by ? { handle: profById.get(r.nominated_by)?.handle ?? '—' } : null,
    }));
}

function Section({ title, reqs }: { title: string; reqs: VReq[] }) {
    return (
        <div style={{ marginBottom: 32 }}>
            <div className="admin-page-sub" style={{ marginBottom: 12 }}>
                {title} · {reqs.length} PENDING
            </div>
            {reqs.length === 0 ? (
                <div className="admin-empty">NOTHING IN THIS QUEUE</div>
            ) : (
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                    {reqs.map((r) => (
                        <VerificationRow key={r.id} req={r} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default async function VerificationsPage() {
    const all = await loadQueue();
    const shop = all.filter((r) => r.kind === 'shop');
    const commerce = all.filter((r) => r.kind === 'commerce');
    const host = all.filter((r) => r.kind === 'host');

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">VERIFICATIONS</div>
                    <div className="admin-page-sub">
                        {all.length} OPEN · SHOP LISTING · COMMERCE KYC · HOST
                    </div>
                </div>
            </div>

            <Section title="SHOP LISTING" reqs={shop} />
            <Section title="COMMERCE (SELL ON NEFERSTOCK)" reqs={commerce} />
            <Section title="INDIVIDUAL HOSTS" reqs={host} />
        </>
    );
}
