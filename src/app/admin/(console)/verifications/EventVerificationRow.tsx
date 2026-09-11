'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RULES_V1 } from '@/lib/verification-rules';
import { decideEventVerification, enableEventCoins } from './event-actions';

export type EventVReq = {
    eventId: string;
    status: 'requested' | 'verified';
    title: string;
    code: string | null;
    type: string | null;
    startAt: string | null;
    capacity: number | null;
    hostHandle: string | null;
    hostCompletedVerified: number;
    requestedBy: string | null;
    requestedAt: string;
    rulesVersion: string;
    attestations: Record<string, unknown>;
    notes: string | null;
    coin: { cap: number; issued: number; finish: string; artworkUrl: string | null } | null;
};

export function EventVerificationRow({ req }: { req: EventVReq }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [cap, setCap] = useState(String(req.coin?.cap ?? 100));
    const [finish, setFinish] = useState<'standard' | 'premium'>((req.coin?.finish as 'standard' | 'premium') ?? 'standard');
    const artwork = typeof req.attestations.artwork_url === 'string' ? req.attestations.artwork_url : (req.coin?.artworkUrl ?? null);
    const probation = req.hostCompletedVerified < 3;

    const decide = (status: 'verified' | 'rejected' | 'revoked') => {
        setErr(null);
        startTransition(async () => {
            const r = await decideEventVerification({ eventId: req.eventId, status, note });
            if (!r.ok) setErr(r.error);
            else router.refresh();
        });
    };
    const coins = () => {
        setErr(null);
        startTransition(async () => {
            const r = await enableEventCoins({ eventId: req.eventId, cap: Number(cap), finish, artworkUrl: artwork });
            if (!r.ok) setErr(r.error);
            else router.refresh();
        });
    };

    return (
        <div style={{ padding: 16, border: '1px solid var(--line, #1a1a28)', borderRadius: 4, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 'var(--track-wider)' }}>{req.title}</div>
                    <div className="admin-handle">
                        {req.code ?? '—'} · {req.type ?? 'EVENT'} · {req.startAt ? req.startAt.slice(0, 16).replace('T', ' ') : '—'} · CAP {req.capacity ?? '—'}
                    </div>
                </div>
                <span className={req.status === 'verified' ? 'admin-pill neon' : 'admin-pill gold'}>{req.status.toUpperCase()}</span>
            </div>
            <div className="admin-handle">
                HOST @{req.hostHandle ?? '—'} · {req.hostCompletedVerified} COMPLETED VERIFIED{probation ? ' · PROBATION (CAP ≤ 40)' : ''} · REQUESTED BY @{req.requestedBy ?? '—'} · {req.requestedAt.slice(0, 10)} · RULES {req.rulesVersion}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-dim)' }}>
                {RULES_V1.map((r) => {
                    const v = req.attestations[r.id];
                    return (
                        <li key={r.id}>
                            {r.title}:{' '}
                            {r.kind === 'artwork' ? (
                                typeof v === 'string' ? (
                                    <a className="text-link" href={v} target="_blank" rel="noreferrer">artwork</a>
                                ) : (
                                    <span style={{ color: 'var(--warn, #e86a45)' }}>missing</span>
                                )
                            ) : v === true ? (
                                'attested'
                            ) : (
                                <span style={{ color: 'var(--warn, #e86a45)' }}>NOT attested</span>
                            )}
                        </li>
                    );
                })}
            </ul>
            {req.notes ? <div className="admin-handle">NOTES · {req.notes}</div> : null}
            {artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artwork} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
            ) : null}
            {err ? <div className="admin-form-error">{err}</div> : null}
            <input className="admin-form-input" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {req.status === 'requested' ? (
                    <>
                        <button type="button" className="admin-action-btn" disabled={pending} onClick={() => decide('verified')}>APPROVE</button>
                        <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => decide('rejected')}>REJECT</button>
                    </>
                ) : (
                    <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => decide('revoked')}>REVOKE</button>
                )}
            </div>
            {req.status === 'verified' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', borderTop: '1px solid var(--line, #1a1a28)', paddingTop: 10 }}>
                    <div className="admin-handle" style={{ gridColumn: '1 / -1' }}>
                        {req.coin ? `COIN ON · ${req.coin.issued} / ${req.coin.cap} MINTED · ${req.coin.finish.toUpperCase()}` : 'COIN NOT ENABLED'}
                    </div>
                    <input className="admin-form-input" type="number" min={1} max={5000} value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Coin cap" />
                    <select className="admin-form-input" value={finish} onChange={(e) => setFinish(e.target.value as 'standard' | 'premium')} aria-label="Finish">
                        <option value="standard">STANDARD</option>
                        <option value="premium">PREMIUM</option>
                    </select>
                    <button type="button" className="admin-action-btn" disabled={pending} onClick={coins}>{req.coin ? 'UPDATE COIN' : 'ENABLE COIN'}</button>
                </div>
            )}
        </div>
    );
}
