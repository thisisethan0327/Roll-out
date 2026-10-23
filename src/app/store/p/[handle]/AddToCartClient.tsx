'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/lib/medusa-cart';
import { formatMoney } from '@/lib/medusa-types';
import type { MedusaVariant } from '@/lib/medusa-types';
import { ArrowRight, ArrowUpRight, Check, CircleCheck, Clock, Info, LoaderCircle, Plus } from 'lucide-react';
import { ErrorLine } from '@/components/glide-tickets/parts';

type Props = {
    paused: boolean;
    /** Configured on unityusa.co — no purchase path here. */
    needsConfigurator: boolean;
    configuratorUrl: string;
    /** Dealer-only AND this visitor is not a dealer — explain, do not offer. */
    dealerLocked: boolean;
    dealerSignedIn: boolean;
    options: { title: string; values: string[] }[];
    variants: MedusaVariant[];
    currency: string | null;
};

/**
 * Variant picker + add-to-cart. When paused, renders a disabled COMING SOON
 * control and no purchase path.
 *
 * When the product needs a CONFIGURATOR it renders no purchase path either, and
 * sends the customer to unityusa.co. A pre-cut kit is plotted per vehicle and
 * Printable PPF is printed from artwork; both are collected at add-to-cart on
 * unityusa.co and written onto the line item, which is where the backend reads
 * them to open a print job. Adding one here would take money for work UNITY
 * cannot do. The cart action refuses these too — hidden is not forbidden.
 */
export function AddToCartClient({
    paused,
    dealerLocked,
    dealerSignedIn,
    needsConfigurator,
    configuratorUrl,
    options,
    variants,
    currency,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState(false);
    const [justAdded, setJustAdded] = useState(false);

    // "Default" single-variant products have one no-op option — skip the UI.
    const realOptions = options.filter(
        (o) => !(o.values.length === 1 && o.values[0] === 'Default'),
    );

    const [selection, setSelection] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const o of realOptions) if (o.values[0]) init[o.title] = o.values[0];
        return init;
    });

    const selectedVariant = useMemo<MedusaVariant | null>(() => {
        if (variants.length === 1) return variants[0];
        return (
            variants.find((v) =>
                realOptions.every((o) => v.optionValues[o.title] === selection[o.title]),
            ) ?? null
        );
    }, [variants, realOptions, selection]);

    // PAUSED WINS, and it is checked first.
    //
    // I had the dealer and configurator branches ahead of it, reasoning that a
    // dealer can buy the product today so "coming soon" would be false. That
    // was wrong: `paused` is a PRODUCT-level flag and the cart refuses a paused
    // line for everyone, dealer or not, on every storefront. So while a product
    // is paused, "sold through UNITY dealers" invites a dealer to try something
    // that cannot work, and "configure on unityusa.co" sends a buyer somewhere
    // it is equally unbuyable. The canary caught this rendering both messages
    // at once (2026-09-09): a gold COMING SOON badge beside "Sold through UNITY
    // dealers", which are two different reasons and cannot both be the answer.
    //
    // The other two are the reasons you CANNOT buy something that is otherwise
    // on sale, so they matter only once the product is live.
    if (paused) {
        return (
            <div className="gt-buyctl">
                <button type="button" className="g-btn g-btn--block gt-btn-off" disabled>
                    <span>Coming soon</span>
                    <span className="g-btn-k" aria-hidden="true">
                        <Clock size={20} strokeWidth={2} />
                    </span>
                </button>
            </div>
        );
    }

    // Not paused, but not for this visitor: a dealer buys this normally.
    if (dealerLocked) {
        return (
            <div className="gt-buyctl">
                <p className="gt-note-box">
                    <Info size={18} strokeWidth={2} aria-hidden="true" />
                    <span>
                        Sold through UNITY dealers.{' '}
                        {dealerSignedIn
                            ? 'Your account is not a dealer account yet.'
                            : 'Sign in to your dealer account,'}{' '}
                        <a href="https://unityusa.co/us/dealers" target="_blank" rel="noreferrer">
                            apply on unityusa.co
                        </a>
                        .
                    </span>
                </p>
            </div>
        );
    }

    // Not paused: the customer can buy this today, just not here.
    if (needsConfigurator) {
        return (
            <div className="gt-buyctl">
                <a href={configuratorUrl} target="_blank" rel="noreferrer" className="g-btn g-btn--block">
                    <span>Configure on unityusa.co</span>
                    <span className="g-btn-k" aria-hidden="true">
                        <ArrowUpRight size={20} strokeWidth={2} />
                    </span>
                </a>
                <p className="gt-fine">This kit is cut to your vehicle, so it is configured on unityusa.co.</p>
            </div>
        );
    }

    const onAdd = () => {
        if (pending) return; // guard against double-submit
        setError(null);
        setAdded(false);
        if (!selectedVariant) {
            setError('Select an option first.');
            return;
        }
        startTransition(async () => {
            const res = await addToCart(selectedVariant.id, 1);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setAdded(true);
            setJustAdded(true);
            setTimeout(() => setJustAdded(false), 1900);
            router.refresh();
        });
    };

    const soldOut = selectedVariant ? !selectedVariant.inStock : false;
    const priceText = selectedVariant
        ? formatMoney(selectedVariant.price, selectedVariant.currency ?? currency)
        : null;
    const disabled = pending || soldOut || (!selectedVariant && variants.length > 1);

    return (
        <div className="gt-buyctl">
            {realOptions.map((o) => (
                <div key={o.title} className="gt-opts">
                    <h3 id={`opt-${o.title}`}>{o.title}</h3>
                    <div className="gt-opts-row" role="radiogroup" aria-labelledby={`opt-${o.title}`}>
                        {o.values.map((val) => {
                            const active = selection[o.title] === val;
                            return (
                                <button
                                    key={val}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => setSelection((s) => ({ ...s, [o.title]: val }))}
                                    className="gt-opt"
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            <button
                type="button"
                className={`g-btn g-btn--block${justAdded ? ' gt-btn-done' : ''}${soldOut ? ' gt-btn-off' : ''}`}
                onClick={onAdd}
                disabled={disabled}
                aria-busy={pending || undefined}
            >
                <span>{pending ? 'Adding…' : justAdded ? 'In cart' : soldOut ? 'Coming soon' : 'Add to cart'}</span>
                {!pending && !justAdded && !soldOut && priceText ? <span className="gt-btn-v">{priceText}</span> : null}
                <span className="g-btn-k" aria-hidden="true">
                    {pending ? (
                        <LoaderCircle size={20} strokeWidth={2} className="g-spin" />
                    ) : justAdded ? (
                        <Check size={20} strokeWidth={2.4} />
                    ) : soldOut ? (
                        <Clock size={20} strokeWidth={2} />
                    ) : (
                        <Plus size={20} strokeWidth={2.2} />
                    )}
                </span>
            </button>

            <div aria-live="polite">
                {added ? (
                    <p className="gt-added">
                        <span>
                            <CircleCheck size={18} strokeWidth={2} aria-hidden="true" />
                            Added to your cart
                        </span>
                        <a href="/store/cart" className="g-link">
                            View cart
                            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                        </a>
                    </p>
                ) : null}
            </div>

            {error ? <ErrorLine>{error}</ErrorLine> : null}
        </div>
    );
}
