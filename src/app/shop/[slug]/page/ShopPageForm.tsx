'use client';
import { useState, useTransition } from 'react';
import { updateShopPage } from './actions';
import { BadgeCheck, Eye, MapPin, TriangleAlert } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { Field, FormSection } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

export function ShopPageForm({
    shopId,
    slug,
    profile,
}: {
    shopId: number;
    slug: string;
    profile: any;
}) {
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    const [handle, setHandle] = useState(profile?.handle ?? '');
    const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
    const [bio, setBio] = useState(profile?.bio ?? '');
    const [location, setLocation] = useState(profile?.location ?? '');
    const [sectorCode, setSectorCode] = useState(profile?.sector_code ?? '');
    const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
    const [bannerUrl, setBannerUrl] = useState(profile?.banner_url ?? '');

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        const fd = new FormData();
        fd.set('handle', handle);
        fd.set('display_name', displayName);
        fd.set('bio', bio);
        fd.set('location', location);
        fd.set('sector_code', sectorCode);
        fd.set('avatar_url', avatarUrl);
        fd.set('banner_url', bannerUrl);
        start(async () => {
            try {
                await updateShopPage(shopId, slug, fd);
                setOk(true);
            } catch (e: any) {
                setErr(e?.message ?? 'Failed to save');
            }
        });
    };

    const inp = cx(cs.input, bz.in);
    const initials = (displayName || handle || '?').trim().slice(0, 2).toUpperCase();

    return (
        <div className={bz.split}>
            <form onSubmit={submit} className={cs.col}>
                <FormSection id="sp-id" title="Identity" sub="How the shop appears on its public page." edge>
                    <Field
                        label="Handle"
                        htmlFor="sp-handle"
                        hint={
                            <>
                                <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
                                Careful — changing this breaks @mentions.
                            </>
                        }
                    >
                        <div className={cs.affix}>
                            <span aria-hidden="true">@</span>
                            <input
                                id="sp-handle"
                                type="text"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                className={inp}
                                placeholder="emwraps"
                                autoCapitalize="none"
                                autoCorrect="off"
                            />
                        </div>
                    </Field>
                    <Field label="Display name" htmlFor="sp-name">
                        <input id="sp-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inp} placeholder="EMWRAPS" />
                    </Field>
                    <Field label={`Bio (${bio.length}/400)`} htmlFor="sp-bio">
                        <textarea
                            id="sp-bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value.slice(0, 400))}
                            className={inp}
                            rows={4}
                            placeholder="Premium vehicle wraps and tint…"
                        />
                    </Field>
                    <div className={cs.grid2f}>
                        <Field label="Location" htmlFor="sp-loc">
                            <input id="sp-loc" type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inp} placeholder="City, ST" />
                        </Field>
                        <Field label="Sector code" htmlFor="sp-sector">
                            <input id="sp-sector" type="text" value={sectorCode} onChange={(e) => setSectorCode(e.target.value)} className={inp} placeholder="SECTOR 06" />
                        </Field>
                    </div>
                </FormSection>

                <FormSection id="sp-img" title="Images" sub="Paste an image link. Square works best for the avatar, 3:1 for the banner.">
                    <Field label="Avatar URL" htmlFor="sp-avatar">
                        <input id="sp-avatar" type="text" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className={inp} placeholder="https://…" />
                    </Field>
                    <Field label="Banner URL" htmlFor="sp-banner">
                        <input id="sp-banner" type="text" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className={inp} placeholder="https://…" />
                    </Field>
                </FormSection>

                {err && (
                    <Notice tone="bad" live>
                        {err}
                    </Notice>
                )}
                {ok && (
                    <Notice tone="ok" live>
                        Saved.
                    </Notice>
                )}
                <div>
                    <GlideButton type="submit" disabled={pending} aria-busy={pending}>
                        {pending ? 'Saving…' : 'Save changes'}
                    </GlideButton>
                </div>
            </form>

            <aside className={cx('g-card', cs.sticky)} aria-labelledby="sp-prev-h">
                <div className={cs.cardBody} style={{ paddingTop: 20, paddingBottom: 28 }}>
                    <h2 id="sp-prev-h" className={bz.prevH}>
                        <Eye size={16} strokeWidth={2} aria-hidden="true" />
                        Preview
                    </h2>
                    <div className={bz.banner}>
                        {bannerUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={bannerUrl} alt="" />
                        ) : (
                            <span>No banner</span>
                        )}
                    </div>
                    <div className={bz.pvAv}>
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" />
                        ) : (
                            <span aria-hidden="true">{initials}</span>
                        )}
                    </div>
                    <p className={bz.pvName}>
                        {displayName || '—'}
                        {profile?.is_verified && <BadgeCheck size={20} strokeWidth={2} role="img" aria-label="Verified" />}
                    </p>
                    <p className={bz.pvMeta}>
                        @{handle || '—'}
                        {sectorCode && ` · ${sectorCode}`}
                    </p>
                    {location && (
                        <p className={bz.pvMeta}>
                            <MapPin size={14} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
                            {location}
                        </p>
                    )}
                    {bio && <p className={bz.pvBio}>{bio}</p>}
                </div>
            </aside>
        </div>
    );
}
