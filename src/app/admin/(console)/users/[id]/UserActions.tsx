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
import { Ban, Check, Lock, ShieldOff } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

type Duration = '24h' | '7d' | '30d' | 'date' | 'permanent';
const DURATION_LABEL: Record<Duration, string> = {
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days',
    date: 'Until a date',
    permanent: 'Permanent',
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
                        ? `Banned. The refund job did not run: ${r.note}`
                        : `Banned. Refunds${r.dryRun ? ' (dry run, nothing sent)' : ''}: ${r.refunded} refunded · ${r.failed} failed · ${r.withheld} withheld. See Ticket refunds below.`,
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
        <div className={a.stack}>
            <div className={a.actRow}>
                <button
                    className={`admin-action-btn ${isVerified ? 'muted' : ''}`}
                    disabled={pending}
                    onClick={() => run(() => setVerified(profileId, !isVerified))}
                >
                    {isVerified ? 'Unverify' : <><Check {...ic} /> Verify</>}
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
                            <ShieldOff {...ic} className={a.dangerIc} /> Revoke god mode
                        </button>
                    ) : (
                        <button
                            className="admin-action-btn"
                            disabled={pending}
                            onClick={() => run(() => grantPlatformAdmin(profileId, adminProfileId))}
                        >
                            Grant god mode
                        </button>
                    ))}
                {kind === 'user' &&
                    (isMeetCoordinator ? (
                        <button
                            className="admin-action-btn muted"
                            disabled={pending}
                            onClick={() => run(() => revokeMeetCoordinator(profileId))}
                        >
                            Remove coordinator
                        </button>
                    ) : (
                        <button
                            className="admin-action-btn"
                            disabled={pending}
                            onClick={() => run(() => grantMeetCoordinator(profileId, adminProfileId))}
                        >
                            Make coordinator
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
                            Unban
                        </button>
                    ) : (
                        <button
                            className="admin-action-btn danger"
                            disabled={pending || !!banDisabledWhy}
                            onClick={() => setPanelOpen((o) => !o)}
                            title={banDisabledWhy || 'Ban this member from Rollout'}
                            aria-expanded={panelOpen}
                        >
                            <Ban {...ic} className={a.dangerIc} /> Ban
                        </button>
                    ))}
                {kind === 'user' && (
                    <button
                        className="admin-action-btn muted"
                        disabled
                        title="A later feature: locks the login on every app (Rollout, EMWRAPS, NeferStock, UNITY)."
                    >
                        <Lock {...ic} /> Account-wide lock, all apps: coming later
                    </button>
                )}
            </div>
            {kind === 'user' && !banReady && <div className={a.small}>{NEEDS_091}</div>}
            {banNotice && (
                <div className={a.note} role="status">
                    {banNotice}
                </div>
            )}

            {panelOpen && !isBanned && !banDisabledWhy && (
                <div className={`${a.card} ${a.formCard}`} role="group" aria-label={`Ban @${handle}`}>
                    <p className={a.small} style={{ margin: 0 }}>
                        <b style={{ color: 'var(--ink)' }}>Ban @{handle} from Rollout.</b> The member can sign in only to
                        the suspended screen. Posts and comments hide while banned. Hosted events stay.
                    </p>
                    <label className={a.field}>
                        <span className="admin-form-label">Reason (internal, required)</span>
                        <textarea
                            className="admin-search-input"
                            rows={3}
                            maxLength={1000}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={pending}
                        />
                    </label>
                    <fieldset className={a.field} style={{ border: 0, margin: 0, padding: 0 }}>
                        <legend className="admin-form-label" style={{ marginBottom: 7 }}>
                            Duration
                        </legend>
                        <div className={a.choices}>
                            {(Object.keys(DURATION_LABEL) as Duration[]).map((d) => (
                                <label key={d} className={a.choice}>
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
                                aria-label="Ban ends on"
                                value={untilDate}
                                min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                                onChange={(e) => setUntilDate(e.target.value)}
                                disabled={pending}
                                style={{ maxWidth: 240 }}
                            />
                        )}
                    </fieldset>
                    {duration === 'permanent' ? (
                        <fieldset className={a.field} style={{ border: 0, margin: 0, padding: 0 }}>
                            <legend className="admin-form-label" style={{ marginBottom: 7 }}>
                                Upcoming paid tickets (permanent ban)
                            </legend>
                            <div className={`${a.choices} ${a.choiceCol}`}>
                                <label className={a.choice}>
                                    <input
                                        type="radio"
                                        name={`ban-refund-${profileId}`}
                                        checked={refundMode === 'auto'}
                                        onChange={() => setRefundMode('auto')}
                                        disabled={pending}
                                    />
                                    Cancel and refund upcoming paid tickets (default)
                                </label>
                                <label className={a.choice}>
                                    <input
                                        type="radio"
                                        name={`ban-refund-${profileId}`}
                                        checked={refundMode === 'withhold'}
                                        onChange={() => setRefundMode('withhold')}
                                        disabled={pending}
                                    />
                                    Withhold refunds
                                </label>
                            </div>
                            {refundMode === 'withhold' && (
                                <label className={a.field}>
                                    <span className="admin-form-label">
                                        Why withhold (internal, required: fraud, chargebacks, abuse at an event…)
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
                            <div className={a.small}>
                                Free upcoming RSVPs are released either way. The member never sees the withhold reason.
                            </div>
                        </fieldset>
                    ) : (
                        <div className={a.small}>
                            Tickets are kept; the member can request a refund from the suspended screen.
                        </div>
                    )}
                    <label className={a.field}>
                        <span className="admin-form-label">Note shown to the member (optional, max 300)</span>
                        <input
                            className="admin-search-input"
                            maxLength={300}
                            value={publicNote}
                            onChange={(e) => setPublicNote(e.target.value)}
                            disabled={pending}
                        />
                    </label>
                    {banError && <div className="admin-login-error" role="alert">{banError}</div>}
                    <div className={a.actRow}>
                        <button className="admin-action-btn danger" disabled={pending} onClick={submitBan}>
                            <Ban {...ic} className={a.dangerIc} /> {pending ? 'Banning…' : 'Confirm ban'}
                        </button>
                        <button
                            className="admin-action-btn muted"
                            disabled={pending}
                            onClick={() => {
                                setPanelOpen(false);
                                setBanError(null);
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
