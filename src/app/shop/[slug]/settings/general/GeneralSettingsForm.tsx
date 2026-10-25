'use client';
import { useState, useTransition } from 'react';
import { updateShopGeneral } from './actions';
import { MapPin } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { InfoTip } from '@/components/glide/InfoTip';
import { Field, FormSection } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

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

    const inp = cx(cs.input, bz.in);
    const off = precision === 'off';

    return (
        <form onSubmit={submit} className={cs.col}>
            <FormSection id="gen-shop" title="Shop" edge>
                <div className={cs.grid2f}>
                    <Field label="Shop name" htmlFor="gen-name">
                        <input id="gen-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="EMWRAPS" />
                    </Field>
                    <Field label="Region" htmlFor="gen-region">
                        <input id="gen-region" type="text" value={region} onChange={(e) => setRegion(e.target.value)} className={inp} placeholder="PNW" />
                    </Field>
                </div>
                <div className={cs.grid2f}>
                    <Field label="Primary color" htmlFor="gen-primary">
                        <div className={bz.swatchRow}>
                            <input id="gen-primary" type="text" value={primary} onChange={(e) => setPrimary(e.target.value)} className={inp} placeholder="#1F5F94" />
                            <span className={bz.swatch} aria-hidden="true">
                                <i style={{ background: primary || 'transparent' }} />
                            </span>
                        </div>
                    </Field>
                    <Field label="Secondary color" htmlFor="gen-secondary">
                        <div className={bz.swatchRow}>
                            <input id="gen-secondary" type="text" value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inp} placeholder="#1a1a1a" />
                            <span className={bz.swatch} aria-hidden="true">
                                <i style={{ background: secondary || 'transparent' }} />
                            </span>
                        </div>
                    </Field>
                </div>
            </FormSection>

            <FormSection
                id="gen-map"
                title={
                    <>
                        Location and map{' '}
                        <InfoTip
                            label="About the map listing"
                            text="Pick how the shop shows on the Rollout map, then add the address. The coordinates are looked up when you save."
                        />
                    </>
                }
            >
                <PrecisionSelector value={precision} onChange={setPrecision} />

                <Field label="Street address" htmlFor="gen-street">
                    <input id="gen-street" type="text" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={inp} placeholder="1900 Airport Way S #103" disabled={off} />
                </Field>
                <div className={cs.grid3f}>
                    <Field label="City" htmlFor="gen-city">
                        <input id="gen-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inp} placeholder="Seattle" disabled={off} />
                    </Field>
                    <Field label="State" htmlFor="gen-state">
                        <input id="gen-state" type="text" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} className={inp} placeholder="WA" disabled={off} />
                    </Field>
                    <Field label="ZIP" htmlFor="gen-zip">
                        <input id="gen-zip" type="text" value={postal} onChange={(e) => setPostal(e.target.value)} className={inp} placeholder="98134" disabled={off} />
                    </Field>
                </div>
                <p className={cs.hint} aria-live="polite">
                    <MapPin size={15} strokeWidth={2} aria-hidden="true" />
                    {precision === 'area'
                        ? 'Area only: we pin the center of your CITY (if you leave city blank, we fall back to your region above) — your street address stays private.'
                        : precision === 'off'
                          ? 'Your shop is hidden from the public map and directory.'
                          : 'Exact: we pin your street address and show it on your map popup.'}
                </p>
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
        <fieldset className={bz.choices}>
            <legend>Map presence</legend>
            {PRECISIONS.map((p) => (
                <label key={p.value} className={bz.choice}>
                    <input
                        type="radio"
                        name="location_precision"
                        value={p.value}
                        checked={value === p.value}
                        onChange={() => onChange(p.value)}
                    />
                    <span style={{ minWidth: 0 }}>
                        <b>{p.label}</b>
                        <small>{p.hint}</small>
                    </span>
                </label>
            ))}
        </fieldset>
    );
}
