/**
 * Consumer (member) session helpers for the public web surface.
 *
 * Unlike requireSession() in auth-guard.ts — which is built for the shop/admin
 * consoles and *signs out* an auth user that has no rollout.profiles row — the
 * consumer surface must be welcoming to brand-new sign-ups. So this helper
 * lazily *creates* the profile via the existing public.ensure_rollout_profile()
 * pattern (migration 003) the first time a member acts (e.g. their first RSVP).
 *
 * Server-only. The auth check reads the SSR cookie session (RLS-relevant), and
 * profile lookup/creation goes through the service-role admin client. Actual
 * data writes (RSVPs) still flow through the anon SSR client so RLS is the
 * enforcement — this helper only resolves *who* the caller is.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServer } from './supabase/server';
import { getSupabaseAdmin, getSupabasePublicAdmin } from './supabase/admin';

export type ConsumerProfile = {
    authUserId: string;
    profileId: string;
    handle: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    /** Individual-host status: 'none' | 'pending' | 'verified' (migration 038). */
    hostStatus: 'none' | 'pending' | 'verified';
    /** If a shop nominated this member as a host, that shop's id. */
    hostAppointedByShopId: number | null;
};

/**
 * Returns the signed-in member's rollout profile, creating one on first sight.
 * Returns null when there is no authenticated session (caller should send them
 * to /login). Never throws for the not-signed-in case.
 */
export async function getConsumerProfile(): Promise<ConsumerProfile | null> {
    const supabase = await getSupabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = getSupabaseAdmin();

    // Fast path: profile already linked.
    const { data: existing, error: existingError } = await admin
        .from('profiles')
        .select('id, handle, display_name, avatar_url, host_status, host_appointed_by_shop_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
    if (existingError) console.error('[lib/consumer] profile lookup failed:', existingError.message);

    if (existing) {
        return {
            authUserId: user.id,
            profileId: (existing as any).id,
            handle: (existing as any).handle,
            displayName: (existing as any).display_name,
            email: user.email ?? null,
            avatarUrl: (existing as any).avatar_url ?? null,
            hostStatus: ((existing as any).host_status ?? 'none') as ConsumerProfile['hostStatus'],
            hostAppointedByShopId: (existing as any).host_appointed_by_shop_id ?? null,
        };
    }

    // First-time member: mint a profile via the bootstrap RPC (public schema).
    const publicAdmin = getSupabasePublicAdmin();
    const { data: newId, error: rpcErr } = await publicAdmin.rpc('ensure_rollout_profile', {
        p_auth_user_id: user.id,
        p_email: user.email ?? null,
        p_display_name: (user.user_metadata as any)?.display_name ?? null,
    });
    if (rpcErr || !newId) return null;

    const { data: created, error: createdError } = await admin
        .from('profiles')
        .select('id, handle, display_name, avatar_url, host_status, host_appointed_by_shop_id')
        .eq('id', newId as string)
        .maybeSingle();
    if (createdError) console.error('[lib/consumer] created-profile fetch failed:', createdError.message);
    if (!created) return null;

    return {
        authUserId: user.id,
        profileId: (created as any).id,
        handle: (created as any).handle,
        displayName: (created as any).display_name,
        email: user.email ?? null,
        avatarUrl: (created as any).avatar_url ?? null,
        hostStatus: ((created as any).host_status ?? 'none') as ConsumerProfile['hostStatus'],
        hostAppointedByShopId: (created as any).host_appointed_by_shop_id ?? null,
    };
}

/**
 * Resolve the signed-in member's rollout profile from a raw Supabase access
 * token (the `Authorization: Bearer <jwt>` the MOBILE app sends), rather than
 * the SSR cookie session getConsumerProfile() reads. Used only by API route
 * handlers the mobile app calls directly (e.g. /api/events/[id]/cancel-refund)
 * — server actions from the web app should keep using getConsumerProfile().
 *
 * Does NOT mint a new profile on first sight (unlike getConsumerProfile): a
 * caller hitting this route already holds a paid RSVP, which means a profile
 * already exists. Returns null for an invalid/expired token or no linked
 * profile, never throws.
 */
export async function getConsumerProfileFromBearer(token: string): Promise<ConsumerProfile | null> {
    if (!token) return null;
    try {
        const client = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const {
            data: { user },
            error,
        } = await client.auth.getUser(token);
        if (error || !user) return null;

        const admin = getSupabaseAdmin();
        const { data: existing } = await admin
            .from('profiles')
            .select('id, handle, display_name, avatar_url, host_status, host_appointed_by_shop_id')
            .eq('auth_user_id', user.id)
            .maybeSingle();
        if (!existing) return null;

        return {
            authUserId: user.id,
            profileId: (existing as any).id,
            handle: (existing as any).handle,
            displayName: (existing as any).display_name,
            email: user.email ?? null,
            avatarUrl: (existing as any).avatar_url ?? null,
            hostStatus: ((existing as any).host_status ?? 'none') as ConsumerProfile['hostStatus'],
            hostAppointedByShopId: (existing as any).host_appointed_by_shop_id ?? null,
        };
    } catch (e) {
        console.error('[lib/consumer] getConsumerProfileFromBearer failed:', (e as any)?.message ?? e);
        return null;
    }
}

/**
 * A rollout-schema-scoped anon SSR client for member writes. RLS applies, so
 * the caller's session (auth.uid()) is the gate — matches the mobile app's
 * trust model for RSVPs. Use this (not the admin client) for member mutations.
 */
export async function getRolloutMemberClient() {
    const supabase = await getSupabaseServer();
    return supabase.schema('rollout');
}
