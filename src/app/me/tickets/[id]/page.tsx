/**
 * /me/tickets/[id] — customer-facing ticket detail. Status, vehicle, services,
 * check-in records with photos (ticket-media public URLs), an invoices summary,
 * a customer-appropriate activity list, and the customer↔shop chat.
 *
 * Every read is via the anon SSR client (RLS-enforced). loadTicketDetail returns
 * null when the ticket isn't the caller's → notFound(). A member hitting another
 * member's ticket id therefore gets a 404, not their data.
 *
 * Glide: page head with the ticket number and status, cards of rows on the
 * left (vehicle, services, inspections, messages) and status, invoices and
 * activity on the right.
 */
import { notFound } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import { loadTicketDetail } from '@/lib/me-data';
import { fmtDate, fmtDay, money, statusVariant } from '../../ui';
import { PortalChat } from './PortalChat';
import { parseServices, lineTotal, visibleLines, serviceDisplayName } from '@/lib/ticket-services';
import { Card } from '@/components/glide/primitives';
import { PageHead, StatusChip, statusLabel, toneFromVariant } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

function Status({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    return <StatusChip label={statusLabel(status)} tone={toneFromVariant(statusVariant(status))} />;
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="gt-card-sub" style={{ paddingTop: 8, paddingBottom: 22 }}>{children}</p>;
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
    // Canonical parse of the shared emwraps `tickets.services` contract. Skip
    // tombstoned lines (deleted:true) and prefer an authored `spec.short` when
    // present; else the parser's `service` (breadcrumb).
    const services = visibleLines(parseServices(t.services)).map((line) => ({
        name: serviceDisplayName(line),
        quantity: line.quantity,
        total: lineTotal(line),
    }));

    return (
        <div className="glide glide-page gt-page--me">
            <PageHead
                back={{ href: '/me/tickets', label: 'All tickets' }}
                title={t.ticket_id ?? '—'}
                code
                meta={
                    <>
                        <Status status={t.status} />
                        <span>{shop?.name ?? 'Shop'}</span>
                    </>
                }
            />

            <div className="gt-cols">
                {/* LEFT */}
                <div className="gt-stack">
                    <Card as="section" className="gt-card" aria-labelledby="tk-vehicle">
                        <h2 className="g-card-h" id="tk-vehicle">
                            Vehicle
                        </h2>
                        <ul className="gt-kv">
                            <li>
                                <span>Vehicle</span>
                                <b>{vehicle || '—'}</b>
                            </li>
                            <li>
                                <span>Trim</span>
                                <b>{t.trim ?? '—'}</b>
                            </li>
                            <li>
                                <span>Color</span>
                                <b>{t.color ?? '—'}</b>
                            </li>
                            {t.vin && (
                                <li>
                                    <span>VIN</span>
                                    <b className="g-w">{t.vin}</b>
                                </li>
                            )}
                        </ul>
                    </Card>

                    <Card as="section" className="gt-card" aria-labelledby="tk-services">
                        <h2 className="g-card-h" id="tk-services">
                            Services
                        </h2>
                        {services.length === 0 ? (
                            <Empty>No services listed.</Empty>
                        ) : (
                            <ul className="gt-kv">
                                {services.map((s, i) => (
                                    <li key={i}>
                                        <span style={{ flex: 1, minWidth: 0, color: 'var(--ink)' }}>
                                            {s.name || 'Service'}
                                            {s.quantity && s.quantity > 1 ? ` ×${s.quantity}` : ''}
                                        </span>
                                        {s.total != null && <b className="g-w">${Number(s.total).toFixed(2)}</b>}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {t.total_price != null && (
                            <ul className="gt-sum" style={{ marginBottom: 18 }}>
                                <li className="is-all">
                                    <span>Total</span>
                                    <span className="g-w">{money(t.total_price)}</span>
                                </li>
                            </ul>
                        )}
                    </Card>

                    <Card as="section" className="gt-card" aria-labelledby="tk-insp" style={{ paddingBottom: 16 }}>
                        <h2 className="g-card-h" id="tk-insp">
                            Inspections
                        </h2>
                        {checkins.length === 0 ? (
                            <Empty>No inspection records yet.</Empty>
                        ) : (
                            <ul className="gt-insp">
                                {checkins.map((c: any) => {
                                    const media = Array.isArray(c.media) ? c.media : [];
                                    return (
                                        <li key={c.id}>
                                            <div className="gt-insp-h">
                                                <StatusChip label={statusLabel(String(c.label ?? c.type ?? 'Check'))} tone="ok" />
                                                <small>{fmtDate(c.created_at)}</small>
                                            </div>
                                            {(c.odometer || c.fuel_level) && (
                                                <p>
                                                    {c.odometer ? `Odometer: ${c.odometer}` : ''}
                                                    {c.odometer && c.fuel_level ? ' · ' : ''}
                                                    {c.fuel_level ? `Fuel: ${c.fuel_level}` : ''}
                                                </p>
                                            )}
                                            {c.condition_notes && <p style={{ color: 'var(--ink)' }}>{c.condition_notes}</p>}
                                            {media.length > 0 && (
                                                <div className="gt-photos">
                                                    {media.map((m: any, i: number) =>
                                                        m?.url ? (
                                                            <a key={i} href={m.url} target="_blank" rel="noreferrer">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={m.url} alt={`Photo ${i + 1}`} />
                                                            </a>
                                                        ) : null,
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>

                    <Card as="section" className="gt-card" aria-labelledby="tk-msgs" style={{ paddingBottom: 18 }}>
                        <h2 className="g-card-h" id="tk-msgs">
                            Messages
                        </h2>
                        <PortalChat ticketId={t.id} messages={messages as any} />
                    </Card>
                </div>

                {/* RIGHT */}
                <aside className="gt-stack">
                    <Card as="section" className="gt-card" aria-labelledby="tk-status">
                        <h2 className="g-card-h" id="tk-status">
                            Status
                        </h2>
                        <ul className="gt-kv">
                            <li>
                                <span>Status</span>
                                <Status status={t.status} />
                            </li>
                            {t.service_day && (
                                <li>
                                    <span>Service day</span>
                                    <b>{fmtDay(t.service_day)}</b>
                                </li>
                            )}
                            {t.end_date && (
                                <li>
                                    <span>Estimated done</span>
                                    <b>{fmtDay(t.end_date)}</b>
                                </li>
                            )}
                            <li>
                                <span>Opened</span>
                                <b>{fmtDay(t.created_at)}</b>
                            </li>
                        </ul>
                    </Card>

                    <Card as="section" className="gt-card" aria-labelledby="tk-inv">
                        <h2 className="g-card-h" id="tk-inv">
                            Invoices
                        </h2>
                        {invoices.length === 0 ? (
                            <Empty>No invoices yet.</Empty>
                        ) : (
                            <ul className="gt-lines">
                                {invoices.map((inv: any) => (
                                    <li key={inv.id} className="gt-line" style={{ paddingLeft: 24 }}>
                                        <span className="gt-line-t">
                                            <b>
                                                {inv.type ? `${statusLabel(String(inv.type))} · ` : ''}
                                                {inv.invoice_date ? fmtDay(inv.invoice_date) : fmtDay(inv.created_at)}
                                            </b>
                                            {inv.amount_paid != null && Number(inv.amount_paid) > 0 && (
                                                <small>
                                                    Paid {money(inv.amount_paid)}
                                                    {inv.paid_at ? ` · ${fmtDay(inv.paid_at)}` : ''}
                                                </small>
                                            )}
                                            <span style={{ display: 'block', marginTop: 6 }}>
                                                <Status status={inv.status} />
                                            </span>
                                        </span>
                                        <span className="gt-line-v g-w">{money(inv.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card as="section" className="gt-card" aria-labelledby="tk-act">
                        <h2 className="g-card-h" id="tk-act">
                            Activity
                        </h2>
                        {activity.length === 0 ? (
                            <Empty>No activity yet.</Empty>
                        ) : (
                            <ul className="gt-activity">
                                {activity.map((a: any) => (
                                    <li key={a.id}>
                                        <small>{fmtDate(a.created_at)}</small>
                                        <p>
                                            {a.title ?? a.type}
                                            {a.description ? ` — ${a.description}` : ''}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </aside>
            </div>
        </div>
    );
}
