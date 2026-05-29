'use client';
import { useTransition } from 'react';
import { softDeletePost, undeletePost } from './actions';

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

    return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <a
                className="admin-action-btn muted"
                href={`https://rollout.club/post/${postId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
            >
                VIEW ↗
            </a>
            {canManage && !deleted && (
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={() => {
                        if (!confirm('Soft-delete this post? It will be hidden from feeds.')) return;
                        run(() => softDeletePost(postId, shopId));
                    }}
                >
                    DELETE
                </button>
            )}
            {canManage && deleted && (
                <button
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => run(() => undeletePost(postId, shopId))}
                >
                    UNDELETE
                </button>
            )}
        </div>
    );
}
