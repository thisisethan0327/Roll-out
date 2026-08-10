'use client';
/**
 * Onboarding form (client). Live handle availability (debounced server check),
 * display name, and an optional bio. Submits via claimProfileAction, which
 * redirects on success. Styling reuses the admin-login / admin-form primitives
 * so it matches the rest of the auth surface.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { checkHandleAction, claimProfileAction } from './actions';
import { PendingButton } from '@/components/feedback';

type HandleState =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | { kind: 'bad'; reason: string };

export function OnboardingForm({
    suggestedName,
    next,
}: {
    suggestedName: string;
    next?: string;
}) {
    const [handle, setHandle] = useState('');
    const [displayName, setDisplayName] = useState(suggestedName);
    const [bio, setBio] = useState('');
    const [handleState, setHandleState] = useState<HandleState>({ kind: 'idle' });
    const [formErr, setFormErr] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);

    // Debounced availability check as the user types.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const normalized = handle.trim().toLowerCase().replace(/^@+/, '');
        if (!normalized) {
            setHandleState({ kind: 'idle' });
            return;
        }
        setHandleState({ kind: 'checking' });
        const mySeq = ++seqRef.current;
        debounceRef.current = setTimeout(async () => {
            const res = await checkHandleAction(normalized);
            // Ignore stale responses (user kept typing).
            if (mySeq !== seqRef.current) return;
            setHandleState(res.ok ? { kind: 'ok' } : { kind: 'bad', reason: res.reason ?? 'Unavailable.' });
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [handle]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormErr(null);
        if (handleState.kind === 'bad') {
            setFormErr(handleState.reason);
            return;
        }
        if (!displayName.trim()) {
            setFormErr('Enter a display name.');
            return;
        }
        startTransition(async () => {
            const res = await claimProfileAction({ handle, displayName, bio, next });
            // Only returns on failure (success redirects).
            if (res && !res.ok) setFormErr(res.error);
        });
    };

    const hint = (() => {
        switch (handleState.kind) {
            case 'checking':
                return { text: 'CHECKING…', color: 'var(--text-3)' };
            case 'ok':
                return { text: '✓ AVAILABLE', color: 'var(--gold)' };
            case 'bad':
                return { text: handleState.reason.toUpperCase(), color: '#e5484d' };
            default:
                return { text: 'LETTERS, NUMBERS, UNDERSCORES · 3–20 CHARS', color: 'var(--text-3)' };
        }
    })();

    const canSubmit =
        !pending &&
        handleState.kind === 'ok' &&
        displayName.trim().length > 0;

    return (
        <form onSubmit={submit} className="admin-login-form">
            <label className="admin-login-label">HANDLE</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono, monospace)' }}>@</span>
                <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="your_handle"
                    className="admin-login-input"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ flex: 1 }}
                    required
                />
            </div>
            <div
                style={{
                    fontSize: 10,
                    letterSpacing: 'var(--track-wider)',
                    color: hint.color,
                    fontFamily: 'var(--font-display)',
                    minHeight: 14,
                }}
            >
                {hint.text}
            </div>

            <label className="admin-login-label">DISPLAY NAME</label>
            <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What people call you"
                className="admin-login-input"
                maxLength={60}
                required
            />

            <label className="admin-login-label">BIO · OPTIONAL</label>
            <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Your builds, your lane… (optional)"
                className="admin-login-input"
                maxLength={280}
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            {formErr && <div className="admin-login-error">{formErr}</div>}

            <PendingButton
                type="submit"
                pending={pending}
                pendingLabel="SETTING UP"
                disabled={!canSubmit}
                className="admin-login-btn"
            >
                ENTER ROLLOUT ›
            </PendingButton>
            <p
                style={{
                    fontSize: 10,
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 'var(--track-wide)',
                    textAlign: 'center',
                    margin: '4px 0 0',
                }}
            >
                ONE ACCOUNT FOR ROLLOUT · NEFERSTOCK · EMWRAPS
            </p>
        </form>
    );
}
