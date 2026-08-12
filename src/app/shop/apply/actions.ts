'use server';

/**
 * Shop application submission. The applicant is a signed-in member; on submit we
 * call the atomic `rollout.create_shop` RPC (SECURITY DEFINER) through the anon
 * SSR client so auth.uid() inside the function resolves to the caller. The shop
 * lands status='pending' (invisible publicly, console shows the pending gate)
 * and a verification_requests(shop) row hits the admin queue. With commerce
 * intent (?commerce=1) a second verification_requests(commerce) row is created
 * in the same transaction and commerce_status flips to 'pending'.
 */
import { redirect } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendPlatformNotification } from '@/lib/platform-notify';
import { SLUG_RE, UBI_RE, type ApplyState } from './types';
import { isShopCategory } from '@/lib/shop-categories';

function str(fd: FormData, key: string): string {
    return (fd.get(key)?.toString() ?? '').trim();
}

export async function submitShopApplication(
    _prev: ApplyState,
    formData: FormData,
): Promise<ApplyState> {
    const applicant = await requireConsumer('/shop/apply');

    const name = str(formData, 'name');
    const slug = str(formData, 'slug').toLowerCase();
    const handle = slug; // shop page @handle == slug (matches salvage convention)
    const category = str(formData, 'category');
    const description = str(formData, 'description');
    const region = str(formData, 'region');
    const addressLine = str(formData, 'address_line');
    const city = str(formData, 'city');
    const stateRegion = str(formData, 'state_region');
    const postal = str(formData, 'postal');
    const phone = str(formData, 'contact_phone');
    const supportEmail = str(formData, 'support_email');
    const website = str(formData, 'website_url');
    const ig = str(formData, 'social_instagram');
    const tiktok = str(formData, 'social_tiktok');

    const withCommerce = str(formData, 'with_commerce') === '1';
    const originApp = withCommerce
        ? 'neferstock'
        : str(formData, 'origin_app') === 'neferstock'
          ? 'neferstock'
          : 'rollout';

    // ── validation ──
    if (name.length < 2 || name.length > 60) {
        return { ok: false, error: 'Shop name must be 2–60 characters.', field: 'name' };
    }
    if (!SLUG_RE.test(slug)) {
        return {
            ok: false,
            error: 'URL handle must be 3–30 chars: lowercase letters, numbers, and hyphens.',
            field: 'slug',
        };
    }
    if (!category) {
        return { ok: false, error: 'Pick a category.', field: 'category' };
    }
    if (!isShopCategory(category)) {
        return { ok: false, error: 'Pick a category from the list.', field: 'category' };
    }

    const socials: Record<string, string> = {};
    if (ig) socials.instagram = ig.replace(/^@/, '');
    if (tiktok) socials.tiktok = tiktok.replace(/^@/, '');

    let commerce: Record<string, unknown> = {};
    if (withCommerce) {
        const ubi = str(formData, 'ubi').replace(/\D/g, '');
        const legalName = str(formData, 'legal_name');
        if (ubi && !UBI_RE.test(ubi)) {
            return { ok: false, error: 'UBI must be 9 digits.', field: 'ubi' };
        }
        commerce = { ubi: ubi || null, legal_name: legalName || null, docs_pending: true };
    }

    // Pre-check slug/handle uniqueness for a friendly message (the RPC also
    // enforces via unique constraints, but we surface a nicer error first).
    const admin = getSupabaseAdmin();
    const [{ data: slugTaken }, { data: handleTaken }] = await Promise.all([
        admin.from('shops').select('id').eq('slug', slug).maybeSingle(),
        admin.from('profiles').select('id').ilike('handle', handle).maybeSingle(),
    ]);
    if (slugTaken || handleTaken) {
        return { ok: false, error: 'That handle is already taken — try another.', field: 'slug' };
    }

    // ── atomic create via RPC (auth.uid() = caller through the SSR client) ──
    const supabase = await getSupabaseServer();
    const { data: created, error } = await supabase.schema('rollout').rpc('create_shop', {
        p_slug: slug,
        p_name: name,
        p_handle: handle,
        p_category: category,
        p_region: region || null,
        p_bio: description || null,
        p_location: [city, stateRegion].filter(Boolean).join(', ') || region || null,
        p_address_line: addressLine || null,
        p_city: city || null,
        p_state_region: stateRegion || null,
        p_postal: postal || null,
        p_contact_phone: phone || null,
        p_support_email: supportEmail || null,
        p_website_url: website || null,
        p_socials: socials,
        p_origin_app: originApp,
        p_with_commerce: withCommerce,
        p_commerce: commerce,
    });

    if (error) {
        const msg = /duplicate|unique/i.test(error.message)
            ? 'That handle is already taken — try another.'
            : `Couldn’t submit your application: ${error.message}`;
        return { ok: false, error: msg, field: 'slug' };
    }

    // ── Best-effort "application received" acknowledgement(s) ──
    // create_shop returns a single row (shop_id, …). Send the shop-listing
    // acknowledgement, plus a commerce one when they applied with commerce
    // intent. Never blocks the redirect below.
    const row = Array.isArray(created) ? (created as any[])[0] : (created as any);
    const newShopId = (row?.shop_id ?? null) as number | null;
    if (applicant.email) {
        await sendPlatformNotification({
            template: 'platform_application_received',
            to: applicant.email,
            toProfileId: applicant.profileId,
            shopId: newShopId,
            vars: { kind: 'shop', shop_name: name, applicant_name: applicant.displayName || applicant.handle, cta_url: `https://rollout.club/shop/${slug}/overview` },
        });
        if (withCommerce) {
            await sendPlatformNotification({
                template: 'platform_application_received',
                to: applicant.email,
                toProfileId: applicant.profileId,
                shopId: newShopId,
                vars: { kind: 'commerce', shop_name: name, applicant_name: applicant.displayName || applicant.handle },
            });
        }
    }

    // Land them on their (pending-gated) console.
    redirect(`/shop/${slug}/overview`);
}
