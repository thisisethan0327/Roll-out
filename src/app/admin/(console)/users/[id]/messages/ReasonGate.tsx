'use client';
/**
 * Reason gate for the admin DM viewer (Part 2). Nothing is fetched until the
 * admin types a reason; the reason goes to a server action (a POST body, never
 * a URL) which calls the logging RPC on the admin's own session. The data lives
 * only in this component's state: a reload asks for a reason again, and so
 * writes a new log row.
 */
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
    adminListThreadsAction,
    adminReadThreadAction,
    type DmAuditRow,
    type DmMessage,
    type DmThread,
} from './actions';

const REASON_MIN = 10;
const REASON_MAX = 500;

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

function Gate({
    what,
    onSubmit,
    pending,
    error,
}: {
    what: string;
    onSubmit: (reason: string) => void;
    pending: boolean;
    error: string | null;
}) {
    const [reason, setReason] = useState('');
    const ok = reason.trim().length >= REASON_MIN;
    return (
        <div style={{ border: '1px solid var(--line)', padding: 16, display: 'grid', gap: 12, maxWidth: 640 }}>
            <div className="admin-page-sub">PRIVATE MESSAGES · FOR DISPUTES ONLY · EVERY VIEW IS LOGGED WITH YOUR NAME AND REASON</div>
            <label style={{ display: 'grid', gap: 6 }}>
                <span className="admin-form-label">
                    REASON FOR VIEWING ({REASON_MIN}–{REASON_MAX} CHARACTERS, REQUIRED)
                </span>
                <textarea
                    className="admin-form-input"
                    rows={3}
                    maxLength={REASON_MAX}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={pending}
                    placeholder="e.g. Dispute #123: buyer says seller threatened them"
                />
            </label>
            {error && <div className="admin-login-error">{error}</div>}
            <div>
                <button className="admin-action-btn danger" disabled={pending || !ok} onClick={() => onSubmit(reason)}>
                    {pending ? 'LOGGING…' : `LOG AND ${what}`}
                </button>
            </div>
        </div>
    );
}

export function ThreadsGate({ profileId, handle }: { profileId: string; handle: string }) {
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [threads, setThreads] = useState<DmThread[] | null>(null);

    if (!threads) {
        return (
            <Gate
                what="LIST THREADS"
                pending={pending}
                error={error}
                onSubmit={(reason) =>
                    start(async () => {
                        setError(null);
                        const res = await adminListThreadsAction(profileId, reason);
                        if (res.ok) setThreads(res.threads);
                        else setError(res.error);
                    })
                }
            />
        );
    }

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <div className="admin-page-sub">
                THIS VIEW IS LOGGED · {threads.length} THREAD{threads.length === 1 ? '' : 'S'} FOR @{handle.toUpperCase()}.
                OPENING A THREAD ASKS FOR A REASON AGAIN.
            </div>
            {threads.length === 0 ? (
                <div className="admin-empty">NO THREADS</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>THREAD</th>
                                <th>KIND</th>
                                <th>MEMBERS</th>
                                <th>MESSAGES</th>
                                <th>LAST MESSAGE</th>
                                <th>THEIR STATE</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {threads.map((t) => (
                                <tr key={t.id}>
                                    <td>{t.name || `…${t.id.slice(-6)}`}</td>
                                    <td>{String(t.kind ?? '—').toUpperCase()}</td>
                                    <td>
                                        {t.members
                                            .map((m) => (m.handle ? `@${m.handle}` : (m.display_name ?? '?')))
                                            .join(', ') || '—'}
                                    </td>
                                    <td>{t.message_count}</td>
                                    <td>{stamp(t.last_message_at)}</td>
                                    <td>{t.state ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <Link
                                            href={`/admin/users/${profileId}/messages/${t.id}`}
                                            className="admin-action-btn"
                                            style={{ textDecoration: 'none' }}
                                        >
                                            OPEN ›
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export function ThreadGate({ profileId, threadId }: { profileId: string; threadId: string }) {
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [reason, setReason] = useState<string | null>(null);
    const [view, setView] = useState<{
        thread: Record<string, any>;
        messages: DmMessage[];
        hasMore: boolean;
        audit: DmAuditRow[];
    } | null>(null);

    const load = (r: string, before?: string | null) =>
        start(async () => {
            setError(null);
            const res = await adminReadThreadAction(threadId, r, before ?? null);
            if (!res.ok) return setError(res.error);
            setReason(r);
            setView((prev) =>
                before && prev
                    ? { ...res, messages: [...res.messages, ...prev.messages] }
                    : { thread: res.thread, messages: res.messages, hasMore: res.hasMore, audit: res.audit },
            );
        });

    if (!view || !reason) {
        return <Gate what="READ THREAD" pending={pending} error={error} onSubmit={(r) => load(r)} />;
    }

    const members: { profile_id: string; handle: string | null; display_name: string | null }[] =
        view.thread.members ?? [];
    const oldest = view.messages[0]?.created_at ?? null;

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div className="admin-page-sub">
                THIS VIEW IS LOGGED · {view.thread.name ? `${String(view.thread.name).toUpperCase()} · ` : ''}
                {members.map((m) => (m.handle ? `@${m.handle}` : (m.display_name ?? '?'))).join(', ')}
            </div>

            {view.hasMore && oldest && (
                <div>
                    <button className="admin-action-btn muted" disabled={pending} onClick={() => load(reason, oldest)}>
                        {pending ? '…' : 'LOAD EARLIER (LOGGED AGAIN)'}
                    </button>
                </div>
            )}
            {error && <div className="admin-login-error">{error}</div>}

            <div
                style={{
                    border: '1px solid var(--line-mid)',
                    background: 'var(--bg-0)',
                    padding: 16,
                    minHeight: 320,
                    maxHeight: '65vh',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                {view.messages.length === 0 ? (
                    <div className="admin-empty" style={{ margin: 'auto' }}>
                        NO MESSAGES
                    </div>
                ) : (
                    view.messages.map((m) => {
                        const mine = m.sender_id === profileId;
                        const deleted = !!m.deleted_at;
                        return (
                            <div
                                key={m.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: mine ? 'flex-end' : 'flex-start',
                                    gap: 2,
                                    opacity: deleted ? 0.5 : 1,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: 'var(--text-2)',
                                        fontFamily: 'var(--font-display)',
                                        letterSpacing: 'var(--track-wider)',
                                    }}
                                >
                                    {m.sender_handle ? `@${m.sender_handle.toUpperCase()}` : '?'}
                                    {deleted ? ' · DELETED' : ''}
                                    {m.edited_at && !deleted ? ' · EDITED' : ''}
                                </div>
                                <div
                                    style={{
                                        maxWidth: '70%',
                                        padding: '8px 12px',
                                        background: mine ? 'var(--gold)' : 'var(--bg-2)',
                                        color: mine ? 'var(--on-gold)' : 'var(--text)',
                                        border: mine ? '1px solid var(--gold)' : '1px solid var(--line-mid)',
                                        fontSize: 14,
                                        lineHeight: 1.4,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        textDecoration: deleted ? 'line-through' : 'none',
                                    }}
                                >
                                    {m.body || (m.media_urls?.length ? '(attachment)' : '')}
                                </div>
                                {m.media_urls && m.media_urls.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {m.media_urls.map((u) => (
                                            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-link" style={{ fontSize: 11 }}>
                                                ATTACHMENT ›
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: 'var(--text-2)',
                                        fontFamily: 'var(--font-display)',
                                        letterSpacing: 'var(--track-wider)',
                                    }}
                                >
                                    {stamp(m.created_at)} UTC
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="admin-page-sub">LAST {view.audit.length} VIEWS OF THIS THREAD</div>
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN (UTC)</th>
                            <th>ADMIN</th>
                            <th>ACTION</th>
                            <th>REASON</th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.audit.map((a, i) => (
                            <tr key={`${a.at}-${i}`}>
                                <td>{stamp(a.at)}</td>
                                <td>{a.actor ? `@${a.actor}` : '—'}</td>
                                <td>{a.action}</td>
                                <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{a.reason ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
