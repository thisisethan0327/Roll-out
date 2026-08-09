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
import { getSupabaseServer } from './supabase/server';
import { getSupabaseAdmin, getSupabasePublicAdmin } from './supabase/admin';

export type ConsumerProfile = {
    authUserId: string;
    profileId: string;
    handle: string;
    displayName: string;
    email: string | null;
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
    const { data: existing } = await admin
        .from('profiles')
        .select('id, handle, display_name')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (existing) {
        return {
            authUserId: user.id,
            profileId: (existing as any).id,
            handle: (existing as any).handle,
            displayName: (existing as any).display_name,
            email: user.email ?? null,
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

    const { data: created } = await admin
        .from('profiles')
        .select('id, handle, display_name')
        .eq('id', newId as string)
        .maybeSingle();
    if (!created) return null;

    return {
        authUserId: user.id,
        profileId: (created as any).id,
        handle: (created as any).handle,
        displayName: (created as any).display_name,
        email: user.email ?? null,
    };
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
