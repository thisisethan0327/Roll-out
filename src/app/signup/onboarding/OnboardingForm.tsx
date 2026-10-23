'use client';
/**
 * Onboarding form (client), in the order a person actually thinks: DISPLAY
 * NAME first; the @HANDLE fills itself from the name (a slug — lowercase,
 * letters/digits/underscores — with a numeric suffix when the slug is taken)
 * and keeps the live availability check; the moment the handle is edited by
 * hand it stops following the name. Bio optional. Then an OPTIONAL shipping
 * address, stored on the member's store account so checkout prefills it.
 * Submits via claimProfileAction, which redirects on success.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { checkHandleAction, claimProfileAction, type OnboardingAddress } from './actions';
import { ArrowRight, AtSign, Check, ChevronDown, CircleAlert, Info, LoaderCircle, UserRound } from 'lucide-react';

type HandleState =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | { kind: 'bad'; reason: string };

/** "Jess O'Neil-Park" → "jess_o_neil_park"; guaranteed to start with a letter, 3–20 chars. */
export function slugFromName(name: string): string {
    let s = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_');
    if (s && !/^[a-z]/.test(s)) s = 'u_' + s;
    if (s.length < 3) return '';
    return s.slice(0, 20).replace(/_+$/g, '');
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const EMPTY_ADDRESS: OnboardingAddress = {
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    province: '',
    postalCode: '',
    countryCode: 'us',
    phone: '',
};

export function OnboardingForm({
    suggestedName,
    next,
}: {
    suggestedName: string;
    next?: string;
}) {
    const [displayName, setDisplayName] = useState(suggestedName);
    const [handle, setHandle] = useState(() => slugFromName(suggestedName));
    // Until the member edits the handle themselves it follows the name.
    const [handleTouched, setHandleTouched] = useState(false);
    const [bio, setBio] = useState('');
    const [address, setAddress] = useState<OnboardingAddress>(EMPTY_ADDRESS);
    const [handleState, setHandleState] = useState<HandleState>({ kind: 'idle' });
    const [formErr, setFormErr] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);
    // Collision suffix for the auto-slug: base_2, base_3 … (auto mode only).
    const suffixRef = useRef(1);

    const onNameChange = (v: string) => {
        setDisplayName(v);
        if (!handleTouched) {
            suffixRef.current = 1;
            setHandle(slugFromName(v));
        }
    };

    // Debounced availability check as the handle changes (typed or auto).
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
            if (mySeq !== seqRef.current) return; // stale
            if (res.ok) {
                setHandleState({ kind: 'ok' });
                return;
            }
            const taken = /taken/i.test(res.reason ?? '');
            // Auto mode + taken → try the next suffix (base_2, base_3 … base_9).
            if (!handleTouched && taken && suffixRef.current < 9) {
                suffixRef.current += 1;
                const base = slugFromName(displayName).slice(0, 20 - 2);
                setHandle(`${base}_${suffixRef.current}`);
                return;
            }
            setHandleState({ kind: 'bad', reason: res.reason ?? 'Unavailable.' });
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // displayName is read for the suffix base only when the auto slug collides
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handle, handleTouched]);

    const addressStarted = !!(address.address1 || address.city || address.postalCode);
    const addressComplete = !!(address.firstName && address.lastName && address.address1 && address.city && address.province && address.postalCode);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormErr(null);
        if (!displayName.trim()) {
            setFormErr('Enter a display name.');
            return;
        }
        if (handleState.kind === 'bad') {
            setFormErr(handleState.reason);
            return;
        }
        if (addressStarted && !addressComplete) {
            setFormErr('Finish the shipping address (name, street, city, state, ZIP) or clear it.');
            return;
        }
        startTransition(async () => {
            const res = await claimProfileAction({
                handle,
                displayName,
                bio,
                address: addressComplete ? address : null,
                next,
            });
            if (res && !res.ok) setFormErr(res.error); // success redirects
        });
    };

    const hint = (() => {
        switch (handleState.kind) {
            case 'checking':
                return { cls: 'ga-hint', icon: <LoaderCircle size={15} strokeWidth={2} className="g-spin" aria-hidden="true" />, text: 'Checking…' };
            case 'ok':
                return {
                    cls: 'ga-hint is-ok',
                    icon: <Check size={15} strokeWidth={2.25} aria-hidden="true" />,
                    text: handleTouched ? 'Available' : 'Available, from your name. Edit it if you like.',
                };
            case 'bad':
                return { cls: 'ga-hint is-bad', icon: <CircleAlert size={15} strokeWidth={2} aria-hidden="true" />, text: handleState.reason };
            default:
                return { cls: 'ga-hint', icon: null, text: 'Letters, numbers and underscores, 3 to 20 characters.' };
        }
    })();

    const canSubmit = !pending && handleState.kind === 'ok' && displayName.trim().length > 0 && (!addressStarted || addressComplete);

    const field = (key: keyof OnboardingAddress, label: string) => ({
        'aria-label': label,
        value: (address[key] ?? '') as string,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddress((a) => ({ ...a, [key]: e.target.value })),
        className: 'ga-in',
    });

    return (
        <form onSubmit={submit} className="ga-form">
            <label className="ga-label" htmlFor="onb-name">
                Display name
            </label>
            <div className="ga-fld">
                <UserRound size={20} strokeWidth={1.75} aria-hidden="true" />
                <input
                    id="onb-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="What people call you"
                    maxLength={60}
                    autoComplete="nickname"
                    autoFocus
                    required
                />
            </div>

            <label className="ga-label" htmlFor="onb-handle">
                Handle
            </label>
            <div className="ga-fld" data-invalid={handleState.kind === 'bad' ? 'true' : undefined}>
                <AtSign size={20} strokeWidth={1.75} aria-hidden="true" />
                <input
                    id="onb-handle"
                    type="text"
                    value={handle}
                    onChange={(e) => {
                        setHandleTouched(true);
                        setHandle(e.target.value);
                    }}
                    placeholder="your_handle"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="onb-handle-hint"
                    aria-invalid={handleState.kind === 'bad' ? true : undefined}
                    required
                />
            </div>
            <p className={hint.cls} id="onb-handle-hint" aria-live="polite">
                {hint.icon}
                <span>{hint.text}</span>
            </p>

            <label className="ga-label" htmlFor="onb-bio">
                Bio <small>· optional</small>
            </label>
            <textarea
                id="onb-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Your builds, your lane… (optional)"
                className="ga-in"
                maxLength={280}
                rows={3}
            />

            <div className="ga-section">
                <h2>
                    Shipping address <small className="ga-opt">optional</small>
                </h2>
                <p>Used when you shop on Rollout. You can skip this and add it at checkout.</p>
                <div className="ga-stack" style={{ marginTop: 16 }}>
                    <div className="ga-grid ga-grid-2 keep">
                        <input type="text" placeholder="First name" autoComplete="given-name" {...field('firstName', 'First name')} />
                        <input type="text" placeholder="Last name" autoComplete="family-name" {...field('lastName', 'Last name')} />
                    </div>
                    <input type="text" placeholder="Street address" autoComplete="address-line1" {...field('address1', 'Street address')} />
                    <input type="text" placeholder="Apt, suite, unit (optional)" autoComplete="address-line2" {...field('address2', 'Apt, suite, unit')} />
                    <div className="ga-grid ga-grid-3">
                        <input type="text" placeholder="City" autoComplete="address-level2" {...field('city', 'City')} />
                        <span className="ga-sel">
                            <select autoComplete="address-level1" {...field('province', 'State')}>
                                <option value="">State</option>
                                {US_STATES.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                        </span>
                        <input type="text" placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" {...field('postalCode', 'ZIP')} />
                    </div>
                    <div className="ga-grid ga-grid-2">
                        <span className="ga-sel">
                            <select autoComplete="country" {...field('countryCode', 'Country')}>
                                <option value="us">United States</option>
                                <option value="ca">Canada</option>
                            </select>
                            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                        </span>
                        <input type="tel" placeholder="Phone (optional)" autoComplete="tel" {...field('phone', 'Phone')} />
                    </div>
                </div>
            </div>

            {addressStarted && !addressComplete && !formErr ? (
                <p className="ga-msg" role="status">
                    <Info size={18} strokeWidth={2} aria-hidden="true" />
                    <span>Finish the shipping address (name, street, city, state, ZIP) or clear it.</span>
                </p>
            ) : null}
            {formErr ? (
                <p className="ga-msg" role="alert">
                    <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
                    <span>{formErr}</span>
                </p>
            ) : null}

            <button type="submit" className="g-btn g-btn--block" disabled={!canSubmit} aria-busy={pending}>
                <span>{pending ? 'Setting up' : 'Enter Rollout'}</span>
                <span className="g-btn-k" aria-hidden="true">
                    {pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <ArrowRight size={20} strokeWidth={2} />}
                </span>
            </button>
        </form>
    );
}
