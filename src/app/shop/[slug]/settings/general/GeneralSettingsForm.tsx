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
    const [lat, setLat] = useState(row?.lat != null ? String(row.lat) : '');
    const [lng, setLng] = useState(row?.lng != null ? String(row.lng) : '');
    const [showOnMap, setShowOnMap] = useState(row?.show_on_map ?? true);

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
        fd.set('lat', lat);
        fd.set('lng', lng);
        if (showOnMap) fd.set('show_on_map', 'on');
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
                Your address + coordinates put your shop on the Rollout map so
                drivers can find you. Look up your exact lat/lng on Google Maps
                (right-click your shop → the first numbers), or leave blank to
                stay off the map.
            </p>

            <div className="admin-form-label">STREET ADDRESS</div>
            <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="admin-form-input"
                placeholder="1900 Airport Way S #103"
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
                    />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">LATITUDE</div>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        className="admin-form-input"
                        placeholder="47.5783"
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <div className="admin-form-label">LONGITUDE</div>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        className="admin-form-input"
                        placeholder="-122.3340"
                    />
                </div>
            </div>

            <label
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    margin: '4px 0 16px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    letterSpacing: 'var(--track-wide)',
                    color: 'var(--text)',
                }}
            >
                <input
                    type="checkbox"
                    checked={showOnMap}
                    onChange={(e) => setShowOnMap(e.target.checked)}
                />
                SHOW THIS SHOP ON THE PUBLIC MAP
            </label>

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
