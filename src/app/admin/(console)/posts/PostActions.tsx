'use client';
import { useTransition } from 'react';
import { forceDeletePost } from '../moderation-actions';
import { Trash2 } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';
import { toast } from '@/components/glide/Toast';

export function PostActions({ postId, authorHandle }: { postId: string; authorHandle?: string | null }) {
    const [pending, start] = useTransition();
    const onDelete = async () => {
        const ok = await confirmDialog({
            title: authorHandle ? `Delete @${authorHandle}'s post?` : 'Delete this post?',
            message: "It's hidden from the feed immediately.",
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        start(async () => {
            try {
                await forceDeletePost(postId);
            } catch (e: any) {
                toast.error('Delete failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };
    return (
        <button className="admin-action-btn danger" disabled={pending} onClick={onDelete}>
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Delete
        </button>
    );
}
