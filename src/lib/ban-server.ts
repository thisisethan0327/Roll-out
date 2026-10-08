import 'server-only';
/**
 * Rollout ban — server-side reads. Service-role; the caller has already decided
 * WHO is being asked about (a verified session / bearer token, or an admin).
 *
 * Pre-091 behaviour: every read here tolerates the ban column / table being
 * absent and answers "not banned" / "no history" instead of throwing.
 */
import { getSupabaseAdmin } from './supabase/admin';
import { isBanSchemaMissing, isBannedUntil } from './ban';

/** After the column is seen missing, skip asking for it this long (a deploy of 091 is picked up within a minute). */
const RECHECK_MS = 60_000;
let columnMissingAt = 0;

/**
 * Run a profiles select that also wants `banned_until`. Tries with the column;
 * if the DB says the column does not exist (migration 091 not applied) it runs
 * again without it, so the row still comes back and `banned_until` is simply
 * undefined (= not banned). Any other error is returned untouched.
 */
export async function selectWithBan<T extends { error: any }>(
    cols: string,
    run: (cols: string) => PromiseLike<T>,
): Promise<T> {
    if (Date.now() - columnMissingAt > RECHECK_MS) {
        const res = await run(`${cols}, banned_until`);
        if (!res.error || !isBanSchemaMissing(res.error)) return res;
        columnMissingAt = Date.now();
    }
    return run(cols);
}

/**
 * Is this profile banned RIGHT NOW? Used where a write path only holds a
 * profile id (lib/event-refund.ts). On an unexpected read error this answers
 * false (and logs): the write it guards reads the same database straight after
 * and fails on its own if the database is really down.
 */
export async function isProfileIdBanned(profileId: string): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const res = await selectWithBan('id', (cols) =>
        admin.from('profiles').select(cols).eq('id', profileId).maybeSingle(),
    );
    if (res.error) {
        console.error('[ban] ban lookup failed:', (res.error as any).message);
        return false;
    }
    return isBannedUntil((res.data as any)?.banned_until ?? null);
}

export type BanNotice = {
    bannedUntil: string | null;
    /** Text the admin chose to show the member (user_bans.public_note); never the internal reason. */
    publicNote: string | null;
};

/** What /suspended shows: the end date and the public note of the latest ban. */
export async function loadBanNotice(profileId: string): Promise<BanNotice> {
    const admin = getSupabaseAdmin();
    const prof = await selectWithBan('id', (cols) =>
        admin.from('profiles').select(cols).eq('id', profileId).maybeSingle(),
    );
    const bannedUntil = ((prof.data as any)?.banned_until ?? null) as string | null;

    let publicNote: string | null = null;
    const hist = await admin
        .from('user_bans')
        .select('public_note')
        .eq('profile_id', profileId)
        .eq('action', 'ban')
        .order('created_at', { ascending: false })
        .limit(1);
    if (hist.error) {
        if (!isBanSchemaMissing(hist.error)) console.error('[ban] notice load failed:', hist.error.message);
    } else {
        publicNote = ((hist.data as any[])?.[0]?.public_note ?? null) as string | null;
    }
    return { bannedUntil, publicNote };
}
