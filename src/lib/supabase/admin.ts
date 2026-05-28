/**
 * Supabase service-role client — bypasses RLS. Server-only.
 *
 * **NEVER import from a Client Component.** Used inside Server Actions and
 * Route Handlers AFTER the user is verified as platform admin (or shop
 * member, depending on route). The auth gate happens at the route layer;
 * this client is the bulldozer once the gate has cleared.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// We don't generate a Database type for the rollout schema yet, so we type
// the admin client as `SupabaseClient<any>` to keep query calls loosely typed
// (otherwise every .update({…}) errors with "not assignable to never").
type LooseClient = SupabaseClient<any, any, any>;

let cached: LooseClient | null = null;

export function getSupabaseAdmin(): LooseClient {
    if (cached) return cached;
    cached = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: { autoRefreshToken: false, persistSession: false },
            db: { schema: 'rollout' as any },
        },
    ) as unknown as LooseClient;
    return cached;
}

/**
 * Same client but pinned to the public schema (for EMWRAPS staff lookups,
 * etc. — needed because the admin SaaS-bridge will eventually link Rollout
 * shops back to public.tickets).
 */
let cachedPublic: LooseClient | null = null;
export function getSupabasePublicAdmin(): LooseClient {
    if (cachedPublic) return cachedPublic;
    cachedPublic = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: { autoRefreshToken: false, persistSession: false },
        },
    ) as unknown as LooseClient;
    return cachedPublic;
}
