/**
 * /admin/events/[id] — platform-admin read view of ONE event: who is going,
 * seat/hold/waitlist counts, tickets, co-hosts, and a "shop console" panel
 * that links into /shop/<slug>/... (where platform admins already pass the
 * shop guard, flagged viaPlatformAdmin).
 *
 * Member-hosted events (shop_id null) have no shop console, so they are edited
 * HERE with the host's own form wired to admin-scoped actions (host-actions.ts).
 *
 * Authorization: requirePlatformAdmin() below (the admin layout checks too —
 * defense in depth). All reads use the service-role client.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { eventHasPaidExposure } from '@/lib/event-refund';
import { formatClock, formatEventTime } from '@/lib/event-time';
import { MEDUSA_URL } from '@/lib/medusa';
import { HostEventEditForm } from '@/app/me/events/[id]/HostEventEditForm';
import { EventActions } from '@/app/admin/(console)/events/EventActions';
import { adminCancelHostEvent, adminSetEventRoutePlan, adminUpdateHostEvent } from './host-actions';
import {
    RSVP_LIMIT,
    UUID_RE,
    deriveCounts,
    loadCheckins,
    loadCohosts,
    loadEvent,
    loadRsvps,
    loadTickets,
    loadTiers,
    type AdminCheckin,
    type AdminRsvp,
    type AdminTicket,
    type ProfileLite,
} from './data';

export const metadata = { title: 'Event Detail' };
export const dynamic = 'force-dynamic';

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

const RSVP_PILL: Record<string, string> = {
    going: 'admin-pill neon',
    maybe: 'admin-pill gold',
    waitlist: 'admin-pill',
    declined: 'admin-pill warn',
};

const HOLD_PILL: Record<string, string> = {
    confirmed: 'admin-pill neon',
    held: 'admin-pill gold',
    waitlisted: 'admin-pill',
    expired: 'admin-pill warn',
    cancelled: 'admin-pill warn',
};

const TICKET_PILL: Record<string, string> = {
    confirmed: 'admin-pill neon',
    held: 'admin-pill gold',
    expired: 'admin-pill warn',
    cancelled: 'admin-pill warn',
};

const COHOST_PILL: Record<string, string> = {
    accepted: 'admin-pill neon',
    pending: 'admin-pill gold',
    invited: 'admin-pill gold',
    declined: 'admin-pill warn',
    removed: 'admin-pill warn',
};

const LABEL_STYLE: React.CSSProperties = {
    padding: '10px 0',
    fontFamily: 'var(--font-display, monospace)',
    fontSize: 10,
    letterSpacing: '2px',
    color: 'var(--text-3, #8a8a9a)',
    width: 130,
    verticalAlign: 'top',
};

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

function money(cents: number | null | undefined, currency: string | null = 'usd'): string {
    if (cents == null) return '—';
    const amount = (cents / 100).toFixed(2);
    return !currency || currency.toLowerCase() === 'usd' ? `$${amount}` : `${currency.toUpperCase()} ${amount}`;
}

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const event = await loadEvent(id);
    if (!event) {
        return (
            <>
                <div className="admin-empty">EVENT NOT FOUND</div>
                <Link href="/admin/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                    ‹ ALL EVENTS
                </Link>
            </>
        );
    }

    const isShopEvent = event.shop_id != null;
    const shop = event.shop;

    const [tiers, rsvps, ticketData, checkins, cohosts, isPaidEvent] = await Promise.all([
        loadTiers(id),
        loadRsvps(id),
        loadTickets(id),
        loadCheckins(id),
        loadCohosts(id),
        eventHasPaidExposure(id),
    ]);
    const { tickets, profiles } = ticketData;
    const counts = deriveCounts(event, rsvps, tickets, checkins);
    const tierName = new Map(tiers.map((t) => [t.id, t.name ?? 'TIER']));

    const isPast = new Date(event.start_at).getTime() < Date.now();
    const isTiered = event.rsvp_mode === 'tiered' || event.rsvp_mode === 'paid';
    const showTickets = tickets.length > 0 || isTiered;
    const typeLabel = TYPE_LABEL[event.type] ?? String(event.type ?? '').replace(/_/g, ' ');
    const rsvpModeLabel = isTiered ? (event.rsvp_mode === 'paid' ? 'PAID' : 'TIERED') : 'FREE';

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">{(event.title ?? 'EVENT').toUpperCase()}</div>
                    <div className="admin-page-sub">
                        {event.code ?? typeLabel} · {typeLabel} · {formatEventTime(event.start_at, event.time_zone)}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link href="/admin/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                        ‹ ALL EVENTS
                    </Link>
                    <Link href={`/event/${event.id}`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                        VIEW PUBLIC ›
                    </Link>
                    {isShopEvent && shop ? (
                        <Link
                            href={`/shop/${shop.slug}/events/${event.id}`}
                            className="admin-action-btn"
                            style={{ textDecoration: 'none', borderColor: 'var(--gold)', color: 'var(--gold)' }}
                        >
                            EDIT IN @{shop.slug.toUpperCase()} CONSOLE ›
                        </Link>
                    ) : !isShopEvent ? (
                        <a
                            href="#edit"
                            className="admin-action-btn"
                            style={{ textDecoration: 'none', borderColor: 'var(--gold)', color: 'var(--gold)' }}
                        >
                            EDIT BELOW ↓
                        </a>
                    ) : null}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 14px 0' }}>
                <span className={TYPE_PILL[event.type] ?? 'admin-pill'}>{typeLabel}</span>
                <span className={VIS_PILL[String(event.visibility)] ?? 'admin-pill'}>
                    {String(event.visibility ?? 'public').toUpperCase()}
                </span>
                {event.is_official && <span className="admin-pill gold">OFFICIAL</span>}
                {event.cancelled_at && <span className="admin-pill warn">CANCELLED</span>}
                {isPast && <span className="admin-pill">PAST</span>}
                {event.verification_status === 'verified' && (
                    <span className="admin-pill neon">VERIFIED{event.coin_enabled ? ' · COIN' : ''}</span>
                )}
                {event.verification_status === 'requested' && <span className="admin-pill">VERIFICATION PENDING</span>}
                {event.verification_status === 'revoked' && <span className="admin-pill warn">VERIFICATION REVOKED</span>}
                <span className="admin-pill">RSVP: {rsvpModeLabel}</span>
                {isShopEvent ? (
                    shop ? (
                        <span className="admin-pill gold">SHOP EVENT</span>
                    ) : (
                        <span className="admin-pill warn">SHOP #{event.shop_id} (MISSING)</span>
                    )
                ) : (
                    <span className="admin-pill">MEMBER-HOSTED</span>
                )}
            </div>

            <div className="admin-stat-grid">
                <Stat
                    label="CONFIRMED SEATS"
                    value={counts.capacity ? `${counts.confirmedSeats} / ${counts.capacity}` : String(counts.confirmedSeats)}
                    accent={counts.confirmedSeats > 0 ? 'gold' : undefined}
                />
                <Stat label="HOLDS" value={counts.holds} />
                <Stat label="WAITLIST" value={counts.waitlist} />
                <Stat label="MAYBE" value={counts.maybe} />
                <Stat label="PAID" value={counts.paid} />
                {showTickets && (
                    <Stat
                        label="TICKETS"
                        value={`${counts.tickets.confirmed} / ${counts.tickets.total}`}
                    />
                )}
                <Stat label="CHECKED IN" value={counts.checkedIn} accent={counts.checkedIn > 0 ? 'gold' : undefined} />
                <Stat label="DB COUNTER" value={counts.attendingCounter} />
            </div>

            <div style={{ marginTop: 20, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                    {/* CONTEXT */}
                    <SectionHead title="CONTEXT" sub="HOST · SHOP · LOCATION · TIERS" />
                    <div style={{ border: '1px solid var(--line)', padding: '4px 16px' }}>
                        <table style={{ width: '100%' }}>
                            <tbody>
                                <tr>
                                    <td style={LABEL_STYLE}>HOST</td>
                                    <td style={{ padding: '10px 0', fontSize: 14 }}>
                                        {event.host ? (
                                            <>
                                                <Link
                                                    href={`/admin/users?q=${encodeURIComponent(event.host.handle)}`}
                                                    className="text-link"
                                                >
                                                    @{event.host.handle}
                                                </Link>
                                                {event.host.display_name ? ` · ${event.host.display_name}` : ''}
                                                {event.host.kind === 'shop_page' && (
                                                    <span className="admin-pill gold" style={{ marginLeft: 6 }}>
                                                        SHOP
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>SHOP</td>
                                    <td style={{ padding: '10px 0', fontSize: 14 }}>
                                        {shop ? (
                                            <>
                                                <Link href={`/admin/shops/${shop.id}`} className="text-link">
                                                    @{shop.slug}
                                                </Link>
                                                {shop.status && shop.status !== 'verified' && (
                                                    <span className="admin-pill warn" style={{ marginLeft: 6 }}>
                                                        {shop.status.toUpperCase()}
                                                    </span>
                                                )}
                                            </>
                                        ) : isShopEvent ? (
                                            <span className="admin-pill warn">SHOP #{event.shop_id} (MISSING)</span>
                                        ) : (
                                            'None (member-hosted)'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>LOCATION</td>
                                    <td style={{ padding: '10px 0', fontSize: 14 }}>
                                        {[event.location_name, event.location_detail].filter(Boolean).join(' · ') || '—'}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>AREA LABEL</td>
                                    <td style={{ padding: '10px 0', fontSize: 14 }}>{event.area_label ?? '—'}</td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>DESCRIPTION</td>
                                    <td style={{ padding: '10px 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>
                                        {event.description || '—'}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>TAGS</td>
                                    <td style={{ padding: '10px 0', fontSize: 14 }}>
                                        {event.tags && event.tags.length ? (
                                            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                                                {event.tags.map((t) => (
                                                    <span key={t} className="admin-pill">
                                                        {t}
                                                    </span>
                                                ))}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>TIERS</td>
                                    <td style={{ padding: '10px 0', fontSize: 14 }}>
                                        {tiers.length === 0 ? (
                                            '—'
                                        ) : (
                                            tiers.map((t) => (
                                                <div key={t.id} style={{ opacity: t.active === false ? 0.5 : 1 }}>
                                                    {t.name ?? 'TIER'} · {money(t.price_cents, t.currency)}
                                                    {t.capacity != null ? ` · cap ${t.capacity}` : ''}
                                                    {t.reserved_spot ? ' · reserved spot' : ''}
                                                    {t.active === false ? ' · RETIRED' : ''}
                                                </div>
                                            ))
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={LABEL_STYLE}>IDS</td>
                                    <td
                                        style={{
                                            padding: '10px 0',
                                            fontSize: 11,
                                            fontFamily: 'var(--font-mono, monospace)',
                                            color: 'var(--text-3)',
                                            wordBreak: 'break-all',
                                        }}
                                    >
                                        event {event.id}
                                        {event.host_id ? ` · host ${event.host_id}` : ''}
                                        {event.shop_id != null ? ` · shop #${event.shop_id}` : ''}
                                        <br />
                                        created {stamp(event.created_at)} · updated {stamp(event.updated_at)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* ATTENDEES */}
                    <div id="attendees" style={{ scrollMarginTop: 80 }} />
                    <SectionHead
                        title="ATTENDEES (RSVPS)"
                        sub={`${rsvps.length} SHOWN · MOST RECENT FIRST`}
                    />
                    <RsvpTable
                        rsvps={rsvps}
                        checkins={checkins}
                        tierName={tierName}
                        timeZone={event.time_zone}
                    />
                    {rsvps.length >= RSVP_LIMIT && (
                        <div className="admin-page-sub" style={{ marginTop: 8 }}>
                            SHOWING THE {RSVP_LIMIT} MOST RECENT RSVPS — OLDER ROWS ARE NOT LISTED.
                        </div>
                    )}

                    {/* TICKETS */}
                    {showTickets && (
                        <>
                            <div id="tickets" style={{ scrollMarginTop: 80 }} />
                            <SectionHead
                                title="TICKETS"
                                sub={`${counts.tickets.total} TOTAL · ${counts.tickets.confirmed} CONFIRMED · ${counts.tickets.held} HELD · ${counts.tickets.cancelled} CANCELLED`}
                            />
                            <TicketTable
                                tickets={tickets}
                                profiles={profiles}
                                tierName={tierName}
                                timeZone={event.time_zone}
                            />
                        </>
                    )}

                    {/* CO-HOSTS */}
                    <SectionHead title="CO-HOSTS" sub={`${cohosts.length} TOTAL`} />
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>SHOP</th>
                                    <th>STATUS</th>
                                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cohosts.length === 0 ? (
                                    <tr>
                                        <td colSpan={3}>
                                            <div className="admin-empty">NO CO-HOSTS</div>
                                        </td>
                                    </tr>
                                ) : (
                                    cohosts.map((c) => (
                                        <tr key={c.shopId}>
                                            <td>
                                                <Link href={`/admin/shops/${c.shopId}`} className="text-link">
                                                    {c.name}
                                                </Link>
                                                {c.slug && <div className="admin-handle">@{c.slug}</div>}
                                            </td>
                                            <td>
                                                <span className={COHOST_PILL[c.status] ?? 'admin-pill'}>
                                                    {String(c.status).toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {c.slug && (
                                                    <Link
                                                        href={`/shop/${c.slug}/events/${event.id}`}
                                                        className="admin-action-btn"
                                                        style={{ textDecoration: 'none' }}
                                                    >
                                                        OPEN AS CO-HOST ›
                                                    </Link>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ADMIN ACTIONS */}
                    {!event.cancelled_at && (
                        <>
                            <SectionHead title="ADMIN ACTIONS" sub="PLATFORM-LEVEL OVERRIDE" />
                            <EventActions
                                eventId={event.id}
                                eventTitle={event.title ?? ''}
                                isPaid={isTiered}
                            />
                        </>
                    )}

                    {/* MEMBER-HOSTED: edit here */}
                    {!isShopEvent && (
                        <div id="edit" style={{ scrollMarginTop: 80 }}>
                            <SectionHead
                                title="EDIT EVENT (AS HOST)"
                                sub="MEMBER-HOSTED · SAVES ARE MADE AS PLATFORM ADMIN"
                            />
                            <div className="admin-page-sub" style={{ marginBottom: 12 }}>
                                INVITES ARE SENT UNDER THE HOST&rsquo;S NAME FROM /ME/EVENTS AND ARE NOT AVAILABLE HERE.
                            </div>
                            <HostEventEditForm
                                event={event}
                                isPaidEvent={isPaidEvent}
                                actions={{
                                    update: adminUpdateHostEvent,
                                    cancel: adminCancelHostEvent,
                                    routePlan: adminSetEventRoutePlan,
                                }}
                            />
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
    return (
        <div className="admin-page-head" style={{ marginTop: 28, borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}>
            <div>
                <div className="admin-page-title" style={{ fontSize: 14 }}>
                    {title}
                </div>
                {sub ? <div className="admin-page-sub">{sub}</div> : null}
            </div>
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

function HandleLink({ p }: { p: { handle: string } | null | undefined }) {
    if (!p?.handle) return <>—</>;
    return (
        <Link href={`/admin/users?q=${encodeURIComponent(p.handle)}`} className="text-link">
            @{p.handle}
        </Link>
    );
}

function CheckedIn({ c, timeZone }: { c: AdminCheckin | undefined; timeZone: string | null }) {
    if (!c) return <>—</>;
    return (
        <span className="admin-pill neon">
            ✓ {c.method ? `${String(c.method).toUpperCase()} · ` : ''}
            {c.checked_in_at ? formatClock(c.checked_in_at, timeZone) : ''}
        </span>
    );
}

function RsvpTable({
    rsvps,
    checkins,
    tierName,
    timeZone,
}: {
    rsvps: AdminRsvp[];
    checkins: Map<string, AdminCheckin>;
    tierName: Map<string, string>;
    timeZone: string | null;
}) {
    return (
        <div className="admin-table-wrap">
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>HANDLE / NAME</th>
                        <th>STATUS</th>
                        <th>HOLD</th>
                        <th>SEATS</th>
                        <th>SPOT #</th>
                        <th>TIER</th>
                        <th>PAID</th>
                        <th>CHECKED IN</th>
                        <th>RSVPED</th>
                    </tr>
                </thead>
                <tbody>
                    {rsvps.length === 0 ? (
                        <tr>
                            <td colSpan={9}>
                                <div className="admin-empty">NO RSVPS YET</div>
                            </td>
                        </tr>
                    ) : (
                        rsvps.map((r) => (
                            <tr key={r.profile_id}>
                                <td>
                                    <HandleLink p={r.profile} />
                                    {r.profile?.display_name ? (
                                        <div className="admin-handle">{r.profile.display_name}</div>
                                    ) : null}
                                </td>
                                <td>
                                    <span className={RSVP_PILL[r.status] ?? 'admin-pill'}>
                                        {String(r.status).toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    {r.hold_state ? (
                                        <>
                                            <span className={HOLD_PILL[r.hold_state] ?? 'admin-pill'}>
                                                {r.hold_state.toUpperCase()}
                                            </span>
                                            {r.hold_state === 'held' && r.hold_expires_at ? (
                                                <div className="admin-handle">
                                                    EXP {formatClock(r.hold_expires_at, timeZone)}
                                                </div>
                                            ) : null}
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td>{r.seats}</td>
                                <td>{r.spot_no ?? '—'}</td>
                                <td>{r.tier_id ? (tierName.get(r.tier_id) ?? '—') : '—'}</td>
                                <td>
                                    {r.payment_ref ? (
                                        <a
                                            href={`${MEDUSA_URL}/app/orders/${r.payment_ref}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-link"
                                        >
                                            ORDER …{r.payment_ref.slice(-6)}
                                        </a>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td>
                                    <CheckedIn c={checkins.get(r.profile_id)} timeZone={timeZone} />
                                </td>
                                <td>{stamp(r.rsvped_at)}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

function TicketTable({
    tickets,
    profiles,
    tierName,
    timeZone,
}: {
    tickets: AdminTicket[];
    profiles: Map<string, ProfileLite>;
    tierName: Map<string, string>;
    timeZone: string | null;
}) {
    // Group seats by order (or hold, for unpaid holds), keeping the query order.
    const groups = new Map<string, AdminTicket[]>();
    for (const t of tickets) {
        const key = t.order_id ?? t.hold_id ?? t.id;
        const list = groups.get(key);
        if (list) list.push(t);
        else groups.set(key, [t]);
    }
    return (
        <div className="admin-table-wrap">
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>SEAT</th>
                        <th>ATTENDEE</th>
                        <th>EMAIL</th>
                        <th>SIZE</th>
                        <th>STATUS</th>
                        <th>SPOT #</th>
                        <th>TIER</th>
                        <th>CLAIMED</th>
                        <th>CHECKED IN</th>
                        <th>REFUND</th>
                    </tr>
                </thead>
                <tbody>
                    {tickets.length === 0 ? (
                        <tr>
                            <td colSpan={10}>
                                <div className="admin-empty">NO TICKETS YET</div>
                            </td>
                        </tr>
                    ) : (
                        [...groups.entries()].map(([key, rows]) => {
                            const first = rows[0];
                            const buyer = first.purchaser_profile_id ? profiles.get(first.purchaser_profile_id) : null;
                            return (
                                <TicketGroup
                                    key={key}
                                    groupKey={key}
                                    rows={rows}
                                    buyer={buyer ?? null}
                                    profiles={profiles}
                                    tierName={tierName}
                                    timeZone={timeZone}
                                />
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}

function TicketGroup({
    groupKey,
    rows,
    buyer,
    profiles,
    tierName,
    timeZone,
}: {
    groupKey: string;
    rows: AdminTicket[];
    buyer: ProfileLite | null;
    profiles: Map<string, ProfileLite>;
    tierName: Map<string, string>;
    timeZone: string | null;
}) {
    const first = rows[0];
    return (
        <>
            <tr>
                <td
                    colSpan={10}
                    style={{
                        background: 'var(--bg-2)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--text-3)',
                    }}
                >
                    {first.order_id ? (
                        <>
                            ORDER{' '}
                            <a
                                href={`${MEDUSA_URL}/app/orders/${first.order_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-link"
                            >
                                …{first.order_id.slice(-6)}
                            </a>
                        </>
                    ) : (
                        <>HOLD …{groupKey.slice(-6)} (UNPAID)</>
                    )}{' '}
                    · BUYER {buyer ? <HandleLink p={buyer} /> : '—'} · {money(first.order_paid_cents)} ·{' '}
                    {stamp(first.created_at)}
                </td>
            </tr>
            {rows.map((t) => {
                const claimed = t.attendee_profile_id ? profiles.get(t.attendee_profile_id) : null;
                return (
                    <tr key={t.id}>
                        <td>{t.seat ?? '—'}</td>
                        <td>{t.attendee_name ?? '—'}</td>
                        <td>{t.attendee_email ?? '—'}</td>
                        <td>{t.sweater_size ?? '—'}</td>
                        <td>
                            <span className={TICKET_PILL[t.status] ?? 'admin-pill'}>
                                {String(t.status).toUpperCase()}
                            </span>
                        </td>
                        <td>{t.spot_no ?? '—'}</td>
                        <td>{t.tier_id ? (tierName.get(t.tier_id) ?? '—') : '—'}</td>
                        <td>{t.attendee_profile_id ? <HandleLink p={claimed} /> : '—'}</td>
                        <td>
                            {t.checked_in_at ? (
                                <span className="admin-pill neon">✓ {formatClock(t.checked_in_at, timeZone)}</span>
                            ) : (
                                '—'
                            )}
                        </td>
                        <td>{t.refund_cents ? money(t.refund_cents) : '—'}</td>
                    </tr>
                );
            })}
        </>
    );
}
