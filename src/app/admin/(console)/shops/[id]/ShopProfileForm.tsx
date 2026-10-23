'use client';
import { useState, useTransition } from 'react';
import { updateShopProfile } from '../actions';
import { SHOP_CATEGORIES } from '@/lib/shop-categories';
import { CircleCheck } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';

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
        <form onSubmit={submit} className="admin-form" aria-labelledby={`edit-shop-${shopId}`}>
            <h2 className={a.formTitle} id={`edit-shop-${shopId}`}>
                Edit profile
            </h2>
            <p className={a.small} style={{ margin: 0 }}>
                Fix any field of this shop&apos;s public profile on the owner&apos;s behalf. Slug, commerce
                tier/handles/fees, and Stripe are intentionally not editable here.
            </p>

            <label className={a.field}>
                <span className="admin-form-label">Shop name</span>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="admin-form-input"
                    placeholder="EMWRAPS"
                />
            </label>

            <div className={a.fieldRow}>
                <label className={a.field}>
                    <span className="admin-form-label">Category</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-form-input">
                        <option value="">Select…</option>
                        {SHOP_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={a.field}>
                    <span className="admin-form-label">Region</span>
                    <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="admin-form-input"
                        placeholder="PNW"
                    />
                </label>
            </div>

            <label className={a.field}>
                <span className="admin-form-label">Bio / description</span>
                <textarea
                    value={bioText}
                    onChange={(e) => setBioText(e.target.value)}
                    className="admin-form-input"
                    rows={3}
                    placeholder="Short description of the shop…"
                />
            </label>

            <label className={a.field}>
                <span className="admin-form-label">Support email</span>
                <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="admin-form-input"
                    placeholder="hello@shop.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                />
            </label>

            <div className={a.fieldRow}>
                <label className={a.field}>
                    <span className="admin-form-label">Support phone</span>
                    <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="admin-form-input"
                        placeholder="(206) 555-0100"
                    />
                </label>
                <label className={a.field}>
                    <span className="admin-form-label">Website</span>
                    <input
                        type="text"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className="admin-form-input"
                        placeholder="https://shop.com"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                </label>
            </div>

            <div className={a.formSub} role="heading" aria-level={3}>
                Location and map
            </div>

            <PrecisionSelector value={precision} onChange={setPrecision} />

            <label className={a.field}>
                <span className="admin-form-label">Street address</span>
                <input
                    type="text"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    className="admin-form-input"
                    placeholder="1900 Airport Way S #103"
                    disabled={precision === 'off'}
                />
            </label>

            <div className={a.fieldRow}>
                <label className={a.field}>
                    <span className="admin-form-label">City</span>
                    <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="admin-form-input"
                        placeholder="Seattle"
                        disabled={precision === 'off'}
                    />
                </label>
                <label className={a.field}>
                    <span className="admin-form-label">State</span>
                    <input
                        type="text"
                        value={stateRegion}
                        onChange={(e) => setStateRegion(e.target.value)}
                        className="admin-form-input"
                        placeholder="WA"
                        disabled={precision === 'off'}
                    />
                </label>
                <label className={a.field}>
                    <span className="admin-form-label">ZIP</span>
                    <input
                        type="text"
                        value={postal}
                        onChange={(e) => setPostal(e.target.value)}
                        className="admin-form-input"
                        placeholder="98134"
                        disabled={precision === 'off'}
                    />
                </label>
            </div>

            <p className={a.small} style={{ margin: 0 }}>
                {precision === 'area'
                    ? 'Coordinates are resolved on save from the city (the region above is used only if no city is set). A good pin is never overwritten if the lookup fails.'
                    : 'Coordinates are resolved automatically on save from the full street address. A good pin is never overwritten if the lookup fails.'}
            </p>

            {err && (
                <div className="admin-login-error" role="alert">
                    {err}
                </div>
            )}
            {ok && (
                <div className={a.note} role="status">
                    <CircleCheck size={18} strokeWidth={2} aria-hidden="true" />
                    Saved.
                </div>
            )}

            <button type="submit" disabled={pending} className="admin-form-btn">
                {pending ? 'Saving…' : 'Save profile'}
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
        <fieldset className={a.field} style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="admin-form-label" style={{ marginBottom: 7 }}>
                Map presence
            </legend>
            <div className={`${a.choices} ${a.choiceCol}`}>
                {PRECISIONS.map((p) => {
                    const on = value === p.value;
                    return (
                        <label key={p.value} className={a.choice}>
                            <input
                                type="radio"
                                name="location_precision"
                                value={p.value}
                                checked={on}
                                onChange={() => onChange(p.value)}
                            />
                            <span style={{ minWidth: 0 }}>
                                {p.label}
                                <small>{p.hint}</small>
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
