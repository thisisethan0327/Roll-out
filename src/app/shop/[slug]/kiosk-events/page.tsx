import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { KioskEventStatusActions } from './KioskEventStatusActions';
import { MonitorSmartphone, Plus } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { GlideButton } from '@/components/glide/primitives';
import { Counts, EmptyRow, FilterTabs, StatusChip, cx, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Kiosk Events' };

const FILTER_TABS = ['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

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
        <div className={sh.stack}>
            <ConsoleHead
                title="Kiosk events"
                sub={`${shop.name} · shown live on the shop kiosk`}
                actions={
                    <GlideButton href={`/shop/${slug}/kiosk-events/new`} size="sm" icon={<Plus size={18} strokeWidth={2} />}>
                        New event
                    </GlideButton>
                }
            />

            <Counts
                label="Kiosk counts"
                items={[
                    { label: 'On kiosk now', value: counts.onKiosk, dot: counts.onKiosk > 0 },
                    { label: 'Published', value: counts.published },
                    { label: 'Drafts', value: counts.draft },
                    { label: 'Archived', value: counts.archived },
                ]}
            />

            <section className="g-card" aria-label="Kiosk events">
                <div className={sh.panelH}>
                    <div>
                        <h2>Lobby screen</h2>
                    </div>
                    <FilterTabs
                        label="Kiosk filter"
                        items={FILTER_TABS.map((t) => ({
                            href: `/shop/${slug}/kiosk-events?filter=${t.toLowerCase()}`,
                            label: FILTER_LABEL[t],
                            active: t === filter,
                        }))}
                    />
                </div>
                <div className={sh.tblWrap}>
                    <table className={sh.tbl}>
                        <thead>
                            <tr>
                                <th>Event</th>
                                <th>Dates</th>
                                <th>Venue</th>
                                <th>Status</th>
                                <th>Images</th>
                                <th className={sh.r}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <EmptyRow
                                    colSpan={6}
                                    icon={<MonitorSmartphone size={18} strokeWidth={2} />}
                                    title={filter === 'ALL' ? 'No kiosk events yet' : `No ${FILTER_LABEL[filter].toLowerCase()} kiosk events`}
                                    body="Promotions and events you publish here play on the shop's lobby kiosk."
                                />
                            ) : (
                                rows.map((e: any) => {
                                    const t = timing(e, today);
                                    const galleryCount = Array.isArray(e.gallery)
                                        ? e.gallery.filter((u: any) => typeof u === 'string' && u).length
                                        : 0;
                                    return (
                                        <tr key={e.id}>
                                            <td>
                                                <Link href={`/shop/${slug}/kiosk-events/${e.id}`} className="text-link" style={{ color: 'var(--ink)' }}>
                                                    {e.title}
                                                </Link>
                                                {e.tagline ? <small>{e.tagline}</small> : null}
                                            </td>
                                            <td data-label="Dates" className={sh.when}>
                                                {formatRange(e.starts_at, e.ends_at)}
                                            </td>
                                            <td data-label="Venue">{e.venue_name ?? '—'}</td>
                                            <td>
                                                <span className="g-chips">
                                                    <StatusChip status={e.status} />
                                                    <StatusChip
                                                        status={t === 'LIVE' ? 'live' : t === 'UPCOMING' ? 'upcoming' : 'past'}
                                                        label={t === 'LIVE' ? 'Live' : t === 'UPCOMING' ? 'Upcoming' : 'Past'}
                                                    />
                                                </span>
                                            </td>
                                            <td data-label="Images" className={sh.muted}>
                                                {e.hero_image_url ? 'Hero' : '—'}
                                                {galleryCount > 0 ? ` · ${galleryCount} photo${galleryCount === 1 ? '' : 's'}` : ''}
                                            </td>
                                            <td className={cx(sh.r, sh.mEnd)}>
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
            </section>
        </div>
    );
}

const FILTER_LABEL: Record<FilterTab, string> = {
    ALL: 'All',
    PUBLISHED: 'Published',
    DRAFT: 'Drafts',
    ARCHIVED: 'Archived',
};
