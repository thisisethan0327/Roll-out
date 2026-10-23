/**
 * The /suspended notice in Glide. Presentational: page.tsx reads the session
 * and the ban server-side (never from the URL) and hands the result here.
 */
import type { ReactNode } from 'react';
import { Ban, Check, Hourglass, LifeBuoy, LogOut, MessageSquareText, ShieldAlert, Ticket } from 'lucide-react';
import {
    APPEAL_BUSINESS_DAYS,
    REFUND_FAILED_PUBLIC,
    SUPPORT_EMAIL,
    addBusinessDays,
    type BanTicket,
    type MyBan,
} from '@/lib/ban';
import { Card, Chip, IconRoundel } from '@/components/glide/primitives';
import { AppealForm } from './AppealForm';
import { RequestRefundButton } from './RequestRefundButton';
import '@/components/glide-auth/auth.css';

function day(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function money(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

const ICON = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;

function ticketPill(t: BanTicket, mode: MyBan['refundMode']): { label: string; tint?: boolean; icon: ReactNode } {
    switch (t.refundStatus) {
        case 'refunded':
            return { label: 'Refunded', tint: true, icon: <Check {...ICON} /> };
        case 'failed':
            return { label: 'Refund pending', icon: <Hourglass {...ICON} /> };
        case 'withheld':
            return { label: 'Under review', icon: <Hourglass {...ICON} /> };
        case 'requested':
            return { label: 'Refund requested', icon: <Hourglass {...ICON} /> };
        case 'declined':
            return { label: 'Refund declined', icon: <Ban {...ICON} /> };
        case 'pending':
        case 'refunding':
        case 'skipped':
            return { label: 'Refund pending', icon: <Hourglass {...ICON} /> };
        default:
            // 'kept': a permanent ban's job has not reached this row yet; a temporary ban keeps it.
            return mode === 'auto'
                ? { label: 'Refund pending', icon: <Hourglass {...ICON} /> }
                : { label: 'Ticket kept', icon: <Ticket {...ICON} /> };
    }
}

function TicketsBlock({ ban }: { ban: MyBan }) {
    if (!ban.extended || ban.tickets.length === 0) return null;
    const mode = ban.refundMode;
    return (
        <Card as="section" className="ga-box" aria-labelledby="sus-tickets">
            <h2 className="g-card-h" id="sus-tickets">
                Your upcoming paid tickets
            </h2>
            <p>
                {mode === 'withhold'
                    ? `Refunds for these tickets are being reviewed. Reply to the suspension email or write to ${SUPPORT_EMAIL} with questions.`
                    : mode === 'on_request'
                      ? 'Your tickets are kept. If you do not want one, you can ask for a refund below; a person will decide.'
                      : 'These tickets are cancelled and refunded to the original payment method.'}
            </p>
            <ul className="g-rows">
                {ban.tickets.map((t) => {
                    const pill = ticketPill(t, mode);
                    const canRequest = mode === 'on_request' && t.refundStatus === 'kept';
                    return (
                        <li key={`${t.kind}:${t.orderId ?? ''}:${t.ticketId ?? ''}`} className="g-row">
                            <IconRoundel small>
                                <Ticket size={18} strokeWidth={1.75} />
                            </IconRoundel>
                            <span className="g-row-t">
                                <b>{t.eventTitle ?? 'Event'}</b>
                                <small>
                                    {day(t.startAt)}
                                    {t.amountCents > 0 ? ` · ${money(t.amountCents)}` : ''}
                                    {t.refundStatus === 'refunded' && t.refundCents != null ? ` · refunded ${money(t.refundCents)}` : ''}
                                </small>
                                {t.refundStatus === 'failed' ? <small>{t.errorPublic ?? REFUND_FAILED_PUBLIC}</small> : null}
                            </span>
                            {canRequest ? (
                                <RequestRefundButton
                                    orderId={t.kind === 'order' ? t.orderId : null}
                                    ticketId={t.kind === 'seat' ? t.ticketId : null}
                                />
                            ) : (
                                <Chip tint={pill.tint} icon={pill.icon}>
                                    {pill.label}
                                </Chip>
                            )}
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}

function AppealBlock({ ban, email }: { ban: MyBan; email: string | null }) {
    if (!ban.extended) {
        return (
            <Card as="section" className="ga-box" aria-labelledby="sus-appeal">
                <h2 className="g-card-h" id="sus-appeal">
                    Appeal
                </h2>
                <p>
                    Appeals open soon — email{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="ga-a">
                        {SUPPORT_EMAIL}
                    </a>
                </p>
            </Card>
        );
    }
    const a = ban.appeal;
    if (!a) {
        return (
            <Card as="section" className="ga-box" aria-labelledby="sus-appeal">
                <h2 className="g-card-h" id="sus-appeal">
                    Appeal this suspension
                </h2>
                <p>
                    Appeals are free. You get one appeal per suspension. A person (not an automated system) reads it and decides within{' '}
                    {APPEAL_BUSINESS_DAYS} business days.
                </p>
                <div className="ga-box-in">
                    <AppealForm defaultEmail={email} />
                </div>
            </Card>
        );
    }
    const due = a.createdAt ? addBusinessDays(new Date(a.createdAt), APPEAL_BUSINESS_DAYS).toISOString() : null;
    const open = a.status === 'submitted' || a.status === 'in_review';
    return (
        <Card as="section" className="ga-box" aria-labelledby="sus-appeal">
            <h2 className="g-card-h" id="sus-appeal">
                Your appeal
            </h2>
            <div className="ga-box-in">
                {open ? (
                    <Chip tint={a.status === 'in_review'} icon={<MessageSquareText {...ICON} />}>
                        {a.status === 'in_review' ? 'Under review' : 'Received'}
                    </Chip>
                ) : (
                    <Chip tint={a.status === 'overturned'} icon={a.status === 'overturned' ? <Check {...ICON} /> : <Ban {...ICON} />}>
                        {a.status === 'overturned' ? 'Overturned' : 'Suspension upheld'}
                    </Chip>
                )}
            </div>
            <p>
                {open ? (
                    <>
                        We received your appeal{a.createdAt ? ` on ${day(a.createdAt)}` : ''}. A person will decide
                        {due ? ` by ${day(due)}` : ` within ${APPEAL_BUSINESS_DAYS} business days`} and email you the outcome.
                    </>
                ) : (
                    <>
                        {a.decidedAt ? `Decided ${day(a.decidedAt)}. ` : ''}
                        This was the one appeal available for this suspension.
                        {a.decisionPublicNote ? ` ${a.decisionPublicNote}` : ''}
                    </>
                )}
            </p>
        </Card>
    );
}

export function SuspendedView({
    handle,
    email,
    end,
    ban,
    signOut,
}: {
    handle: string;
    email: string | null;
    /** describeBanEnd(): "until Nov 3, 2026 (UTC)", "permanently" or "". */
    end: string;
    ban: MyBan;
    signOut: () => Promise<void>;
}) {
    const subject = encodeURIComponent(`Account suspension: @${handle}`);
    return (
        <div className="glide glide-page ga-read">
            <div className="g-wrap">
                <div className="ga-sus">
                    <Card as="section" edge className="ga-sus-h" aria-labelledby="sus-title">
                        <IconRoundel>
                            <ShieldAlert size={22} strokeWidth={1.75} />
                        </IconRoundel>
                        <h1 id="sus-title">Your account is suspended</h1>
                        <p className="ga-sus-who">
                            {end ? `@${handle} is suspended on Rollout ${end}.` : `@${handle} is suspended on Rollout.`}
                        </p>
                        {ban.publicNote ? <p className="ga-quote">{ban.publicNote}</p> : null}
                        <p>
                            While the suspension is in place your member dashboard, shop console, posting, RSVPs, bookings, profile edits and
                            account deletion are closed. You can still browse public pages. For a copy of your data or to ask for deletion,
                            write to{' '}
                            <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="ga-a">
                                {SUPPORT_EMAIL}
                            </a>
                            .
                        </p>
                    </Card>

                    <TicketsBlock ban={ban} />
                    <AppealBlock ban={ban} email={email} />

                    <div className="ga-sus-acts">
                        <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="g-sec">
                            <LifeBuoy size={18} strokeWidth={1.75} aria-hidden="true" />
                            Contact support
                        </a>
                        <form action={signOut}>
                            <button type="submit" className="g-sec g-sec--ink">
                                <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
                                Sign out
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
