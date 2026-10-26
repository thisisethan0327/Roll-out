'use client';
import { useState, useTransition } from 'react';
import { actionReportWithTakedown, setReportStatus, type ReportStatus } from './actions';
import { Trash2 } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';

export function ReportActions({
    reportId,
    status,
    targetType,
    targetLive,
    authorHandle,
}: {
    reportId: string;
    status: ReportStatus;
    targetType: string;
    /** false when the target is already deleted/missing: nothing left to take down. */
    targetLive: boolean;
    /** Author of the reported post / comment, for the confirm title. */
    authorHandle?: string | null;
}) {
    const [pending, start] = useTransition();
    const [note, setNote] = useState('');
    const [err, setErr] = useState<string | null>(null);

    const open = status === 'pending' || status === 'reviewing';
    const canTakedown = targetLive && (targetType === 'post' || targetType === 'comment');

    const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
        setErr(null);
        start(async () => {
            try {
                const res = await fn();
                if (!res.ok) setErr(res.error ?? 'Failed');
            } catch (e: any) {
                setErr(e?.message ?? 'Failed');
            }
        });
    };

    const setTo = (s: ReportStatus) => run(() => setReportStatus({ reportId, status: s, note }));

    const removeAndAction = async () => {
        const ok = await confirmDialog({
            title: authorHandle ? `Remove @${authorHandle}'s ${targetType}?` : `Remove this ${targetType}?`,
            message: "It's hidden immediately and the report is marked actioned.",
            confirmLabel: 'Remove',
            danger: true,
        });
        if (!ok) return;
        run(() => actionReportWithTakedown({ reportId, note }));
    };

    if (!open) {
        return (
            <div className={a.actRow}>
                <button className="admin-action-btn muted" disabled={pending} onClick={() => setTo('pending')}>
                    {pending ? 'Reopening…' : 'Reopen'}
                </button>
                {err && <div className="admin-login-error" role="alert">{err}</div>}
            </div>
        );
    }

    return (
        <div className={a.stack} style={{ gap: 10 }}>
            <input
                className="admin-form-input"
                placeholder="Note"
                aria-label="Moderation note"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
            />
            <div className={a.actRow}>
                {status === 'pending' && (
                    <button className="admin-action-btn muted" disabled={pending} onClick={() => setTo('reviewing')}>
                        Mark reviewing
                    </button>
                )}
                <button className="admin-action-btn muted" disabled={pending} onClick={() => setTo('dismissed')}>
                    Dismiss
                </button>
                <button className="admin-action-btn" disabled={pending} onClick={() => setTo('actioned')}>
                    Actioned
                </button>
                {canTakedown && (
                    <button className="admin-action-btn danger" disabled={pending} onClick={removeAndAction}>
                        <Trash2 size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Actioned and remove{' '}
                        {targetType}
                    </button>
                )}
            </div>
            {err && <div className="admin-login-error" role="alert">{err}</div>}
        </div>
    );
}
