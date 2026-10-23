'use client';
/**
 * The one appeal a banned member gets per suspension. The text goes to a server
 * action (never a URL). Free, electronic, read by a person.
 */
import { useActionState, useState } from 'react';
import { submitBanAppealAction, type AppealResult } from './actions';
import { APPEAL_MAX, APPEAL_MIN } from '@/lib/ban';
import { ArrowRight, CircleAlert, CircleCheck, LoaderCircle, Mail } from 'lucide-react';

export function AppealForm({ defaultEmail }: { defaultEmail: string | null }) {
    const [state, formAction, pending] = useActionState<AppealResult | null, FormData>(submitBanAppealAction, null);
    const [text, setText] = useState('');

    return (
        <form action={formAction} className="ga-form">
            <label className="ga-label" htmlFor="appeal-text" style={{ marginTop: 4 }}>
                Why should this be reversed?
            </label>
            <textarea
                id="appeal-text"
                name="text"
                className="ga-in"
                rows={6}
                minLength={APPEAL_MIN}
                maxLength={APPEAL_MAX}
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={pending}
                aria-describedby="appeal-count"
            />
            <span className="ga-count" id="appeal-count">
                <span className="g-w">{text.trim().length}</span>/<span className="g-w">{APPEAL_MAX}</span> · at least {APPEAL_MIN} characters
            </span>
            <label className="ga-label" htmlFor="appeal-contact">
                Contact email <small>· optional</small>
            </label>
            <div className="ga-fld">
                <Mail size={20} strokeWidth={1.75} aria-hidden="true" />
                <input
                    id="appeal-contact"
                    name="contact"
                    type="email"
                    maxLength={254}
                    defaultValue={defaultEmail ?? ''}
                    disabled={pending}
                    autoComplete="email"
                />
            </div>
            {state && !state.ok && state.error ? (
                <p className="ga-msg" role="alert">
                    <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
                    <span>{state.error}</span>
                </p>
            ) : null}
            {state?.ok && state.message ? (
                <p className="ga-msg" role="status">
                    <CircleCheck size={18} strokeWidth={2} aria-hidden="true" />
                    <span>{state.message}</span>
                </p>
            ) : null}
            <button type="submit" className="g-btn g-btn--block" disabled={pending || text.trim().length < APPEAL_MIN} aria-busy={pending}>
                <span>{pending ? 'Sending' : 'Send appeal'}</span>
                <span className="g-btn-k" aria-hidden="true">
                    {pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <ArrowRight size={20} strokeWidth={2} />}
                </span>
            </button>
        </form>
    );
}
