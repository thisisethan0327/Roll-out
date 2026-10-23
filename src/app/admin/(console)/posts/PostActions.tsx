'use client';
import { useTransition } from 'react';
import { forceDeletePost } from '../moderation-actions';
import { Trash2 } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';

export function PostActions({ postId }: { postId: string }) {
    const [pending, start] = useTransition();
    const onDelete = () => {
        if (!confirm('Force-delete this post? Hidden from feed immediately.')) return;
        start(async () => {
            try {
                await forceDeletePost(postId);
            } catch (e: any) {
                alert('Failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };
    return (
        <button className="admin-action-btn danger" disabled={pending} onClick={onDelete}>
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Delete
        </button>
    );
}
