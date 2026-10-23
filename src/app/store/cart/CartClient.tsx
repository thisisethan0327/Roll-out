'use client';

/**
 * The bag: quantity / remove mutations and the checkout hand-off.
 *
 * Glide (board G5 "Cart"): one card of lines (photo · name · seller ·
 * Michroma price · stepper · remove), and a summary card with the subtotal and
 * the check-out pill. The mutations are the same server actions as before.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Lock, Package, ShoppingBag, Store, Trash2 } from 'lucide-react';
import { updateLineItem, removeLineItem } from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { Cart } from '@/lib/medusa-types';
import { GlideButton, SecButton } from '@/components/glide/primitives';
import { EmptyState, ErrorLine, Stepper } from '@/components/glide-tickets/parts';

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
            <EmptyState
                icon={<ShoppingBag size={28} strokeWidth={1.5} />}
                title="Your cart is empty"
                action={<GlideButton href="/store">Browse the store</GlideButton>}
            >
                Gear from the brands on Rollout lands here.
            </EmptyState>
        );
    }

    const soldBy = cart.isMultiVendor
        ? cart.vendors.map((v) => v.name).filter(Boolean).join(' · ')
        : cart.vendor.name || null;

    return (
        <div className="gt-cols">
            <section className="g-card gt-cart" aria-label="Items in your cart" aria-busy={pending}>
                <ul style={{ margin: 0, padding: 0, opacity: pending ? 0.6 : 1, transition: 'opacity 120ms ease-out' }}>
                    {cart.items.map((it) => (
                        <li key={it.id} className="gt-ki">
                            <span className="gt-ki-im">
                                {it.thumbnail ? (
                                    <Image src={it.thumbnail} alt="" fill loading="lazy" sizes="72px" />
                                ) : (
                                    <span className="gt-pc-ph" aria-hidden="true">
                                        <Package size={26} strokeWidth={1.5} />
                                    </span>
                                )}
                            </span>
                            <span className="gt-ki-t">
                                <b>
                                    {it.productHandle ? (
                                        <Link href={`/store/p/${it.productHandle}`}>{it.productTitle}</Link>
                                    ) : (
                                        it.productTitle
                                    )}
                                </b>
                                {it.variantTitle && it.variantTitle !== 'Default' ? <small>{it.variantTitle}</small> : null}
                                <span className="gt-ki-r">
                                    <span className="g-w" aria-label={`${formatMoney(it.unitPrice, currency)} each`}>
                                        {formatMoney(it.unitPrice, currency)}
                                    </span>
                                    <span className="gt-ki-acts">
                                        <Stepper
                                            value={it.quantity}
                                            min={0}
                                            max={Number.MAX_SAFE_INTEGER}
                                            label={`of ${it.productTitle}`}
                                            disabled={pending}
                                            onChange={(n) => mutate(() => updateLineItem(it.id, n))}
                                        />
                                        <button
                                            type="button"
                                            className="gt-ki-x"
                                            onClick={() => mutate(() => removeLineItem(it.id))}
                                            disabled={pending}
                                            aria-label={`Remove ${it.productTitle}`}
                                        >
                                            <Trash2 size={19} strokeWidth={1.75} aria-hidden="true" />
                                        </button>
                                    </span>
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* summary */}
            <aside className="g-card gt-cart-side gt-side" aria-label="Summary">
                {soldBy ? (
                    <div className="g-chips">
                        <span className="g-chip">
                            <Store size={14} strokeWidth={2} aria-hidden="true" />
                            Sold by {soldBy}
                        </span>
                    </div>
                ) : null}
                <div className="gt-cart-tot" style={{ paddingTop: 0 }}>
                    <span>
                        <b>Subtotal</b>
                        {/* shipping + tax aren't chosen until checkout */}
                        <small>Shipping and tax at checkout</small>
                    </span>
                    <span className="g-w">{formatMoney(cart.subtotal, currency)}</span>
                </div>
                {pending ? (
                    <span className="gt-busy" role="status">
                        <LoaderCircle size={16} strokeWidth={2} className="g-spin" aria-hidden="true" />
                        Updating
                    </span>
                ) : null}
                {error ? <ErrorLine>{error}</ErrorLine> : null}
                <GlideButton href="/store/checkout" block>
                    Check out
                </GlideButton>
                <p className="gt-lockline">
                    <Lock size={15} strokeWidth={1.75} aria-hidden="true" />
                    Secure checkout. Payments by Stripe.
                </p>
                <SecButton href="/store">Continue shopping</SecButton>
            </aside>
        </div>
    );
}
