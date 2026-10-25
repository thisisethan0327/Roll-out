import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EventActions } from './EventActions';
import { CoHostInboxActions } from './CoHostInboxActions';
import { BadgeCheck, CircleAlert, Flag, Globe, Lock, Plus } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { GlideButton } from '@/components/glide/primitives';
import { Counts, EmptyRow, FilterTabs, Panel, StatusChip, cx, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Events' };

/** Events this shop is invited to co-host or is co-hosting (not its own). */
async function loadCoHostEvents(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_cohosts')
        .select(
            `status, invited_at,
             event:events!event_cohosts_event_id_fkey(
                id, code, title, type, start_at, location_name, cancelled_at,
                shop:shops!events_shop_id_fkey(name, slug)
             )`,
        )
        .eq('shop_id', shopId)
        .neq('status', 'declined')
        .order('invited_at', { ascending: false })
        .limit(100);
    if (error) console.error('[shop/events] loadCoHostEvents failed:', error.message);
    return ((data as any[]) ?? [])
        .filter((r) => r.event)
        .map((r) => ({
            status: r.status as string,
            id: r.event.id as string,
            code: r.event.code as string,
            title: r.event.title as string,
            type: r.event.type as string,
            start_at: r.event.start_at as string,
            location_name: r.event.location_name as string | null,
            cancelled_at: r.event.cancelled_at as string | null,
            hostName: (r.event.shop?.name as string) ?? 'Host',
        }));
}

const FILTER_TABS = ['UPCOMING', 'PAST', 'CANCELLED', 'ALL'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'Night run',
    CAR_MEET: 'Car meet',
    TRACK_DAY: 'Track day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
};

async function fetchShopPageProfileId(shopId: number): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('shop_id', shopId)
        .eq('kind', 'shop_page')
        .maybeSingle();
    if (error) console.error('[shop/events] fetchShopPageProfileId failed:', error.message);
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

    const { data, error } = await q;
    if (error) console.error('[shop/events] loadEvents failed:', error.message);

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
            <div className={sh.stack}>
                <ConsoleHead title="Events" sub={shop.name} />
                <div className={sh.note} role="note">
                    <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
                    <span className={sh.noteText}>
                        No shop page profile found
                        <small>Contact support to set up your shop page before hosting events.</small>
                    </span>
                </div>
            </div>
        );
    }

    const [data, coHostEvents] = await Promise.all([
        loadEvents(shop.shopId, hostId, filter),
        loadCoHostEvents(shop.shopId),
    ]);
    const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');

    return (
        <div className={sh.stack}>
            <ConsoleHead
                title="Events"
                sub={`${shop.name} · ${data.rows.length} shown`}
                actions={
                    <GlideButton href={`/shop/${slug}/events/new`} size="sm" icon={<Plus size={18} strokeWidth={2} />}>
                        Host event
                    </GlideButton>
                }
            />

            <Counts
                label="Event counts"
                items={[
                    { label: 'Upcoming', value: data.upcoming, dot: data.upcoming > 0 },
                    { label: 'Past', value: data.past },
                    { label: 'Cancelled', value: data.cancelled },
                    { label: 'Total RSVPs', value: data.totalRsvps },
                ]}
            />

            {coHostEvents.length > 0 && (
                <Panel
                    id="cohosting"
                    title="Co-hosting"
                    sub={`Events other shops invited ${shop.name} to`}
                    count={coHostEvents.length}
                    flush
                >
                    <div className={sh.tblWrap}>
                        <table className={sh.tbl}>
                            <thead>
                                <tr>
                                    <th>Event</th>
                                    <th>Host</th>
                                    <th>Starts</th>
                                    <th>Status</th>
                                    <th className={sh.r}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {coHostEvents.map((e) => (
                                    <tr key={e.id}>
                                        <td>
                                            {e.status === 'accepted' ? (
                                                <Link href={`/shop/${slug}/events/${e.id}`} className="text-link" style={{ color: 'var(--ink)' }}>
                                                    {e.title}
                                                </Link>
                                            ) : (
                                                <b style={{ fontWeight: 600 }}>{e.title}</b>
                                            )}
                                            <small>
                                                <span className={sh.code} style={{ fontSize: 11 }}>{e.code}</span>
                                                {e.location_name ? ` · ${e.location_name}` : ''}
                                            </small>
                                        </td>
                                        <td data-label="Host">{e.hostName}</td>
                                        <td data-label="Starts" className={sh.when}>
                                            {when(e.start_at)}
                                        </td>
                                        <td>
                                            <StatusChip
                                                status={e.status === 'accepted' ? 'accepted' : 'invited'}
                                                label={e.status === 'invited' ? 'Co-host invite' : sentence(e.status)}
                                            />
                                        </td>
                                        <td className={cx(sh.r, sh.mEnd)}>
                                            <CoHostInboxActions eventId={e.id} shopId={shop.shopId} status={e.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            <section className="g-card" aria-label="Your events">
                <div className={sh.panelH}>
                    <div>
                        <h2>Your events</h2>
                    </div>
                    <FilterTabs
                        label="Event filter"
                        items={FILTER_TABS.map((t) => ({
                            href: `/shop/${slug}/events?filter=${t.toLowerCase()}`,
                            label: sentence(t),
                            active: t === filter,
                        }))}
                    />
                </div>
                <div className={sh.tblWrap}>
                    <table className={sh.tbl}>
                        <thead>
                            <tr>
                                <th>Event</th>
                                <th>Starts</th>
                                <th>Status</th>
                                <th>RSVPs</th>
                                <th>Visibility</th>
                                <th className={sh.r}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.length === 0 ? (
                                <EmptyRow
                                    colSpan={6}
                                    icon={<Flag size={18} strokeWidth={2} />}
                                    title={`No ${filter === 'ALL' ? '' : filter.toLowerCase() + ' '}events`}
                                    body="Host a meet, cruise or run from your shop. It appears on your shop page and the map."
                                />
                            ) : (
                                data.rows.map((e: any) => (
                                    <tr key={e.id}>
                                        <td>
                                            <Link href={`/shop/${slug}/events/${e.id}`} className="text-link" style={{ color: 'var(--ink)' }}>
                                                {e.title}
                                            </Link>
                                            <small>
                                                <span className={sh.code} style={{ fontSize: 11 }}>{e.code}</span>
                                                {' · '}
                                                {TYPE_LABEL[e.type] ?? sentence(String(e.type ?? 'event'))}
                                                {e.location_name ? ` · ${e.location_name}` : ''}
                                            </small>
                                        </td>
                                        <td data-label="Starts" className={sh.when}>
                                            {when(e.start_at)}
                                        </td>
                                        <td>
                                            <span className="g-chips">
                                                {e.cancelled_at ? (
                                                    <StatusChip status="cancelled" />
                                                ) : (
                                                    <StatusChip status={new Date(e.start_at).getTime() > Date.now() ? 'upcoming' : 'past'} />
                                                )}
                                                {e.is_official ? (
                                                    <span className="g-chip g-chip--tint">
                                                        <BadgeCheck size={14} strokeWidth={2} aria-hidden="true" />
                                                        Official
                                                    </span>
                                                ) : null}
                                            </span>
                                        </td>
                                        <td data-label="RSVPs" className={sh.num}>
                                            {e.attending_count}
                                            {e.capacity ? (
                                                <span className={sh.muted} style={{ fontFamily: 'var(--ui)', fontSize: 12.5 }}>
                                                    {' '}
                                                    of {e.capacity}
                                                </span>
                                            ) : null}
                                        </td>
                                        <td data-label="Visibility">
                                            <span className="g-chip">
                                                {e.visibility === 'private' ? (
                                                    <Lock size={14} strokeWidth={2} aria-hidden="true" />
                                                ) : (
                                                    <Globe size={14} strokeWidth={2} aria-hidden="true" />
                                                )}
                                                {sentence(String(e.visibility))}
                                            </span>
                                        </td>
                                        <td className={cx(sh.r, sh.mEnd)}>
                                            <EventActions
                                                eventId={e.id}
                                                shopId={shop.shopId}
                                                slug={slug}
                                                cancelled={!!e.cancelled_at}
                                                callerRole={role}
                                                title={e.title}
                                            />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function sentence(t: string): string {
    const x = t.replace(/[_-]+/g, ' ').trim().toLowerCase();
    return x.charAt(0).toUpperCase() + x.slice(1);
}
