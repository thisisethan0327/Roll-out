'use client';
import { useTransition } from 'react';
import { dismissActionItem } from './actions';
import { toast } from '@/components/glide/Toast';

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
                        toast.error('Dismiss failed: ' + (e?.message ?? 'unknown'));
                    }
                })
            }
        >
            {pending ? 'Dismissing…' : 'Dismiss'}
        </button>
    );
}
