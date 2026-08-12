'use client';
import { useTransition } from 'react';
import { dismissShopActionItem } from './actions';

/**
 * Client dismiss control for a shop_owner action item. Slug travels with the id
 * so the server action can re-verify shop membership before touching the row.
 */
export function DismissButton({ slug, id }: { slug: string; id: string }) {
    const [pending, start] = useTransition();
    return (
        <button
            className="admin-action-btn muted"
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
            {pending ? '…' : 'DISMISS'}
        </button>
    );
}
