'use client';
import { useState, useTransition } from 'react';
import { actionReportWithTakedown, setReportStatus, type ReportStatus } from './actions';

export function ReportActions({
    reportId,
    status,
    targetType,
    targetLive,
}: {
    reportId: string;
    status: ReportStatus;
    targetType: string;
    /** false when the target is already deleted/missing: nothing left to take down. */
    targetLive: boolean;
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

    const removeAndAction = () => {
        if (!confirm(`Remove this ${targetType} and mark the report ACTIONED? It is hidden immediately.`)) return;
        run(() => actionReportWithTakedown({ reportId, note }));
    };

    if (!open) {
        return (
            <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                <button className="admin-action-btn muted" disabled={pending} onClick={() => setTo('pending')}>
                    {pending ? '…' : 'REOPEN'}
                </button>
                {err && <div style={{ color: 'var(--warn)', fontSize: 12 }}>{err}</div>}
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <input
                className="admin-form-input"
                placeholder="Note (optional)"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {status === 'pending' && (
                    <button className="admin-action-btn muted" disabled={pending} onClick={() => setTo('reviewing')}>
                        MARK REVIEWING
                    </button>
                )}
                <button className="admin-action-btn muted" disabled={pending} onClick={() => setTo('dismissed')}>
                    DISMISS
                </button>
                <button className="admin-action-btn" disabled={pending} onClick={() => setTo('actioned')}>
                    ACTIONED
                </button>
                {canTakedown && (
                    <button className="admin-action-btn danger" disabled={pending} onClick={removeAndAction}>
                        ACTIONED + REMOVE {targetType.toUpperCase()}
                    </button>
                )}
            </div>
            {err && <div style={{ color: 'var(--warn)', fontSize: 12 }}>{err}</div>}
        </div>
    );
}
