'use client';
import { useTransition } from 'react';
import { dismissActionItem } from './actions';

export function DismissButton({ id }: { id: string }) {
    const [pending, start] = useTransition();
    return (
        <button
            className="admin-action-btn muted"
            disabled={pending}
            onClick={() =>
                start(async () => {
                    try {
                        await dismissActionItem(id);
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
