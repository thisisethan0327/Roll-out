'use client';
import { useTransition } from 'react';
import { dismissShopActionItem } from './actions';
import { shopStyles as sh } from '@/components/glide-shop/parts';

/**
 * Client dismiss control for a shop_owner action item. Slug travels with the id
 * so the server action can re-verify shop membership before touching the row.
 */
export function DismissButton({ slug, id }: { slug: string; id: string }) {
    const [pending, start] = useTransition();
    return (
        <button
            type="button"
            className={`g-sec g-sec--ink ${sh.secSm}`}
            disabled={pending}
            onClick={() =>
                start(async () => {
                    try {
                        await dismissShopActionItem(slug, id);
                    } catch (e: any) {
                        alert('Dismiss failed: ' + (e?.message ?? 'unknown'));
                    }
                })
            }
        >
            {pending ? 'Dismissing…' : 'Dismiss'}
        </button>
    );
}
