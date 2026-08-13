import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { KioskEventStatusActions } from './KioskEventStatusActions';

export const metadata = { title: 'Kiosk Events' };

const FILTER_TABS = ['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const STATUS_PILL: Record<string, string> = {
    published: 'admin-pill neon',
    draft: 'admin-pill gold',
    archived: 'admin-pill',
};

/** Local-date string, zero-padded — matches the kiosk's own date math. */
function todayStr(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timing(e: any, today: string): 'LIVE' | 'UPCOMING' | 'PAST' {
    if (e.ends_at < today) return 'PAST';
    if (e.starts_at <= today) return 'LIVE';
    return 'UPCOMING';
}

const TIMING_PILL: Record<string, string> = {
    LIVE: 'admin-pill neon',
    UPCOMING: 'admin-pill gold',
    PAST: 'admin-pill',
};

function formatRange(starts: string, ends: string): string {
    const fmt = (d: string) => {
        const [y, m, day] = d.split('-');
        return `${m}/${day}/${y.slice(2)}`;
    };
    return starts === ends ? fmt(starts) : `${fmt(starts)} – ${fmt(ends)}`;
}

export default async function KioskEventsPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ filter?: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const { filter: rawFilter } = await searchParams;

    const filterUpper = (rawFilter ?? 'ALL').toUpperCase();
    const filter: FilterTab = (FILTER_TABS as readonly string[]).includes(filterUpper)
        ? (filterUpper as FilterTab)
        : 'ALL';

    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin
        .from('events')
        .select('*')
        .eq('shop_id', shop.shopId)
        .order('starts_at', { ascending: true })
        .limit(200);
    if (error) console.error('[shop/kiosk-events] load failed:', error.message);
    const all = (data as any[]) ?? [];

    const rows =
        filter === 'ALL' ? all : all.filter((e) => e.status === filter.toLowerCase());
    const today = todayStr();

    const counts = {
        published: all.filter((e) => e.status === 'published').length,
        draft: all.filter((e) => e.status === 'draft').length,
        archived: all.filter((e) => e.status === 'archived').length,
        onKiosk: all.filter((e) => e.status === 'published' && e.ends_at >= today).length,
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">KIOSK EVENTS</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · SHOWN LIVE ON THE SHOP KIOSK
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/kiosk-events/new`}
                    className="admin-action-btn"
                    style={{ textDecoration: 'none' }}
                >
                    + NEW EVENT
                </Link>
            </div>

            <div className="admin-stat-grid">
                <Stat label="ON KIOSK NOW" value={counts.onKiosk} accent={counts.onKiosk > 0 ? 'gold' : undefined} />
                <Stat label="PUBLISHED" value={counts.published} />
                <Stat label="DRAFTS" value={counts.draft} />
                <Stat label="ARCHIVED" value={counts.archived} />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
                {FILTER_TABS.map((t) => {
                    const isActive = t === filter;
                    return (
                        <Link
                            key={t}
                            href={`/shop/${slug}/kiosk-events?filter=${t.toLowerCase()}`}
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
                            <th>TITLE</th>
                            <th>DATES</th>
                            <th>VENUE</th>
                            <th>STATUS</th>
                            <th>TIMING</th>
                            <th>IMAGES</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">NO {filter} KIOSK EVENTS.</div>
                                </td>
                            </tr>
                        ) : (
                            rows.map((e: any) => {
                                const t = timing(e, today);
                                const galleryCount = Array.isArray(e.gallery)
                                    ? e.gallery.filter((u: any) => typeof u === 'string' && u).length
                                    : 0;
                                return (
                                    <tr key={e.id}>
                                        <td>
                                            <Link
                                                href={`/shop/${slug}/kiosk-events/${e.id}`}
                                                className="text-link"
                                            >
                                                {e.title}
                                            </Link>
                                            {e.tagline && (
                                                <div className="admin-handle">{e.tagline}</div>
                                            )}
                                        </td>
                                        <td>{formatRange(e.starts_at, e.ends_at)}</td>
                                        <td>{e.venue_name ?? '—'}</td>
                                        <td>
                                            <span className={STATUS_PILL[e.status] ?? 'admin-pill'}>
                                                {String(e.status).toUpperCase()}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={TIMING_PILL[t]}>{t}</span>
                                        </td>
                                        <td>
                                            {e.hero_image_url ? 'HERO' : '—'}
                                            {galleryCount > 0 ? ` · ${galleryCount} PHOTOS` : ''}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <KioskEventStatusActions
                                                eventId={e.id}
                                                shopId={shop.shopId}
                                                slug={slug}
                                                status={e.status}
                                                callerRole={role}
                                                showEdit
                                            />
                                        </td>
                                    </tr>
                                );
                            })
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
