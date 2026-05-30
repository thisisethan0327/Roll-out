import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { EventEditForm } from './EventEditForm';

export const metadata = { title: 'Event Detail' };

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

const RSVP_PILL: Record<string, string> = {
    going: 'admin-pill neon',
    maybe: 'admin-pill gold',
    waitlist: 'admin-pill',
    declined: 'admin-pill warn',
};

async function loadEvent(eventId: string, shopId: number) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select(
            `id, shop_id, host_id, code, type, title, description, location_name, location_detail,
             lat, lng, sector_code, hero_image_url, start_at, capacity, attending_count,
             visibility, tags, cancelled_at, is_official, created_at, updated_at`,
        )
        .eq('id', eventId)
        .eq('shop_id', shopId)
        .maybeSingle();
    return data as any;
}

async function loadRsvps(eventId: string) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('event_rsvps')
        .select(
            `event_id, profile_id, status, rsvped_at,
             profile:profiles!event_rsvps_profile_id_fkey(id, handle, display_name)`,
        )
        .eq('event_id', eventId)
        .order('rsvped_at', { ascending: false })
        .limit(200);
    return (data as any[]) ?? [];
}

export default async function EventDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string; id: string }>;
    searchParams: Promise<{ just_created?: string }>;
}) {
    const { slug, id } = await params;
    const { just_created } = await searchParams;
    const { shop, role } = await requireShopMemberBySlug(slug);

    const event = await loadEvent(id, shop.shopId);
    if (!event) notFound();
    const rsvps = await loadRsvps(id);
    const justCreated = just_created === '1';

    return (
        <>
            {justCreated ? (
                <div
                    style={{
                        margin: '0 0 12px 0',
                        padding: '12px 16px',
                        background: 'var(--gold-dim)',
                        border: '1px solid var(--gold)',
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 12,
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    ✓ EVENT CREATED · LIVE ON /MEETS AND /U/{slug.toUpperCase()}
                </div>
            ) : null}
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">{event.title}</div>
                    <div className="admin-page-sub">
                        {event.code} ·{' '}
                        {new Date(event.start_at).toISOString().slice(0, 16).replace('T', ' ')}
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/events`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ ALL EVENTS
                </Link>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 12px 0' }}>
                <span className={TYPE_PILL[event.type] ?? 'admin-pill'}>
                    {TYPE_LABEL[event.type] ?? event.type}
                </span>
                <span className="admin-pill">
                    {String(event.visibility).toUpperCase()}
                </span>
                {event.is_official && <span className="admin-pill gold">OFFICIAL</span>}
                {event.cancelled_at && <span className="admin-pill warn">CANCELLED</span>}
            </div>

            <div className="admin-stat-grid">
                <Stat
                    label="RSVPS"
                    value={
                        event.capacity
                            ? `${event.attending_count} / ${event.capacity}`
                            : String(event.attending_count ?? 0)
                    }
                    accent={event.attending_count > 0 ? 'gold' : undefined}
                />
                <Stat
                    label="CREATED"
                    value={new Date(event.created_at).toISOString().slice(0, 10)}
                />
                <Stat
                    label="UPDATED"
                    value={
                        event.updated_at
                            ? new Date(event.updated_at).toISOString().slice(0, 10)
                            : '—'
                    }
                />
            </div>

            <EventEditForm
                event={event}
                shopId={shop.shopId}
                slug={slug}
                callerRole={role}
            />

            <div className="admin-page-head" style={{ marginTop: 24, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        RSVPS
                    </div>
                    <div className="admin-page-sub">
                        {rsvps.length} TOTAL · MOST RECENT FIRST
                    </div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>HANDLE</th>
                            <th>NAME</th>
                            <th>STATUS</th>
                            <th>RSVPED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rsvps.length === 0 ? (
                            <tr>
                                <td colSpan={4}>
                                    <div className="admin-empty">NO RSVPS YET.</div>
                                </td>
                            </tr>
                        ) : (
                            rsvps.map((r: any) => (
                                <tr key={`${r.event_id}-${r.profile_id}`}>
                                    <td>
                                        {r.profile?.handle ? (
                                            <span className="text-link">@{r.profile.handle}</span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td>{r.profile?.display_name ?? '—'}</td>
                                    <td>
                                        <span className={RSVP_PILL[r.status] ?? 'admin-pill'}>
                                            {String(r.status).toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {r.rsvped_at
                                            ? new Date(r.rsvped_at).toISOString().slice(0, 16).replace('T', ' ')
                                            : '—'}
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
