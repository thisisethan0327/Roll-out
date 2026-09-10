import type { Metadata } from 'next';
import Link from 'next/link';
import { requireConsumer } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ensureMedusaCustomerToken } from '@/lib/medusa-customer';
import { listShippingAddresses } from '@/lib/medusa-address';
import { Panel } from '../ui';
import { ProfileForm } from './ProfileForm';
import { ImageSlot } from './ImageSlot';
import { AddressBook } from './AddressBook';
import { AccountPanel } from './AccountPanel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings · My Rollout', robots: { index: false } };

export default async function SettingsPage() {
    const me = await requireConsumer('/me/settings');
    const admin = getSupabaseAdmin();
    const { data: p } = await admin
        .from('profiles')
        .select('handle, display_name, bio, location, avatar_url, banner_url')
        .eq('id', me.profileId)
        .maybeSingle();
    const connected = !!(await ensureMedusaCustomerToken());
    const addresses = connected ? await listShippingAddresses() : [];
    const handle = String(p?.handle ?? me.handle).replace(/^@+/, '');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">SETTINGS</div>
                    <div className="admin-page-sub">Your profile, shipping addresses and account.</div>
                </div>
                <Link href={`/u/${handle}`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                    PUBLIC PROFILE
                </Link>
            </div>

            <Panel title="PROFILE">
                <div className="admin-form" style={{ marginBottom: 14 }}>
                    <ImageSlot kind="avatar" current={p?.avatar_url ?? null} label="AVATAR" hint="Square, up to 5 MB — JPG, PNG or WebP. Resized to 512 px." />
                    <ImageSlot kind="banner" current={p?.banner_url ?? null} label="BANNER" hint="Wide, up to 5 MB — shown 21:9 at the top of your page. Resized to 1600 px." />
                </div>
                <ProfileForm initial={{ displayName: p?.display_name ?? me.displayName, handle, bio: p?.bio ?? '', location: p?.location ?? '' }} />
            </Panel>

            <Panel title="SHIPPING ADDRESSES">
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>Used when you shop on Rollout. Your default prefills checkout.</div>
                <AddressBook initial={addresses} connected={connected} />
            </Panel>

            <Panel title="ACCOUNT">
                <AccountPanel email={me.email} handle={handle} />
            </Panel>
        </div>
    );
}
