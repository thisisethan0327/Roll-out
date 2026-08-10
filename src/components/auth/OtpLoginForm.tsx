'use client';
/**
 * Shared email-OTP login form used by both /admin/login and /shop/login.
 *
 * Two phases: enter email → enter 6-digit code. Pre-checks the Supabase env
 * config so a missing `NEXT_PUBLIC_*` deploy var surfaces an explicit error
 * instead of a stuck spinner. emailRedirectTo carries the tenant signal to
 * the send-auth-email Auth Hook (anything containing rollout.club routes to
 * the Rollout branding).
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

type Phase = 'email' | 'otp';

export type OtpLoginFormProps = {
    /** Where to push after a successful OTP verify. Server gate at the
     *  destination should re-verify the role and bounce if mismatched. */
    successPath: string;
    /** Retained for API stability across callers. The magic-link fallback now
     *  routes through /auth/callback (which carries next + email), and the
     *  tenant signal for the Auth Hook comes from the rollout.club callback
     *  origin. Not otherwise consumed. */
    redirectSuffix: string;
    /** When true, a brand-new email creates an auth user (consumer sign-up).
     *  Defaults to false so the shop/admin gates stay invite-only — those
     *  callers must omit this prop and keep their existing behavior. */
    allowSignup?: boolean;
    /** Pre-fill the email field. Set when arriving from an auth email whose link
     *  couldn't be consumed (see /auth/callback) so the user never re-types it. */
    initialEmail?: string;
    /** Jump straight to the 6-digit code step (skip the email step) WITHOUT
     *  auto-sending a new code — the code already sitting in the user's inbox is
     *  still valid, and re-sending would invalidate it. Only honored when an
     *  initialEmail is supplied. */
    startAtCode?: boolean;
    /** Optional friendly banner shown above the form (e.g. "link expired — enter
     *  the code from your email instead"). */
    notice?: string;
};

export function OtpLoginForm({
    successPath,
    redirectSuffix: _redirectSuffix,
    allowSignup = false,
    initialEmail = '',
    startAtCode = false,
    notice,
}: OtpLoginFormProps) {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>(
        startAtCode && initialEmail ? 'otp' : 'email',
    );
    const [email, setEmail] = useState(initialEmail);
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [resendIn, setResendIn] = useState(0);
    const otpInputRef = useRef<HTMLInputElement>(null);
    // Guards against a double verify when the auto-submit (6th digit) and a
    // manual button press or Enter land in the same tick.
    const verifyingRef = useRef(false);

    const startResendCooldown = () => {
        setResendIn(30);
        const id = setInterval(() => {
            setResendIn((s) => {
                if (s <= 1) {
                    clearInterval(id);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    };

    if (!isSupabaseConfigured()) {
        return (
            <div className="admin-login-error" style={{ whiteSpace: 'pre-wrap' }}>
                Deploy config missing. Set
                {'\n  '}NEXT_PUBLIC_SUPABASE_URL
                {'\n  '}NEXT_PUBLIC_SUPABASE_ANON_KEY
                {'\n'}as BUILD-TIME variables in Coolify, then redeploy.
            </div>
        );
    }

    const sendCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setErr(null);
        if (!email.trim()) return;
        setBusy(true);
        try {
            const supabase = getSupabaseBrowser();
            const origin =
                typeof window !== 'undefined' ? window.location.origin : 'https://rollout.club';
            const cleanEmail = email.trim().toLowerCase();
            // Magic-link fallback target: the shared /auth/callback consumer,
            // carrying where to land (next) and the email so a token-consumption
            // failure still lands with the address prefilled + code step ready.
            // The rollout.club origin also serves as the Auth Hook tenant signal.
            const callback = new URL('/auth/callback', origin);
            callback.searchParams.set('next', successPath);
            callback.searchParams.set('email', cleanEmail);
            const { error } = await supabase.auth.signInWithOtp({
                email: cleanEmail,
                options: {
                    shouldCreateUser: allowSignup,
                    emailRedirectTo: callback.toString(),
                    // SECURITY: consumer sign-ups MUST carry app='rollout' in
                    // raw_user_meta_data. Without it a legacy public.* trigger
                    // auto-provisions the new auth user as an EMWRAPS STAFF
                    // profile (public.profiles) — a cross-tenant privilege leak.
                    // options.data is only consumed when a user is created, so
                    // this is inert for existing users and for the shop/admin
                    // gates (allowSignup=false → shouldCreateUser=false).
                    ...(allowSignup ? { data: { app: 'rollout' } } : {}),
                },
            });
            if (error) {
                setErr(error.message);
                return;
            }
            setPhase('otp');
            startResendCooldown();
        } catch (ex: any) {
            setErr(ex?.message ?? 'Unexpected error sending code.');
        } finally {
            setBusy(false);
        }
    };

    // Verify a 6-digit code. Called both by the auto-submit on the 6th digit
    // and by the manual VERIFY button / Enter (kept as a fallback). The ref
    // guard prevents a double call when both fire together.
    const runVerify = async (code: string) => {
        const token = code.trim();
        if (token.length !== 6) return;
        if (verifyingRef.current) return;
        verifyingRef.current = true;
        setErr(null);
        setBusy(true);
        try {
            const supabase = getSupabaseBrowser();
            const { error } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token,
                type: 'email',
            });
            if (error) {
                // Failure: wipe the entry and refocus so a retype starts clean.
                setErr(error.message);
                setOtp('');
                requestAnimationFrame(() => otpInputRef.current?.focus());
                return;
            }
            router.push(successPath);
            router.refresh();
        } catch (ex: any) {
            setErr(ex?.message ?? 'Unexpected error verifying code.');
            setOtp('');
            requestAnimationFrame(() => otpInputRef.current?.focus());
        } finally {
            setBusy(false);
            verifyingRef.current = false;
        }
    };

    const verify = async (e: React.FormEvent) => {
        e.preventDefault();
        await runVerify(otp);
    };

    // Numeric-only, capped at 6. Auto-submits the instant the 6th digit lands
    // (covers both typing and paste-of-6) — no button press needed.
    const handleOtpChange = (raw: string) => {
        const next = raw.replace(/\D/g, '').slice(0, 6);
        setOtp(next);
        if (err) setErr(null);
        if (next.length === 6) {
            void runVerify(next);
        }
    };

    // Friendly banner (e.g. an expired link routed the user back here). Rendered
    // atop whichever phase is active. Styled like the error banner but muted.
    const noticeBanner = notice ? (
        <div
            className="admin-login-error"
            style={{
                borderColor: 'var(--gold, #e8a845)',
                color: 'var(--gold, #e8a845)',
                background: 'transparent',
            }}
        >
            {notice === 'link_expired'
                ? 'That sign-in link expired or was already used — enter the 6-digit code from your email below.'
                : notice}
        </div>
    ) : null;

    if (phase === 'email') {
        return (
            <form onSubmit={sendCode} className="admin-login-form">
                {noticeBanner}
                <label className="admin-login-label">EMAIL</label>
                <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@rollout.club"
                    className="admin-login-input"
                    required
                />
                {err && <div className="admin-login-error">{err}</div>}
                <button type="submit" disabled={busy} className="admin-login-btn">
                    {busy ? 'SENDING...' : 'SEND CODE ›'}
                </button>
            </form>
        );
    }

    return (
        <form onSubmit={verify} className="admin-login-form">
            {noticeBanner}
            <label className="admin-login-label">CODE FROM EMAIL</label>
            <input
                ref={otpInputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => handleOtpChange(e.target.value)}
                placeholder="000000"
                className="admin-login-input admin-login-otp"
                maxLength={6}
                disabled={busy}
                autoFocus
                required
            />
            <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: 'var(--track-wider)' }}>
                SENT TO <span style={{ color: 'var(--gold)' }}>{email.toUpperCase()}</span>
            </div>
            {err && <div className="admin-login-error">{err}</div>}
            <button type="submit" disabled={busy || otp.length !== 6} className="admin-login-btn">
                {busy ? 'VERIFYING...' : 'VERIFY ›'}
            </button>
            <button
                type="button"
                disabled={busy || resendIn > 0}
                onClick={() => {
                    setOtp('');
                    setErr(null);
                    void sendCode();
                }}
                className="admin-login-secondary"
            >
                {resendIn > 0 ? `RESEND CODE IN ${resendIn}s` : 'RESEND CODE'}
            </button>
            <button
                type="button"
                onClick={() => {
                    setPhase('email');
                    setOtp('');
                    setErr(null);
                }}
                className="admin-login-secondary"
            >
                ← USE DIFFERENT EMAIL
            </button>
        </form>
    );
}
