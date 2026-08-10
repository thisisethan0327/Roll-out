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
import { fmtDate, fmtDay, StatusPill, EmptyRow } from '../../ui';

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

const SECTION: React.CSSProperties = {
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    padding: 16,
};
const SECTION_TITLE: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: 10,
    letterSpacing: 'var(--track-widest)',
    color: 'var(--text-3)',
    marginBottom: 12,
};

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
            <div>
                <BackLink />
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">ORDER</div>
                        <div className="admin-page-sub text-dim">{result.note}</div>
                    </div>
                </div>
                <EmptyRow text="ORDER UNAVAILABLE" />
            </div>
        );
    }
    // Not the caller's order (or unknown) → real 404.
    if (result.notFound || !result.order) notFound();

    const o = result.order;
    const cur = o.currency_code;
    const vendorShop = await resolveVendorHandle(o.vendor);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
                <BackLink />
                <div className="admin-page-head" style={{ marginTop: 8 }}>
                    <div>
                        <div
                            className="admin-page-title"
                            style={{ fontFamily: 'var(--font-mono, monospace)' }}
                        >
                            #{o.display_id ?? o.id.slice(-8)}
                        </div>
                        <div className="admin-page-sub text-dim">
                            {fmtDate(o.created_at)}
                            {vendorShop ? ' · ' : o.vendor ? ` · ${o.vendor}` : ''}
                            {vendorShop && (
                                <Link href={`/u/${vendorShop.handle}`} className="text-link" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                                    {vendorShop.name}
                                </Link>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {o.payment_status && <StatusPill status={o.payment_status} />}
                        {o.fulfillment_status && <StatusPill status={o.fulfillment_status} />}
                    </div>
                </div>
            </div>

            {/* STATUS */}
            <section style={SECTION}>
                <div style={SECTION_TITLE}>STATUS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                    <div>
                        <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 1 }}>
                            {pay.label.toUpperCase()}
                        </div>
                        {pay.detail && (
                            <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>{pay.detail}</div>
                        )}
                    </div>
                    <div>
                        <div style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 1 }}>
                            {ful.label.toUpperCase()}
                        </div>
                        {ful.detail && (
                            <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>{ful.detail}</div>
                        )}
                    </div>
                </div>

                {/* Timeline */}
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {timeline.map((step, i) => (
                        <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                                <span
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        marginTop: 3,
                                        background: step.done ? 'var(--gold)' : 'transparent',
                                        border: '1px solid ' + (step.done ? 'var(--gold)' : 'var(--line-mid)'),
                                        flexShrink: 0,
                                    }}
                                />
                                {i < timeline.length - 1 && (
                                    <span style={{ width: 1, flex: 1, minHeight: 20, background: 'var(--line)' }} />
                                )}
                            </div>
                            <div style={{ paddingBottom: 12 }}>
                                <div
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 11,
                                        letterSpacing: 'var(--track-wider)',
                                        color: step.done ? 'var(--text)' : 'var(--text-3)',
                                    }}
                                >
                                    {step.label}
                                </div>
                                <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                    {step.at ? fmtDate(step.at) : step.done ? '—' : 'Pending'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ITEMS */}
            <section style={SECTION}>
                <div style={SECTION_TITLE}>ITEMS ({o.items.length})</div>
                {o.items.length === 0 ? (
                    <EmptyRow text="NO ITEMS" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {o.items.map((it) => (
                            <div
                                key={it.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}
                            >
                                {it.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={it.thumbnail} alt="" style={{ width: 44, height: 44, objectFit: 'cover', border: '1px solid var(--line)' }} />
                                ) : (
                                    <div style={{ width: 44, height: 44, background: 'var(--bg-2)', border: '1px solid var(--line)' }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{it.title ?? 'Item'}</div>
                                    <div className="text-dim" style={{ fontSize: 11 }}>Qty {it.quantity ?? 1}</div>
                                </div>
                                <div className="text-dim" style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {formatMoney(it.unit_price, cur)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Totals */}
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line-mid)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <TotalRow label="SUBTOTAL" value={formatMoney(o.subtotal, cur)} />
                    {o.discount_total ? <TotalRow label="DISCOUNT" value={`- ${formatMoney(o.discount_total, cur)}`} /> : null}
                    <TotalRow label="SHIPPING" value={formatMoney(o.shipping_total, cur)} />
                    {o.tax_total ? <TotalRow label="TAX" value={formatMoney(o.tax_total, cur)} /> : null}
                    <TotalRow label="TOTAL" value={formatMoney(o.total, cur)} strong />
                </div>
            </section>

            {/* SHIPPING + PAYMENT */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                <section style={SECTION}>
                    <div style={SECTION_TITLE}>SHIPPING</div>
                    {o.shipping_address ? (
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                            {formatAddress(o.shipping_address).map((line, i) => (
                                <div key={i}>{line}</div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-dim" style={{ fontSize: 12 }}>No shipping address on file.</div>
                    )}
                    {o.shipping_methods.length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                            {o.shipping_methods.map((m) => (
                                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span className="text-dim">{m.name ?? 'Shipping'}</span>
                                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>
                                        {formatMoney(m.amount, cur)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {trackingLinks.length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                            <div style={{ ...SECTION_TITLE, marginBottom: 8 }}>TRACKING</div>
                            {trackingLinks.map((t, i) => (
                                <div key={i} style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', marginTop: i ? 4 : 0 }}>
                                    {t.url ? (
                                        <a
                                            href={t.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-link"
                                            style={{ color: 'var(--gold)', textDecoration: 'none' }}
                                        >
                                            {t.number ?? 'Track shipment'} ↗
                                        </a>
                                    ) : (
                                        <span style={{ color: 'var(--text)' }}>{t.number}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section style={SECTION}>
                    <div style={SECTION_TITLE}>PAYMENT</div>
                    {o.payments.length === 0 ? (
                        <div className="text-dim" style={{ fontSize: 12 }}>
                            {pay.detail || 'No payment details available for this order.'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {o.payments.map((p) => (
                                <div key={p.id} style={{ fontSize: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span className="text-dim">{providerLabel(p.provider_id)}</span>
                                        <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>
                                            {formatMoney(p.amount, p.currency_code)}
                                        </span>
                                    </div>
                                    {p.cardBrand && p.cardLast4 && (
                                        <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                            {p.cardBrand.toUpperCase()} ···· {p.cardLast4}
                                        </div>
                                    )}
                                    <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                        {p.captured_at
                                            ? `Charged ${fmtDay(p.captured_at)}`
                                            : p.canceled_at
                                                ? `Canceled ${fmtDay(p.canceled_at)}`
                                                : 'Authorized — charged when the order ships'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function BackLink() {
    return (
        <Link
            href="/me/orders"
            className="text-link"
            style={{
                fontFamily: 'var(--font-display)',
                fontSize: 10,
                letterSpacing: 'var(--track-wider)',
                textDecoration: 'none',
                color: 'var(--text-2)',
            }}
        >
            ‹ ALL ORDERS
        </Link>
    );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: strong ? 11 : 10,
                    letterSpacing: 'var(--track-wider)',
                    color: strong ? 'var(--text)' : 'var(--text-3)',
                }}
            >
                {label}
            </span>
            <span
                style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: strong ? 16 : 13,
                    color: strong ? 'var(--gold)' : 'var(--text-2)',
                }}
            >
                {value}
            </span>
        </div>
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
