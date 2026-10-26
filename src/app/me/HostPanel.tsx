'use client';
/**
 * "Become a host" panel on the /me overview, in Glide.
 *
 * Three states driven by the member's host_status:
 *   • none      → pitch + apply form (become_host RPC via becomeHostAction)
 *   • pending   → "under review" notice
 *   • verified  → success + link into /me/events (host your own meets)
 *
 * Nominated members (host_appointed_by_shop_id set) whose status is pending see
 * a slightly different note (a shop vouched for them).
 */
import { useActionState } from 'react';
import { BadgeCheck, CircleAlert, Clock, Flag, LoaderCircle, Plus } from 'lucide-react';
import { becomeHostAction } from './actions';
import { Card, GlideButton, SecButton } from '@/components/glide/primitives';
import { CardHead } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';

type HostStatus = 'none' | 'pending' | 'verified';

export function HostPanel({ hostStatus, nominated }: { hostStatus: HostStatus; nominated: boolean }) {
    const [state, formAction, pending] = useActionState(becomeHostAction, null);

    return (
        <Card as="section" aria-labelledby="host-h">
            <CardHead id="host-h" title="Host on Rollout" action={<StatusBadge status={hostStatus} />} />
            <div className={s.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {hostStatus === 'verified' ? (
                    <>
                        <p className={s.small} style={{ fontSize: 15 }}>
                            You’re a verified host. Create your own meets, runs, and shows — they appear on the public Meets directory and map, and you can invite people by email.
                        </p>
                        <div className={s.actRow}>
                            <GlideButton href="/me/events/new" size="sm" icon={<Plus size={18} strokeWidth={2} />}>
                                Host an event
                            </GlideButton>
                            <SecButton href="/me/events" className="g-sec--ink">
                                My events
                            </SecButton>
                        </div>
                    </>
                ) : hostStatus === 'pending' ? (
                    <p className={s.small} style={{ fontSize: 15 }}>
                        {nominated
                            ? 'A shop nominated you as a host. A Rollout admin is reviewing it — you’ll be able to host your own events once approved.'
                            : 'Your host application is under review. We’ll email you the moment a Rollout admin approves it, and hosting unlocks here.'}
                    </p>
                ) : (
                    <>
                        <p className={s.small} style={{ fontSize: 15 }}>
                            Want to run your own meets? Apply to become an individual host. Once a Rollout admin verifies you, you can create community events (no shop required) and invite people by email.
                        </p>
                        <form action={formAction} className={s.form}>
                            <div className={s.field}>
                                <label className={s.label} htmlFor="host-why">
                                    What do you want to host?
                                </label>
                                <textarea
                                    id="host-why"
                                    name="why"
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Helps the review."
                                    className={s.input}
                                />
                            </div>
                            {state?.error ? (
                                <p className={`${s.hint} ${s.hintBad}`} role="alert">
                                    <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
                                    {state.error}
                                </p>
                            ) : null}
                            <div>
                                <GlideButton
                                    type="submit"
                                    size="sm"
                                    disabled={pending}
                                    aria-busy={pending}
                                    icon={pending ? <LoaderCircle size={18} strokeWidth={2} className="g-spin" /> : undefined}
                                >
                                    {pending ? 'Submitting…' : 'Apply to host'}
                                </GlideButton>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </Card>
    );
}

function StatusBadge({ status }: { status: HostStatus }) {
    const ic = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;
    if (status === 'verified') {
        return (
            <span className="g-chip g-chip--tint">
                <BadgeCheck {...ic} />
                Verified host
            </span>
        );
    }
    if (status === 'pending') {
        return (
            <span className="g-chip">
                <Clock {...ic} />
                Under review
            </span>
        );
    }
    return (
        <span className="g-chip">
            <Flag {...ic} />
            Not a host
        </span>
    );
}
