/**
 * Bridge between Rollout shop staff (rollout.shop_memberships → rollout.profiles)
 * and the legacy `public.profiles` staff table.
 *
 * WHY THIS EXISTS: the shared job tables `public.ticket_workers.worker_id`,
 * `public.ticket_checkins.checked_in_by`, `public.ticket_activity.created_by`
 * and `public.ticket_activity.target_worker_id` all FK to `public.profiles.id`.
 * Rollout shop members are `rollout.profiles` rows whose ids are NOT present in
 * `public.profiles` (verified: 0/10 overlap). So we cannot stamp a Rollout
 * profile id into those columns without violating the FK.
 *
 * BRIDGE RULE (tenancy-safe, no hardcoded shop identity): a Rollout shop member
 * maps to a `public.profiles` staffer by matching **email** (case-insensitive).
 * The shop's assignable worker pool is the set of `public.profiles` rows that
 * (a) email-match one of the shop's rollout members, UNION (b) already appear
 * as a worker on one of this shop's tickets. Both are inherently shop-scoped —
 * no cross-tenant leak. Shops with no email-matched staff and no historical
 * workers get an empty pool (surfaced with an explanatory note in the UI).
 *
 * All ids returned here are `public.profiles.id` values, safe to write into the
 * shared FK columns.
 */
import 'server-only';
import { getSupabaseAdmin, getSupabasePublicAdmin } from './supabase/admin';

export type WorkerPoolEntry = {
    /** public.profiles.id — FK-safe for ticket_workers/checkins/activity. */
    profileId: string;
    name: string;
    email: string | null;
    role: string | null;
};

/** Fetch auth emails for a batch of auth_user_ids via the admin auth API. */
async function emailsFor(authUserIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (authUserIds.length === 0) return out;
    const admin = getSupabasePublicAdmin();
    await Promise.all(
        authUserIds.map(async (uid) => {
            try {
                const { data } = await admin.auth.admin.getUserById(uid);
                const email = data?.user?.email;
                if (email) out.set(uid, email.toLowerCase());
            } catch {
                /* best-effort */
            }
        }),
    );
    return out;
}

/**
 * The assignable worker pool for a shop — public.profiles rows the shop may
 * assign to tickets. See BRIDGE RULE above.
 */
export async function listShopWorkerPool(shopId: number): Promise<WorkerPoolEntry[]> {
    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();

    // (a) rollout members of this shop → emails → public.profiles by email.
    const { data: members } = await admin
        .from('shop_memberships')
        .select('role, profiles!inner(auth_user_id, display_name, handle)')
        .eq('shop_id', shopId);

    const memberRows = (members ?? []) as any[];
    const authIds = memberRows
        .map((m) => m.profiles?.auth_user_id)
        .filter(Boolean) as string[];
    const emailByAuth = await emailsFor(authIds);
    const memberEmails = Array.from(new Set(Array.from(emailByAuth.values())));

    const byProfileId = new Map<string, WorkerPoolEntry>();
    // Emails already represented by a public.profiles row, so branch (c) below
    // doesn't add a duplicate virtual entry for the same person.
    const representedEmails = new Set<string>();

    if (memberEmails.length > 0) {
        const { data: staff } = await pub
            .from('profiles')
            .select('id, email, first_name, last_name, role, is_active')
            .in('email', memberEmails);
        for (const s of (staff ?? []) as any[]) {
            if (s.is_active === false) continue;
            const name =
                `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || 'STAFF';
            byProfileId.set(s.id, {
                profileId: s.id,
                name,
                email: s.email ?? null,
                role: s.role ?? null,
            });
            if (s.email) representedEmails.add(String(s.email).toLowerCase());
        }
    }

    // (b) public.profiles already assigned to this shop's tickets.
    const { data: shopTickets } = await pub
        .from('tickets')
        .select('id')
        .eq('shop_id', shopId)
        .limit(5000);
    const ticketIds = (shopTickets ?? []).map((t: any) => t.id);
    if (ticketIds.length > 0) {
        const { data: tw } = await pub
            .from('ticket_workers')
            .select('worker_id')
            .in('ticket_id', ticketIds)
            .not('worker_id', 'is', null)
            .limit(5000);
        const existingIds = Array.from(
            new Set((tw ?? []).map((r: any) => r.worker_id).filter(Boolean)),
        ) as string[];
        const missing = existingIds.filter((id) => !byProfileId.has(id));
        if (missing.length > 0) {
            const { data: staff } = await pub
                .from('profiles')
                .select('id, email, first_name, last_name, role')
                .in('id', missing);
            for (const s of (staff ?? []) as any[]) {
                const name =
                    `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() ||
                    s.email ||
                    'STAFF';
                if (!byProfileId.has(s.id)) {
                    byProfileId.set(s.id, {
                        profileId: s.id,
                        name,
                        email: s.email ?? null,
                        role: s.role ?? null,
                    });
                }
            }
        }
    }

    // (c) Rollout shop members with NO email-matched public.profiles staffer and
    // no historical assignment — non-EMWRAPS shops live here. They are surfaced
    // as VIRTUAL pool entries keyed by their auth_user_id, which is exactly the
    // FK-safe id a lazily-created bridge row will carry (public.profiles.id →
    // auth.users(id); the rollout member owns that auth account). No row is
    // written just by listing — the bridge row is materialized only when the
    // shop actually assigns them (setTicketWorkers → ensureBridgeProfile), which
    // keeps the EMWRAPS Settings roster clean for members nobody ever assigns.
    for (const m of memberRows) {
        const authId = m.profiles?.auth_user_id as string | undefined;
        if (!authId || byProfileId.has(authId)) continue;
        const email = emailByAuth.get(authId) ?? null;
        if (email && representedEmails.has(email)) continue;
        const name =
            (m.profiles?.display_name && String(m.profiles.display_name).trim()) ||
            (m.profiles?.handle ? `@${m.profiles.handle}` : null) ||
            email ||
            'STAFF';
        byProfileId.set(authId, {
            profileId: authId,
            name,
            email,
            // Display label only — the materialized bridge row's role is NULL so
            // is_staff() stays false and EMWRAPS worker UIs exclude it.
            role: (m.role as string | null) ?? null,
        });
    }

    return Array.from(byProfileId.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
    );
}

/**
 * Lazily materialize the FK-safe bridge row for a Rollout shop member so it can
 * be written into public.ticket_workers.worker_id. Called at ASSIGNMENT time
 * (not while merely listing the pool) so shops that never assign a member never
 * create a row for them.
 *
 * Tenancy + safety invariants:
 *  - Only an auth user who is an actual member of `shopId` is materialized — an
 *    arbitrary id can never be turned into a public.profiles row here.
 *  - The bridge row is written with role = NULL. That is deliberate and load-
 *    bearing: public.is_staff() is `role IS NOT NULL`, is_god/is_admin require
 *    specific roles, and 0 RLS policies grant by bare profiles membership — so a
 *    NULL-role row grants ZERO EMWRAPS access. The emwraps-tickets worker lists
 *    filter role IN ('admin','manager','worker'), so it is also invisible there.
 *  - ON CONFLICT (id) DO NOTHING: never overwrites a real EMWRAPS staffer's row
 *    (or an already-bridged row), so a real role can never be clobbered to NULL.
 *
 * Returns the public.profiles.id (== authUserId) on success, or null when the
 * user is not a member of this shop (caller then drops them from the write).
 */
export async function ensureBridgeProfile(
    shopId: number,
    authUserId: string,
): Promise<string | null> {
    if (!authUserId) return null;
    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();

    // Verify membership of THIS shop (never materialize a non-member).
    const { data: member } = await admin
        .from('shop_memberships')
        .select('role, profiles!inner(auth_user_id, display_name, handle)')
        .eq('shop_id', shopId)
        .eq('profiles.auth_user_id', authUserId)
        .maybeSingle();
    if (!member) return null;

    // Resolve display + email for the roster row.
    let email: string | null = null;
    try {
        const { data } = await pub.auth.admin.getUserById(authUserId);
        email = data?.user?.email ?? null;
    } catch {
        /* best-effort */
    }
    const dn =
        ((member as any).profiles?.display_name &&
            String((member as any).profiles.display_name).trim()) ||
        ((member as any).profiles?.handle
            ? String((member as any).profiles.handle)
            : '') ||
        '';
    const [first, ...rest] = dn.split(/\s+/).filter(Boolean);

    const { error } = await pub.from('profiles').upsert(
        {
            id: authUserId,
            first_name: first ?? null,
            last_name: rest.length ? rest.join(' ') : null,
            email,
            // NULL role = cross-tenant bridge row (see invariants above).
            role: null,
            is_active: true,
        },
        { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) return null;
    return authUserId;
}

/**
 * Resolve the acting Rollout user (by their auth email) to a public.profiles.id
 * for attribution in shared FK columns. Returns null when there's no matching
 * legacy staff row — callers should write null (all these columns are
 * nullable) rather than fail.
 */
export async function resolveActingWorkerId(
    actingEmail: string | null,
): Promise<string | null> {
    if (!actingEmail) return null;
    const pub = getSupabasePublicAdmin();
    const { data } = await pub
        .from('profiles')
        .select('id')
        .ilike('email', actingEmail)
        .maybeSingle();
    return (data as any)?.id ?? null;
}
