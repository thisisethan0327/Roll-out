'use client';
import { useState, useTransition } from 'react';
import { updateShopGeneral } from './actions';

export function GeneralSettingsForm({
    shopId,
    slug,
    row,
}: {
    shopId: number;
    slug: string;
    row: any;
}) {
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    const [name, setName] = useState(row?.name ?? '');
    const [region, setRegion] = useState(row?.region ?? '');
    const [primary, setPrimary] = useState(row?.primary_color ?? '');
    const [secondary, setSecondary] = useState(row?.secondary_color ?? '');

    // Location
    const [addressLine, setAddressLine] = useState(row?.address_line ?? '');
    const [city, setCity] = useState(row?.city ?? '');
    const [stateRegion, setStateRegion] = useState(row?.state_region ?? '');
    const [postal, setPostal] = useState(row?.postal ?? '');
    const [precision, setPrecision] = useState<'exact' | 'area' | 'off'>(
        (row?.location_precision as any) ?? 'exact',
    );

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        const fd = new FormData();
        fd.set('name', name);
        fd.set('region', region);
        fd.set('primary_color', primary);
        fd.set('secondary_color', secondary);
        fd.set('address_line', addressLine);
        fd.set('city', city);
        fd.set('state_region', stateRegion);
        fd.set('postal', postal);
        fd.set('location_precision', precision);
        start(async () => {
            try {
                await updateShopGeneral(shopId, slug, fd);
                setOk(true);
            } catch (e: any) {
                setErr(e?.message ?? 'Failed to save');
            }
        });
    };

    return (
        <form onSubmit={submit} className="admin-form" style={{ maxWidth: 560 }}>
            <div className="admin-form-label">SHOP NAME</div>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="admin-form-input"
                placeholder="EMWRAPS"
            />

            <div className="admin-form-label">REGION</div>
            <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="admin-form-input"
                placeholder="PNW"
            />

            <div className="admin-form-label">PRIMARY COLOR</div>
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <input
                    type="text"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                    className="admin-form-input"
                    placeholder="#ffb733"
                    style={{ flex: 1, marginBottom: 0 }}
                />
                <div
                    style={{
                        width: 36,
                        height: 36,
                        border: '1px solid var(--line-mid)',
                        background: primary || 'transparent',
                    }}
                />
            </div>

            <div className="admin-form-label">SECONDARY COLOR</div>
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <input
                    type="text"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="admin-form-input"
                    placeholder="#1a1a1a"
                    style={{ flex: 1, marginBottom: 0 }}
                />
                <div
                    style={{
                        width: 36,
                        height: 36,
                        border: '1px solid var(--line-mid)',
                        background: secondary || 'transparent',
                    }}
                />
            </div>

            <div
                style={{
                    marginTop: 18,
                    marginBottom: 14,
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
            <p
                style={{
                    color: 'var(--text-2)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    margin: '0 0 14px',
                }}
            >
                Choose how your shop appears on the Rollout map, then give us an
                address. We look up the coordinates for you automatically when you
                save — no need to find lat/lng yourself.
            </p>

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
                    />
                </div>
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.5, margin: '6px 0 4px' }}>
                {precision === 'area'
                    ? 'Area only: we pin the center of your CITY (if you leave city blank, we fall back to your region above) — your street address stays private.'
                    : precision === 'off'
                      ? 'Your shop is hidden from the public map and directory.'
                      : 'Exact: we pin your street address and show it on your map popup.'}
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

            <button
                type="submit"
                disabled={pending}
                className="admin-form-btn"
            >
                {pending ? 'SAVING…' : 'SAVE CHANGES'}
            </button>
        </form>
    );
}

const PRECISIONS: {
    value: 'exact' | 'area' | 'off';
    label: string;
    hint: string;
}[] = [
    { value: 'exact', label: 'Exact address', hint: 'Pin your street address — shown on your map popup.' },
    { value: 'area', label: 'Area only — city-level pin', hint: 'Online-based? Your CITY drives the pin (region used if blank); street stays private.' },
    { value: 'off', label: 'Not on the map', hint: 'Hide your shop from the public map + directory.' },
];

function PrecisionSelector({
    value,
    onChange,
}: {
    value: 'exact' | 'area' | 'off';
    onChange: (v: 'exact' | 'area' | 'off') => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '0 0 6px' }}>
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
