'use client';
/**
 * Shop post actions. Delete is a soft delete (Restore brings it back), so it
 * runs at once and offers Undo in a toast instead of asking first
 * (Documents/CLAUDE.md §12: a change that can be put back gets Undo, not a
 * confirm). Failures are error toasts.
 */
import { useTransition } from 'react';
import { softDeletePost, undeletePost } from './actions';
import { ArrowUpRight, Trash2, Undo2 } from 'lucide-react';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { toast, undoToast } from '@/components/glide/Toast';

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

    const run = (label: string, fn: () => Promise<void>, after?: () => void) => {
        start(async () => {
            try {
                await fn();
                after?.();
            } catch (e: any) {
                toast.error(`${label} failed: ` + (e?.message ?? 'unknown'));
            }
        });
    };
    const restore = () => run('Restore', () => undeletePost(postId, shopId));
    // Undo runs outside the transition: the row may have left the list by then.
    const undo = () =>
        undeletePost(postId, shopId).catch((e: any) => toast.error('Restore failed: ' + (e?.message ?? 'unknown')));
    const remove = () =>
        run('Delete', () => softDeletePost(postId, shopId), () => undoToast({ message: 'Post deleted', onUndo: undo }));

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
                    onClick={remove}
                >
                    <Trash2 {...ic} />
                    Delete
                </button>
            )}
            {canManage && deleted && (
                <button type="button" className={bz.act} disabled={pending} onClick={restore}>
                    <Undo2 {...ic} />
                    Restore
                </button>
            )}
        </div>
    );
}
