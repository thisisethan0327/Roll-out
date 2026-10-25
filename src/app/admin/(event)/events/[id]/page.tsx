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
import { DoorSection } from '@/components/DoorSection';
import { RsvpRowActions, TicketRefundButton } from './RowActions';
import { AdminAuditTable } from '@/components/AdminAuditTable';
import { loadAuditForEvent } from '@/lib/admin-audit';
import {
    adminCancelHostEvent,
    adminDoorCheckInAction,
    adminSetEventRoutePlan,
    adminUpdateHostEvent,
} from './host-actions';
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
import { ArrowDown, Check, ChevronRight, Eye, Pencil } from 'lucide-react';
import { AdminHead, DefList, SectionHead, Stat, adminStyles as a, sentence } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export const metadata = { title: 'Event Detail' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'Night run',
    CAR_MEET: 'Car meet',
    TRACK_DAY: 'Track day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
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
                <AdminHead title="Event not found" back={{ href: '/admin/events', label: 'All events' }} />
                <div className="admin-empty">No event has that id.</div>
            </>
        );
    }

    const isShopEvent = event.shop_id != null;
    const shop = event.shop;

    const [tiers, rsvps, ticketData, checkins, cohosts, isPaidEvent, audit] = await Promise.all([
        loadTiers(id),
        loadRsvps(id),
        loadTickets(id),
        loadCheckins(id),
        loadCohosts(id),
        eventHasPaidExposure(id),
        loadAuditForEvent(id),
    ]);
    const { tickets, profiles } = ticketData;
    const counts = deriveCounts(event, rsvps, tickets, checkins);
    const tierName = new Map(tiers.map((t) => [t.id, t.name ?? 'Tier']));

    const isPast = new Date(event.start_at).getTime() < Date.now();
    const isTiered = event.rsvp_mode === 'tiered' || event.rsvp_mode === 'paid';
    const showTickets = tickets.length > 0 || isTiered;
    const typeLabel = TYPE_LABEL[event.type] ?? sentence(String(event.type ?? ''));
    const rsvpModeLabel = isTiered ? (event.rsvp_mode === 'paid' ? 'paid' : 'tiered') : 'free';

    return (
        <>
            <AdminHead
                back={{ href: '/admin/events', label: 'All events' }}
                title={event.title ?? 'Event'}
                sub={`${event.code ?? typeLabel} · ${typeLabel} · ${formatEventTime(event.start_at, event.time_zone)}`}
                actions={
                    <>
                        <Link href={`/event/${event.id}`} className="admin-action-btn muted">
                            <Eye {...ic} /> View public page
                        </Link>
                        {isShopEvent && shop ? (
                            <Link href={`/shop/${shop.slug}/events/${event.id}`} className="admin-action-btn">
                                <Pencil {...ic} /> Edit in @{shop.slug} console <ChevronRight {...ic} />
                            </Link>
                        ) : !isShopEvent ? (
                            <a href="#edit" className="admin-action-btn">
                                <Pencil {...ic} /> Edit below <ArrowDown {...ic} />
                            </a>
                        ) : null}
                    </>
                }
            />

            <div className={a.chipRow}>
                <span className={TYPE_PILL[event.type] ?? 'admin-pill'}>{typeLabel}</span>
                <span className={VIS_PILL[String(event.visibility)] ?? 'admin-pill'}>
                    {sentence(String(event.visibility ?? 'public'))}
                </span>
                {event.is_official && <span className="admin-pill gold">Official</span>}
                {event.cancelled_at && <span className="admin-pill warn">Cancelled</span>}
                {isPast && <span className="admin-pill">Past</span>}
                {event.verification_status === 'verified' && (
                    <span className="admin-pill neon">Verified{event.coin_enabled ? ' · coin' : ''}</span>
                )}
                {event.verification_status === 'requested' && <span className="admin-pill">Verification pending</span>}
                {event.verification_status === 'revoked' && <span className="admin-pill warn">Verification revoked</span>}
                <span className="admin-pill">RSVP: {rsvpModeLabel}</span>
                {isShopEvent ? (
                    shop ? (
                        <span className="admin-pill gold">Shop event</span>
                    ) : (
                        <span className="admin-pill warn">Shop #{event.shop_id} (missing)</span>
                    )
                ) : (
                    <span className="admin-pill">Member-hosted</span>
                )}
            </div>

            <div className="admin-stat-grid">
                <Stat
                    label="Confirmed seats"
                    value={counts.capacity ? `${counts.confirmedSeats} / ${counts.capacity}` : String(counts.confirmedSeats)}
                />
                <Stat label="Holds" value={counts.holds} />
                <Stat label="Waitlist" value={counts.waitlist} />
                <Stat label="Maybe" value={counts.maybe} />
                <Stat label="Paid" value={counts.paid} />
                {showTickets && <Stat label="Tickets" value={`${counts.tickets.confirmed} / ${counts.tickets.total}`} />}
                <Stat label="Checked in" value={counts.checkedIn} />
                <Stat label="DB counter" value={counts.attendingCounter} />
            </div>

            <div style={{ display: 'contents' }}>
                <div style={{ display: 'contents' }}>
                    {/* CONTEXT */}
                    <SectionHead title="Context" />
                    <DefList
                        label="Event context"
                        rows={[
                            {
                                k: 'Host',
                                v: event.host ? (
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
                                                Shop
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    '—'
                                ),
                            },
                            {
                                k: 'Shop',
                                v: shop ? (
                                    <>
                                        <Link href={`/admin/shops/${shop.id}`} className="text-link">
                                            @{shop.slug}
                                        </Link>
                                        {shop.status && shop.status !== 'verified' && (
                                            <span className="admin-pill warn" style={{ marginLeft: 6 }}>
                                                {sentence(shop.status)}
                                            </span>
                                        )}
                                    </>
                                ) : isShopEvent ? (
                                    <span className="admin-pill warn">Shop #{event.shop_id} (missing)</span>
                                ) : (
                                    'None (member-hosted)'
                                ),
                            },
                            {
                                k: 'Location',
                                v: [event.location_name, event.location_detail].filter(Boolean).join(' · ') || '—',
                            },
                            { k: 'Area label', v: event.area_label ?? '—' },
                            { k: 'Description', v: <span style={{ whiteSpace: 'pre-wrap' }}>{event.description || '—'}</span> },
                            {
                                k: 'Tags',
                                v:
                                    event.tags && event.tags.length ? (
                                        <span className={a.chipRow}>
                                            {event.tags.map((t) => (
                                                <span key={t} className="admin-pill">
                                                    {t}
                                                </span>
                                            ))}
                                        </span>
                                    ) : (
                                        '—'
                                    ),
                            },
                            {
                                k: 'Tiers',
                                v:
                                    tiers.length === 0
                                        ? '—'
                                        : tiers.map((t) => (
                                              <div key={t.id} style={{ color: t.active === false ? 'var(--ink-2)' : undefined }}>
                                                  {t.name ?? 'Tier'} · {money(t.price_cents, t.currency)}
                                                  {t.capacity != null ? ` · cap ${t.capacity}` : ''}
                                                  {t.reserved_spot ? ' · reserved spot' : ''}
                                                  {t.active === false ? ' · retired' : ''}
                                              </div>
                                          )),
                            },
                            {
                                k: 'IDs',
                                v: (
                                    <span className={a.mono}>
                                        event {event.id}
                                        {event.host_id ? ` · host ${event.host_id}` : ''}
                                        {event.shop_id != null ? ` · shop #${event.shop_id}` : ''}
                                        <br />
                                        created {stamp(event.created_at)} · updated {stamp(event.updated_at)}
                                    </span>
                                ),
                            },
                        ]}
                    />
                    {/* ATTENDEES */}
                    <SectionHead id="attendees" title="Attendees (RSVPs)" sub={`${rsvps.length} shown`} />
                    <RsvpTable
                        eventId={event.id}
                        rsvps={rsvps}
                        checkins={checkins}
                        tierName={tierName}
                        timeZone={event.time_zone}
                    />
                    {rsvps.length >= RSVP_LIMIT && (
                        <div className={a.small}>
                            Showing the {RSVP_LIMIT} most recent RSVPs. Older rows are not listed.
                        </div>
                    )}

                    {/* TICKETS */}
                    {showTickets && (
                        <>
                            <SectionHead
                                id="tickets"
                                title="Tickets"
                                sub={`${counts.tickets.total} total · ${counts.tickets.confirmed} confirmed · ${counts.tickets.held} held · ${counts.tickets.cancelled} cancelled.`}
                            />
                            <TicketTable
                                eventId={event.id}
                                tickets={tickets}
                                profiles={profiles}
                                tierName={tierName}
                                timeZone={event.time_zone}
                            />
                        </>
                    )}

                    {/* DOOR LIST + CHECK-IN: platform admins run the door for any event
                        (shop OR member hosted). The list loads on the admin's own session
                        (host_event_tickets admits platform admins); the check-in is
                        adminDoorCheckInAction, which logs to the admin activity log. */}
                    <DoorSection
                        eventId={event.id}
                        rsvpMode={event.rsvp_mode}
                        cancelled={!!event.cancelled_at}
                        checkIn={adminDoorCheckInAction.bind(null, event.id)}
                    />

                    {/* CO-HOSTS */}
                    <SectionHead title="Co-hosts" sub={`${cohosts.length} total.`} />
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Shop</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cohosts.length === 0 ? (
                                    <tr>
                                        <td colSpan={3}>
                                            <div className="admin-empty">No co-hosts.</div>
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
                                                    {sentence(c.status)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {c.slug && (
                                                    <Link
                                                        href={`/shop/${c.slug}/events/${event.id}`}
                                                        className="admin-action-btn"
                                                    >
                                                        Open as co-host <ChevronRight {...ic} />
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
                            <SectionHead title="Admin actions" />
                            <div className={a.actRow}>
                            <EventActions
                                eventId={event.id}
                                eventTitle={event.title ?? ''}
                                isPaid={isTiered}
                            />
                            </div>
                        </>
                    )}

                    {/* ADMIN ACTIVITY (platform admins only; hidden before migration 092) */}
                    {!audit.missing && (
                        <>
                            <SectionHead
                                title="Admin activity"
                                sub={`${audit.rows.length} shown`}
                            />
                            <AdminAuditTable result={audit} showSubject={false} />
                        </>
                    )}

                    {/* MEMBER-HOSTED: edit here */}
                    {!isShopEvent && (
                        <div id="edit" className={a.stack} style={{ scrollMarginTop: 96 }}>
                            <SectionHead
                                title="Edit event (as host)"
                                sub="Saves as platform admin"
                            />
                            <HostEventEditForm
                                event={event}
                                isPaidEvent={isPaidEvent}
                                glide
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
            <Check {...ic} /> {c.method ? `${String(c.method).toUpperCase()} · ` : ''}
            {c.checked_in_at ? formatClock(c.checked_in_at, timeZone) : ''}
        </span>
    );
}

function RsvpTable({
    eventId,
    rsvps,
    checkins,
    tierName,
    timeZone,
}: {
    eventId: string;
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
                        <th>Handle / name</th>
                        <th>Status</th>
                        <th>Hold</th>
                        <th>Seats</th>
                        <th>Spot #</th>
                        <th>Tier</th>
                        <th>Paid</th>
                        <th>Checked in</th>
                        <th>RSVPed</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rsvps.length === 0 ? (
                        <tr>
                            <td colSpan={10}>
                                <div className="admin-empty">No RSVPs yet.</div>
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
                                    <span className={RSVP_PILL[r.status] ?? 'admin-pill'}>{sentence(r.status)}</span>
                                </td>
                                <td>
                                    {r.hold_state ? (
                                        <>
                                            <span className={HOLD_PILL[r.hold_state] ?? 'admin-pill'}>
                                                {sentence(r.hold_state)}
                                            </span>
                                            {r.hold_state === 'held' && r.hold_expires_at ? (
                                                <div className="admin-handle">
                                                    Expires {formatClock(r.hold_expires_at, timeZone)}
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
                                            Order …{r.payment_ref.slice(-6)}
                                        </a>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td>
                                    <CheckedIn c={checkins.get(r.profile_id)} timeZone={timeZone} />
                                </td>
                                <td className={a.time}>{stamp(r.rsvped_at)}</td>
                                <td style={{ textAlign: 'right' }}>
                                    {r.status === 'declined' ? (
                                        '—'
                                    ) : (
                                        <RsvpRowActions
                                            eventId={eventId}
                                            profileId={r.profile_id}
                                            handle={r.profile?.handle ?? 'member'}
                                            paid={!!r.payment_ref}
                                        />
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

function TicketTable({
    eventId,
    tickets,
    profiles,
    tierName,
    timeZone,
}: {
    eventId: string;
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
                        <th>Seat</th>
                        <th>Attendee</th>
                        <th>Email</th>
                        <th>Size</th>
                        <th>Status</th>
                        <th>Spot #</th>
                        <th>Tier</th>
                        <th>Claimed</th>
                        <th>Checked in</th>
                        <th>Refund</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {tickets.length === 0 ? (
                        <tr>
                            <td colSpan={11}>
                                <div className="admin-empty">No tickets yet.</div>
                            </td>
                        </tr>
                    ) : (
                        [...groups.entries()].map(([key, rows]) => {
                            const first = rows[0];
                            const buyer = first.purchaser_profile_id ? profiles.get(first.purchaser_profile_id) : null;
                            return (
                                <TicketGroup
                                    eventId={eventId}
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
    eventId,
    groupKey,
    rows,
    buyer,
    profiles,
    tierName,
    timeZone,
}: {
    eventId: string;
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
                <td colSpan={11} className={a.groupRow}>
                    {first.order_id ? (
                        <>
                            Order{' '}
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
                        <>Hold …{groupKey.slice(-6)} (unpaid)</>
                    )}{' '}
                    · buyer {buyer ? <HandleLink p={buyer} /> : '—'} · {money(first.order_paid_cents)} ·{' '}
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
                            <span className={TICKET_PILL[t.status] ?? 'admin-pill'}>{sentence(t.status)}</span>
                        </td>
                        <td>{t.spot_no ?? '—'}</td>
                        <td>{t.tier_id ? (tierName.get(t.tier_id) ?? '—') : '—'}</td>
                        <td>{t.attendee_profile_id ? <HandleLink p={claimed} /> : '—'}</td>
                        <td>
                            {t.checked_in_at ? (
                                <span className="admin-pill neon">
                                    <Check {...ic} /> {formatClock(t.checked_in_at, timeZone)}
                                </span>
                            ) : (
                                '—'
                            )}
                        </td>
                        <td>{t.refund_cents ? money(t.refund_cents) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                            {t.status === 'confirmed' && t.order_id ? (
                                <TicketRefundButton eventId={eventId} ticketId={t.id} buyerHandle={buyer?.handle ?? null} />
                            ) : (
                                '—'
                            )}
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
