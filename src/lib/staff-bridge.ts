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

    return Array.from(byProfileId.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
    );
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
