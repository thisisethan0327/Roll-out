'use client';

import { useActionState } from 'react';
import { submitShopApplication } from './actions';
import { APPLY_INITIAL, SHOP_CATEGORIES } from './types';

export function ApplyForm({ withCommerce }: { withCommerce: boolean }) {
    const [state, action, pending] = useActionState(submitShopApplication, APPLY_INITIAL);

    return (
        <form action={action} className="apply-form" style={{ display: 'grid', gap: 22 }}>
            {withCommerce ? <input type="hidden" name="with_commerce" value="1" /> : null}

            {state.error ? (
                <div
                    role="alert"
                    style={{
                        border: '1px solid var(--danger, #d33)',
                        color: 'var(--danger, #d33)',
                        background: 'color-mix(in srgb, var(--danger, #d33) 8%, transparent)',
                        padding: '12px 14px',
                        fontSize: 13,
                    }}
                >
                    {state.error}
                </div>
            ) : null}

            {/* ── SHOP BASICS ── */}
            <div style={{ display: 'grid', gap: 14 }}>
                <SectionHeading>SHOP BASICS</SectionHeading>

                <Field label="SHOP NAME *">
                    <input className="admin-form-input" name="name" required maxLength={60} placeholder="Apex Auto Styling" />
                </Field>

                <Field label="URL HANDLE *" hint="rollout.club/u/your-handle">
                    <input className="admin-form-input" name="slug" required placeholder="apex-auto" pattern="[a-z0-9][a-z0-9\-]{2,29}" />
                </Field>

                <Field label="CATEGORY *">
                    <select className="admin-form-input" name="category" required defaultValue="">
                        <option value="" disabled>Select…</option>
                        {SHOP_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </Field>

                <Field label="DESCRIPTION">
                    <textarea className="admin-form-input" name="description" rows={4} maxLength={600} placeholder="What you do, brands you run, what makes you you." style={{ resize: 'vertical' }} />
                </Field>
            </div>

            {/* ── LOCATION & CONTACT ── */}
            <div style={{ display: 'grid', gap: 14 }}>
                <SectionHeading>LOCATION &amp; CONTACT</SectionHeading>

                <Field label="ADDRESS">
                    <input className="admin-form-input" name="address_line" placeholder="123 Main St" />
                </Field>

                <div className="apply-row apply-row-3">
                    <Field label="CITY"><input className="admin-form-input" name="city" placeholder="Your City" /></Field>
                    <Field label="STATE"><input className="admin-form-input" name="state_region" placeholder="CA" /></Field>
                    <Field label="ZIP"><input className="admin-form-input" name="postal" placeholder="90210" /></Field>
                </div>

                <Field label="REGION">
                    <input className="admin-form-input" name="region" placeholder="SoCal" />
                </Field>

                <div className="apply-row apply-row-2">
                    <Field label="PHONE"><input className="admin-form-input" name="contact_phone" type="tel" placeholder="(555) 555-0100" /></Field>
                    <Field label="SUPPORT EMAIL"><input className="admin-form-input" name="support_email" type="email" placeholder="hello@yourshop.com" /></Field>
                </div>

                <Field label="WEBSITE">
                    <input className="admin-form-input" name="website_url" type="url" placeholder="https://yourshop.com" />
                </Field>

                <div className="apply-row apply-row-2">
                    <Field label="INSTAGRAM"><input className="admin-form-input" name="social_instagram" placeholder="@yourshop" /></Field>
                    <Field label="TIKTOK"><input className="admin-form-input" name="social_tiktok" placeholder="@yourshop" /></Field>
                </div>
            </div>

            {/* ── SELL ON NEFERSTOCK (bordered card) ── */}
            {withCommerce ? (
                <div
                    style={{
                        border: '1px solid var(--gold)',
                        background: 'var(--bg-1)',
                        padding: 20,
                        display: 'grid',
                        gap: 14,
                    }}
                >
                    <SectionHeading noRule>SELL ON NEFERSTOCK</SectionHeading>
                    <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                        To sell products you’ll complete a short KYC. Enter your UBI now; we’ll request
                        your business license and reseller certificate after you submit.
                    </p>
                    <Field label="LEGAL BUSINESS NAME">
                        <input className="admin-form-input" name="legal_name" placeholder="Apex Auto Styling LLC" />
                    </Field>
                    <Field label="UBI (9 DIGITS)">
                        <input className="admin-form-input" name="ubi" inputMode="numeric" pattern="\d{9}" placeholder="601123456" />
                    </Field>
                    <div style={{ border: '1px dashed var(--line)', padding: '10px 12px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                        Payouts setup (Stripe) — <b style={{ color: 'var(--text)' }}>coming soon</b>. You can be approved to sell
                        on interim settlement before payouts are connected.
                    </div>
                </div>
            ) : null}

            <div>
                <button type="submit" className="admin-form-btn" disabled={pending} style={{ justifySelf: 'start' }}>
                    {pending ? 'SUBMITTING…' : 'SUBMIT APPLICATION ›'}
                </button>
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                You’ll become the owner immediately. Your shop stays hidden until a Rollout admin verifies it.
            </p>

            <style>{`
                .apply-form .admin-form-input { width: 100%; box-sizing: border-box; }
                .apply-form select.admin-form-input { appearance: none; -webkit-appearance: none; cursor: pointer; }
                .apply-row { display: grid; gap: 12px; }
                .apply-row-2 { grid-template-columns: 1fr 1fr; }
                .apply-row-3 { grid-template-columns: 2fr 1fr 1fr; }
                @media (max-width: 560px) {
                    .apply-row-2, .apply-row-3 { grid-template-columns: 1fr; }
                }
            `}</style>
        </form>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="admin-form-label" style={{ textTransform: 'uppercase' }}>
                {label}
                {hint ? <span style={{ color: 'var(--text-3)', textTransform: 'none', marginLeft: 6 }}>· {hint}</span> : null}
            </span>
            {children}
        </label>
    );
}

function SectionHeading({ children, noRule = false }: { children: React.ReactNode; noRule?: boolean }) {
    return (
        <div
            style={{
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                letterSpacing: 'var(--track-wider)',
                color: 'var(--gold)',
                borderTop: noRule ? 'none' : '1px solid var(--rule, var(--line))',
                paddingTop: noRule ? 0 : 12,
            }}
        >
            ／ {children}
        </div>
    );
}
