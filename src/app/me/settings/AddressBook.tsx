'use client';
import { useState, useTransition } from 'react';
import type { CustomerAddress } from '@/lib/medusa-address';
import { deleteAddressAction, saveAddressAction } from './actions';
import { PendingButton } from '@/components/feedback';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
type Draft = Omit<CustomerAddress, 'id' | 'isDefault'> & { id: string | null; isDefault: boolean };
const EMPTY: Draft = { id: null, isDefault: true, firstName: '', lastName: '', address1: '', address2: '', city: '', province: '', postalCode: '', countryCode: 'us', phone: '' };

export function AddressBook({ initial, connected }: { initial: CustomerAddress[]; connected: boolean }) {
    const [list, setList] = useState(initial);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, start] = useTransition();
    const f = (k: keyof Draft, label: string) => ({
        'aria-label': label,
        value: String(draft?.[k] ?? ''),
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d)),
        className: 'admin-form-input',
    });

    return (
        <div>
            {!connected ? (
                <div className="admin-empty" style={{ marginBottom: 12 }}>STORE ACCOUNT NOT CONNECTED — ADD AN ADDRESS AT CHECKOUT</div>
            ) : null}
            {list.map((a) => (
                <div key={a.id} className="feature-card corner-wrap" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="corner-bottom-left" />
                    <span className="corner-bottom-right" />
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 600 }}>
                            {a.firstName} {a.lastName}
                            {a.isDefault ? <span className="accent" style={{ marginLeft: 8, fontSize: 10, letterSpacing: 'var(--track-wider)', fontFamily: 'var(--font-display)' }}>DEFAULT</span> : null}
                        </div>
                        <div style={{ color: 'var(--text-2)' }}>
                            {a.address1}
                            {a.address2 ? `, ${a.address2}` : ''} · {a.city}, {a.province} {a.postalCode} · {a.countryCode.toUpperCase()}
                            {a.phone ? ` · ${a.phone}` : ''}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!a.isDefault ? (
                            <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => start(async () => { const res = await saveAddressAction({ ...a, isDefault: true }); setMsg(res.ok ? { ok: true, text: 'Default updated.' } : { ok: false, text: res.error }); if (res.ok) setList((l) => l.map((x) => ({ ...x, isDefault: x.id === a.id }))); })}>
                                MAKE DEFAULT
                            </button>
                        ) : null}
                        <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => setDraft({ ...a })}>EDIT</button>
                        <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => start(async () => { const res = await deleteAddressAction(a.id); setMsg(res.ok ? { ok: true, text: res.message ?? 'Removed.' } : { ok: false, text: res.error }); if (res.ok) setList((l) => l.filter((x) => x.id !== a.id)); })}>
                            DELETE
                        </button>
                    </div>
                </div>
            ))}
            {draft ? (
                <form
                    className="admin-form"
                    style={{ marginTop: 12 }}
                    onSubmit={(e) => {
                        e.preventDefault();
                        start(async () => {
                            setMsg(null);
                            const res = await saveAddressAction(draft);
                            setMsg(res.ok ? { ok: true, text: res.message ?? 'Saved.' } : { ok: false, text: res.error });
                            if (res.ok) {
                                setDraft(null);
                                // Re-read from the server on the next render (revalidated); update locally meanwhile.
                                setList((l) => {
                                    const next = draft.id ? l.map((x) => (x.id === draft.id ? { ...x, ...draft, id: x.id } : x)) : [...l, { ...draft, id: `tmp-${Date.now()}` }];
                                    return draft.isDefault ? next.map((x) => ({ ...x, isDefault: x.id === (draft.id ?? next[next.length - 1].id) })) : next;
                                });
                            }
                        });
                    }}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        <input type="text" placeholder="First name" autoComplete="given-name" required {...f('firstName', 'First name')} />
                        <input type="text" placeholder="Last name" autoComplete="family-name" required {...f('lastName', 'Last name')} />
                    </div>
                    <input type="text" placeholder="Street address" autoComplete="address-line1" required style={{ marginTop: 10, width: '100%' }} {...f('address1', 'Street address')} />
                    <input type="text" placeholder="Apt, suite, unit (optional)" autoComplete="address-line2" style={{ marginTop: 10, width: '100%' }} {...f('address2', 'Apt, suite, unit')} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 10 }}>
                        <input type="text" placeholder="City" autoComplete="address-level2" required {...f('city', 'City')} />
                        <select required {...f('province', 'State')}>
                            <option value="">State</option>
                            {US_STATES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <input type="text" placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" required {...f('postalCode', 'ZIP')} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
                        <select {...f('countryCode', 'Country')}>
                            <option value="us">United States</option>
                            <option value="ca">Canada</option>
                        </select>
                        <input type="tel" placeholder="Phone (optional)" autoComplete="tel" {...f('phone', 'Phone')} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12 }}>
                        <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft((d) => (d ? { ...d, isDefault: e.target.checked } : d))} />
                        Use as my default shipping address
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                        <PendingButton type="submit" pending={pending} pendingLabel="SAVING" className="admin-login-btn">
                            {draft.id ? 'SAVE ADDRESS ›' : 'ADD ADDRESS ›'}
                        </PendingButton>
                        <button type="button" className="admin-action-btn muted" onClick={() => setDraft(null)}>CANCEL</button>
                    </div>
                </form>
            ) : connected ? (
                <button type="button" className="admin-action-btn" style={{ marginTop: 4 }} onClick={() => setDraft({ ...EMPTY, isDefault: list.length === 0 })}>
                    + ADD ADDRESS
                </button>
            ) : null}
            {msg ? (
                <div className="admin-login-error" role="status" style={{ marginTop: 12, ...(msg.ok ? { borderColor: 'var(--gold)', background: 'rgba(255,183,51,0.08)', color: 'var(--text)' } : {}) }}>
                    {msg.text}
                </div>
            ) : null}
        </div>
    );
}
