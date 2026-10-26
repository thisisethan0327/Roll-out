'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RULES_V1 } from '@/lib/verification-rules';
import { decideEventVerification, enableEventCoins } from './event-actions';
import { CircleCheck, CircleX } from 'lucide-react';
import { adminStyles as a, sentence } from '@/components/glide-admin/parts';

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
        <article className={`${a.card} ${a.cardPad} ${a.stack}`} aria-label={`Event verification: ${req.title}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                    <div className={a.vTitle}>{req.title}</div>
                    <div className={a.meta}>
                        <span className={a.num}>{req.code ?? '—'}</span>
                        <span>{req.type ? sentence(req.type) : 'Event'}</span>
                        <span>{req.startAt ? req.startAt.slice(0, 16).replace('T', ' ') : '—'}</span>
                        <span>Cap {req.capacity ?? '—'}</span>
                    </div>
                </div>
                <span className={req.status === 'verified' ? 'admin-pill neon' : 'admin-pill gold'}>{sentence(req.status)}</span>
            </div>
            <div className={a.small}>
                Host @{req.hostHandle ?? '—'} · {req.hostCompletedVerified} completed verified
                {probation ? ' · on probation (cap ≤ 40)' : ''} · requested by @{req.requestedBy ?? '—'} ·{' '}
                {req.requestedAt.slice(0, 10)} · rules {req.rulesVersion}
            </div>
            <ul className={a.checks}>
                {RULES_V1.map((r) => {
                    const v = req.attestations[r.id];
                    const ok = r.kind === 'artwork' ? typeof v === 'string' : v === true;
                    return (
                        <li key={r.id}>
                            {ok ? (
                                <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />
                            ) : (
                                <CircleX size={16} strokeWidth={2} aria-hidden="true" className={a.dangerIc} />
                            )}
                            <span>
                                {r.title}:{' '}
                                {r.kind === 'artwork' ? (
                                    typeof v === 'string' ? (
                                        <a className="text-link" href={v} target="_blank" rel="noreferrer">
                                            artwork
                                        </a>
                                    ) : (
                                        <b>missing</b>
                                    )
                                ) : v === true ? (
                                    'attested'
                                ) : (
                                    <b>not attested</b>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {req.notes ? <div className={a.small}>Notes · {req.notes}</div> : null}
            {artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artwork} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
            ) : null}
            {err ? (
                <div className="admin-form-error" role="alert">
                    {err}
                </div>
            ) : null}
            <input
                className="admin-form-input"
                placeholder="Decision note"
                aria-label="Decision note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
            />
            <div className={a.actRow}>
                {req.status === 'requested' ? (
                    <>
                        <button type="button" className="admin-action-btn" disabled={pending} onClick={() => decide('verified')}>
                            Approve
                        </button>
                        <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => decide('rejected')}>
                            Reject
                        </button>
                    </>
                ) : (
                    <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => decide('revoked')}>
                        Revoke
                    </button>
                )}
            </div>
            {req.status === 'verified' && (
                <div className={a.coinRow}>
                    <div className={a.small} style={{ gridColumn: '1 / -1' }}>
                        {req.coin
                            ? `Coin on · ${req.coin.issued} / ${req.coin.cap} minted · ${sentence(req.coin.finish)}`
                            : 'Coin not enabled'}
                    </div>
                    <input
                        className="admin-form-input"
                        type="number"
                        min={1}
                        max={5000}
                        value={cap}
                        onChange={(e) => setCap(e.target.value)}
                        aria-label="Coin cap"
                    />
                    <select
                        className="admin-form-input"
                        value={finish}
                        onChange={(e) => setFinish(e.target.value as 'standard' | 'premium')}
                        aria-label="Finish"
                    >
                        <option value="standard">Standard</option>
                        <option value="premium">Premium</option>
                    </select>
                    <button type="button" className="admin-action-btn" disabled={pending} onClick={coins}>
                        {req.coin ? 'Update coin' : 'Enable coin'}
                    </button>
                </div>
            )}
        </article>
    );
}
