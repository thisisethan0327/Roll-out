'use client';
/**
 * The same account actions the /admin/users row offers, for the detail page,
 * plus the Rollout ban controls. They call the server actions in ../actions.ts,
 * each of which re-checks requirePlatformAdmin() server-side (and banUser also
 * re-checks self / platform admin / shop page against the DB) -- the disabled
 * states here are convenience, not the gate.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    setVerified,
    grantPlatformAdmin,
    revokePlatformAdmin,
    grantMeetCoordinator,
    revokeMeetCoordinator,
    banUser,
    unbanUser,
} from '../actions';

type Duration = '24h' | '7d' | '30d' | 'date' | 'permanent';
const DURATION_LABEL: Record<Duration, string> = {
    '24h': '24 HOURS',
    '7d': '7 DAYS',
    '30d': '30 DAYS',
    date: 'UNTIL DATE',
    permanent: 'PERMANENT',
};
const DURATION_MS: Partial<Record<Duration, number>> = {
    '24h': 24 * 3600_000,
    '7d': 7 * 24 * 3600_000,
    '30d': 30 * 24 * 3600_000,
};
const NEEDS_091 = 'Needs migration 091';

export function UserActions({
    profileId,
    handle,
    kind,
    isVerified,
    isPlatformAdmin,
    isMeetCoordinator,
    adminProfileId,
    isBanned,
    banReady,
}: {
    profileId: string;
    handle: string;
    kind: string;
    isVerified: boolean;
    isPlatformAdmin: boolean;
    isMeetCoordinator: boolean;
    adminProfileId: string;
    /** profiles.banned_until is in the future. */
    isBanned: boolean;
    /** Migration 091 is applied (banned_until column and user_bans table both exist). */
    banReady: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const isMe = profileId === adminProfileId;

    // Ban panel state
    const [panelOpen, setPanelOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState<Duration>('7d');
    const [untilDate, setUntilDate] = useState('');
    const [publicNote, setPublicNote] = useState('');
    const [banError, setBanError] = useState<string | null>(null);
    // Permanent bans: refund policy for upcoming paid tickets (Part 2).
    const [refundMode, setRefundMode] = useState<'auto' | 'withhold'>('auto');
    const [withholdReason, setWithholdReason] = useState('');
    const [banNotice, setBanNotice] = useState<string | null>(null);

    const banDisabledWhy = !banReady
        ? NEEDS_091
        : isMe
          ? "You can't ban yourself."
          : isPlatformAdmin
            ? "Platform admins can't be banned. Revoke god mode first."
            : '';

    const submitBan = () => {
        setBanError(null);
        if (!reason.trim()) return setBanError('A reason is required.');
        let until: string;
        if (duration === 'permanent') until = 'permanent';
        else if (duration === 'date') {
            if (!untilDate) return setBanError('Pick an end date.');
            until = new Date(`${untilDate}T23:59:59Z`).toISOString();
        } else until = new Date(Date.now() + (DURATION_MS[duration] ?? 0)).toISOString();
        const permanent = duration === 'permanent';
        if (permanent && refundMode === 'withhold' && !withholdReason.trim()) {
            return setBanError('A written reason is required to withhold refunds.');
        }
        if (
            permanent &&
            refundMode === 'auto' &&
            !confirm(
                'Permanently ban @' +
                    handle +
                    '? Their upcoming paid tickets will be CANCELLED and REFUNDED to the original payment method, and the hosts told.',
            )
        ) {
            return;
        }
        start(async () => {
            const res = await banUser(profileId, {
                reason,
                until,
                publicNote,
                ...(permanent
                    ? { refundMode, refundWithheldReason: refundMode === 'withhold' ? withholdReason : undefined }
                    : {}),
            });
            if (!res.ok) return setBanError(res.error);
            setPanelOpen(false);
            setReason('');
            setPublicNote('');
            setRefundMode('auto');
            setWithholdReason('');
            if (res.refunds) {
                const r = res.refunds;
                setBanNotice(
                    r.note
                        ? `BANNED. REFUND JOB DID NOT RUN: ${r.note}`
                        : `BANNED. REFUNDS${r.dryRun ? ' (DRY RUN, NOTHING SENT)' : ''}: ${r.refunded} REFUNDED · ${r.failed} FAILED · ${r.withheld} WITHHELD. SEE TICKET REFUNDS BELOW.`,
                );
            } else {
                setBanNotice(null);
            }
            router.refresh();
        });
    };

    const submitUnban = () => {
        if (!confirm('Lift the Rollout ban on @' + handle + '?')) return;
        start(async () => {
            const res = await unbanUser(profileId);
            if (!res.ok) return alert('Action failed: ' + res.error);
            router.refresh();
        });
    };

    const run = (fn: () => Promise<void>) => {
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
                className={`admin-action-btn ${isVerified ? 'muted' : ''}`}
                disabled={pending}
                onClick={() => run(() => setVerified(profileId, !isVerified))}
            >
                {isVerified ? 'UNVERIFY' : 'VERIFY ✓'}
            </button>
            {kind === 'user' &&
                (isPlatformAdmin ? (
                    <button
                        className="admin-action-btn danger"
                        disabled={pending || isMe}
                        onClick={() =>
                            confirm('Revoke god mode from @' + handle + '?') &&
                            run(() => revokePlatformAdmin(profileId))
                        }
                        title={isMe ? "You can't revoke your own admin." : ''}
                    >
                        REVOKE GOD
                    </button>
                ) : (
                    <button
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => run(() => grantPlatformAdmin(profileId, adminProfileId))}
                    >
                        + GOD
                    </button>
                ))}
            {kind === 'user' &&
                (isMeetCoordinator ? (
                    <button
                        className="admin-action-btn muted"
                        disabled={pending}
                        onClick={() => run(() => revokeMeetCoordinator(profileId))}
                    >
                        − COORD
                    </button>
                ) : (
                    <button
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => run(() => grantMeetCoordinator(profileId, adminProfileId))}
                    >
                        + COORD
                    </button>
                ))}
            {kind === 'user' &&
                (isBanned ? (
                    <button
                        className="admin-action-btn"
                        disabled={pending || !banReady}
                        onClick={submitUnban}
                        title={!banReady ? NEEDS_091 : 'Lift the Rollout ban'}
                    >
                        UNBAN
                    </button>
                ) : (
                    <button
                        className="admin-action-btn danger"
                        disabled={pending || !!banDisabledWhy}
                        onClick={() => setPanelOpen((o) => !o)}
                        title={banDisabledWhy || 'Ban this member from Rollout'}
                    >
                        BAN
                    </button>
                ))}
            {kind === 'user' && (
                <button
                    className="admin-action-btn muted"
                    disabled
                    title="A later feature: locks the login on every app (Rollout, EMWRAPS, NeferStock, UNITY)."
                >
                    ACCOUNT-WIDE LOCK · ALL APPS — coming later
                </button>
            )}
            {kind === 'user' && !banReady && (
                <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--text-3)' }}>{NEEDS_091}</div>
            )}
            {banNotice && <div style={{ flexBasis: '100%', fontSize: 12 }}>{banNotice}</div>}

            {panelOpen && !isBanned && !banDisabledWhy && (
                <div
                    style={{
                        flexBasis: '100%',
                        border: '1px solid var(--line)',
                        padding: 14,
                        display: 'grid',
                        gap: 12,
                        marginTop: 6,
                    }}
                >
                    <div className="admin-page-sub">
                        BAN @{handle} FROM ROLLOUT · THE MEMBER CAN SIGN IN ONLY TO THE SUSPENDED SCREEN · POSTS AND COMMENTS HIDE WHILE BANNED · HOSTED EVENTS STAY
                    </div>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="admin-form-label">REASON (INTERNAL, REQUIRED)</span>
                        <textarea
                            className="admin-search-input"
                            rows={3}
                            maxLength={1000}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={pending}
                        />
                    </label>
                    <div style={{ display: 'grid', gap: 6 }}>
                        <span className="admin-form-label">DURATION</span>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
                            {(Object.keys(DURATION_LABEL) as Duration[]).map((d) => (
                                <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input
                                        type="radio"
                                        name={`ban-duration-${profileId}`}
                                        checked={duration === d}
                                        onChange={() => setDuration(d)}
                                        disabled={pending}
                                    />
                                    {DURATION_LABEL[d]}
                                </label>
                            ))}
                        </div>
                        {duration === 'date' && (
                            <input
                                type="date"
                                className="admin-search-input"
                                value={untilDate}
                                min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                                onChange={(e) => setUntilDate(e.target.value)}
                                disabled={pending}
                                style={{ maxWidth: 220 }}
                            />
                        )}
                    </div>
                    {duration === 'permanent' ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                            <span className="admin-form-label">UPCOMING PAID TICKETS (PERMANENT BAN)</span>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                                <input
                                    type="radio"
                                    name={`ban-refund-${profileId}`}
                                    checked={refundMode === 'auto'}
                                    onChange={() => setRefundMode('auto')}
                                    disabled={pending}
                                />
                                CANCEL AND REFUND UPCOMING PAID TICKETS (DEFAULT)
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                                <input
                                    type="radio"
                                    name={`ban-refund-${profileId}`}
                                    checked={refundMode === 'withhold'}
                                    onChange={() => setRefundMode('withhold')}
                                    disabled={pending}
                                />
                                WITHHOLD REFUNDS
                            </label>
                            {refundMode === 'withhold' && (
                                <label style={{ display: 'grid', gap: 6 }}>
                                    <span className="admin-form-label">
                                        WHY WITHHOLD (INTERNAL, REQUIRED: FRAUD, CHARGEBACKS, ABUSE AT AN EVENT…)
                                    </span>
                                    <textarea
                                        className="admin-search-input"
                                        rows={2}
                                        maxLength={1000}
                                        value={withholdReason}
                                        onChange={(e) => setWithholdReason(e.target.value)}
                                        disabled={pending}
                                    />
                                </label>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                Free upcoming RSVPs are released either way. The member never sees the withhold reason.
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            Tickets are kept; the member can request a refund from the suspended screen.
                        </div>
                    )}
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="admin-form-label">NOTE SHOWN TO THE MEMBER (OPTIONAL, MAX 300)</span>
                        <input
                            className="admin-search-input"
                            maxLength={300}
                            value={publicNote}
                            onChange={(e) => setPublicNote(e.target.value)}
                            disabled={pending}
                        />
                    </label>
                    {banError && <div className="admin-login-error">{banError}</div>}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="admin-action-btn danger" disabled={pending} onClick={submitBan}>
                            {pending ? 'BANNING…' : 'CONFIRM BAN'}
                        </button>
                        <button
                            className="admin-action-btn muted"
                            disabled={pending}
                            onClick={() => {
                                setPanelOpen(false);
                                setBanError(null);
                            }}
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
