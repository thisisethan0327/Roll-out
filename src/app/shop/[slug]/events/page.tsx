import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EventActions } from './EventActions';

export const metadata = { title: 'Events' };

const FILTER_TABS = ['UPCOMING', 'PAST', 'CANCELLED', 'ALL'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'NIGHT RUN',
    CAR_MEET: 'CAR MEET',
    TRACK_DAY: 'TRACK DAY',
    CRUISE: 'CRUISE',
    SHOW: 'SHOW',
};

const TYPE_PILL: Record<string, string> = {
    NIGHT_RUN: 'admin-pill neon',
    CAR_MEET: 'admin-pill',
    TRACK_DAY: 'admin-pill warn',
    CRUISE: 'admin-pill',
    SHOW: 'admin-pill gold',
};

const VIS_PILL: Record<string, string> = {
    public: 'admin-pill neon',
    followers: 'admin-pill',
    private: 'admin-pill warn',
};

async function fetchShopPageProfileId(shopId: number): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    return (data as any)?.id ?? null;
}

async function loadEvents(shopId: number, hostId: string, filter: FilterTab) {
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const [upcomingC, pastC, cancelledC, rsvpAgg] = await Promise.all([
        admin
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('host_id', hostId)
            .gt('start_at', nowIso)
            .is('cancelled_at', null),
        admin
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('host_id', hostId)
            .lte('start_at', nowIso)
            .is('cancelled_at', null),
        admin
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('host_id', hostId)
            .not('cancelled_at', 'is', null),
        admin
            .from('events')
            .select('attending_count')
            .eq('host_id', hostId),
    ]);

    const totalRsvps =
        (rsvpAgg.data ?? []).reduce(
            (acc: number, r: any) => acc + (Number(r.attending_count) || 0),
            0,
        ) ?? 0;

    let q = admin
        .from('events')
        .select(
            `id, code, type, title, location_name, start_at, attending_count, capacity,
             is_official, visibility, cancelled_at, created_at`,
        )
        .eq('host_id', hostId)
        .order('start_at', { ascending: filter === 'UPCOMING' })
        .limit(200);

    if (filter === 'UPCOMING') {
        q = q.gt('start_at', nowIso).is('cancelled_at', null);
    } else if (filter === 'PAST') {
        q = q.lte('start_at', nowIso).is('cancelled_at', null);
    } else if (filter === 'CANCELLED') {
        q = q.not('cancelled_at', 'is', null);
    }

    const { data } = await q;

    return {
        upcoming: upcomingC.count ?? 0,
        past: pastC.count ?? 0,
        cancelled: cancelledC.count ?? 0,
        totalRsvps,
        rows: (data as any[]) ?? [],
    };
}

export default async function ShopEventsPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ filter?: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const { filter: rawFilter } = await searchParams;

    const filterUpper = (rawFilter ?? 'UPCOMING').toUpperCase();
    const filter: FilterTab = (FILTER_TABS as readonly string[]).includes(filterUpper)
        ? (filterUpper as FilterTab)
        : 'UPCOMING';

    const hostId = await fetchShopPageProfileId(shop.shopId);

    if (!hostId) {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">EVENTS</div>
                        <div className="admin-page-sub">{shop.name.toUpperCase()}</div>
                    </div>
                </div>
                <div className="admin-empty">
                    NO SHOP PAGE PROFILE FOUND — CONTACT SUPPORT.
                </div>
            </>
        );
    }

    const data = await loadEvents(shop.shopId, hostId, filter);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">EVENTS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · {data.rows.length} SHOWN
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/events/new`}
                    className="admin-action-btn"
                    style={{ textDecoration: 'none' }}
                >
                    + HOST EVENT
                </Link>
            </div>

            <div className="admin-stat-grid">
                <Stat label="UPCOMING" value={data.upcoming} accent={data.upcoming > 0 ? 'gold' : undefined} />
                <Stat label="PAST" value={data.past} />
                <Stat label="CANCELLED" value={data.cancelled} />
                <Stat label="TOTAL RSVPS" value={data.totalRsvps} />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
                {FILTER_TABS.map((t) => {
                    const isActive = t === filter;
                    return (
                        <Link
                            key={t}
                            href={`/shop/${slug}/events?filter=${t.toLowerCase()}`}
                            className={`admin-action-btn ${isActive ? '' : 'muted'}`}
                            style={{ textDecoration: 'none' }}
                        >
                            {t}
                        </Link>
                    );
                })}
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>CODE</th>
                            <th>TITLE</th>
                            <th>TYPE</th>
                            <th>STARTS</th>
                            <th>RSVPS</th>
                            <th>VISIBILITY</th>
                            <th>FLAGS</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.length === 0 ? (
                            <tr>
                                <td colSpan={8}>
                                    <div className="admin-empty">
                                        NO {filter} EVENTS.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.rows.map((e: any) => (
                                <tr key={e.id}>
                                    <td>
                                        <Link
                                            href={`/shop/${slug}/events/${e.id}`}
                                            className="text-link"
                                        >
                                            {e.code}
                                        </Link>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                                            {e.title}
                                        </div>
                                        {e.location_name && (
                                            <div className="admin-handle">{e.location_name}</div>
                                        )}
                                    </td>
                                    <td>
                                        <span className={TYPE_PILL[e.type] ?? 'admin-pill'}>
                                            {TYPE_LABEL[e.type] ?? e.type}
                                        </span>
                                    </td>
                                    <td>
                                        {new Date(e.start_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        {e.attending_count}
                                        {e.capacity ? ` / ${e.capacity}` : ''}
                                    </td>
                                    <td>
                                        <span className={VIS_PILL[e.visibility] ?? 'admin-pill'}>
                                            {String(e.visibility).toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {e.is_official && <span className="admin-pill gold">OFFICIAL</span>}
                                            {e.cancelled_at && <span className="admin-pill warn">CANCELLED</span>}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <EventActions
                                            eventId={e.id}
                                            shopId={shop.shopId}
                                            slug={slug}
                                            cancelled={!!e.cancelled_at}
                                            callerRole={role}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
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
