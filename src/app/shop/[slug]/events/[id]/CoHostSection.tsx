'use client';
/**
 * CO-HOSTS section on the shop event detail page.
 *
 * Host view: search the shop directory, invite a shop to co-host, and manage
 * the co-host list (statuses + remove). Co-host view: accept or decline the
 * invitation to co-host. Once accepted, a co-host gains the INVITATIONS section
 * (rendered separately by the page) and read-only event details.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    searchCoHostCandidates,
    inviteCoHost,
    respondCoHost,
    removeCoHost,
    type CoHostCandidate,
} from './invite-actions';

export type CoHostRow = { shopId: number; name: string; slug: string; status: string };

const STATUS_PILL: Record<string, string> = {
    invited: 'admin-pill gold',
    accepted: 'admin-pill neon',
    declined: 'admin-pill warn',
};

export function CoHostSection({
    eventId,
    hostShopId,
    viewerShopId,
    isHost,
    cohosts,
    myStatus,
}: {
    eventId: string;
    hostShopId: number;
    viewerShopId: number;
    isHost: boolean;
    cohosts: CoHostRow[];
    myStatus: string | null;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [query, setQuery] = useState('');
    const [candidates, setCandidates] = useState<CoHostCandidate[]>([]);
    const [searching, setSearching] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const runSearch = (q: string) => {
        setQuery(q);
        setSearching(true);
        start(async () => {
            try {
                const res = await searchCoHostCandidates(hostShopId, eventId, q);
                setCandidates(res);
            } catch (e: any) {
                setErr(e?.message ?? 'search failed');
            } finally {
                setSearching(false);
            }
        });
    };

    const doInvite = (shopId: number) => {
        setErr(null);
        start(async () => {
            try {
                await inviteCoHost(eventId, hostShopId, shopId);
                setCandidates((prev) => prev.filter((c) => c.id !== shopId));
                router.refresh();
            } catch (e: any) {
                setErr(e?.message ?? 'invite failed');
            }
        });
    };

    const doRemove = (shopId: number) => {
        if (!confirm('Remove this co-host from the event?')) return;
        start(async () => {
            try {
                await removeCoHost(eventId, hostShopId, shopId);
                router.refresh();
            } catch (e: any) {
                setErr(e?.message ?? 'remove failed');
            }
        });
    };

    const doRespond = (accept: boolean) => {
        start(async () => {
            try {
                await respondCoHost(eventId, viewerShopId, accept);
                router.refresh();
            } catch (e: any) {
                setErr(e?.message ?? 'response failed');
            }
        });
    };

    return (
        <div style={{ marginTop: 24 }}>
            <div className="admin-page-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        CO-HOSTS
                    </div>
                    <div className="admin-page-sub">
                        {isHost ? 'INVITE OTHER SHOPS TO RIDE ALONG' : 'YOU WERE INVITED TO CO-HOST'}
                    </div>
                </div>
            </div>

            {err && (
                <div className="admin-pill warn" style={{ marginTop: 8 }}>
                    {err}
                </div>
            )}

            {/* Co-host respond banner */}
            {!isHost && myStatus === 'invited' && (
                <div
                    style={{
                        margin: '12px 0',
                        padding: '14px 16px',
                        border: '1px solid var(--gold, #e8a845)',
                        background: 'var(--gold-dim, rgba(232,168,69,0.08))',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ fontSize: 13, color: 'var(--text, #f0f0f0)' }}>
                        You've been invited to co-host this event. Accept to add it to your dashboard and
                        invite your own customers.
                    </span>
                    <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                        <button className="admin-action-btn" disabled={pending} onClick={() => doRespond(true)}>
                            ACCEPT
                        </button>
                        <button
                            className="admin-action-btn danger"
                            disabled={pending}
                            onClick={() => doRespond(false)}
                        >
                            DECLINE
                        </button>
                    </span>
                </div>
            )}
            {!isHost && myStatus === 'accepted' && (
                <div className="admin-pill neon" style={{ marginTop: 8 }}>
                    YOU ARE CO-HOSTING THIS EVENT
                </div>
            )}
            {!isHost && myStatus === 'declined' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="admin-pill warn">DECLINED</span>
                    <button className="admin-action-btn muted" disabled={pending} onClick={() => doRespond(true)}>
                        RECONSIDER — ACCEPT
                    </button>
                </div>
            )}

            {/* Host: invite picker */}
            {isHost && (
                <div style={{ margin: '12px 0' }}>
                    <input
                        value={query}
                        onChange={(e) => runSearch(e.target.value)}
                        placeholder="Search shops by name or slug…"
                        style={{
                            width: '100%',
                            maxWidth: 420,
                            padding: '9px 11px',
                            background: 'var(--bg-2, #0c0c14)',
                            border: '1px solid var(--line, #1a1a28)',
                            color: 'var(--text, #f0f0f0)',
                            fontSize: 14,
                            borderRadius: 3,
                            boxSizing: 'border-box',
                        }}
                    />
                    {searching && <div className="admin-page-sub" style={{ marginTop: 6 }}>SEARCHING…</div>}
                    {candidates.length > 0 && (
                        <div
                            style={{
                                marginTop: 8,
                                border: '1px solid var(--line, #1a1a28)',
                                borderRadius: 3,
                                maxWidth: 420,
                            }}
                        >
                            {candidates.map((c) => (
                                <div
                                    key={c.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 10px',
                                        borderBottom: '1px solid var(--line, #1a1a28)',
                                    }}
                                >
                                    <span style={{ fontSize: 13 }}>
                                        {c.name} <span className="admin-handle">/{c.slug}</span>
                                    </span>
                                    <button
                                        className="admin-action-btn"
                                        disabled={pending}
                                        onClick={() => doInvite(c.id)}
                                    >
                                        INVITE
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Co-host list (visible to host + co-hosts) */}
            <div className="admin-table-wrap" style={{ marginTop: 8 }}>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>SHOP</th>
                            <th>STATUS</th>
                            {isHost && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {cohosts.length === 0 ? (
                            <tr>
                                <td colSpan={isHost ? 3 : 2}>
                                    <div className="admin-empty">NO CO-HOSTS YET.</div>
                                </td>
                            </tr>
                        ) : (
                            cohosts.map((c) => (
                                <tr key={c.shopId}>
                                    <td>
                                        {c.name} <span className="admin-handle">/{c.slug}</span>
                                    </td>
                                    <td>
                                        <span className={STATUS_PILL[c.status] ?? 'admin-pill'}>
                                            {c.status.toUpperCase()}
                                        </span>
                                    </td>
                                    {isHost && (
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="admin-action-btn danger"
                                                disabled={pending}
                                                onClick={() => doRemove(c.shopId)}
                                            >
                                                REMOVE
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
