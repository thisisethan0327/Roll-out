'use client';
import { useState, useTransition } from 'react';
import { decideAppeal, takeAppeal } from './actions';
import { Gavel, ShieldCheck } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';

/**
 * TAKE (submitted -> in review) and DECIDE (uphold / overturn) controls for one
 * appeal. Authorization is server-side in actions.ts; the disabled states here
 * are convenience. The issuing admin is warned up front, and when the server
 * refuses the issuing admin the explicit "decide anyway (logged)" box appears.
 * Deciding asks through confirmDialog, naming the member: the member is
 * emailed and the decision is final.
 */
export function AppealActions({
    appealId,
    status,
    issuedByMe,
    memberHandle,
}: {
    appealId: string;
    /** The banned member's handle, for the confirm title. */
    memberHandle?: string | null;
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

    const decide = async (decision: 'upheld' | 'overturned') => {
        setErr(null);
        if (needsOverride && !override) {
            return setErr('You issued this ban. Tick the box to decide it anyway (this is logged), or leave it to another admin.');
        }
        const who = memberHandle ? `@${memberHandle}` : 'The member';
        const overturn = decision === 'overturned';
        const ok = await confirmDialog({
            title: overturn
                ? `Overturn the ban on ${memberHandle ? who : 'this member'}?`
                : `Uphold the ban on ${memberHandle ? who : 'this member'}?`,
            message: `${overturn ? 'The ban lifts now.' : 'The ban stays.'} ${who} is emailed the outcome. One appeal per ban: this is final.`,
            confirmLabel: overturn ? 'Overturn' : 'Uphold',
            danger: !overturn,
        });
        if (!ok) return;
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
        <div className={a.stack} style={{ gap: 10 }}>
            {status === 'submitted' && (
                <div>
                    <button className="admin-action-btn muted" disabled={pending} onClick={take}>
                        {pending ? 'Taking…' : 'Take for review'}
                    </button>
                </div>
            )}
            <textarea
                className="admin-form-input"
                placeholder="Internal note"
                aria-label="Internal note"
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
            />
            <textarea
                className="admin-form-input"
                placeholder="Note to the member, shown on /suspended and emailed"
                aria-label="Note to the member, shown on /suspended and emailed"
                rows={2}
                maxLength={600}
                value={publicNote}
                onChange={(e) => setPublicNote(e.target.value)}
                disabled={pending}
            />
            {needsOverride && (
                <label className={a.choice} style={{ alignSelf: 'start' }}>
                    <input
                        type="checkbox"
                        checked={override}
                        onChange={(e) => setOverride(e.target.checked)}
                        disabled={pending}
                    />
                    No other admin is available — decide anyway (logged)
                </label>
            )}
            <div className={a.actRow}>
                <button className="admin-action-btn" disabled={pending} onClick={() => decide('overturned')}>
                    <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" /> Overturn and lift ban
                </button>
                <button className="admin-action-btn danger" disabled={pending} onClick={() => decide('upheld')}>
                    <Gavel size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Uphold
                </button>
            </div>
            {err && <div className="admin-login-error" role="alert">{err}</div>}
        </div>
    );
}
