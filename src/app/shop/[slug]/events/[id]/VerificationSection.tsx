'use client';
/**
 * VERIFICATION + CHECK-IN on the shop event page (host view only).
 *
 * none / revoked  → the request form: six rule attestations + coin artwork.
 * requested       → waiting chip + what was attested.
 * verified        → the door panel: check-in code as big text + QR (payload =
 *                   the code), Rotate, the live check-in list, and a CHECK IN
 *                   button per "going" RSVP that has not checked in.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RULES_V1 } from '@/lib/verification-rules';
import { requestVerificationAction, rotateCheckinCodeAction, hostCheckInAction } from './progression-actions';

export type VerificationView = {
    status: 'none' | 'requested' | 'verified' | 'revoked';
    coinEnabled: boolean;
    requestedAt: string | null;
    decidedAt: string | null;
    notes: string | null;
    attestations: Record<string, unknown>;
    checkinCode: string | null;
    qrSvg: string | null;
    coin: { cap: number; issued: number; finish: string; artworkUrl: string | null } | null;
    checkins: { profileId: string; handle: string | null; displayName: string | null; method: string; at: string; serial: number | null; arrivedAt: string | null }[];
    going: { profileId: string; handle: string | null; displayName: string | null }[];
};

const STATUS_PILL: Record<VerificationView['status'], string> = {
    none: 'admin-pill',
    requested: 'admin-pill gold',
    verified: 'admin-pill neon',
    revoked: 'admin-pill warn',
};

function stamp(iso: string | null) {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

function Head({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="admin-page-head" style={{ marginTop: 24, borderBottom: 'none', paddingBottom: 0 }}>
            <div>
                <div className="admin-page-title" style={{ fontSize: 14 }}>{title}</div>
                <div className="admin-page-sub">{sub}</div>
            </div>
        </div>
    );
}

export function VerificationSection({ eventId, shopId, slug, view }: { eventId: string; shopId: number; slug: string; view: VerificationView }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const submitRequest = (formData: FormData) => {
        setErr(null);
        startTransition(async () => {
            const r = await requestVerificationAction(formData);
            if (!r.ok) setErr(r.error);
            else router.refresh();
        });
    };
    const rotate = () => {
        setErr(null);
        startTransition(async () => {
            const r = await rotateCheckinCodeAction({ shopId, eventId, slug });
            if (!r.ok) setErr(r.error);
            else router.refresh();
        });
    };
    const checkIn = (profileId: string, handle: string | null) => {
        setErr(null);
        setNote(null);
        startTransition(async () => {
            const r = await hostCheckInAction({ shopId, eventId, slug, profileId });
            if (!r.ok) setErr(r.error);
            else {
                setNote(`@${handle ?? profileId.slice(0, 8)} checked in${r.serial ? ` · coin #${r.serial}` : ''}${r.xp ? ` · +${r.xp} XP` : ''}`);
                router.refresh();
            }
        });
    };

    const checkedIn = new Set(view.checkins.map((c) => c.profileId));
    const waiting = view.going.filter((g) => !checkedIn.has(g.profileId));

    return (
        <>
            <Head
                title="Rollout verification"
                sub={
                    view.status === 'verified'
                        ? `Verified ${stamp(view.decidedAt)} · ${view.coinEnabled && view.coin ? `coin on · ${view.coin.issued} / ${view.coin.cap} minted` : 'coin not enabled yet'}`
                        : view.status === 'requested'
                          ? `Requested ${stamp(view.requestedAt)} · an admin reviews it`
                          : view.status === 'revoked'
                            ? `Revoked ${stamp(view.decidedAt)} · you can request again`
                            : 'Verified events award XP at check-in and can issue a coin'
                }
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
                <span className={STATUS_PILL[view.status]}>{view.status.toUpperCase()}</span>
                {view.notes ? <span className="admin-pill">{view.notes}</span> : null}
            </div>
            {err ? <div className="admin-form-error" style={{ marginBottom: 12 }}>{err}</div> : null}
            {note ? <div className="admin-pill neon" style={{ marginBottom: 12 }}>{note}</div> : null}

            {(view.status === 'none' || view.status === 'revoked') && (
                <form action={submitRequest} className="admin-form" style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
                    <input type="hidden" name="shopId" value={shopId} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="slug" value={slug} />
                    {RULES_V1.map((r) => (
                        <label key={r.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
                            {r.kind === 'check' ? (
                                <input type="checkbox" name={r.id} required style={{ marginTop: 4 }} />
                            ) : (
                                <input type="file" name="artwork" accept="image/png,image/jpeg,image/webp" required style={{ maxWidth: 220 }} />
                            )}
                            <span>
                                <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)' }}>{r.title.toUpperCase()}</span>
                                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>{r.text}</span>
                            </span>
                        </label>
                    ))}
                    <div>
                        <button type="submit" className="admin-action-btn" disabled={pending}>
                            {pending ? 'Sending…' : 'Request verification'}
                        </button>
                    </div>
                </form>
            )}

            {view.status === 'requested' && (
                <div className="admin-empty">
                    WAITING FOR REVIEW · {Object.keys(view.attestations).filter((k) => k !== 'artwork_url').length} RULES ATTESTED
                    {typeof view.attestations.artwork_url === 'string' ? (
                        <>
                            {' · '}
                            <a className="text-link" href={view.attestations.artwork_url} target="_blank" rel="noreferrer">Coin artwork</a>
                        </>
                    ) : null}
                </div>
            )}

            {view.status === 'verified' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 20, alignItems: 'center', padding: 16, border: '1px solid var(--line, #1a1a28)', borderRadius: 4 }}>
                        <div style={{ width: 168, height: 168, background: '#fff', padding: 8, borderRadius: 4 }}>
                            {view.qrSvg ? <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: view.qrSvg }} /> : null}
                        </div>
                        <div>
                            <div className="admin-page-sub">Door code · members scan or type it in the app</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '6px', margin: '6px 0 10px', wordBreak: 'break-all' }}>
                                {view.checkinCode ?? '— no code yet —'}
                            </div>
                            <button type="button" className="admin-action-btn muted" onClick={rotate} disabled={pending}>
                                {pending ? 'Working…' : view.checkinCode ? 'Rotate code' : 'Create code'}
                            </button>
                            {view.coin?.artworkUrl ? (
                                <a className="text-link" href={view.coin.artworkUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>Coin artwork</a>
                            ) : null}
                        </div>
                    </div>

                    <Head title="Checked in" sub={`${view.checkins.length} at the door · ${waiting.length} going, not yet in`} />
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Handle</th>
                                    <th>Name</th>
                                    <th>How</th>
                                    <th>Coin</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.checkins.length === 0 ? (
                                    <tr><td colSpan={5}><div className="admin-empty">Nobody has checked in yet.</div></td></tr>
                                ) : (
                                    view.checkins.map((c) => (
                                        <tr key={c.profileId}>
                                            <td>{c.handle ? <span className="text-link">@{c.handle}</span> : '—'}</td>
                                            <td>{c.displayName ?? '—'}</td>
                                            <td><span className="admin-pill">{c.method.replace('_', ' ').charAt(0).toUpperCase() + c.method.replace('_', ' ').slice(1)}{c.arrivedAt ? ' · arrived' : ''}</span></td>
                                            <td>{c.serial ? <span className="admin-pill gold">#{c.serial}</span> : '—'}</td>
                                            <td>{stamp(c.at)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {waiting.length > 0 && (
                        <>
                            <Head title="At the door" sub="Going but not checked in · check them in by hand if their phone fails" />
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Handle</th>
                                            <th>Name</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {waiting.map((g) => (
                                            <tr key={g.profileId}>
                                                <td>{g.handle ? <span className="text-link">@{g.handle}</span> : '—'}</td>
                                                <td>{g.displayName ?? '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button type="button" className="admin-action-btn" disabled={pending} onClick={() => checkIn(g.profileId, g.handle)}>
                                                        Check in
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </>
            )}
        </>
    );
}
