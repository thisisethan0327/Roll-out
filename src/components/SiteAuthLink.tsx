'use client';
/**
 * Public-header auth affordance. Checks the browser Supabase session on mount
 * and shows either "My Rollout" (→ /me) for signed-in members or "Sign In"
 * (→ /login) otherwise. Renders a stable placeholder before the check resolves
 * so the header doesn't flash. Smallest-touch addition to the marketing header.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

export function SiteAuthLink() {
    const [signedIn, setSignedIn] = useState<boolean | null>(null);

    useEffect(() => {
        if (!isSupabaseConfigured()) {
            setSignedIn(false);
            return;
        }
        const supabase = getSupabaseBrowser();
        let active = true;
        supabase.auth.getUser().then(({ data }) => {
            if (active) setSignedIn(Boolean(data.user));
        });
        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
            if (active) setSignedIn(Boolean(session?.user));
        });
        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    if (signedIn) {
        return (
            <Link href="/me" className="text-dim" style={{ textTransform: 'uppercase', color: 'var(--gold)' }}>
                My Rollout
            </Link>
        );
    }
    return (
        <Link href="/login" className="text-dim" style={{ textTransform: 'uppercase' }}>
            Sign In
        </Link>
    );
}
