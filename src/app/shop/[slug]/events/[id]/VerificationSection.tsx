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
                title="ROLLOUT VERIFICATION"
                sub={
                    view.status === 'verified'
                        ? `VERIFIED ${stamp(view.decidedAt)} · ${view.coinEnabled && view.coin ? `COIN ON · ${view.coin.issued} / ${view.coin.cap} MINTED` : 'COIN NOT ENABLED YET'}`
                        : view.status === 'requested'
                          ? `REQUESTED ${stamp(view.requestedAt)} · AN ADMIN REVIEWS IT`
                          : view.status === 'revoked'
                            ? `REVOKED ${stamp(view.decidedAt)} · YOU CAN REQUEST AGAIN`
                            : 'VERIFIED EVENTS AWARD XP AT CHECK-IN AND CAN ISSUE A COIN'
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
                            {pending ? 'SENDING…' : 'REQUEST VERIFICATION'}
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
                            <a className="text-link" href={view.attestations.artwork_url} target="_blank" rel="noreferrer">COIN ARTWORK</a>
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
                            <div className="admin-page-sub">DOOR CODE · MEMBERS SCAN OR TYPE IT IN THE APP</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '6px', margin: '6px 0 10px', wordBreak: 'break-all' }}>
                                {view.checkinCode ?? '— NO CODE YET —'}
                            </div>
                            <button type="button" className="admin-action-btn muted" onClick={rotate} disabled={pending}>
                                {pending ? 'WORKING…' : view.checkinCode ? 'ROTATE CODE' : 'CREATE CODE'}
                            </button>
                            {view.coin?.artworkUrl ? (
                                <a className="text-link" href={view.coin.artworkUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>COIN ARTWORK</a>
                            ) : null}
                        </div>
                    </div>

                    <Head title="CHECKED IN" sub={`${view.checkins.length} AT THE DOOR · ${waiting.length} GOING, NOT YET IN`} />
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>HANDLE</th>
                                    <th>NAME</th>
                                    <th>HOW</th>
                                    <th>COIN</th>
                                    <th>TIME</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.checkins.length === 0 ? (
                                    <tr><td colSpan={5}><div className="admin-empty">NOBODY HAS CHECKED IN YET.</div></td></tr>
                                ) : (
                                    view.checkins.map((c) => (
                                        <tr key={c.profileId}>
                                            <td>{c.handle ? <span className="text-link">@{c.handle}</span> : '—'}</td>
                                            <td>{c.displayName ?? '—'}</td>
                                            <td><span className="admin-pill">{c.method.replace('_', ' ').toUpperCase()}{c.arrivedAt ? ' · ARRIVED' : ''}</span></td>
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
                            <Head title="AT THE DOOR" sub="GOING BUT NOT CHECKED IN · CHECK THEM IN BY HAND IF THEIR PHONE FAILS" />
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>HANDLE</th>
                                            <th>NAME</th>
                                            <th style={{ textAlign: 'right' }}>ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {waiting.map((g) => (
                                            <tr key={g.profileId}>
                                                <td>{g.handle ? <span className="text-link">@{g.handle}</span> : '—'}</td>
                                                <td>{g.displayName ?? '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button type="button" className="admin-action-btn" disabled={pending} onClick={() => checkIn(g.profileId, g.handle)}>
                                                        CHECK IN
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
