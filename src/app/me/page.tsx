/**
 * /me — member overview. Profile card, quick links, upcoming RSVPs, and recent
 * activity (latest tickets + appointments) pulled from the identity-scoped
 * loaders.
 */
import Link from 'next/link';
import { requireConsumer } from '@/lib/me-guard';
import {
    loadMyTickets,
    loadMyAppointments,
    loadMyUpcomingRsvps,
} from '@/lib/me-data';
import { resolveCover } from '@/lib/event-covers';
import { fmtDate, StatusPill, Panel, EmptyRow } from './ui';
import { HostPanel } from './HostPanel';

export const dynamic = 'force-dynamic';

export default async function MeOverview() {
    const profile = await requireConsumer('/me');
    const [tickets, appts, rsvps] = await Promise.all([
        loadMyTickets(),
        loadMyAppointments(profile.profileId),
        loadMyUpcomingRsvps(profile.profileId),
    ]);

    const recentTickets = tickets.slice(0, 4);
    const recentAppts = appts.slice(0, 4);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* PROFILE CARD */}
            <section
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 18,
                    border: '1px solid var(--line)',
                    background: 'var(--bg-1)',
                    padding: 20,
                }}
            >
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        border: '1px solid var(--line)',
                        background: profile.avatarUrl
                            ? `center/cover url(${profile.avatarUrl})`
                            : 'var(--bg-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--gold)',
                        fontSize: 22,
                        flexShrink: 0,
                    }}
                >
                    {!profile.avatarUrl && (profile.displayName?.[0] ?? '?').toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 20,
                            color: 'var(--text)',
                            letterSpacing: 1,
                        }}
                    >
                        {profile.displayName || 'Member'}
                    </div>
                    <div className="text-dim" style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
                        @{profile.handle}
                    </div>
                    {profile.email && (
                        <div className="text-dim" style={{ fontSize: 11 }}>
                            {profile.email}
                        </div>
                    )}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <Link
                        href={`/u/${profile.handle}`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        PUBLIC PROFILE
                    </Link>
                </div>
            </section>

            {/* QUICK LINKS */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                }}
            >
                <QuickLink href="/me/appointments" label="APPOINTMENTS" value={String(appts.length)} />
                <QuickLink href="/me/tickets" label="TICKETS" value={String(tickets.length)} />
                <QuickLink href="/me/orders" label="ORDERS" value="›" />
                <QuickLink href="/me/garage" label="GARAGE" value="›" />
            </div>

            {/* BECOME A HOST */}
            <HostPanel
                hostStatus={profile.hostStatus}
                nominated={profile.hostAppointedByShopId != null}
            />

            {/* UPCOMING RSVPS */}
            <Panel title="UPCOMING MEETS" href="/meets" hrefLabel="ALL MEETS">
                {rsvps.length === 0 ? (
                    <EmptyRow text="NO UPCOMING RSVPS" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {rsvps.map((r) => (
                            <Link
                                key={r.event_id}
                                href={`/event/${r.event_id}`}
                                style={rowStyle}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                    <div
                                        aria-hidden
                                        style={{
                                            flex: 'none',
                                            width: 52,
                                            height: 34,
                                            borderRadius: 3,
                                            border: '1px solid var(--line)',
                                            background: `url(${resolveCover(r.hero_image_url, r.type, r.event_id)}) center/cover no-repeat`,
                                        }}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ color: 'var(--text)', fontSize: 13 }}>
                                            {r.title ?? 'Meet'}
                                        </div>
                                        <div className="text-dim" style={{ fontSize: 11 }}>
                                            {r.location_name ?? '—'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="text-dim" style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                                        {fmtDate(r.start_at)}
                                    </div>
                                    {r.status && <StatusPill status={r.status} />}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </Panel>

            {/* RECENT ACTIVITY */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                <Panel title="RECENT TICKETS" href="/me/tickets" hrefLabel="ALL">
                    {recentTickets.length === 0 ? (
                        <EmptyRow text="NO TICKETS YET" />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {recentTickets.map((t) => (
                                <Link key={t.id} href={`/me/tickets/${t.id}`} style={rowStyle}>
                                    <div>
                                        <div style={{ color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>
                                            {t.ticket_id ?? '—'}
                                        </div>
                                        <div className="text-dim" style={{ fontSize: 11 }}>
                                            {t.shop?.name ?? 'Shop'} ·{' '}
                                            {[t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ') || '—'}
                                        </div>
                                    </div>
                                    <StatusPill status={t.status} />
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="RECENT APPOINTMENTS" href="/me/appointments" hrefLabel="ALL">
                    {recentAppts.length === 0 ? (
                        <EmptyRow text="NO APPOINTMENTS YET" />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {recentAppts.map((a) => (
                                <div key={a.id} style={rowStyle}>
                                    <div>
                                        <div style={{ color: 'var(--text)', fontSize: 13 }}>
                                            {a.service_type ?? 'Request'}
                                        </div>
                                        <div className="text-dim" style={{ fontSize: 11 }}>
                                            {a.shop?.name ?? 'Shop'} · {fmtDate(a.preferred_at)}
                                        </div>
                                    </div>
                                    <StatusPill status={a.status} />
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid var(--line)',
    textDecoration: 'none',
};

function QuickLink({ href, label, value }: { href: string; label: string; value: string }) {
    return (
        <Link
            href={href}
            style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-1)',
                padding: 16,
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
            }}
        >
            <span
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--text-3)',
                }}
            >
                {label}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--gold)' }}>
                {value}
            </span>
        </Link>
    );
}
