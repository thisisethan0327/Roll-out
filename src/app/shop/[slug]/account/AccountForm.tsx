'use client';
/**
 * MY ACCOUNT edit form (client). Live handle availability (debounced server
 * check, shared with onboarding rules), display name, and optional bio. Submits
 * via saveAccountAction, which — unlike onboarding — returns a result instead of
 * redirecting, so we show an inline "saved" state and refresh the route (which
 * re-renders the sidebar's SIGNED IN AS block with the new handle/name).
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkAccountHandleAction, saveAccountAction } from './actions';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { FormSection } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

type HandleState =
    | { kind: 'idle' }
    | { kind: 'current' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | { kind: 'bad'; reason: string };

function normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/^@+/, '');
}

export function AccountForm({
    slug,
    initialHandle,
    initialDisplayName,
    initialBio,
}: {
    slug: string;
    initialHandle: string;
    initialDisplayName: string;
    initialBio: string;
}) {
    const router = useRouter();
    const [handle, setHandle] = useState(initialHandle);
    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [bio, setBio] = useState(initialBio);
    const [handleState, setHandleState] = useState<HandleState>({ kind: 'current' });
    const [formErr, setFormErr] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [pending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);

    // Debounced availability check as the user types.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const normalized = normalize(handle);
        if (!normalized) {
            setHandleState({ kind: 'idle' });
            return;
        }
        // Unchanged handle → no need to check; it's already yours.
        if (normalized === normalize(initialHandle)) {
            setHandleState({ kind: 'current' });
            return;
        }
        setHandleState({ kind: 'checking' });
        const mySeq = ++seqRef.current;
        debounceRef.current = setTimeout(async () => {
            const res = await checkAccountHandleAction(slug, normalized);
            if (mySeq !== seqRef.current) return; // ignore stale responses
            setHandleState(
                res.ok
                    ? { kind: 'ok' }
                    : { kind: 'bad', reason: res.reason ?? 'Unavailable.' },
            );
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [handle, initialHandle, slug]);

    const dirty =
        normalize(handle) !== normalize(initialHandle) ||
        displayName !== initialDisplayName ||
        bio !== initialBio;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormErr(null);
        setSaved(false);
        if (handleState.kind === 'bad') {
            setFormErr(handleState.reason);
            return;
        }
        if (!displayName.trim()) {
            setFormErr('Enter a display name.');
            return;
        }
        startTransition(async () => {
            const res = await saveAccountAction(slug, { handle, displayName, bio });
            if (!res.ok) {
                setFormErr(res.error);
                return;
            }
            setSaved(true);
            setHandleState({ kind: 'current' });
            // Re-render the layout so the sidebar reflects the new handle/name.
            router.refresh();
        });
    };

    const hintIc = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;
    const hint = (() => {
        switch (handleState.kind) {
            case 'checking':
                return (
                    <>
                        <LoaderCircle {...hintIc} className="g-spin" />
                        Checking…
                    </>
                );
            case 'ok':
                return (
                    <>
                        <Check {...hintIc} />
                        Available
                    </>
                );
            case 'current':
                return 'Your current handle';
            case 'bad':
                return (
                    <>
                        <CircleAlert {...hintIc} />
                        {handleState.reason}
                    </>
                );
            default:
                return 'Letters, numbers and underscores, 3–20 characters.';
        }
    })();

    const canSubmit =
        !pending &&
        dirty &&
        displayName.trim().length > 0 &&
        handleState.kind !== 'bad' &&
        handleState.kind !== 'checking';

    const inp = cx(cs.input, bz.in);

    return (
        <form onSubmit={submit} className={cs.col}>
            <FormSection id="acct-form" title="Profile" sub="Your handle, name and bio across the network." edge>
                <div className={cs.field}>
                    <label className={cs.label} htmlFor="acct-handle">
                        Handle
                    </label>
                    <div className={cs.affix}>
                        <span aria-hidden="true">@</span>
                        <input
                            id="acct-handle"
                            type="text"
                            value={handle}
                            onChange={(e) => {
                                setHandle(e.target.value);
                                setSaved(false);
                            }}
                            placeholder="your_handle"
                            className={inp}
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={handleState.kind === 'bad' || undefined}
                            aria-describedby="acct-handle-hint"
                        />
                    </div>
                    <p id="acct-handle-hint" className={cx(cs.hint, handleState.kind === 'bad' && cs.hintBad)} aria-live="polite">
                        {hint}
                    </p>
                </div>

                <div className={cs.field}>
                    <label className={cs.label} htmlFor="acct-name">
                        Display name
                    </label>
                    <input
                        id="acct-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                            setDisplayName(e.target.value);
                            setSaved(false);
                        }}
                        placeholder="What people call you"
                        className={inp}
                        maxLength={60}
                    />
                </div>

                <div className={cs.field}>
                    <label className={cs.label} htmlFor="acct-bio">
                        Bio (optional)
                    </label>
                    <textarea
                        id="acct-bio"
                        value={bio}
                        onChange={(e) => {
                            setBio(e.target.value);
                            setSaved(false);
                        }}
                        placeholder="Your builds, your lane…"
                        className={inp}
                        maxLength={280}
                        rows={3}
                    />
                </div>
            </FormSection>

            {formErr && (
                <Notice tone="bad" live>
                    {formErr}
                </Notice>
            )}
            {saved && !formErr && (
                <Notice tone="ok" live>
                    Saved.
                </Notice>
            )}

            <div>
                <GlideButton type="submit" disabled={!canSubmit} aria-busy={pending}>
                    {pending ? 'Saving…' : 'Save changes'}
                </GlideButton>
            </div>
        </form>
    );
}
