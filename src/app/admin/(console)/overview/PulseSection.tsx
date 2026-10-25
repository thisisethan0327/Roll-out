import { getPulse } from '@/lib/pulse';
import { SectionHead } from '@/components/glide-admin/parts';
import { InfoTip } from '@/components/glide/InfoTip';

/** $1,234 with cents only when the amount has them. */
function money(n: number): string {
    const hasCents = Math.round(n * 100) % 100 !== 0;
    return `$${n.toLocaleString('en-US', {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * PULSE — cross-ecosystem KPI band. Server-rendered; every source is fetched and
 * cached in `getPulse` (5-min in-memory) and tolerates individual failure — a
 * dead source shows "—" with a small note, never breaks the page.
 */
export default async function PulseSection() {
    const p = await getPulse();
    const s = p.signups;
    const signup7 = s.portal.d7 + s.staff.d7 + s.rollout.d7;
    const signup30 = s.portal.d30 + s.staff.d30 + s.rollout.d30;
    const currency = (p.store.currency ?? 'usd').toUpperCase();

    return (
        <>
            <SectionHead
                title={
                    <>
                        Pulse <InfoTip label="About Pulse" text="Numbers across the ecosystem over 7 and 30 days, cached for 5 minutes." />
                    </>
                }
            />

            <div className="admin-stat-grid">
                {/* 1 · REVENUE (EMWRAPS) */}
                <Tile
                    label="Revenue · EMWRAPS"
                    value={p.revenue.error ? '—' : money(p.revenue.outstanding)}
                    accent="gold"
                    error={p.revenue.error}
                    sub={
                        p.revenue.error ? null : (
                            <>
                                <span className="k">{money(p.revenue.thisMonthCollected)}</span> collected this month
                                <br />
                                <span className="k">{money(p.revenue.totalInvoiced)}</span> invoiced ·{' '}
                                <span className="k">{money(p.revenue.collectedAllTime)}</span> collected all-time
                                <br />
                                outstanding balance shown above
                            </>
                        )
                    }
                />

                {/* 2 · STORE REVENUE (Medusa, sandbox) */}
                <Tile
                    label="Store revenue"
                    tag={{ text: 'Sandbox', kind: 'sandbox' }}
                    value={p.store.error ? '—' : money(p.store.storeRevenue.d30.subtotal)}
                    accent="gold"
                    error={p.store.error}
                    sub={
                        p.store.error ? null : (
                            <>
                                <span className="k">7d</span> {money(p.store.storeRevenue.d7.subtotal)} ·{' '}
                                {p.store.storeRevenue.d7.count} orders
                                <br />
                                <span className="k">30d</span> {money(p.store.storeRevenue.d30.subtotal)} ·{' '}
                                {p.store.storeRevenue.d30.count} orders <span className="sep">·</span> {currency} item
                                subtotal
                            </>
                        )
                    }
                />

                {/* 3 · TICKETS */}
                <Tile
                    label="Active jobs · EMWRAPS"
                    value={p.tickets.error ? '—' : p.tickets.active}
                    error={p.tickets.error}
                    sub={
                        p.tickets.error ? null : (
                            <>
                                <span className="k">{p.tickets.pending}</span> pending{' '}
                                <span className="sep">·</span> <span className="k">{p.tickets.in_progress}</span>{' '}
                                in-progress
                                <br />
                                {p.tickets.quote} quote <span className="sep">·</span> {p.tickets.estimate} estimate{' '}
                                <span className="sep">·</span> {p.tickets.completed} completed
                            </>
                        )
                    }
                />

                {/* 4 · ORDERS AWAITING FULFILLMENT */}
                <Tile
                    label="Orders awaiting fulfillment"
                    value={p.store.error ? '—' : p.store.unfulfilled.total}
                    accent={!p.store.error && p.store.unfulfilled.total > 0 ? 'warn' : undefined}
                    error={p.store.error}
                    sub={
                        p.store.error ? null : (
                            <>
                                {p.store.unfulfilled.byVendor.map((v, i) => (
                                    <span key={v.key}>
                                        {i > 0 && <span className="sep">·</span>}
                                        <span className="k">{v.label}</span> {v.count}{' '}
                                    </span>
                                ))}
                                <br />
                                paid, not yet shipped
                            </>
                        )
                    }
                />

                {/* 5 · SIGNUPS */}
                <Tile
                    label="Signups · 7 days"
                    value={s.error ? '—' : signup7}
                    error={s.error}
                    sub={
                        s.error ? null : (
                            <>
                                <span className="k">{s.portal.d7}</span> portal{' '}
                                <span className="sep">·</span> <span className="k">{s.staff.d7}</span> staff{' '}
                                <span className="sep">·</span> <span className="k">{s.rollout.d7}</span> rollout
                                <br />
                                <span className="k">{signup30}</span> in last 30d
                            </>
                        )
                    }
                />

                {/* 6 · EVENTS */}
                <Tile
                    label="Upcoming events"
                    value={p.events.error ? '—' : p.events.upcomingEvents}
                    error={p.events.error}
                    sub={
                        p.events.error ? null : (
                            <>
                                <span className="k">{p.events.upcomingRsvps}</span> RSVPs upcoming
                                <br />
                                <span className="k">{p.events.totalRsvps}</span> RSVPs total
                            </>
                        )
                    }
                />

                {/* 7 · TRAFFIC (GA4) — degraded by default */}
                <div className="admin-stat">
                    <div className="admin-stat-lbl">Traffic · GA4 · 7 days</div>
                    {p.ga4.connected ? (
                        <>
                            <div className="admin-stat-num">
                                {(p.ga4.sessions ?? 0).toLocaleString('en-US')}
                            </div>
                            <div className="admin-stat-sub">
                                <span className="k">sessions</span> <span className="sep">·</span>{' '}
                                {(p.ga4.totalUsers ?? 0).toLocaleString('en-US')} users
                                <br />
                                {(p.ga4.pageViews ?? 0).toLocaleString('en-US')} pageviews
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="admin-stat-connect">Connect GA4</div>
                            <div className="admin-stat-sub">
                                Server-side GA4 not configured. Add a service account
                                <br />
                                (GA4_PROPERTY_ID + GOOGLE_SERVICE_ACCOUNT_JSON) to light this up.
                            </div>
                            {p.ga4.error && <div className="admin-stat-note">{p.ga4.error}</div>}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function Tile({
    label,
    value,
    accent,
    sub,
    error,
    tag,
}: {
    label: string;
    value: number | string;
    accent?: 'gold' | 'warn';
    sub?: React.ReactNode;
    error?: string | null;
    tag?: { text: string; kind?: 'sandbox' };
}) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">
                {label}
                {tag && <span className={`admin-stat-tag ${tag.kind ?? ''}`}>{tag.text}</span>}
            </div>
            <div className={`admin-stat-num ${error ? '' : accent ?? ''}`}>{value}</div>
            {sub && <div className="admin-stat-sub">{sub}</div>}
            {error && <div className="admin-stat-note">{error}</div>}
        </div>
    );
}
