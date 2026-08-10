'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { updateLineItem, removeLineItem } from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { Cart } from '@/lib/medusa-types';
import { Dots } from '../_ui';

export function CartClient({ initialCart }: { initialCart: Cart | null }) {
    const router = useRouter();
    const [cart, setCart] = useState<Cart | null>(initialCart);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const currency = cart?.currencyCode ?? 'usd';

    const mutate = (fn: () => Promise<{ ok: boolean; data?: Cart; error?: string }>) => {
        setError(null);
        startTransition(async () => {
            const res = await fn();
            if (!res.ok) {
                setError(res.error ?? 'Something went wrong.');
                return;
            }
            setCart(res.data ?? null);
            router.refresh();
        });
    };

    if (!cart || cart.items.length === 0) {
        return (
            <div className="admin-empty" style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: 18 }}>Your bag is empty.</p>
                <Link href="/store" className="btn">
                    BROWSE THE STORE
                </Link>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {cart.vendor.name ? (
                <div className="mono-row" style={{ fontSize: 12 }}>
                    <span className="accent">SOLD BY</span>
                    <span className="sep" />
                    <span style={{ color: 'var(--text)' }}>{cart.vendor.name}</span>
                </div>
            ) : null}

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    opacity: pending ? 0.6 : 1,
                    transition: 'opacity 120ms ease',
                }}
                aria-busy={pending}
            >
                {cart.items.map((it) => (
                    <div
                        key={it.id}
                        style={{
                            display: 'flex',
                            gap: 16,
                            alignItems: 'center',
                            padding: 14,
                            background: 'var(--bg-2)',
                            border: '1px solid var(--line)',
                        }}
                    >
                        <div
                            style={{
                                position: 'relative',
                                width: 72,
                                height: 72,
                                flexShrink: 0,
                                overflow: 'hidden',
                                background: 'var(--bg-3)',
                                border: '1px solid var(--line)',
                            }}
                        >
                            {it.thumbnail ? (
                                <Image
                                    src={it.thumbnail}
                                    alt={it.productTitle}
                                    fill
                                    loading="lazy"
                                    sizes="72px"
                                    style={{ objectFit: 'cover' }}
                                />
                            ) : null}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'var(--text)', fontSize: 15, marginBottom: 4 }}>
                                {it.productHandle ? (
                                    <Link href={`/store/p/${it.productHandle}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                                        {it.productTitle}
                                    </Link>
                                ) : (
                                    it.productTitle
                                )}
                            </div>
                            {it.variantTitle && it.variantTitle !== 'Default' ? (
                                <div className="text-dim" style={{ fontSize: 12 }}>{it.variantTitle}</div>
                            ) : null}
                            <div className="accent" style={{ fontSize: 13, marginTop: 4 }}>
                                {formatMoney(it.unitPrice, currency)}
                            </div>
                        </div>

                        {/* qty */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                type="button"
                                className="btn-ghost"
                                style={{ padding: '4px 10px' }}
                                disabled={pending}
                                onClick={() => mutate(() => updateLineItem(it.id, it.quantity - 1))}
                                aria-label="Decrease quantity"
                            >
                                −
                            </button>
                            <span style={{ minWidth: 20, textAlign: 'center', color: 'var(--text)' }}>
                                {it.quantity}
                            </span>
                            <button
                                type="button"
                                className="btn-ghost"
                                style={{ padding: '4px 10px' }}
                                disabled={pending}
                                onClick={() => mutate(() => updateLineItem(it.id, it.quantity + 1))}
                                aria-label="Increase quantity"
                            >
                                +
                            </button>
                        </div>

                        <div style={{ minWidth: 70, textAlign: 'right', color: 'var(--text)' }}>
                            {formatMoney(it.total, currency)}
                        </div>
                        <button
                            type="button"
                            onClick={() => mutate(() => removeLineItem(it.id))}
                            disabled={pending}
                            aria-label="Remove item"
                            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            {/* summary */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Row label="Subtotal" value={formatMoney(cart.subtotal, currency)} />
                <Row label="Total" value={formatMoney(cart.total, currency)} strong />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 16 }}>
                    <p className="text-dim" style={{ fontSize: 12, margin: '2px 0 0' }}>
                        Shipping + tax calculated at checkout.
                    </p>
                    {pending ? (
                        <span className="font-display" style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center' }}>
                            UPDATING<Dots />
                        </span>
                    ) : null}
                </div>
            </div>

            {error ? <p style={{ color: 'var(--danger, #ff6b6b)', fontSize: 13, margin: 0 }}>{error}</p> : null}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/store" className="btn-ghost" style={{ padding: '12px 22px' }}>
                    CONTINUE SHOPPING
                </Link>
                <Link href="/store/checkout" className="btn btn-lg" style={{ flex: 1, minWidth: 200, textAlign: 'center' }}>
                    CHECKOUT →
                </Link>
            </div>
        </div>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 17 : 14 }}>
            <span className="text-dim">{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: strong ? 700 : 400 }}>{value}</span>
        </div>
    );
}
