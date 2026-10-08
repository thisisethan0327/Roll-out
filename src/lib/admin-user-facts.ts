import 'server-only';
/**
 * Read-only facts about members for the platform-admin console: the account
 * (auth.users via the admin API) plus activity counts. Service-role only; the
 * CALLER must already have passed requirePlatformAdmin().
 *
 * Batched on purpose: the verification queue loads facts for every pending
 * applicant at once. Counts come from ONE `.in()` query per table (key column
 * only, counted in memory); the auth lookup is one admin-API call per distinct
 * user, run in parallel (the auth API has no batch-by-id endpoint).
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { selectWithBan } from '@/lib/ban-server';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Row cap per batched count query. Far above any real member's activity. */
const COUNT_ROW_CAP = 20000;

export type UserCounts = {
    posts: number | null;
    vehicles: number | null;
    followers: number | null;
    following: number | null;
    plates: number | null;
    coins: number | null;
    rsvps: number | null;
    hosted: number | null;
};

export type AuthFacts = {
    email: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    provider: string | null;
    providers: string[];
    appTag: string | null;
    bannedUntil: string | null;
};

export type UserFacts = {
    profileId: string;
    profileCreatedAt: string | null;
    /** rollout.profiles.banned_until (Rollout ban, migration 091) — null when never banned or 091 is not applied. NOT the auth-level auth.bannedUntil. */
    profileBannedUntil: string | null;
    auth: AuthFacts | null;
    counts: UserCounts;
};

/** key-column rows -> per-id counts. null when the query failed or the table is absent. */
async function countBy(
    table: string,
    col: string,
    ids: string[],
    configure?: (q: any) => any,
): Promise<Map<string, number> | null> {
    const admin = getSupabaseAdmin();
    let q: any = admin.from(table).select(col).in(col, ids).limit(COUNT_ROW_CAP);
    if (configure) q = configure(q);
    const { data, error } = await q;
    if (error) {
        console.error(`[admin-user-facts] ${table}.${col} count failed:`, error.message);
        return null;
    }
    const out = new Map<string, number>();
    for (const r of (data as any[]) ?? []) out.set(r[col], (out.get(r[col]) ?? 0) + 1);
    return out;
}

async function loadAuth(authUserId: string | null): Promise<AuthFacts | null> {
    if (!authUserId) return null;
    try {
        const { data, error } = await (getSupabaseAdmin() as any).auth.admin.getUserById(authUserId);
        if (error || !data?.user) return null;
        const u = data.user;
        const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
        const userMeta = (u.user_metadata ?? {}) as Record<string, unknown>;
        return {
            email: u.email ?? null,
            createdAt: u.created_at ?? null,
            lastSignInAt: u.last_sign_in_at ?? null,
            emailConfirmedAt: u.email_confirmed_at ?? u.confirmed_at ?? null,
            provider: typeof appMeta.provider === 'string' ? appMeta.provider : null,
            providers: Array.isArray(appMeta.providers) ? (appMeta.providers as string[]) : [],
            appTag: typeof userMeta.app === 'string' ? userMeta.app : null,
            bannedUntil: typeof (u as any).banned_until === 'string' ? (u as any).banned_until : null,
        };
    } catch (e: any) {
        console.error('[admin-user-facts] auth lookup failed:', e?.message);
        return null;
    }
}

export async function loadUserFacts(profileIds: string[]): Promise<Map<string, UserFacts>> {
    const ids = [...new Set(profileIds.filter(Boolean))];
    const out = new Map<string, UserFacts>();
    if (ids.length === 0) return out;
    const admin = getSupabaseAdmin();

    const [profRes, posts, vehicles, followers, following, plates, coins, rsvps, hosted] = await Promise.all([
        selectWithBan('id, auth_user_id, created_at', (cols) => admin.from('profiles').select(cols).in('id', ids)),
        countBy('posts', 'author_id', ids, (q) => q.is('deleted_at', null)),
        countBy('vehicles', 'owner_id', ids, (q) => q.is('deleted_at', null)),
        countBy('follows', 'followee_id', ids),
        countBy('follows', 'follower_id', ids),
        countBy('plates', 'profile_id', ids),
        countBy('coin_awards', 'profile_id', ids),
        countBy('event_rsvps', 'profile_id', ids),
        countBy('events', 'host_id', ids),
    ]);
    if (profRes.error) console.error('[admin-user-facts] profiles load failed:', profRes.error.message);
    const profiles = ((profRes.data as any[]) ?? []) as {
        id: string;
        auth_user_id: string | null;
        created_at: string | null;
        banned_until?: string | null;
    }[];
    const auths = await Promise.all(profiles.map((p) => loadAuth(p.auth_user_id)));

    const get = (m: Map<string, number> | null, id: string) => (m ? (m.get(id) ?? 0) : null);
    profiles.forEach((p, i) => {
        out.set(p.id, {
            profileId: p.id,
            profileCreatedAt: p.created_at,
            profileBannedUntil: p.banned_until ?? null,
            auth: auths[i],
            counts: {
                posts: get(posts, p.id),
                vehicles: get(vehicles, p.id),
                followers: get(followers, p.id),
                following: get(following, p.id),
                plates: get(plates, p.id),
                coins: get(coins, p.id),
                rsvps: get(rsvps, p.id),
                hosted: get(hosted, p.id),
            },
        });
    });
    return out;
}

/** "3 days ago" / "5 min ago" / "just now". Server-rendered snapshot. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '—';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} hr ago`;
    const d = Math.round(h / 24);
    if (d < 60) return `${d} days ago`;
    const mo = Math.round(d / 30);
    if (mo < 24) return `${mo} mo ago`;
    return `${Math.round(d / 365)} yr ago`;
}
