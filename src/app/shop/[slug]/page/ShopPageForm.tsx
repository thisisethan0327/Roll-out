'use client';
import { useState, useTransition } from 'react';
import { updateShopPage } from './actions';

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

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 320px',
                gap: 24,
                alignItems: 'start',
            }}
        >
            <form onSubmit={submit} className="admin-form">
                <div className="admin-form-label">HANDLE</div>
                <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="admin-form-input"
                    placeholder="emwraps"
                    autoCapitalize="none"
                    autoCorrect="off"
                />
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--text-2)',
                        marginTop: -8,
                        marginBottom: 12,
                    }}
                >
                    CAREFUL — CHANGING THIS BREAKS @MENTIONS.
                </div>

                <div className="admin-form-label">DISPLAY NAME</div>
                <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="admin-form-input"
                    placeholder="EMWRAPS"
                />

                <div className="admin-form-label">BIO ({bio.length}/400)</div>
                <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 400))}
                    className="admin-form-input"
                    rows={4}
                    style={{ resize: 'vertical', minHeight: 84 }}
                    placeholder="Premium vehicle wraps and tint in Seattle…"
                />

                <div className="admin-form-label">LOCATION</div>
                <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="admin-form-input"
                    placeholder="Seattle, WA"
                />

                <div className="admin-form-label">SECTOR CODE</div>
                <input
                    type="text"
                    value={sectorCode}
                    onChange={(e) => setSectorCode(e.target.value)}
                    className="admin-form-input"
                    placeholder="SECTOR 06"
                />

                <div className="admin-form-label">AVATAR URL</div>
                <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="admin-form-input"
                    placeholder="https://…"
                />

                <div className="admin-form-label">BANNER URL</div>
                <input
                    type="text"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    className="admin-form-input"
                    placeholder="https://…"
                />

                {err && (
                    <div className="admin-login-error" style={{ padding: 8 }}>
                        {err}
                    </div>
                )}
                {ok && (
                    <div
                        style={{
                            padding: 8,
                            border: '1px solid var(--gold)',
                            background: 'var(--gold-glow)',
                            color: 'var(--gold)',
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wide)',
                        }}
                    >
                        SAVED.
                    </div>
                )}
                <button
                    type="submit"
                    disabled={pending}
                    className="admin-form-btn"
                >
                    {pending ? 'SAVING…' : 'SAVE CHANGES'}
                </button>
            </form>

            <div
                style={{
                    border: '1px solid var(--line-mid)',
                    background: 'var(--bg-2)',
                    padding: 16,
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--text-2)',
                        marginBottom: 12,
                    }}
                >
                    PREVIEW
                </div>
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '3 / 1',
                        background: 'var(--bg-1)',
                        border: '1px solid var(--line-mid)',
                        overflow: 'hidden',
                    }}
                >
                    {bannerUrl ? (
                        <img
                            src={bannerUrl}
                            alt=""
                            style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                height: '100%',
                                color: 'var(--text-2)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 10,
                                letterSpacing: 'var(--track-wider)',
                            }}
                        >
                            NO BANNER
                        </div>
                    )}
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        marginTop: -28,
                        paddingLeft: 12,
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            width: 64,
                            height: 64,
                            border: '2px solid var(--bg-2)',
                            background: 'var(--bg-1)',
                            overflow: 'hidden',
                        }}
                    >
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt=""
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                            />
                        ) : null}
                    </div>
                </div>
                <div style={{ marginTop: 12 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--text)',
                            letterSpacing: 'var(--track-wide)',
                        }}
                    >
                        {displayName || '—'}{' '}
                        {profile?.is_verified && (
                            <span style={{ color: 'var(--gold)' }}>✓</span>
                        )}
                    </div>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            color: 'var(--text-2)',
                            letterSpacing: 'var(--track-wider)',
                        }}
                    >
                        @{handle || '—'}
                        {sectorCode && ` · ${sectorCode}`}
                    </div>
                    {location && (
                        <div
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: 10,
                                color: 'var(--text-2)',
                                letterSpacing: 'var(--track-wider)',
                                marginTop: 4,
                            }}
                        >
                            {location}
                        </div>
                    )}
                    {bio && (
                        <div
                            style={{
                                marginTop: 10,
                                fontSize: 12,
                                color: 'var(--text)',
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {bio}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
