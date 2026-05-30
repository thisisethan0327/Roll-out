/**
 * /shop/[slug]/tickets/[id]/invoice — printable invoice for a ticket.
 *
 * Reads the shared public.tickets row + rollout.shops branding, renders a
 * white-on-dark-agnostic invoice document, and offers a browser print dialog
 * (Save as PDF). Chrome (sidebar, buttons) is hidden in @media print.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { PrintButton } from './PrintButton';

export const metadata = { title: 'Invoice' };

type LineItem = { name: string; qty: number; price: number | null };

function parseServices(services: any): LineItem[] {
    if (!Array.isArray(services)) return [];
    return services.map((s: any) => {
        if (s && typeof s === 'object') {
            return {
                name: String(s.name ?? s.notes ?? 'Service'),
                qty: s.qty != null ? Number(s.qty) : 1,
                price: s.price != null && !Number.isNaN(Number(s.price)) ? Number(s.price) : null,
            };
        }
        return { name: String(s), qty: 1, price: null };
    });
}

function money(n: number | null | undefined): string {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return `$${Number(n).toFixed(2)}`;
}

function invoiceDate(iso: string | null): string {
    const d = iso ? new Date(iso) : new Date();
    try {
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'America/Los_Angeles',
        });
    } catch {
        return '';
    }
}

export default async function TicketInvoicePage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    const pub = getSupabasePublicAdmin();
    const admin = getSupabaseAdmin();
    const [ticketRes, shopRes] = await Promise.all([
        pub.from('tickets').select('*').eq('id', id).eq('shop_id', shop.shopId).maybeSingle(),
        admin
            .from('shops')
            .select('name, slug, primary_color, from_name, email_logo_url, support_email, region')
            .eq('id', shop.shopId)
            .maybeSingle(),
    ]);

    const t = ticketRes.data as any;
    if (!t) notFound();
    const branding = (shopRes.data ?? {}) as any;

    const accent = branding.primary_color || '#ffb733';
    const shopName = branding.from_name || branding.name || shop.name;
    const vehicle = [t.car_year, t.car_make, t.car_model, t.trim].filter(Boolean).join(' ');
    const lineItems = parseServices(t.services);
    const itemsSubtotal = lineItems.reduce(
        (sum, li) => (li.price != null ? sum + li.price * (li.qty || 1) : sum),
        0,
    );
    const total = t.total_price != null ? Number(t.total_price) : itemsSubtotal;
    const hasPrices = lineItems.some((li) => li.price != null);

    return (
        <>
            <style
                dangerouslySetInnerHTML={{
                    __html: `
@media print {
  .shop-sidebar, .admin-sidebar, .no-print { display: none !important; }
  .admin-main, .shop-layout, .admin-layout { padding: 0 !important; margin: 0 !important; display: block !important; }
  body { background: #fff !important; }
  @page { margin: 16mm; }
}`,
                }}
            />

            <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <Link
                    href={`/shop/${slug}/tickets/${id}`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ BACK TO TICKET
                </Link>
                <PrintButton />
            </div>

            {/* INVOICE DOCUMENT — explicit light palette so it reads as paper on screen + print */}
            <div
                className="invoice-doc"
                style={{
                    maxWidth: 800,
                    margin: '0 auto',
                    background: '#ffffff',
                    color: '#111111',
                    border: '1px solid #e2e2e2',
                    padding: '40px 44px',
                    fontFamily: 'var(--font-body, sans-serif)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${accent}`, paddingBottom: 20, marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
                    <div>
                        {branding.email_logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={branding.email_logo_url} alt={shopName} style={{ maxHeight: 56, marginBottom: 8 }} />
                        ) : (
                            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{shopName}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                            @{branding.slug || shop.slug}
                            {branding.region ? ` · ${branding.region}` : ''}
                            {branding.support_email ? ` · ${branding.support_email}` : ''}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 3, color: accent }}>INVOICE</div>
                        <div style={{ fontSize: 13, fontFamily: 'monospace', marginTop: 6 }}>{t.ticket_id ?? id}</div>
                        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{invoiceDate(t.created_at)}</div>
                    </div>
                </div>

                {/* Bill to + vehicle */}
                <div style={{ display: 'flex', gap: 40, marginBottom: 28, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 200 }}>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Bill To</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{t.customer_name || '—'}</div>
                        {t.email ? <div style={{ fontSize: 13, color: '#555' }}>{t.email}</div> : null}
                        {t.phone ? <div style={{ fontSize: 13, color: '#555' }}>{t.phone}</div> : null}
                    </div>
                    {vehicle ? (
                        <div style={{ minWidth: 200 }}>
                            <div style={{ fontSize: 10, letterSpacing: 2, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Vehicle</div>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{vehicle}</div>
                            {t.color ? <div style={{ fontSize: 13, color: '#555' }}>{t.color}</div> : null}
                            {t.vin ? <div style={{ fontSize: 12, color: '#777', fontFamily: 'monospace' }}>VIN {t.vin}</div> : null}
                        </div>
                    ) : null}
                </div>

                {/* Line items */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #222', textAlign: 'left' }}>
                            <th style={{ padding: '8px 0', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#666' }}>Description</th>
                            <th style={{ padding: '8px 0', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#666', textAlign: 'center', width: 60 }}>Qty</th>
                            <th style={{ padding: '8px 0', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#666', textAlign: 'right', width: 110 }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.length === 0 ? (
                            <tr>
                                <td colSpan={3} style={{ padding: '14px 0', color: '#888' }}>No itemized services.</td>
                            </tr>
                        ) : (
                            lineItems.map((li, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '10px 0' }}>{li.name}</td>
                                    <td style={{ padding: '10px 0', textAlign: 'center' }}>{li.qty || 1}</td>
                                    <td style={{ padding: '10px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                                        {li.price != null ? money(li.price * (li.qty || 1)) : '—'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                    <div style={{ minWidth: 240 }}>
                        {hasPrices && Math.abs(itemsSubtotal - total) > 0.001 ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', padding: '4px 0' }}>
                                <span>Subtotal</span>
                                <span style={{ fontFamily: 'monospace' }}>{money(itemsSubtotal)}</span>
                            </div>
                        ) : null}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #222', marginTop: 8, paddingTop: 12 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Total</span>
                            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: accent }}>{money(total)}</span>
                        </div>
                    </div>
                </div>

                {t.notes ? (
                    <div style={{ marginTop: 32, borderTop: '1px solid #eee', paddingTop: 16 }}>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                        <div style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.notes}</div>
                    </div>
                ) : null}

                <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: '#999', letterSpacing: 1 }}>
                    THANK YOU FOR YOUR BUSINESS · {shopName.toUpperCase()}
                </div>
            </div>
        </>
    );
}
