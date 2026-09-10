'use server';
/**
 * Follow / unfollow from the web. rollout.follows already allows a member to
 * write their own rows (follows_write_self + the authenticated grant); this
 * action runs after the platform session check with the admin client so the
 * write cannot be spoofed for another follower. The follow notification
 * trigger (migration 010) fires on insert as it does from the app.
 */
import { getConsumerProfile } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type FollowResult = { ok: true; following: boolean } | { ok: false; reason: 'signin' | 'self' | 'error' };

export async function toggleFollowAction(targetProfileId: string): Promise<FollowResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, reason: 'signin' };
    if (me.profileId === targetProfileId) return { ok: false, reason: 'self' };
    const admin = getSupabaseAdmin();
    const { data: existing, error: readErr } = await admin
        .from('follows')
        .select('follower_id')
        .eq('follower_id', me.profileId)
        .eq('followee_id', targetProfileId)
        .maybeSingle();
    if (readErr) return { ok: false, reason: 'error' };
    if (existing) {
        const { error } = await admin.from('follows').delete().eq('follower_id', me.profileId).eq('followee_id', targetProfileId);
        return error ? { ok: false, reason: 'error' } : { ok: true, following: false };
    }
    const { error } = await admin.from('follows').insert({ follower_id: me.profileId, followee_id: targetProfileId });
    return error ? { ok: false, reason: 'error' } : { ok: true, following: true };
}
