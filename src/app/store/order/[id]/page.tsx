/**
 * /store/order/[id] — order confirmation.
 *
 * Shown after `completeCart` succeeds. Confirms the order id and points the
 * shopper to their email (the tenant-branded confirmation) and /me/orders.
 * Best-effort fetches the display number; renders fine without it (guest
 * orders aren't always readable by id via the store API).
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { MEDUSA_URL, medusaHeaders } from '@/lib/medusa';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Order confirmed · Rollout Store',
    robots: { index: false },
};

async function fetchDisplay(id: string): Promise<{ display: string | null; email: string | null }> {
    try {
        const res = await fetch(`${MEDUSA_URL}/store/orders/${id}?fields=id,display_id,email`, {
            headers: medusaHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) return { display: null, email: null };
        const json = await res.json();
        const o = json?.order;
        return {
            display: o?.display_id != null ? `#${o.display_id}` : null,
            email: o?.email ?? null,
        };
    } catch {
        return { display: null, email: null };
    }
}

export default async function OrderConfirmedPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const { display, email } = await fetchDisplay(id);

    return (
        <section className="section" style={{ padding: '72px 0' }}>
            <div className="container container-narrow" style={{ textAlign: 'center' }}>
                <div className="eyebrow eyebrow-gold mb-4" style={{ justifyContent: 'center' }}>
                    ／ ORDER CONFIRMED
                </div>
                <div style={{ fontSize: 44, color: 'var(--gold)', marginBottom: 12 }}>✓</div>
                <h1 style={{ letterSpacing: 1, margin: '0 0 14px' }}>THANK YOU</h1>
                <p style={{ color: 'var(--text-2)', fontSize: 16, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 8px' }}>
                    Your order is in. {display ? `Order ${display}.` : ''}
                </p>
                <p style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 28px' }}>
                    We’ve emailed a confirmation{email ? ` to ${email}` : ''} — check your inbox for
                    the receipt and shipping updates from the shop.
                </p>

                <div className="mono-row" style={{ justifyContent: 'center', fontSize: 11, marginBottom: 32 }}>
                    <span className="text-dim">ORDER ID</span>
                    <span className="sep" />
                    <span style={{ color: 'var(--text)' }}>{id}</span>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/store" className="btn btn-lg">CONTINUE SHOPPING</Link>
                    <Link href="/me/orders" className="btn-ghost" style={{ padding: '14px 24px' }}>
                        MY ORDERS
                    </Link>
                </div>
            </div>
        </section>
    );
}
