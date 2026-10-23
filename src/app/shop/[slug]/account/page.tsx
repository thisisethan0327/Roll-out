/**
 * MY ACCOUNT — the shop console's per-member profile surface.
 *
 * Every shop member (any role) lands here to see which login they're signed in
 * as (email), their handle / display name / avatar, their role at THIS shop and
 * when they joined it — and to edit their own handle, display name, and bio.
 *
 * Membership is enforced by the parent /shop/[slug] layout guard; we re-run the
 * guard here to get the authoritative profileId + role and to keep this route
 * safe if ever reached directly. The content is the session user's global
 * profile, so it renders the same for every shop slug.
 */
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AccountForm } from './AccountForm';
import { AtSign, CalendarDays, Mail, ShieldCheck } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

export const metadata = { title: 'My Account' };

type ProfileRow = {
    id: string;
    handle: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    created_at: string | null;
};

async function loadProfile(profileId: string): Promise<ProfileRow | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select('id, handle, display_name, bio, avatar_url, created_at')
        .eq('id', profileId)
        .maybeSingle();
    if (error) console.error('[shop/account] loadProfile failed:', error.message);
    return (data as ProfileRow) ?? null;
}

async function loadMemberSince(
    profileId: string,
    shopId: number,
): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shop_memberships')
        .select('created_at')
        .eq('profile_id', profileId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (error) console.error('[shop/account] loadMemberSince failed:', error.message);
    return (data as any)?.created_at ?? null;
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d
        .toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
}

function initials(name: string | null, handle: string): string {
    const src = (name || handle || '?').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

/** Truncate a long email for the compact header display. */
function truncEmail(email: string | null): string {
    if (!email) return 'NO EMAIL ON FILE';
    if (email.length <= 32) return email;
    const [user, domain] = email.split('@');
    if (!domain) return email.slice(0, 31) + '…';
    const head = user.slice(0, 12);
    return `${head}…@${domain}`;
}

export default async function AccountPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { profile, role, shop } = await requireShopMemberBySlug(slug);

    const [row, memberSince] = await Promise.all([
        loadProfile(profile.profileId),
        loadMemberSince(profile.profileId, shop.shopId),
    ]);

    const handle = row?.handle ?? profile.handle;
    const displayName = row?.display_name ?? profile.displayName ?? '';
    const bio = row?.bio ?? '';
    const email = profile.email;
    const isPlaceholder = /^u_[0-9a-f]{8}$/i.test(handle);

    return (
        <BizPage slug={slug}>
            <ConsoleHead title="My account" sub={`${shop.name} · Your profile`} />

            {isPlaceholder && (
                <Notice icon={<AtSign size={20} strokeWidth={2} aria-hidden="true" />}>
                    You&apos;re using an auto-generated handle (<b>@{handle}</b>). Claim a real one below — it&apos;s how teammates
                    and customers find you across the network.
                </Notice>
            )}

            <div className={bz.split}>
                <aside className={cx('g-card', bz.sideFirst)} aria-labelledby="acct-who">
                    <div className={bz.who}>
                        <span
                            className={bz.acAv}
                            style={row?.avatar_url ? { backgroundImage: `url(${row.avatar_url})` } : undefined}
                            aria-hidden="true"
                        >
                            {!row?.avatar_url && initials(displayName, handle)}
                        </span>
                        <span style={{ minWidth: 0 }}>
                            <h2 id="acct-who" className={bz.pvName} style={{ margin: 0 }}>
                                {displayName || '—'}
                            </h2>
                            <p className={bz.pvMeta}>@{handle}</p>
                        </span>
                    </div>
                    <ul className={cx('g-rows', cs.cardRows)} style={{ marginTop: 0 }}>
                        <li className="g-row">
                            <Mail size={20} strokeWidth={2} aria-hidden="true" />
                            <span className="g-row-t">
                                <b>Signed in as</b>
                                <small style={{ overflowWrap: 'anywhere' }} title={email ?? undefined}>
                                    {email ?? 'No email on file'}
                                </small>
                            </span>
                        </li>
                        <li className="g-row">
                            <ShieldCheck size={20} strokeWidth={2} aria-hidden="true" />
                            <span className="g-row-t">
                                <b>Role at this shop</b>
                                <small>{role.charAt(0).toUpperCase() + role.slice(1)}</small>
                            </span>
                        </li>
                        <li className="g-row">
                            <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
                            <span className="g-row-t">
                                <b>Member since</b>
                                <small>{fmtDate(memberSince)}</small>
                            </span>
                        </li>
                    </ul>
                </aside>

                <AccountForm slug={slug} initialHandle={handle} initialDisplayName={displayName} initialBio={bio} />
            </div>
        </BizPage>
    );
}
