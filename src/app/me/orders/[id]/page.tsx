/**
 * /me/orders/[id] — a single Medusa order for the signed-in member.
 *
 * Data comes exclusively from the authenticated customer's STORE token
 * (loadMyOrder → Supabase→Medusa exchange). Ownership is enforced by Medusa:
 * a foreign / unknown order id comes back as notFound and we render Next's 404,
 * so this page never reveals another customer's order. No admin API is used, so
 * anything the store API withholds (e.g. card brand/last4) simply renders as a
 * graceful fallback.
 *
 * Vendor shop is linked to its public /u/[handle] via the read-only selling-shop
 * registry (getSellingShops) — matched on slug / handle / name.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import {
    loadMyOrder,
    formatMoney,
    paymentStatusCopy,
    fulfillmentStatusCopy,
    type MedusaAddress,
} from '@/lib/medusa-customer';
import { getSellingShops } from '@/lib/store-shops';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { refundPolicyShortLine, REFUND_POLICY_PATH } from '@/lib/refund-policy';
import { ticketsForOrder, sizeLabel } from '@/lib/event-tickets';
import { fmtDate, fmtDay, statusVariant } from '../../ui';
import { ArrowUpRight, Check, Circle, CreditCard, Package, Unplug, Users } from 'lucide-react';
import { Card } from '@/components/glide/primitives';
import { EmptyState, PageHead, StatusChip, statusLabel, toneFromVariant } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

/** Resolve the order's vendor string to a selling shop (for /u/[handle]). */
async function resolveVendorHandle(vendor: string | null): Promise<{ name: string; handle: string } | null> {
    if (!vendor) return null;
    const v = vendor.trim().toLowerCase();
    try {
        const shops = await getSellingShops();
        const match =
            shops.find((s) => s.slug.toLowerCase() === v || s.handle.toLowerCase() === v) ??
            shops.find((s) => s.name.toLowerCase() === v);
        if (match) return { name: match.name, handle: match.handle };
    } catch {
        /* registry unavailable — fall through to a plain label */
    }
    return null;
}

function formatAddress(a: MedusaAddress): string[] {
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
    const cityLine = [a.city, a.province, a.postal_code].filter(Boolean).join(', ');
    const country = a.country_code ? a.country_code.toUpperCase() : '';
    return [name, a.company, a.address_1, a.address_2, cityLine, country, a.phone].filter(
        (l): l is string => Boolean(l && l.trim()),
    );
}

export default async function OrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    await requireConsumer(`/me/orders/${id}`);
    const result = await loadMyOrder(id);

    // Store account not linked / exchange failed → not a 404, show guidance.
    if (!result.exchanged) {
        return (
            <div className="glide glide-page gt-page--me">
                <PageHead back={BACK} title="Order" />
                <EmptyState icon={<Unplug size={28} strokeWidth={1.5} />} title="Order unavailable" blocker={result.note ?? undefined} />
            </div>
        );
    }
    // Not the caller's order (or unknown) → real 404.
    if (result.notFound || !result.order) notFound();

    const o = result.order;
    const cur = o.currency_code;
    const vendorShop = await resolveVendorHandle(o.vendor);

    // Paid-event ticket (077) — the refund policy line, with the event's
    // OWN cutoff date. Read-only public-ish event fields via the admin
    // client (same pattern the public event page uses); best-effort — a
    // failed lookup just omits the line rather than failing the order page.
    let refundPolicyLine: string | null = null;
    if (o.is_event && o.event_id) {
        try {
            const admin = getSupabaseAdmin();
            const { data: ev } = await admin
                .from('events')
                .select('start_at, time_zone, reservation_policy')
                .eq('id', o.event_id)
                .maybeSingle();
            if (ev) {
                refundPolicyLine = refundPolicyShortLine(
                    (ev as any).start_at,
                    (ev as any).time_zone,
                    (ev as any).reservation_policy,
                );
            }
        } catch (e) {
            console.error('[me/orders/[id]] refund policy lookup failed:', (e as any)?.message ?? e);
        }
    }
    // Multi-ticket packages (feature-gated): the ATTENDEES table under an
    // event order that carries tickets. ticketsForOrder() is buyer-scoped
    // (my_tickets() itself), so a non-event order or a member who isn't the
    // buyer simply gets []; the section is omitted entirely in that case.
    const attendees = o.is_event ? await ticketsForOrder(o.id) : [];

    const pay = paymentStatusCopy(o.payment_status);
    const ful = fulfillmentStatusCopy(o.fulfillment_status);

    // Derive a placed → paid → shipped → delivered timeline with graceful
    // fallback: a step is "done" if we have a timestamp OR the status implies it.
    const capturedAt = o.payments.find((p) => p.captured_at)?.captured_at ?? null;
    const shippedAt = o.fulfillments.find((f) => f.shipped_at)?.shipped_at ?? null;
    const deliveredAt = o.fulfillments.find((f) => f.delivered_at)?.delivered_at ?? null;
    const trackingLinks = o.fulfillments.flatMap((f) => f.tracking ?? []);
    const payStatus = (o.payment_status ?? '').toLowerCase();
    const fulStatus = (o.fulfillment_status ?? '').toLowerCase();

    const timeline: { label: string; at: string | null; done: boolean }[] = [
        { label: 'PLACED', at: o.created_at, done: true },
        {
            label: payStatus === 'authorized' ? 'PAYMENT AUTHORIZED' : 'PAID',
            at: capturedAt,
            done: ['captured', 'authorized', 'partially_captured', 'refunded', 'partially_refunded'].includes(payStatus),
        },
        {
            label: 'SHIPPED',
            at: shippedAt,
            done: ['shipped', 'partially_shipped', 'delivered'].includes(fulStatus),
        },
        {
            label: 'DELIVERED',
            at: deliveredAt,
            done: fulStatus === 'delivered',
        },
    ];

    return (
        <div className="glide glide-page gt-page--me">
            <PageHead
                back={BACK}
                title={`#${o.display_id ?? o.id.slice(-8)}`}
                code
                meta={
                    <>
                        <span>
                            {fmtDate(o.created_at)}
                            {vendorShop ? ' · ' : o.vendor ? ` · ${o.vendor}` : ''}
                            {vendorShop && (
                                <Link href={`/u/${vendorShop.handle}`} style={{ color: 'var(--link)', fontWeight: 600 }}>
                                    {vendorShop.name}
                                </Link>
                            )}
                        </span>
                        {o.payment_status && <Status status={o.payment_status} />}
                        {o.fulfillment_status && <Status status={o.fulfillment_status} />}
                    </>
                }
            />

            <div className="gt-cols">
                <div className="gt-stack">
                    {/* STATUS */}
                    <Card as="section" className="gt-card" aria-labelledby="ord-status" style={{ paddingBottom: 10 }}>
                        <h2 className="g-card-h" id="ord-status">
                            Status
                        </h2>
                        <div className="gt-paystate">
                            <div>
                                <b>{pay.label}</b>
                                {pay.detail && <small>{pay.detail}</small>}
                            </div>
                            <div>
                                <b>{ful.label}</b>
                                {ful.detail && <small>{ful.detail}</small>}
                            </div>
                        </div>

                        {/* Timeline */}
                        <ol className="gt-tl" style={{ marginTop: 14 }}>
                            {timeline.map((step) => (
                                <li key={step.label} className={step.done ? 'is-done' : undefined}>
                                    <span className="gt-tl-dot" aria-hidden="true">
                                        {step.done ? <Check size={16} strokeWidth={2.6} /> : <Circle size={10} strokeWidth={3} />}
                                    </span>
                                    <span className="gt-tl-t">
                                        <b>
                                            {statusLabel(step.label)}
                                            <span className="g-sr">{step.done ? ', done' : ', not yet'}</span>
                                        </b>
                                        <small>{step.at ? fmtDate(step.at) : step.done ? '—' : 'Pending'}</small>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </Card>

                    {/* ITEMS */}
                    <Card as="section" className="gt-card" aria-labelledby="ord-items" style={{ paddingBottom: 18 }}>
                        <h2 className="g-card-h" id="ord-items">
                            Items <span className="g-w" style={{ fontSize: 14 }}>{o.items.length}</span>
                        </h2>
                        {o.items.length === 0 ? (
                            <p className="gt-card-sub">No items.</p>
                        ) : (
                            <ul className="gt-lines">
                                {o.items.map((it) => (
                                    <li key={it.id} className="gt-line">
                                        <span className="gt-thumb" aria-hidden="true">
                                            {it.thumbnail ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={it.thumbnail} alt="" />
                                            ) : (
                                            <Package size={20} strokeWidth={1.5} />
                                        )}
                                        </span>
                                        <span className="gt-line-t">
                                            <b>{it.title ?? 'Item'}</b>
                                            <small>Qty {it.quantity ?? 1}</small>
                                        </span>
                                        <span className="gt-line-v g-w">{formatMoney(it.unit_price, cur)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {/* Totals */}
                        <ul className="gt-sum" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                            <TotalRow label="Subtotal" value={formatMoney(o.subtotal, cur)} />
                            {o.discount_total ? <TotalRow label="Discount" value={`- ${formatMoney(o.discount_total, cur)}`} /> : null}
                            <TotalRow label="Shipping" value={formatMoney(o.shipping_total, cur)} />
                            {o.tax_total ? <TotalRow label="Tax" value={formatMoney(o.tax_total, cur)} /> : null}
                            <TotalRow label="Total" value={formatMoney(o.total, cur)} strong />
                        </ul>
                    </Card>

                    {/* ATTENDEES — multi-ticket packages (feature-gated) */}
                    {attendees.length > 0 ? (
                        <section className="gt-seats" aria-labelledby="ord-att">
                            <div className="gt-seats-h">
                                <span className="g-ic" aria-hidden="true">
                                    <Users size={20} strokeWidth={1.75} />
                                </span>
                                <b id="ord-att">
                                    Attendees <span className="g-w" style={{ fontSize: 13 }}>{attendees.length}</span>
                                </b>
                            </div>
                            {[...attendees].sort((a, b) => a.seat - b.seat).map((t) => (
                                <div key={t.ticketId} className="gt-seat">
                                    <span className="gt-seat-n" aria-hidden="true">
                                        {t.seat}
                                    </span>
                                    <span className="gt-seat-t">
                                        <b>
                                            <span className="g-sr">Seat {t.seat}: </span>
                                            {t.attendeeName || '—'}
                                        </b>
                                        <small>Sweater {sizeLabel(t.sweaterSize)}</small>
                                    </span>
                                    <Status status={t.status} />
                                </div>
                            ))}
                        </section>
                    ) : null}
                </div>

                <aside className="gt-stack">
                    {refundPolicyLine ? (
                        <Card as="section" className="gt-card" aria-labelledby="ord-policy" style={{ paddingBottom: 20 }}>
                            <h2 className="g-card-h" id="ord-policy">
                                Refunds &amp; cancellation
                            </h2>
                            <p className="gt-card-sub" style={{ marginTop: 10 }}>
                                {refundPolicyLine}{' '}
                                <Link href={REFUND_POLICY_PATH} style={{ color: 'var(--link)', fontWeight: 600 }}>
                                    Full policy
                                </Link>
                            </p>
                        </Card>
                    ) : null}

                    {/* SHIPPING */}
                    <Card as="section" className="gt-card" aria-labelledby="ord-ship" style={{ paddingBottom: 6 }}>
                        <h2 className="g-card-h" id="ord-ship">
                            Shipping
                        </h2>
                        {o.shipping_address ? (
                            <address className="gt-addr">
                                {formatAddress(o.shipping_address).map((line, i) => (
                                    <span key={i} style={{ display: 'block' }}>
                                        {line}
                                    </span>
                                ))}
                            </address>
                        ) : (
                            <p className="gt-card-sub" style={{ marginTop: 10 }}>
                                No shipping address on file.
                            </p>
                        )}
                        {o.shipping_methods.length > 0 || trackingLinks.length > 0 ? (
                            <ul className="gt-kv">
                                {o.shipping_methods.map((m) => (
                                    <li key={m.id}>
                                        <span>{m.name ?? 'Shipping'}</span>
                                        <b className="g-w">{formatMoney(m.amount, cur)}</b>
                                    </li>
                                ))}
                                {trackingLinks.map((t, i) => (
                                    <li key={`trk-${i}`}>
                                        <span>Tracking</span>
                                        {t.url ? (
                                            <a href={t.url} target="_blank" rel="noopener noreferrer">
                                                {t.number ?? 'Track shipment'}
                                                <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
                                            </a>
                                        ) : (
                                            <b className="g-w">{t.number}</b>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div style={{ height: 16 }} />
                        )}
                    </Card>

                    {/* PAYMENT */}
                    <Card as="section" className="gt-card" aria-labelledby="ord-pay" style={{ paddingBottom: 6 }}>
                        <h2 className="g-card-h" id="ord-pay">
                            Payment
                        </h2>
                        {o.payments.length === 0 ? (
                            <p className="gt-card-sub" style={{ marginTop: 10, paddingBottom: 16 }}>
                                {pay.detail || 'No payment details available for this order.'}
                            </p>
                        ) : (
                            <ul className="gt-lines">
                                {o.payments.map((p) => (
                                    <li key={p.id} className="gt-line" style={{ paddingLeft: 16 }}>
                                        <span className="g-ic g-ic--sm" aria-hidden="true">
                                            <CreditCard size={18} strokeWidth={1.75} />
                                        </span>
                                        <span className="gt-line-t">
                                            <b>{providerLabel(p.provider_id)}</b>
                                            {p.cardBrand && p.cardLast4 && (
                                                <small>
                                                    {p.cardBrand.toUpperCase()} ···· {p.cardLast4}
                                                </small>
                                            )}
                                            <small>
                                                {p.captured_at
                                                    ? `Charged ${fmtDay(p.captured_at)}`
                                                    : p.canceled_at
                                                        ? `Canceled ${fmtDay(p.canceled_at)}`
                                                        : 'Authorized — charged when the order ships'}
                                            </small>
                                        </span>
                                        <span className="gt-line-v g-w">{formatMoney(p.amount, p.currency_code)}</span>
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

const BACK = { href: '/me/orders', label: 'All orders' };

function Status({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    return <StatusChip label={statusLabel(status)} tone={toneFromVariant(statusVariant(status))} />;
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <li className={strong ? 'is-all' : undefined}>
            <span>{label}</span>
            <span className="g-w">{value}</span>
        </li>
    );
}

function providerLabel(provider: string | null): string {
    if (!provider) return 'Payment';
    const p = provider.toLowerCase();
    if (p.includes('stripe')) return 'Card · Stripe';
    if (p.includes('manual') || p.includes('system')) return 'Manual';
    if (p.includes('paypal')) return 'PayPal';
    return provider;
}
