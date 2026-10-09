'use client';
/**
 * The one appeal a banned member gets per suspension. The text goes to a server
 * action (never a URL). Free, electronic, read by a person.
 */
import { useActionState, useState } from 'react';
import { submitBanAppealAction, type AppealResult } from './actions';
import { APPEAL_MAX, APPEAL_MIN } from '@/lib/ban';

export function AppealForm({ defaultEmail }: { defaultEmail: string | null }) {
    const [state, formAction, pending] = useActionState<AppealResult | null, FormData>(submitBanAppealAction, null);
    const [text, setText] = useState('');

    return (
        <form action={formAction} style={{ display: 'grid', gap: 12, textAlign: 'left' }}>
            <label style={{ display: 'grid', gap: 6 }}>
                <span className="admin-form-label">WHY SHOULD THIS BE REVERSED?</span>
                <textarea
                    name="text"
                    className="admin-form-input"
                    rows={6}
                    minLength={APPEAL_MIN}
                    maxLength={APPEAL_MAX}
                    required
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={pending}
                    style={{ resize: 'vertical' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {text.trim().length}/{APPEAL_MAX} · at least {APPEAL_MIN} characters
                </span>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
                <span className="admin-form-label">CONTACT EMAIL (OPTIONAL)</span>
                <input
                    name="contact"
                    type="email"
                    className="admin-form-input"
                    maxLength={254}
                    defaultValue={defaultEmail ?? ''}
                    disabled={pending}
                    autoComplete="email"
                />
            </label>
            {state && !state.ok && state.error ? <div className="admin-login-error">{state.error}</div> : null}
            {state?.ok && state.message ? <div style={{ fontSize: 14 }}>{state.message}</div> : null}
            <div>
                <button type="submit" className="btn" disabled={pending || text.trim().length < APPEAL_MIN}>
                    {pending ? 'Sending…' : 'Send appeal'}
                </button>
            </div>
        </form>
    );
}
