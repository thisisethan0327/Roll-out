'use client';
import { useState, useTransition } from 'react';
import { updateShopProfile } from '../actions';
import { SHOP_CATEGORIES } from '@/lib/shop-categories';

type PrecisionOpt = {
    value: 'exact' | 'area' | 'off';
    label: string;
    hint: string;
};

const PRECISIONS: PrecisionOpt[] = [
    { value: 'exact', label: 'Exact address', hint: 'Street-address pin — popup shows the full address.' },
    { value: 'area', label: 'Area only — city-level pin', hint: 'CITY drives the pin (region is used if no city). Popup shows "ONLINE · BASED IN <city>", no street.' },
    { value: 'off', label: 'Not on the map', hint: 'Hidden from the public map + directory.' },
];

export function ShopProfileForm({
    shopId,
    shop,
    bio,
}: {
    shopId: number;
    shop: any;
    bio: string;
}) {
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    const [name, setName] = useState(shop?.name ?? '');
    const [category, setCategory] = useState(shop?.category ?? '');
    const [region, setRegion] = useState(shop?.region ?? '');
    const [bioText, setBioText] = useState(bio ?? '');
    const [addressLine, setAddressLine] = useState(shop?.address_line ?? '');
    const [city, setCity] = useState(shop?.city ?? '');
    const [stateRegion, setStateRegion] = useState(shop?.state_region ?? '');
    const [postal, setPostal] = useState(shop?.postal ?? '');
    const [supportEmail, setSupportEmail] = useState(shop?.support_email ?? '');
    const [contactPhone, setContactPhone] = useState(shop?.contact_phone ?? '');
    const [websiteUrl, setWebsiteUrl] = useState(shop?.website_url ?? '');
    const [precision, setPrecision] = useState<'exact' | 'area' | 'off'>(
        (shop?.location_precision as any) ?? 'exact',
    );

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        const fd = new FormData();
        fd.set('name', name);
        fd.set('category', category);
        fd.set('region', region);
        fd.set('bio', bioText);
        fd.set('address_line', addressLine);
        fd.set('city', city);
        fd.set('state_region', stateRegion);
        fd.set('postal', postal);
        fd.set('support_email', supportEmail);
        fd.set('contact_phone', contactPhone);
        fd.set('website_url', websiteUrl);
        fd.set('location_precision', precision);
        start(async () => {
            try {
                await updateShopProfile(shopId, fd);
                setOk(true);
            } catch (e: any) {
                setErr(e?.message ?? 'Failed to save');
            }
        });
    };

    return (
        <form onSubmit={submit} className="admin-form" style={{ maxWidth: 620, marginTop: 24 }}>
            <div className="admin-form-label" style={{ color: 'var(--gold)', fontSize: 11 }}>
                EDIT PROFILE
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5, margin: '0 0 6px' }}>
                Fix any field of this shop&apos;s public profile on the owner&apos;s behalf. Slug,
                commerce tier/handles/fees, and Stripe are intentionally not editable here.
            </p>

            <div className="admin-form-label">SHOP NAME</div>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="admin-form-input"
                placeholder="EMWRAPS"
            />

            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">CATEGORY</div>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="admin-form-input"
                        style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
                    >
                        <option value="">Select…</option>
                        {SHOP_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">REGION</div>
                    <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="admin-form-input"
                        placeholder="PNW"
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <div className="admin-form-label">BIO / DESCRIPTION</div>
            <textarea
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
                className="admin-form-input"
                rows={3}
                placeholder="Short description of the shop…"
                style={{ resize: 'vertical', fontFamily: 'var(--font-body)' }}
            />

            <div className="admin-form-label">SUPPORT EMAIL</div>
            <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="admin-form-input"
                placeholder="hello@shop.com"
                autoCapitalize="none"
                autoCorrect="off"
            />

            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">SUPPORT PHONE</div>
                    <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="admin-form-input"
                        placeholder="(206) 555-0100"
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">WEBSITE</div>
                    <input
                        type="text"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className="admin-form-input"
                        placeholder="https://shop.com"
                        autoCapitalize="none"
                        autoCorrect="off"
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <div
                style={{
                    marginTop: 10,
                    paddingTop: 14,
                    borderTop: '1px solid var(--line)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--gold)',
                }}
            >
                LOCATION · MAP
            </div>

            <PrecisionSelector value={precision} onChange={setPrecision} />

            <div className="admin-form-label">STREET ADDRESS</div>
            <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="admin-form-input"
                placeholder="1900 Airport Way S #103"
                disabled={precision === 'off'}
            />

            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                    <div className="admin-form-label">CITY</div>
                    <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="admin-form-input"
                        placeholder="Seattle"
                        disabled={precision === 'off'}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">STATE</div>
                    <input
                        type="text"
                        value={stateRegion}
                        onChange={(e) => setStateRegion(e.target.value)}
                        className="admin-form-input"
                        placeholder="WA"
                        disabled={precision === 'off'}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">ZIP</div>
                    <input
                        type="text"
                        value={postal}
                        onChange={(e) => setPostal(e.target.value)}
                        className="admin-form-input"
                        placeholder="98134"
                        disabled={precision === 'off'}
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            <p style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.5, margin: '2px 0 0' }}>
                {precision === 'area'
                    ? 'Coordinates are resolved on save from the CITY (the region above is used only if no city is set). A good pin is never overwritten if the lookup fails.'
                    : 'Coordinates are resolved automatically on save from the full street address. A good pin is never overwritten if the lookup fails.'}
            </p>

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

            <button type="submit" disabled={pending} className="admin-form-btn">
                {pending ? 'SAVING…' : 'SAVE PROFILE'}
            </button>
        </form>
    );
}

function PrecisionSelector({
    value,
    onChange,
}: {
    value: 'exact' | 'area' | 'off';
    onChange: (v: 'exact' | 'area' | 'off') => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="admin-form-label">MAP PRESENCE</div>
            {PRECISIONS.map((p) => {
                const on = value === p.value;
                return (
                    <label
                        key={p.value}
                        style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            padding: '10px 12px',
                            border: `1px solid ${on ? 'var(--gold)' : 'var(--line-mid)'}`,
                            background: on ? 'var(--gold-glow)' : 'var(--bg-2)',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="radio"
                            name="location_precision"
                            value={p.value}
                            checked={on}
                            onChange={() => onChange(p.value)}
                            style={{ marginTop: 2 }}
                        />
                        <span style={{ minWidth: 0 }}>
                            <span
                                style={{
                                    display: 'block',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 12,
                                    letterSpacing: 'var(--track-wide)',
                                    color: on ? 'var(--gold)' : 'var(--text)',
                                }}
                            >
                                {p.label.toUpperCase()}
                            </span>
                            <span style={{ display: 'block', color: 'var(--text-2)', fontSize: 12, marginTop: 2 }}>
                                {p.hint}
                            </span>
                        </span>
                    </label>
                );
            })}
        </div>
    );
}
