'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setKioskEventStatus, deleteKioskEvent } from './actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const OWNER_ROLES = new Set(['owner', 'admin']);

export function KioskEventStatusActions({
    eventId,
    shopId,
    slug,
    status,
    callerRole,
    showEdit,
}: {
    eventId: string;
    shopId: number;
    slug: string;
    status: string;
    callerRole: string;
    showEdit?: boolean;
}) {
    const [pending, start] = useTransition();
    const router = useRouter();
    const canManage = MANAGER_ROLES.has(callerRole);
    const canDelete = OWNER_ROLES.has(callerRole);

    // Two-click "armed" delete — window.confirm is unreliable (auto-dismissed
    // in some browsers), so the first click arms the button for 3s.
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(t);
    }, [armed]);

    const run = (fn: () => Promise<unknown>) => {
        start(async () => {
            try {
                await fn();
                router.refresh();
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {showEdit && (
                <button
                    className="admin-action-btn muted"
                    disabled={pending}
                    onClick={() => router.push(`/shop/${slug}/kiosk-events/${eventId}`)}
                >
                    EDIT
                </button>
            )}
            {canManage && status !== 'published' && (
                <button
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => run(() => setKioskEventStatus(eventId, shopId, 'published'))}
                >
                    PUBLISH
                </button>
            )}
            {canManage && status === 'published' && (
                <button
                    className="admin-action-btn muted"
                    disabled={pending}
                    onClick={() => run(() => setKioskEventStatus(eventId, shopId, 'draft'))}
                >
                    UNPUBLISH
                </button>
            )}
            {canManage && status !== 'archived' && (
                <button
                    className="admin-action-btn muted"
                    disabled={pending}
                    onClick={() => run(() => setKioskEventStatus(eventId, shopId, 'archived'))}
                >
                    ARCHIVE
                </button>
            )}
            {canDelete && (
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={() => {
                        if (!armed) {
                            setArmed(true);
                            return;
                        }
                        setArmed(false);
                        run(() => deleteKioskEvent(eventId, shopId));
                    }}
                >
                    {armed ? 'CONFIRM DELETE?' : 'DELETE'}
                </button>
            )}
        </div>
    );
}
