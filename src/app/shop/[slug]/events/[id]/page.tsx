import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { InviteBranding, InviteEvent } from '@/lib/event-invites';
import { EventEditForm } from './EventEditForm';
import type { TierDraft } from '../TierRowsEditor';
import { InviteSection } from './InviteSection';
import { CoHostSection, type CoHostRow } from './CoHostSection';

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

const INVITE_STATUS_PILL: Record<string, string> = {
    going: 'admin-pill neon',
    maybe: 'admin-pill gold',
    declined: 'admin-pill warn',
};

/** Loads the event by id only — host AND co-host shops need to read it. */
async function loadEvent(eventId: string) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select(
            `id, shop_id, host_id, code, type, title, description, location_name, location_detail,
             lat, lng, sector_code, hero_image_url, start_at, capacity, attending_count,
             visibility, tags, cancelled_at, is_official, rsvp_mode, created_at, updated_at`,
        )
        .eq('id', eventId)
        .maybeSingle();
    return data as any;
}

/**
 * Active tiers (E2), pre-shaped into the editor's draft rows: cents → dollar
 * strings, includes[] → comma string. Retired tiers (active=false) stay out of
 * the editor by design — re-adding one means creating a fresh row.
 */
async function loadTierDrafts(eventId: string): Promise<TierDraft[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_tiers')
        .select('id, name, price_cents, capacity, reserved_spot, includes, package_mode, package_price_cents, medusa_product_id, sort')
        .eq('event_id', eventId)
        .eq('active', true)
        .order('sort', { ascending: true });
    if (error) console.error('[shop/events/[id]] tier load failed:', error.message);
    return ((data as any[]) ?? []).map((t) => ({
        id: t.id,
        name: t.name ?? '',
        price: t.price_cents != null ? (Number(t.price_cents) / 100).toFixed(2) : '',
        capacity: t.capacity != null ? String(t.capacity) : '',
        reservedSpot: Boolean(t.reserved_spot),
        includes: Array.isArray(t.includes) ? t.includes.join(', ') : '',
        packageMode: (t.package_mode ?? 'none') as TierDraft['packageMode'],
        packagePrice:
            t.package_price_cents != null ? (Number(t.package_price_cents) / 100).toFixed(2) : '',
        medusaProductId: t.medusa_product_id ?? '',
    }));
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

async function loadBrandingForShop(shopId: number): Promise<InviteBranding | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.rpc('shop_email_branding', { p_shop_id: shopId });
    const b = (data as any[])?.[0];
    if (!b) return null;
    return {
        shopName: b.name,
        fromName: b.from_name ?? b.name,
        logoUrl: b.email_logo_url ?? null,
        primaryColor: b.primary_color ?? '#e8a845',
        secondaryColor: b.secondary_color ?? b.primary_color ?? '#e8a845',
        supportEmail: b.support_email ?? null,
        pageHandle: b.page_handle ?? null,
    };
}

async function loadCohosts(eventId: string): Promise<CoHostRow[]> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('event_cohosts')
        .select('shop_id, status, invited_at, shop:shops!event_cohosts_shop_id_fkey(name, slug)')
        .eq('event_id', eventId)
        .order('invited_at', { ascending: true });
    return ((data as any[]) ?? []).map((r) => ({
        shopId: r.shop_id,
        name: r.shop?.name ?? `Shop #${r.shop_id}`,
        slug: r.shop?.slug ?? '',
        status: r.status,
    }));
}

/** Host name first, then accepted co-hosts in invite order. */
function computeHostNames(hostName: string, cohosts: CoHostRow[]): string[] {
    return [hostName, ...cohosts.filter((c) => c.status === 'accepted').map((c) => c.name)];
}

/** Invites for this event — host sees all, co-host sees its own. */
async function loadInvites(eventId: string, shopId: number, isHost: boolean) {
    const admin = getSupabaseAdmin();
    let q = admin
        .from('event_invites')
        .select('invited_email, invited_name, template_key, shop_id, sent_at, rsvp_status, rsvp_at, opened_at, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(300);
    if (!isHost) q = q.eq('shop_id', shopId);
    const { data } = await q;
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

    const event = await loadEvent(id);
    if (!event) notFound();

    const isHost = event.shop_id === shop.shopId;

    // Co-host relationship (when not host).
    const cohosts = await loadCohosts(id);
    const myCohost = cohosts.find((c) => c.shopId === shop.shopId) ?? null;
    const myStatus = myCohost?.status ?? null;

    // A viewer with no relationship to this event can't see it here.
    if (!isHost && !myCohost) notFound();

    const canInvite = isHost || myStatus === 'accepted';

    const [rsvps, branding, invites, tierDrafts] = await Promise.all([
        loadRsvps(id),
        loadBrandingForShop(shop.shopId),
        loadInvites(id, shop.shopId, isHost),
        isHost ? loadTierDrafts(id) : Promise.resolve([] as TierDraft[]),
    ]);

    // Host shop name for the hosted-by line.
    const admin = getSupabaseAdmin();
    const { data: hostShop } = await admin
        .from('shops')
        .select('name, from_name')
        .eq('id', event.shop_id)
        .maybeSingle();
    const hostDisplayName = (hostShop as any)?.from_name ?? (hostShop as any)?.name ?? 'Host';
    const hostNames = computeHostNames(hostDisplayName, cohosts);

    const inviteEvent: InviteEvent = {
        id: event.id,
        title: event.title,
        typeLabel: TYPE_LABEL[event.type] ?? String(event.type ?? 'EVENT').replace(/_/g, ' '),
        startAtISO: event.start_at,
        locationName: event.location_name ?? '',
        locationDetail: event.location_detail ?? null,
        code: event.code ?? null,
        description: event.description ?? null,
    };

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
                {!isHost && <span className="admin-pill gold">CO-HOST VIEW</span>}
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

            {isHost ? (
                <EventEditForm
                    event={event}
                    shopId={shop.shopId}
                    slug={slug}
                    callerRole={role}
                    tiers={tierDrafts}
                />
            ) : (
                <ReadOnlyEventCard event={event} hostName={hostDisplayName} />
            )}

            {/* CO-HOSTS */}
            <CoHostSection
                eventId={event.id}
                hostShopId={event.shop_id}
                viewerShopId={shop.shopId}
                isHost={isHost}
                cohosts={cohosts}
                myStatus={myStatus}
            />

            {/* INVITATIONS — host always; co-host only once accepted */}
            {canInvite && branding && (
                <InviteSection
                    eventId={event.id}
                    shopId={shop.shopId}
                    branding={branding}
                    event={inviteEvent}
                    hostNames={hostNames}
                    asCoHost={!isHost}
                />
            )}

            {/* SENT INVITES */}
            <div
                className="admin-page-head"
                style={{ marginTop: 24, borderBottom: 'none', paddingBottom: 0 }}
            >
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        SENT INVITES
                    </div>
                    <div className="admin-page-sub">
                        {invites.length} TOTAL · {isHost ? 'ALL SHOPS' : 'YOUR SHOP'}
                    </div>
                </div>
            </div>
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>EMAIL</th>
                            <th>STYLE</th>
                            <th>SENT</th>
                            <th>RSVP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invites.length === 0 ? (
                            <tr>
                                <td colSpan={4}>
                                    <div className="admin-empty">NO INVITES SENT YET.</div>
                                </td>
                            </tr>
                        ) : (
                            invites.map((iv: any, idx: number) => (
                                <tr key={`${iv.invited_email}-${idx}`}>
                                    <td>
                                        {iv.invited_email}
                                        {iv.invited_name ? (
                                            <div className="admin-handle">{iv.invited_name}</div>
                                        ) : null}
                                    </td>
                                    <td>
                                        <span className="admin-pill">
                                            {String(iv.template_key ?? '—').toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {iv.sent_at
                                            ? new Date(iv.sent_at)
                                                  .toISOString()
                                                  .slice(0, 16)
                                                  .replace('T', ' ')
                                            : '—'}
                                    </td>
                                    <td>
                                        {iv.rsvp_status ? (
                                            <span
                                                className={
                                                    INVITE_STATUS_PILL[iv.rsvp_status] ?? 'admin-pill'
                                                }
                                            >
                                                {String(iv.rsvp_status).toUpperCase()}
                                            </span>
                                        ) : iv.opened_at ? (
                                            <span className="admin-pill">OPENED</span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* RSVPS */}
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

function ReadOnlyEventCard({ event, hostName }: { event: any; hostName: string }) {
    const rows: { label: string; value: string }[] = [
        { label: 'HOSTED BY', value: hostName },
        {
            label: 'STARTS',
            value: new Date(event.start_at).toISOString().slice(0, 16).replace('T', ' '),
        },
        {
            label: 'LOCATION',
            value: [event.location_name, event.location_detail].filter(Boolean).join(' · ') || '—',
        },
        { label: 'DESCRIPTION', value: event.description || '—' },
    ];
    return (
        <div
            style={{
                marginTop: 16,
                border: '1px solid var(--line, #1a1a28)',
                borderRadius: 4,
                padding: '4px 16px',
            }}
        >
            <table style={{ width: '100%' }}>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.label}>
                            <td
                                style={{
                                    padding: '10px 0',
                                    fontFamily: 'var(--font-display, monospace)',
                                    fontSize: 10,
                                    letterSpacing: '2px',
                                    color: 'var(--text-dim, #8a8a9a)',
                                    width: 130,
                                    verticalAlign: 'top',
                                }}
                            >
                                {r.label}
                            </td>
                            <td style={{ padding: '10px 0', fontSize: 14, color: 'var(--text, #f0f0f0)' }}>
                                {r.value}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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
