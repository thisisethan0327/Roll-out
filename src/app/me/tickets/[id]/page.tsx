/**
 * /me/tickets/[id] — customer-facing ticket detail. Status, vehicle, services,
 * check-in records with photos (ticket-media public URLs), an invoices summary,
 * a customer-appropriate activity list, and the customer↔shop chat.
 *
 * Every read is via the anon SSR client (RLS-enforced). loadTicketDetail returns
 * null when the ticket isn't the caller's → notFound(). A member hitting another
 * member's ticket id therefore gets a 404, not their data.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import { loadTicketDetail } from '@/lib/me-data';
import { fmtDate, fmtDay, money, StatusPill, EmptyRow, KV } from '../../ui';
import { PortalChat } from './PortalChat';
import { parseServices, lineTotal } from '@/lib/ticket-services';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: 'var(--track-widest)',
                    color: 'var(--text-3)',
                    marginBottom: 10,
                }}
            >
                {title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
        </section>
    );
}

export default async function MeTicketDetail({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    await requireConsumer(`/me/tickets/${id}`);
    const detail = await loadTicketDetail(id);
    if (!detail) notFound();

    const { ticket: t, shop, checkins, invoices, activity, messages } = detail;
    const vehicle = [t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ');
    // Canonical parse of the shared emwraps `tickets.services` contract. Prefer an
    // authored `spec.short` when present; else the parser's `service` (breadcrumb).
    const rawServices: any[] = Array.isArray(t.services) ? t.services : [];
    const services = parseServices(rawServices).map((line, i) => ({
        name: rawServices[i]?.spec?.short || line.service,
        quantity: line.quantity,
        total: lineTotal(line),
    }));

    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <Link
                        href="/me/tickets"
                        className="text-link"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wider)',
                            textDecoration: 'none',
                        }}
                    >
                        ‹ ALL TICKETS
                    </Link>
                    <div className="admin-page-title" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {t.ticket_id ?? '—'}
                    </div>
                    <div className="admin-page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StatusPill status={t.status} />
                        <span className="text-dim" style={{ fontSize: 12 }}>
                            {shop?.name ?? 'Shop'}
                        </span>
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)',
                    gap: 20,
                    alignItems: 'start',
                }}
            >
                {/* LEFT */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Section title="VEHICLE">
                        <KV label="VEHICLE" value={vehicle || '—'} />
                        <KV label="TRIM" value={t.trim ?? '—'} />
                        <KV label="COLOR" value={t.color ?? '—'} />
                        {t.vin && <KV label="VIN" value={t.vin} mono />}
                    </Section>

                    <Section title="SERVICES">
                        {services.length === 0 ? (
                            <EmptyRow text="NO SERVICES LISTED" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {services.map((s, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 10,
                                            fontSize: 13,
                                            borderBottom: '1px solid var(--line)',
                                            padding: '6px 0',
                                        }}
                                    >
                                        <span style={{ color: 'var(--text)' }}>
                                            {s.name || 'Service'}
                                            {s.quantity && s.quantity > 1 ? ` ×${s.quantity}` : ''}
                                        </span>
                                        {s.total != null && (
                                            <span
                                                className="text-dim"
                                                style={{ fontFamily: 'var(--font-mono, monospace)' }}
                                            >
                                                ${Number(s.total).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {t.total_price != null && (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginTop: 8,
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 12,
                                    letterSpacing: 'var(--track-wider)',
                                }}
                            >
                                <span style={{ color: 'var(--text-3)' }}>TOTAL</span>
                                <span style={{ color: 'var(--gold)' }}>{money(t.total_price)}</span>
                            </div>
                        )}
                    </Section>

                    <Section title="INSPECTIONS">
                        {checkins.length === 0 ? (
                            <EmptyRow text="NO INSPECTION RECORDS" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {checkins.map((c: any) => {
                                    const media = Array.isArray(c.media) ? c.media : [];
                                    return (
                                        <div
                                            key={c.id}
                                            style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', padding: 10 }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                <span className="admin-pill neon">
                                                    {String(c.label ?? c.type ?? 'CHECK').toUpperCase()}
                                                </span>
                                                <span className="text-dim" style={{ fontSize: 11 }}>
                                                    {fmtDate(c.created_at)}
                                                </span>
                                            </div>
                                            {(c.odometer || c.fuel_level) && (
                                                <div className="text-dim" style={{ fontSize: 11, marginTop: 6 }}>
                                                    {c.odometer ? `Odometer: ${c.odometer}` : ''}
                                                    {c.odometer && c.fuel_level ? ' · ' : ''}
                                                    {c.fuel_level ? `Fuel: ${c.fuel_level}` : ''}
                                                </div>
                                            )}
                                            {c.condition_notes && (
                                                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-2)' }}>
                                                    {c.condition_notes}
                                                </div>
                                            )}
                                            {media.length > 0 && (
                                                <div
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
                                                        gap: 6,
                                                        marginTop: 8,
                                                    }}
                                                >
                                                    {media.map((m: any, i: number) =>
                                                        m?.url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <a key={i} href={m.url} target="_blank" rel="noreferrer">
                                                                <img
                                                                    src={m.url}
                                                                    alt={`Photo ${i + 1}`}
                                                                    style={{
                                                                        width: '100%',
                                                                        aspectRatio: '1',
                                                                        objectFit: 'cover',
                                                                        border: '1px solid var(--line)',
                                                                    }}
                                                                />
                                                            </a>
                                                        ) : null,
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Section>

                    <Section title="MESSAGES">
                        <PortalChat ticketId={t.id} messages={messages as any} />
                    </Section>
                </div>

                {/* RIGHT */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Section title="STATUS">
                        <div><StatusPill status={t.status} /></div>
                        {t.service_day && <KV label="SERVICE DAY" value={fmtDay(t.service_day)} />}
                        {t.end_date && <KV label="ESTIMATED DONE" value={fmtDay(t.end_date)} />}
                        <KV label="OPENED" value={fmtDay(t.created_at)} />
                    </Section>

                    <Section title="INVOICES">
                        {invoices.length === 0 ? (
                            <EmptyRow text="NO INVOICES" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {invoices.map((inv: any) => (
                                    <div
                                        key={inv.id}
                                        style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', padding: 10 }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                            <StatusPill status={inv.status} />
                                            <span
                                                style={{
                                                    fontFamily: 'var(--font-mono, monospace)',
                                                    color: 'var(--gold)',
                                                    fontSize: 13,
                                                }}
                                            >
                                                {money(inv.amount)}
                                            </span>
                                        </div>
                                        <div className="text-dim" style={{ fontSize: 11, marginTop: 6 }}>
                                            {inv.type ? `${String(inv.type).toUpperCase()} · ` : ''}
                                            {inv.invoice_date ? fmtDay(inv.invoice_date) : fmtDay(inv.created_at)}
                                        </div>
                                        {inv.amount_paid != null && Number(inv.amount_paid) > 0 && (
                                            <div className="text-dim" style={{ fontSize: 11 }}>
                                                Paid: {money(inv.amount_paid)}
                                                {inv.paid_at ? ` · ${fmtDay(inv.paid_at)}` : ''}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section title="ACTIVITY">
                        {activity.length === 0 ? (
                            <EmptyRow text="NO ACTIVITY" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {activity.map((a: any) => (
                                    <div key={a.id} style={{ fontSize: 11, borderBottom: '1px solid var(--line)', padding: '5px 0' }}>
                                        <div className="text-dim" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                            {fmtDate(a.created_at)}
                                        </div>
                                        <div style={{ color: 'var(--text-2)', marginTop: 2 }}>
                                            {a.title ?? a.type}
                                            {a.description ? ` — ${a.description}` : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>
                </aside>
            </div>
        </div>
    );
}
