import 'server-only';
/**
 * Auth glue for the Rollout mobile app's JSON API (/api/app/event-checkout/*
 * — see docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract"). Every route
 * under /api/app/** trusts ONLY a verified Supabase access token, never a
 * user id the client sent in the body.
 *
 * `supabase.auth.getUser(token)` round-trips to Supabase Auth to verify the
 * JWT is live (not merely well-formed) — the same check
 * getConsumerProfileFromBearer (lib/consumer.ts) makes for the existing
 * mobile routes (e.g. /api/events/[id]/cancel-refund). This module composes
 * that profile lookup with the raw auth user (id/email/user_metadata), which
 * ensureMedusaCustomerTokenForUser (lib/medusa-customer.ts) needs to
 * find-or-create the Medusa customer link.
 */
import { createClient } from '@supabase/supabase-js';
import { getConsumerProfileFromBearer, type ConsumerProfile } from './consumer';
import type { StoreUser } from './medusa-customer';

export type AppCaller = {
    /** The verified Supabase access token itself — handed to
     *  ensureMedusaCustomerTokenForUser for the platform→Medusa exchange. */
    accessToken: string;
    profile: ConsumerProfile;
    user: StoreUser;
};

/** Extracts the bearer token from an `Authorization: Bearer <jwt>` header. Null if missing/malformed. */
export function bearerTokenFrom(req: Request): string | null {
    const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
    const token = auth.slice(7).trim();
    return token || null;
}

/**
 * Verifies the Supabase access token server-side (auth.getUser(token) against
 * the anon client — never trusts anything the client claims) and resolves the
 * caller's rollout profile. Returns null for a missing/expired/invalid token
 * or no linked profile — never throws.
 */
export async function resolveAppCaller(token: string | null): Promise<AppCaller | null> {
    if (!token) return null;
    try {
        const anon = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const {
            data: { user },
            error,
        } = await anon.auth.getUser(token);
        if (error || !user) return null;

        // getConsumerProfileFromBearer re-verifies the token itself (a second
        // getUser round trip) but is the existing, proven path to a rollout
        // profile row — reused rather than duplicated here.
        const profile = await getConsumerProfileFromBearer(token);
        if (!profile) return null;

        return {
            accessToken: token,
            profile,
            user: { id: user.id, email: user.email ?? null, user_metadata: user.user_metadata ?? null },
        };
    } catch (e) {
        console.error('[app-auth] resolveAppCaller failed:', (e as any)?.message ?? e);
        return null;
    }
}
