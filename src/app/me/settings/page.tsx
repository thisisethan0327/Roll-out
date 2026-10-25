import type { Metadata } from 'next';
import { ChevronRight, MapPin, Palette, ShieldCheck, UserRound } from 'lucide-react';
import { requireConsumer } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ensureMedusaCustomerToken } from '@/lib/medusa-customer';
import { listShippingAddresses } from '@/lib/medusa-address';
import { ProfileForm } from './ProfileForm';
import { ImageSlot } from './ImageSlot';
import { AddressBook } from './AddressBook';
import { AccountPanel } from './AccountPanel';
import { AppearancePanel } from '@/components/glide-console/AppearancePanel';
import { Card, Row, SecButton } from '@/components/glide/primitives';
import { CardHead, ConsoleHead } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import st from './settings.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings · My Rollout', robots: { index: false } };

const ic = { size: 22, strokeWidth: 1.75, 'aria-hidden': true } as const;
const chev = <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />;

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
        <div className={s.scope}>
            <ConsoleHead
                title="Settings"
                actions={
                    <SecButton href={`/u/${handle}`}>
                        <UserRound size={17} strokeWidth={2} aria-hidden="true" />
                        Public profile
                    </SecButton>
                }
            />

            <div className={s.side}>
                {/* Index: jumps to each section on this page. */}
                <div className={`${s.col} ${s.sticky}`}>
                    <Card as="section" aria-label="Settings sections">
                        <ul className={`g-rows ${st.index}`}>
                            <Row href="#profile" icon={<UserRound {...ic} />} label="Profile" sub="Name, handle, photo, bio" trailing={chev} />
                            <Row
                                href="#shipping"
                                icon={<MapPin {...ic} />}
                                label="Shipping addresses"
                                sub={connected ? `${addresses.length} saved` : 'Added at checkout'}
                                trailing={chev}
                            />
                            <Row href="#appearance" icon={<Palette {...ic} />} label="Appearance" sub="Theme and dark style" trailing={chev} />
                            <Row href="#account" icon={<ShieldCheck {...ic} />} label="Account" sub="Email, sessions, delete" trailing={chev} />
                        </ul>
                    </Card>
                </div>

                <div className={s.col}>
                    <Card as="section" aria-labelledby="profile" style={{ scrollMarginTop: 20 }}>
                        <CardHead id="profile" title="Profile" />
                        <div className={s.cardBody}>
                            <div className={st.slots}>
                                <ImageSlot kind="avatar" current={p?.avatar_url ?? null} label="Avatar" hint="Square, up to 5 MB — JPG, PNG or WebP. Resized to 512 px." />
                                <ImageSlot kind="banner" current={p?.banner_url ?? null} label="Banner" hint="Wide, up to 5 MB — shown 21:9 at the top of your page. Resized to 1600 px." />
                            </div>
                            <ProfileForm initial={{ displayName: p?.display_name ?? me.displayName, handle, bio: p?.bio ?? '', location: p?.location ?? '' }} />
                        </div>
                    </Card>

                    <Card as="section" aria-labelledby="shipping" style={{ scrollMarginTop: 20 }}>
                        <CardHead id="shipping" title="Shipping addresses" />
                        <div className={s.cardBody}>
                            <AddressBook initial={addresses} connected={connected} />
                        </div>
                    </Card>

                    {/* Device-only: the choice lives in cookies on this browser. Saving it
                        on the profile needs a migration (open decision). */}
                    <Card as="section" aria-labelledby="appearance" style={{ scrollMarginTop: 20 }}>
                        <CardHead id="appearance" title="Appearance" sub="Saved on this device." />
                        <div className={s.cardBody}>
                            <AppearancePanel />
                        </div>
                    </Card>

                    <Card as="section" aria-labelledby="account" style={{ scrollMarginTop: 20 }}>
                        <CardHead id="account" title="Account" />
                        <div className={s.cardBody} style={{ paddingTop: 4 }}>
                            <AccountPanel email={me.email} handle={handle} />
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
