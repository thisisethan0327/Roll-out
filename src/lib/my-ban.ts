import 'server-only';
/**
 * What /suspended shows: the caller's own ban state via rollout.my_ban() on the
 * MEMBER session (the RPC resolves the caller by auth.uid(), because
 * current_profile_id() is NULL for a banned caller). Migration 093 extends the
 * payload (refund mode, appeal, tickets). Before 093, or if the RPC errors, we
 * fall back to loadBanNotice() (service-role read of the 091 columns).
 */
import { getRolloutMemberClient } from './consumer';
import { loadBanNotice } from './ban-server';
import { isBanSchemaMissing, isPermanentBan, parseMyBan, type MyBan } from './ban';

export async function loadMyBan(profileId: string, fallbackUntil?: string | null): Promise<MyBan> {
    try {
        const member = await getRolloutMemberClient();
        const { data, error } = await member.rpc('my_ban');
        if (!error) {
            const parsed = parseMyBan(data);
            if (parsed) return parsed;
        } else if (!isBanSchemaMissing(error)) {
            console.error('[my-ban] my_ban failed:', error.code, error.message);
        }
    } catch (e) {
        console.error('[my-ban] my_ban threw:', e instanceof Error ? e.message : e);
    }
    const notice = await loadBanNotice(profileId);
    const until = notice.bannedUntil ?? fallbackUntil ?? null;
    return {
        bannedUntil: until,
        publicNote: notice.publicNote,
        banId: null,
        bannedAt: null,
        isPermanent: isPermanentBan(until),
        refundMode: null,
        appeal: null,
        tickets: [],
        extended: false,
    };
}
