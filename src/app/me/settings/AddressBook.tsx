'use client';
import { useState, useTransition } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { CustomerAddress } from '@/lib/medusa-address';
import { deleteAddressAction, saveAddressAction } from './actions';
import { GlideButton } from '@/components/glide/primitives';
import { Empty } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import st from './settings.module.css';

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
        className: s.input,
    });
    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <div className={s.form}>
            {!connected ? (
                <Empty
                    icon={<MapPin size={22} strokeWidth={1.75} />}
                    title="Store account not connected"
                />
            ) : list.length === 0 && !draft ? (
                <p className={s.small}>No saved addresses yet.</p>
            ) : null}

            {list.length > 0 ? (
                <ul className={st.addrList}>
                    {list.map((a) => (
                        <li key={a.id} className={st.addr}>
                            <MapPin className={st.addrIc} size={22} strokeWidth={1.75} aria-hidden="true" />
                            <div className={st.addrT}>
                                <b>
                                    {a.firstName} {a.lastName}
                                    {a.isDefault ? (
                                        <span className="g-chip g-chip--tint" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                                            <Star size={13} strokeWidth={2} aria-hidden="true" />
                                            Default
                                        </span>
                                    ) : null}
                                </b>
                                <small>
                                    {a.address1}
                                    {a.address2 ? `, ${a.address2}` : ''} · {a.city}, {a.province} {a.postalCode} · {a.countryCode.toUpperCase()}
                                    {a.phone ? ` · ${a.phone}` : ''}
                                </small>
                            </div>
                            <div className={st.addrActs}>
                                {!a.isDefault ? (
                                    <button
                                        type="button"
                                        className="g-link"
                                        disabled={pending}
                                        onClick={() =>
                                            start(async () => {
                                                const res = await saveAddressAction({ ...a, isDefault: true });
                                                setMsg(res.ok ? { ok: true, text: 'Default updated.' } : { ok: false, text: res.error });
                                                if (res.ok) setList((l) => l.map((x) => ({ ...x, isDefault: x.id === a.id })));
                                            })
                                        }
                                    >
                                        Make default
                                    </button>
                                ) : null}
                                <button type="button" className="g-cb g-cb--fill" disabled={pending} onClick={() => setDraft({ ...a })} aria-label={`Edit address for ${a.firstName} ${a.lastName}`}>
                                    <Pencil size={17} strokeWidth={2} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    className={`g-cb g-cb--fill ${s.danger}`}
                                    disabled={pending}
                                    aria-label={`Delete address for ${a.firstName} ${a.lastName}`}
                                    onClick={() =>
                                        start(async () => {
                                            const res = await deleteAddressAction(a.id);
                                            setMsg(res.ok ? { ok: true, text: res.message ?? 'Removed.' } : { ok: false, text: res.error });
                                            if (res.ok) setList((l) => l.filter((x) => x.id !== a.id));
                                        })
                                    }
                                >
                                    <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}

            {draft ? (
                <form
                    className={`${s.form} ${st.addrForm}`}
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
                    <b className={st.slotLabel}>{draft.id ? 'Edit address' : 'New address'}</b>
                    <div className={s.grid2f}>
                        <input type="text" placeholder="First name" autoComplete="given-name" required {...f('firstName', 'First name')} />
                        <input type="text" placeholder="Last name" autoComplete="family-name" required {...f('lastName', 'Last name')} />
                    </div>
                    <input type="text" placeholder="Street address" autoComplete="address-line1" required {...f('address1', 'Street address')} />
                    <input type="text" placeholder="Apt, suite, unit" autoComplete="address-line2" {...f('address2', 'Apt, suite, unit')} />
                    <div className={s.grid3f}>
                        <input type="text" placeholder="City" autoComplete="address-level2" required {...f('city', 'City')} />
                        <select required {...f('province', 'State')}>
                            <option value="">State</option>
                            {US_STATES.map((x) => (
                                <option key={x} value={x}>
                                    {x}
                                </option>
                            ))}
                        </select>
                        <input type="text" placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" required {...f('postalCode', 'ZIP')} />
                    </div>
                    <div className={s.grid2f}>
                        <select {...f('countryCode', 'Country')}>
                            <option value="us">United States</option>
                            <option value="ca">Canada</option>
                        </select>
                        <input type="tel" placeholder="Phone" autoComplete="tel" {...f('phone', 'Phone')} />
                    </div>
                    <label className={s.check}>
                        <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft((d) => (d ? { ...d, isDefault: e.target.checked } : d))} />
                        Use as my default shipping address
                    </label>
                    <div className={s.actRow}>
                        <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending} icon={pending ? <LoaderCircle size={18} strokeWidth={2} className="g-spin" /> : undefined}>
                            {pending ? 'Saving…' : draft.id ? 'Save address' : 'Add address'}
                        </GlideButton>
                        <button type="button" className="g-sec g-sec--ink" onClick={() => setDraft(null)}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : connected ? (
                <div>
                    <button type="button" className="g-sec" onClick={() => setDraft({ ...EMPTY, isDefault: list.length === 0 })}>
                        <Plus {...ic} />
                        Add address
                    </button>
                </div>
            ) : null}
            {msg ? (
                <p className={`g-note ${s.msg}`} role="status">
                    {msg.ok ? <CircleCheck size={20} strokeWidth={2} aria-hidden="true" /> : <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />}
                    {msg.text}
                </p>
            ) : null}
        </div>
    );
}
