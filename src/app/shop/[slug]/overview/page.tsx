import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Overview' };

async function loadOverview(shopId: number) {
    const admin = getSupabaseAdmin();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

    // Fan out the counts. All RLS-bypassed via service role since we've
    // already verified shop membership at the layout.
    const [
        pendingRes,
        acceptedRes,
        declinedRes,
        staffRes,
        postsWkRes,
        shopPageRes,
        recentPending,
    ] = await Promise.all([
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'pending'),
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'accepted'),
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'declined'),
        admin
            .from('shop_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId),
        admin
            .from('posts')
            .select('id, shop_id, created_at, deleted_at', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .is('deleted_at', null)
            .gte('created_at', since7d),
        admin
            .from('profiles')
            .select('id, handle, display_name, is_verified, avatar_url')
            .eq('shop_id', shopId)
            .eq('kind', 'shop_page')
            .maybeSingle(),
        admin
            .from('appointment_requests')
            .select(
                `id, service_type, preferred_at, created_at,
                 requester:profiles!appointment_requests_requester_profile_id_fkey(handle, display_name),
                 vehicle:vehicles(year, make, model)`,
            )
            .eq('shop_id', shopId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    const shopPage = shopPageRes.data as any;
    let followers = 0;
    if (shopPage?.id) {
        const fr = await admin
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('followee_id', shopPage.id);
        followers = fr.count ?? 0;
    }

    return {
        pending: pendingRes.count ?? 0,
        accepted: acceptedRes.count ?? 0,
        declined: declinedRes.count ?? 0,
        staff: staffRes.count ?? 0,
        postsThisWeek: postsWkRes.count ?? 0,
        followers,
        shopPage,
        recentPending: recentPending.data ?? [],
    };
}

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'VINYL WRAP',
    PPF: 'PPF',
    TINT: 'WINDOW TINT',
    CERAMIC: 'CERAMIC',
    PARTS: 'PARTS / INSTALL',
    OTHER: 'OTHER',
};

export default async function ShopOverviewPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);
    const s = await loadOverview(shop.shopId);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">OVERVIEW</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · DAILY PULSE
                    </div>
                </div>
                <Link href={`/shop/${slug}/inbox`} className="admin-action-btn" style={{ textDecoration: 'none' }}>
                    OPEN INBOX ›
                </Link>
            </div>

            <div className="admin-stat-grid">
                <Stat label="PENDING REQUESTS" value={s.pending} accent={s.pending > 0 ? 'gold' : undefined} />
                <Stat label="ACCEPTED" value={s.accepted} />
                <Stat label="DECLINED / CANCELLED" value={s.declined} />
                <Stat label="STAFF" value={s.staff} />
                <Stat label="POSTS / 7D" value={s.postsThisWeek} />
                <Stat label="FOLLOWERS" value={s.followers} />
            </div>

            <div className="admin-page-head" style={{ marginTop: 12, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        PRIORITY QUEUE
                    </div>
                    <div className="admin-page-sub">5 MOST RECENT PENDING REQUESTS</div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>CUSTOMER</th>
                            <th>SERVICE</th>
                            <th>VEHICLE</th>
                            <th>PREFERRED</th>
                            <th style={{ textAlign: 'right' }}>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {s.recentPending.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">
                                        NO PENDING REQUESTS — EVERYTHING&apos;S CAUGHT UP.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            s.recentPending.map((a: any) => (
                                <tr key={a.id}>
                                    <td>
                                        {new Date(a.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        @{a.requester?.handle ?? '?'}
                                        <div className="admin-handle">{a.requester?.display_name}</div>
                                    </td>
                                    <td>
                                        <span className="admin-pill">
                                            {SERVICE_LABEL[a.service_type] ?? a.service_type}
                                        </span>
                                    </td>
                                    <td>
                                        {a.vehicle
                                            ? `${a.vehicle.year ?? ''} ${a.vehicle.make ?? ''} ${a.vehicle.model ?? ''}`.trim()
                                            : '—'}
                                    </td>
                                    <td>{a.preferred_at ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <Link
                                            href={`/shop/${slug}/inbox`}
                                            className="admin-action-btn"
                                            style={{ textDecoration: 'none' }}
                                        >
                                            REVIEW ›
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!s.shopPage?.is_verified && (
                <div
                    style={{
                        marginTop: 20,
                        padding: 14,
                        border: '1px solid var(--gold)',
                        background: 'var(--gold-glow)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wide)',
                        color: 'var(--text-2)',
                    }}
                >
                    <strong style={{ color: 'var(--gold)' }}>VERIFICATION PENDING</strong> — your shop_page profile
                    isn&apos;t marked verified yet. Customers booking through Rollout will see a yellow note instead of
                    the ✓ badge. Reach out to{' '}
                    <a href="mailto:team@rollout.club" style={{ color: 'var(--gold)' }}>team@rollout.club</a> when
                    you&apos;re ready.
                </div>
            )}
        </>
    );
}

function Stat({
    label,
    value,
    accent,
}: {
    label: string;
    value: number | string;
    accent?: 'gold' | 'warn';
}) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className={`admin-stat-num ${accent ?? ''}`}>{value}</div>
        </div>
    );
}
