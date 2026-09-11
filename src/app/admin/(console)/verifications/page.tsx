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
import { EventVerificationRow, type EventVReq } from './EventVerificationRow';

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

/** Event verifications (066): requested ones to decide, verified ones to revoke / enable coins. */
async function loadEventQueue(): Promise<EventVReq[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_verifications')
        .select('event_id, status, rules_version, attestations, notes, created_at, requested_by, event:events!event_verifications_event_id_fkey(title, code, type, start_at, capacity, host_id, cancelled_at)')
        .in('status', ['requested', 'verified'])
        .order('created_at', { ascending: true });
    if (error) console.error('[admin/verifications] event queue load failed:', error.message);
    const rows = ((data as any[]) ?? []).filter((r) => r.event && !r.event.cancelled_at);
    if (rows.length === 0) return [];
    const eventIds = rows.map((r) => r.event_id);
    const profileIds = [...new Set(rows.flatMap((r) => [r.requested_by, r.event.host_id]).filter((x): x is string => !!x))];
    const [profRes, coinRes, countRes] = await Promise.all([
        admin.from('profiles').select('id, handle').in('id', profileIds),
        admin.from('event_coins').select('event_id, cap, issued_count, finish, artwork_url').in('event_id', eventIds),
        Promise.all(rows.map((r) => admin.rpc('host_completed_verified_count', { p_host: r.event.host_id, p_exclude: r.event_id }))),
    ]);
    const handle = new Map<string, string>();
    for (const p of (profRes.data as any[]) ?? []) handle.set(p.id, p.handle);
    const coinBy = new Map<string, any>();
    for (const c of (coinRes.data as any[]) ?? []) coinBy.set(c.event_id, c);
    return rows.map((r, i) => ({
        eventId: r.event_id,
        status: r.status,
        title: r.event.title,
        code: r.event.code ?? null,
        type: r.event.type ?? null,
        startAt: r.event.start_at ?? null,
        capacity: r.event.capacity ?? null,
        hostHandle: handle.get(r.event.host_id) ?? null,
        hostCompletedVerified: Number(countRes[i]?.data ?? 0),
        requestedBy: handle.get(r.requested_by) ?? null,
        requestedAt: r.created_at,
        rulesVersion: r.rules_version,
        attestations: (r.attestations ?? {}) as Record<string, unknown>,
        notes: r.notes ?? null,
        coin: coinBy.has(r.event_id)
            ? { cap: coinBy.get(r.event_id).cap, issued: coinBy.get(r.event_id).issued_count, finish: coinBy.get(r.event_id).finish, artworkUrl: coinBy.get(r.event_id).artwork_url ?? null }
            : null,
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
    const [all, events] = await Promise.all([loadQueue(), loadEventQueue()]);
    const eventsPending = events.filter((e) => e.status === 'requested');
    const eventsVerified = events.filter((e) => e.status === 'verified');
    const shop = all.filter((r) => r.kind === 'shop');
    const commerce = all.filter((r) => r.kind === 'commerce');
    const host = all.filter((r) => r.kind === 'host');

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">VERIFICATIONS</div>
                    <div className="admin-page-sub">
                        {all.length + eventsPending.length} OPEN · SHOP LISTING · COMMERCE KYC · HOST · EVENTS
                    </div>
                </div>
            </div>

            <Section title="SHOP LISTING" reqs={shop} />
            <Section title="COMMERCE (SELL ON NEFERSTOCK)" reqs={commerce} />
            <Section title="INDIVIDUAL HOSTS" reqs={host} />
            <div style={{ marginBottom: 32 }}>
                <div className="admin-page-sub" style={{ marginBottom: 12 }}>EVENT VERIFICATIONS · {eventsPending.length} PENDING</div>
                {eventsPending.length === 0 ? (
                    <div className="admin-empty">NOTHING IN THIS QUEUE</div>
                ) : (
                    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
                        {eventsPending.map((e) => <EventVerificationRow key={e.eventId} req={e} />)}
                    </div>
                )}
            </div>
            <div style={{ marginBottom: 32 }}>
                <div className="admin-page-sub" style={{ marginBottom: 12 }}>VERIFIED EVENTS · {eventsVerified.length} · REVOKE OR ENABLE THE COIN</div>
                {eventsVerified.length === 0 ? (
                    <div className="admin-empty">NO VERIFIED EVENTS YET</div>
                ) : (
                    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
                        {eventsVerified.map((e) => <EventVerificationRow key={e.eventId} req={e} />)}
                    </div>
                )}
            </div>
        </>
    );
}
