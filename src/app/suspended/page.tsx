/**
 * /suspended — the ONE place a Rollout-banned member can be (Part 2, Ethan
 * 2026-10-09). The middleware, requireSession/requireConsumer and /auth/landing
 * all send them here; the dashboard, shop console, profile edits and account
 * deletion are closed (data and deletion requests go through support).
 *
 * It is the notice of the restriction (what, how long, the reason the admin
 * chose to share, what is closed) and the way out: one free appeal per
 * suspension, read by a person within 5 business days; paid-ticket and refund
 * status; sign out.
 *
 * Deliberately does NOT use requireConsumer (it would redirect here: a loop).
 * The ban state is read server-side from the session cookie via my_ban() on the
 * member's own session; nothing about the ban comes from the URL or the client.
 * A signed-out visitor goes to /login; a member who is not (or no longer) banned
 * goes to /me. Before migration 093 the page falls back to the 091 notice and
 * says appeals open soon.
 *
 * Sign-out is GLOBAL (Ethan's 2026-09-08 ruling) via the shared signOutAction.
 */
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
import {
    APPEAL_BUSINESS_DAYS,
    REFUND_FAILED_PUBLIC,
    SUPPORT_EMAIL,
    addBusinessDays,
    describeBanEnd,
    isProfileBanned,
    type BanTicket,
    type MyBan,
} from '@/lib/ban';
import { loadMyBan } from '@/lib/my-ban';
import { signOutAction } from '@/app/me/actions';
import { AppealForm } from './AppealForm';
import { RequestRefundButton } from './RequestRefundButton';

export const metadata = { title: 'Account suspended', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const BOX: React.CSSProperties = {
    margin: '0 auto 20px',
    maxWidth: 560,
    padding: '14px 18px',
    border: '1px solid var(--line)',
    textAlign: 'left',
};

function day(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function money(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function ticketPill(t: BanTicket, mode: MyBan['refundMode']): { label: string; cls: string } {
    switch (t.refundStatus) {
        case 'refunded':
            return { label: 'REFUNDED', cls: 'admin-pill neon' };
        case 'failed':
            return { label: 'REFUND PENDING', cls: 'admin-pill warn' };
        case 'withheld':
            return { label: 'UNDER REVIEW', cls: 'admin-pill gold' };
        case 'requested':
            return { label: 'REFUND REQUESTED', cls: 'admin-pill gold' };
        case 'declined':
            return { label: 'REFUND DECLINED', cls: 'admin-pill' };
        case 'pending':
        case 'refunding':
        case 'skipped':
            return { label: 'REFUND PENDING', cls: 'admin-pill gold' };
        default:
            // 'kept': a permanent ban's job has not reached this row yet; a temporary ban keeps it.
            return mode === 'auto'
                ? { label: 'REFUND PENDING', cls: 'admin-pill gold' }
                : { label: 'TICKET KEPT', cls: 'admin-pill' };
    }
}

function TicketsBlock({ ban }: { ban: MyBan }) {
    if (!ban.extended || ban.tickets.length === 0) return null;
    const mode = ban.refundMode;
    return (
        <div style={BOX}>
            <div className="admin-form-label" style={{ marginBottom: 8 }}>
                YOUR UPCOMING PAID TICKETS
            </div>
            <div className="text-dim" style={{ fontSize: 14, marginBottom: 12 }}>
                {mode === 'withhold'
                    ? `Refunds for these tickets are being reviewed. Reply to the suspension email or write to ${SUPPORT_EMAIL} with questions.`
                    : mode === 'on_request'
                      ? 'Your tickets are kept. If you do not want one, you can ask for a refund below; a person will decide.'
                      : 'These tickets are cancelled and refunded to the original payment method.'}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
                {ban.tickets.map((t) => {
                    const pill = ticketPill(t, mode);
                    const canRequest = mode === 'on_request' && t.refundStatus === 'kept';
                    return (
                        <div
                            key={`${t.kind}:${t.orderId ?? ''}:${t.ticketId ?? ''}`}
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 15 }}>{t.eventTitle ?? 'Event'}</div>
                                <div className="text-dim" style={{ fontSize: 12 }}>
                                    {day(t.startAt)}
                                    {t.amountCents > 0 ? ` · ${money(t.amountCents)}` : ''}
                                    {t.refundStatus === 'refunded' && t.refundCents != null
                                        ? ` · refunded ${money(t.refundCents)}`
                                        : ''}
                                </div>
                                {t.refundStatus === 'failed' ? (
                                    <div className="text-dim" style={{ fontSize: 12 }}>
                                        {t.errorPublic ?? REFUND_FAILED_PUBLIC}
                                    </div>
                                ) : null}
                            </div>
                            {canRequest ? (
                                <RequestRefundButton
                                    orderId={t.kind === 'order' ? t.orderId : null}
                                    ticketId={t.kind === 'seat' ? t.ticketId : null}
                                />
                            ) : (
                                <span className={pill.cls}>{pill.label}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function AppealBlock({ ban, email }: { ban: MyBan; email: string | null }) {
    if (!ban.extended) {
        return (
            <div style={BOX}>
                <div className="admin-form-label" style={{ marginBottom: 8 }}>
                    APPEAL
                </div>
                <div style={{ fontSize: 15 }}>
                    Appeals open soon — email{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link">
                        {SUPPORT_EMAIL}
                    </a>
                </div>
            </div>
        );
    }
    const a = ban.appeal;
    if (!a) {
        return (
            <div style={BOX}>
                <div className="admin-form-label" style={{ marginBottom: 8 }}>
                    APPEAL THIS SUSPENSION
                </div>
                <div className="text-dim" style={{ fontSize: 14, marginBottom: 14 }}>
                    Appeals are free. You get one appeal per suspension. A person (not an automated system) reads it and
                    decides within {APPEAL_BUSINESS_DAYS} business days.
                </div>
                <AppealForm defaultEmail={email} />
            </div>
        );
    }
    const due = a.createdAt ? addBusinessDays(new Date(a.createdAt), APPEAL_BUSINESS_DAYS).toISOString() : null;
    return (
        <div style={BOX}>
            <div className="admin-form-label" style={{ marginBottom: 8 }}>
                YOUR APPEAL
            </div>
            {a.status === 'submitted' || a.status === 'in_review' ? (
                <>
                    <div style={{ marginBottom: 6 }}>
                        <span className={a.status === 'in_review' ? 'admin-pill gold' : 'admin-pill'}>
                            {a.status === 'in_review' ? 'UNDER REVIEW' : 'RECEIVED'}
                        </span>
                    </div>
                    <div className="text-dim" style={{ fontSize: 14 }}>
                        We received your appeal{a.createdAt ? ` on ${day(a.createdAt)}` : ''}. A person will decide
                        {due ? ` by ${day(due)}` : ` within ${APPEAL_BUSINESS_DAYS} business days`} and email you the
                        outcome.
                    </div>
                </>
            ) : (
                <>
                    <div style={{ marginBottom: 6 }}>
                        <span className="admin-pill warn">
                            {a.status === 'overturned' ? 'OVERTURNED' : 'SUSPENSION UPHELD'}
                        </span>
                    </div>
                    <div className="text-dim" style={{ fontSize: 14 }}>
                        {a.decidedAt ? `Decided ${day(a.decidedAt)}. ` : ''}
                        This was the one appeal available for this suspension.
                        {a.decisionPublicNote ? ` ${a.decisionPublicNote}` : ''}
                    </div>
                </>
            )}
        </div>
    );
}

export default async function SuspendedPage() {
    const me = await getConsumerProfile();
    if (!me) redirect('/login');
    if (!isProfileBanned(me)) redirect('/me');

    const ban = await loadMyBan(me.profileId, me.bannedUntil);
    const end = describeBanEnd(ban.bannedUntil ?? me.bannedUntil);
    const subject = encodeURIComponent(`Account suspension: @${me.handle}`);

    return (
        <div className="legal">
            <div className="container container-narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
                <div className="eyebrow eyebrow-gold mb-4">／ ACCOUNT SUSPENDED</div>
                <h1 style={{ marginBottom: 12 }}>Your account is suspended</h1>
                <p className="text-dim" style={{ fontSize: 17, marginBottom: 16 }}>
                    {end
                        ? `@${me.handle} is suspended on Rollout ${end}.`
                        : `@${me.handle} is suspended on Rollout.`}
                </p>
                {ban.publicNote ? (
                    <p
                        style={{
                            fontSize: 16,
                            margin: '0 auto 16px',
                            maxWidth: 520,
                            padding: '12px 16px',
                            border: '1px solid var(--line)',
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {ban.publicNote}
                    </p>
                ) : null}
                <p className="text-dim" style={{ fontSize: 15, margin: '0 auto 24px', maxWidth: 560 }}>
                    While the suspension is in place your member dashboard, shop console, posting, RSVPs, bookings,
                    profile edits and account deletion are closed. You can still browse public pages. For a copy of your
                    data or to ask for deletion, write to{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="text-link">
                        {SUPPORT_EMAIL}
                    </a>
                    .
                </p>

                <TicketsBlock ban={ban} />
                <AppealBlock ban={ban} email={me.email} />

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="btn btn-ghost">
                        Contact support
                    </a>
                    <form action={signOutAction}>
                        <button type="submit" className="btn btn-ghost">
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
