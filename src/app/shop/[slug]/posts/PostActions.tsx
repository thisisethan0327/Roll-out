'use client';
import { useTransition } from 'react';
import { softDeletePost, undeletePost } from './actions';
import { ArrowUpRight, Trash2, Undo2 } from 'lucide-react';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function PostActions({
    postId,
    shopId,
    deleted,
    callerRole,
}: {
    postId: string;
    shopId: number;
    deleted: boolean;
    callerRole: string;
}) {
    const [pending, start] = useTransition();
    const canManage = MANAGER_ROLES.has(callerRole);

    const run = (fn: () => Promise<void>) => {
        start(async () => {
            try {
                await fn();
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
    return (
        <div className={cx(bz.acts, bz.actsEnd)}>
            <a className={cx(bz.act, bz.actInk)} href={`https://rollout.club/post/${postId}`} target="_blank" rel="noopener noreferrer">
                View
                <ArrowUpRight {...ic} />
                <span className="g-sr">(opens in a new tab)</span>
            </a>
            {canManage && !deleted && (
                <button
                    type="button"
                    className={cx(bz.act, bz.actInk, bz.actDanger)}
                    disabled={pending}
                    onClick={() => {
                        if (!confirm('Soft-delete this post? It will be hidden from feeds.')) return;
                        run(() => softDeletePost(postId, shopId));
                    }}
                >
                    <Trash2 {...ic} />
                    Delete
                </button>
            )}
            {canManage && deleted && (
                <button type="button" className={bz.act} disabled={pending} onClick={() => run(() => undeletePost(postId, shopId))}>
                    <Undo2 {...ic} />
                    Restore
                </button>
            )}
        </div>
    );
}
