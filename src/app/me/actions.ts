'use server';
/**
 * Shared server actions for the /me consumer portal.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireConsumer } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendPlatformNotification } from '@/lib/platform-notify';

/** Sign the member out (clears the SSR cookie session) and return home. */
export async function signOutAction(): Promise<void> {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();
    redirect('/');
}

/**
 * Member self-applies to become an individual event host. Calls the
 * `rollout.become_host` SECURITY DEFINER RPC through the anon SSR client so
 * auth.uid() resolves to the caller (the RPC flips host_status → 'pending' and
 * files a verification_requests(host) row). Best-effort "received" email.
 */
export async function becomeHostAction(
    _prev: { ok: boolean; error?: string } | null,
    formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
    const profile = await requireConsumer('/me');
    const why = (formData.get('why')?.toString() ?? '').trim().slice(0, 500);

    const supabase = await getSupabaseServer();
    const { error } = await supabase
        .schema('rollout')
        .rpc('become_host', { p_payload: { why: why || null } });
    if (error) {
        const msg = /already a verified host/i.test(error.message)
            ? 'You are already a verified host.'
            : `Couldn’t submit your host application: ${error.message}`;
        return { ok: false, error: msg };
    }

    // Best-effort acknowledgement email.
    if (profile.email) {
        await sendPlatformNotification({
            template: 'platform_application_received',
            to: profile.email,
            toProfileId: profile.profileId,
            vars: {
                kind: 'host',
                applicant_name: profile.displayName || profile.handle,
                cta_url: 'https://rollout.club/me',
            },
        });
    }

    revalidatePath('/me');
    return { ok: true };
}
