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
    const { data } = await admin
        .from('profiles')
        .select('id, handle, display_name, bio, avatar_url, created_at')
        .eq('id', profileId)
        .maybeSingle();
    return (data as ProfileRow) ?? null;
}

async function loadMemberSince(
    profileId: string,
    shopId: number,
): Promise<string | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shop_memberships')
        .select('created_at')
        .eq('profile_id', profileId)
        .eq('shop_id', shopId)
        .maybeSingle();
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
        })
        .toUpperCase();
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
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">MY ACCOUNT</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · YOUR ROLLOUT PROFILE
                    </div>
                </div>
            </div>

            {/* Identity summary */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    marginBottom: 16,
                }}
            >
                <div
                    aria-hidden
                    style={{
                        width: 56,
                        height: 56,
                        flex: '0 0 auto',
                        borderRadius: '50%',
                        border: '1px solid var(--line-mid)',
                        background: 'var(--gold-glow, rgba(255,183,51,0.08))',
                        color: 'var(--gold)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-display)',
                        fontSize: 18,
                        letterSpacing: 'var(--track-wide)',
                        backgroundImage: row?.avatar_url
                            ? `url(${row.avatar_url})`
                            : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                >
                    {!row?.avatar_url && initials(displayName, handle)}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 16,
                            color: 'var(--text)',
                        }}
                    >
                        {displayName || '—'}
                    </div>
                    <div style={{ color: 'var(--gold)', fontSize: 13 }}>
                        @{handle}
                    </div>
                </div>
            </div>

            <div className="admin-stat-grid" style={{ marginBottom: 20 }}>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">SIGNED IN AS</div>
                    <div
                        className="admin-stat-num"
                        style={{ fontSize: 14, wordBreak: 'break-all' }}
                        title={email ?? undefined}
                    >
                        {email ?? 'NO EMAIL ON FILE'}
                    </div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">ROLE AT THIS SHOP</div>
                    <div className="admin-stat-num gold" style={{ fontSize: 16 }}>
                        {role.toUpperCase()}
                    </div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">MEMBER SINCE</div>
                    <div className="admin-stat-num" style={{ fontSize: 14 }}>
                        {fmtDate(memberSince)}
                    </div>
                </div>
            </div>

            {isPlaceholder && (
                <div
                    style={{
                        padding: 10,
                        marginBottom: 16,
                        border: '1px solid var(--line-mid)',
                        background: 'var(--gold-glow, rgba(255,183,51,0.06))',
                        color: 'var(--text-2)',
                        fontSize: 12,
                        lineHeight: 1.5,
                    }}
                >
                    You're using an auto-generated handle (
                    <span style={{ color: 'var(--gold)' }}>@{handle}</span>).
                    Claim a real one below — it's how teammates and customers
                    find you across Rollout.
                </div>
            )}

            <AccountForm
                slug={slug}
                initialHandle={handle}
                initialDisplayName={displayName}
                initialBio={bio}
            />
        </>
    );
}
