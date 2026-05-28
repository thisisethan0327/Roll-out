'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

type Phase = 'email' | 'otp';

export function LoginForm() {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const sendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        if (!email.trim()) return;
        setBusy(true);
        const supabase = getSupabaseBrowser();
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim().toLowerCase(),
            options: { shouldCreateUser: false },
        });
        setBusy(false);
        if (error) {
            setErr(error.message);
            return;
        }
        setPhase('otp');
    };

    const verify = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        if (otp.trim().length !== 6) return;
        setBusy(true);
        const supabase = getSupabaseBrowser();
        const { error } = await supabase.auth.verifyOtp({
            email: email.trim().toLowerCase(),
            token: otp.trim(),
            type: 'email',
        });
        setBusy(false);
        if (error) {
            setErr(error.message);
            return;
        }
        // Server-side guard on /admin/overview will reject non-admin users.
        router.push('/admin/overview');
        router.refresh();
    };

    if (phase === 'email') {
        return (
            <form onSubmit={sendCode} className="admin-login-form">
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
            <label className="admin-login-label">CODE FROM EMAIL</label>
            <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="admin-login-input admin-login-otp"
                maxLength={6}
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
