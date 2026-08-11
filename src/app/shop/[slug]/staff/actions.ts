'use server';
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { sendPlatformNotification } from '@/lib/platform-notify';

const OWNER_ROLES = new Set(['owner']);
const VALID_ROLES = new Set(['owner', 'admin', 'manager', 'installer', 'staff']);

async function assertOwner(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!OWNER_ROLES.has(role)) {
        throw new Error('Only owners can manage staff.');
    }
    return { profile, role };
}

export type InviteStaffResult =
    | { ok: true; created: boolean; email: string; role: string; emailed: boolean }
    | { ok: false; error: string };

/**
 * Admin-driven staff onboarding. The founder rule: staff do NOT self-sign-up —
 * an owner adds them here by EMAIL. This:
 *   1. Finds or admin-creates the platform auth user, ALWAYS stamping
 *      raw_user_meta_data.app='rollout' so the legacy public.handle_new_user
 *      trigger does NOT auto-provision them as EMWRAPS staff (public.profiles),
 *      and the rollout trigger mints their rollout.profiles row instead.
 *   2. Ensures a rollout.profiles row exists (idempotent backfill for an
 *      existing consumer / EMWRAPS-only account).
 *   3. Grants shop access via rollout.shop_memberships(role) — the ONLY place
 *      shop access is granted.
 *   4. Sends a Rollout co-branded "you've been added" email pointing them at
 *      /shop/login (the working web OTP entry). Best-effort — a mail failure
 *      does not roll back the membership.
 *
 * Invited staff are never routed through consumer onboarding (that lives only
 * under /signup); their first OTP sign-in lands them at /shop → their dashboard.
 */
export async function inviteStaffByEmail(
    rawEmail: string,
    role: string,
    shopId: number,
    slug: string,
): Promise<InviteStaffResult> {
    try {
        await assertOwner(shopId);
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Not authorized.' };
    }

    const email = rawEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Enter a valid email address.' };
    }
    if (!VALID_ROLES.has(role)) {
        return { ok: false, error: 'Invalid role.' };
    }

    const admin = getSupabaseAdmin();
    const publicAdmin = getSupabasePublicAdmin();
    const displayFallback = email.split('@')[0];
    const originBase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('localhost')
        ? 'http://localhost:3000'
        : 'https://rollout.club';

    // ── 1. Find or create the auth user (always app='rollout') ───────────────
    // NEW users are created via inviteUserByEmail, which — through the
    // send-auth-email hook — dispatches a Rollout-branded invite email (the same
    // hook that already powers OTP sign-in). The invite carries app='rollout' in
    // user_metadata so the legacy public.handle_new_user trigger skips them and
    // the rollout trigger mints their profile. redirectTo points at /auth/callback
    // (carrying next=/shop + the email), which consumes the invite token — session
    // arrives in the URL hash from GoTrue's /verify redirect — and signs them
    // straight into the dashboard. If the token can't be consumed (expired/reused),
    // the callback bounces them to /shop/login with the email prefilled and the
    // 6-digit code step ready, so they never have to re-type their address.
    let authUserId: string;
    let created = false;
    let emailed = false;
    const inviteCallback = new URL(`${originBase}/auth/callback`);
    inviteCallback.searchParams.set('next', '/shop');
    inviteCallback.searchParams.set('email', email);
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
        data: { app: 'rollout', home_shop_slug: slug, display_name: displayFallback },
        redirectTo: inviteCallback.toString(),
    });

    if (invite.data?.user) {
        authUserId = invite.data.user.id;
        created = true;
        emailed = true; // GoTrue dispatched the branded invite email
    } else {
        // Already registered — resolve the existing user's id WITHOUT sending an
        // auth email (generateLink returns the user but dispatches nothing), then
        // fall through to a best-effort co-branded "you've been added" notice.
        const msg = (invite.error?.message ?? '').toLowerCase();
        const looksLikeExists =
            msg.includes('already') || msg.includes('registered') || msg.includes('exists');
        if (!looksLikeExists && invite.error) {
            return { ok: false, error: invite.error.message };
        }
        const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
        const existingId = link.data?.user?.id;
        if (!existingId) {
            return {
                ok: false,
                error: invite.error?.message ?? 'Could not resolve that account.',
            };
        }
        authUserId = existingId;
    }

    // ── 2. Ensure a rollout.profiles row (idempotent) ────────────────────────
    const { data: profileId, error: profErr } = await publicAdmin.rpc('ensure_rollout_profile', {
        p_auth_user_id: authUserId,
        p_home_shop_slug: slug,
        p_display_name: displayFallback,
        p_email: email,
    });
    if (profErr || !profileId) {
        return { ok: false, error: profErr?.message ?? 'Could not create the staff profile.' };
    }

    // ── 3. Grant shop access (the only place membership is created) ──────────
    const { error: memErr } = await admin
        .from('shop_memberships')
        .upsert({ profile_id: profileId as string, shop_id: shopId, role });
    if (memErr) {
        return { ok: false, error: memErr.message };
    }

    // ── 4. Existing users: best-effort co-branded "you've been added" notice ──
    // New users already got the branded invite email in step 1. For an existing
    // account we can't re-trigger an auth email, so we fire the shop-notification
    // function (co-branded, Reply-To the shop). Best-effort — never rolls back.
    if (!created) try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && key) {
            const resp = await fetch(`${url}/functions/v1/send-shop-notification`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shop_id: shopId,
                    template: 'shop_message',
                    to: email,
                    subject_override: 'You\'ve been added to the shop dashboard on Rollout',
                    vars: {
                        customer_name: 'there',
                        title: 'You\'re on the team.',
                        subject: 'You\'ve been added to the shop dashboard on Rollout',
                        message: `you've been added as ${role.toUpperCase()}. Sign in at ${originBase}/shop/login with this email to open the shop dashboard.`,
                    },
                }),
            });
            emailed = resp.ok;
        }
    } catch {
        emailed = false;
    }

    revalidatePath(`/shop/${slug}/staff`, 'page');
    return { ok: true, created, email, role, emailed };
}

export async function setStaffRole(
    profileId: string,
    shopId: number,
    slug: string,
    role: 'owner' | 'admin' | 'manager' | 'installer' | 'staff',
) {
    const { profile: caller } = await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    // If demoting the only remaining owner away from 'owner', block it.
    if (role !== 'owner') {
        const { data: existing } = await admin
            .from('shop_memberships')
            .select('profile_id, role')
            .eq('shop_id', shopId)
            .eq('profile_id', profileId)
            .maybeSingle();
        if (existing && (existing as any).role === 'owner') {
            const { data: owners } = await admin
                .from('shop_memberships')
                .select('profile_id')
                .eq('shop_id', shopId)
                .eq('role', 'owner');
            const ownerCount = owners?.length ?? 0;
            if (ownerCount <= 1) {
                throw new Error(
                    'Cannot demote the only owner — promote someone else to owner first.',
                );
            }
        }
    }

    const { error } = await admin
        .from('shop_memberships')
        .upsert({ profile_id: profileId, shop_id: shopId, role });
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/staff`, 'page');
}

/**
 * Nominate a staff member as an individual host. Calls rollout.nominate_host
 * (SECURITY DEFINER; re-checks manager+ and nominee kind='user') through the
 * anon SSR client so auth.uid() = the owner. Flips the member's host_status →
 * 'pending' + files a verification_requests(host) row for admin review. Sends a
 * best-effort "application received" note to the nominee.
 */
export async function nominateHostAction(
    profileId: string,
    shopId: number,
    slug: string,
): Promise<{ ok: boolean; error?: string }> {
    try {
        await assertOwner(shopId);
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Not authorized.' };
    }

    const supabase = await getSupabaseServer();
    const { error } = await supabase
        .schema('rollout')
        .rpc('nominate_host', { p_profile_id: profileId, p_shop_id: shopId, p_payload: {} });
    if (error) {
        const msg = /host_status/.test(error.message)
            ? 'That member is already a host or pending.'
            : error.message;
        return { ok: false, error: msg };
    }

    // Best-effort: tell the nominee (email resolved server-side from profile).
    const admin = getSupabaseAdmin();
    const { data: prof } = await admin
        .from('profiles')
        .select('display_name, handle')
        .eq('id', profileId)
        .maybeSingle();
    await sendPlatformNotification({
        template: 'platform_application_received',
        toProfileId: profileId,
        vars: {
            kind: 'host',
            applicant_name: (prof as any)?.display_name ?? (prof as any)?.handle ?? 'there',
            cta_url: 'https://rollout.club/me',
        },
    });

    revalidatePath(`/shop/${slug}/staff`, 'page');
    return { ok: true };
}

export async function removeStaff(
    profileId: string,
    shopId: number,
    slug: string,
) {
    const { profile: caller } = await assertOwner(shopId);
    const admin = getSupabaseAdmin();

    // Self-protection: prevent removing self if you're the only owner.
    if (profileId === caller.profileId) {
        const { data: owners } = await admin
            .from('shop_memberships')
            .select('profile_id')
            .eq('shop_id', shopId)
            .eq('role', 'owner');
        const ownerCount = owners?.length ?? 0;
        if (ownerCount <= 1) {
            throw new Error(
                'Cannot remove yourself — you are the only owner. Promote someone else first.',
            );
        }
    }

    const { error } = await admin
        .from('shop_memberships')
        .delete()
        .eq('profile_id', profileId)
        .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    revalidatePath(`/shop/${slug}/staff`, 'page');
}
