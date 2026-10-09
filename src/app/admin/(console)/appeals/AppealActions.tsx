'use client';
import { useState, useTransition } from 'react';
import { decideAppeal, takeAppeal } from './actions';

/**
 * TAKE (submitted -> in review) and DECIDE (uphold / overturn) controls for one
 * appeal. Authorization is server-side in actions.ts; the disabled states here
 * are convenience. The issuing admin is warned up front, and when the server
 * refuses the issuing admin the explicit "decide anyway (logged)" box appears.
 */
export function AppealActions({
    appealId,
    status,
    issuedByMe,
}: {
    appealId: string;
    status: 'submitted' | 'in_review' | 'upheld' | 'overturned';
    /** The viewing admin issued this ban. */
    issuedByMe: boolean;
}) {
    const [pending, start] = useTransition();
    const [note, setNote] = useState('');
    const [publicNote, setPublicNote] = useState('');
    const [override, setOverride] = useState(false);
    const [needsOverride, setNeedsOverride] = useState(issuedByMe);
    const [err, setErr] = useState<string | null>(null);

    if (status === 'upheld' || status === 'overturned') return null;

    const take = () => {
        setErr(null);
        start(async () => {
            const res = await takeAppeal(appealId);
            if (!res.ok) setErr(res.error ?? 'Failed');
        });
    };

    const decide = (decision: 'upheld' | 'overturned') => {
        setErr(null);
        if (needsOverride && !override) {
            return setErr('You issued this ban. Tick the box to decide it anyway (this is logged), or leave it to another admin.');
        }
        const verb = decision === 'overturned' ? 'OVERTURN (lifts the ban now)' : 'UPHOLD (the ban stays)';
        if (!confirm(`${verb}? The member is emailed the outcome. One appeal per ban: this is final.`)) return;
        start(async () => {
            const res = await decideAppeal({
                appealId,
                decision,
                note,
                publicNote,
                sameAdminOverride: override,
            });
            if (!res.ok) {
                if (res.needsOverride) setNeedsOverride(true);
                setErr(res.error ?? 'Failed');
            }
        });
    };

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            {status === 'submitted' && (
                <div>
                    <button className="admin-action-btn muted" disabled={pending} onClick={take}>
                        {pending ? '…' : 'TAKE FOR REVIEW'}
                    </button>
                </div>
            )}
            <textarea
                className="admin-form-input"
                placeholder="Internal note (optional, admins only)"
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
            />
            <textarea
                className="admin-form-input"
                placeholder="Note to the member (optional, shown on /suspended and emailed)"
                rows={2}
                maxLength={600}
                value={publicNote}
                onChange={(e) => setPublicNote(e.target.value)}
                disabled={pending}
            />
            {needsOverride && (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <input
                        type="checkbox"
                        checked={override}
                        onChange={(e) => setOverride(e.target.checked)}
                        disabled={pending}
                    />
                    No other admin is available — decide anyway (logged)
                </label>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="admin-action-btn" disabled={pending} onClick={() => decide('overturned')}>
                    OVERTURN · LIFT BAN
                </button>
                <button className="admin-action-btn danger" disabled={pending} onClick={() => decide('upheld')}>
                    UPHOLD
                </button>
            </div>
            {err && <div style={{ color: 'var(--warn)', fontSize: 12 }}>{err}</div>}
        </div>
    );
}
