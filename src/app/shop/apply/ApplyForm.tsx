'use client';

import { useActionState } from 'react';
import { submitShopApplication } from './actions';
import { APPLY_INITIAL, SHOP_CATEGORIES } from './types';

export function ApplyForm({ withCommerce }: { withCommerce: boolean }) {
    const [state, action, pending] = useActionState(submitShopApplication, APPLY_INITIAL);

    return (
        <form action={action} className="apply-form" style={{ display: 'grid', gap: 18 }}>
            {withCommerce ? <input type="hidden" name="with_commerce" value="1" /> : null}

            {state.error ? (
                <div className="admin-empty" role="alert" style={{ borderColor: 'var(--danger, #d33)', color: 'var(--danger, #d33)' }}>
                    {state.error}
                </div>
            ) : null}

            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
                <legend className="eyebrow eyebrow-gold" style={{ marginBottom: 6 }}>／ SHOP BASICS</legend>

                <label className="field">
                    <span>Shop name *</span>
                    <input name="name" required maxLength={60} placeholder="EMWRAPS" />
                </label>

                <label className="field">
                    <span>URL handle * — rollout.club/u/<b>your-handle</b></span>
                    <input name="slug" required placeholder="emwraps" pattern="[a-z0-9][a-z0-9\-]{2,29}" />
                </label>

                <label className="field">
                    <span>Category *</span>
                    <select name="category" required defaultValue="">
                        <option value="" disabled>Select…</option>
                        {SHOP_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </label>

                <label className="field">
                    <span>Description</span>
                    <textarea name="description" rows={3} maxLength={600} placeholder="What you do, brands you run, what makes you you." />
                </label>
            </fieldset>

            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
                <legend className="eyebrow" style={{ marginBottom: 6 }}>／ LOCATION & CONTACT</legend>
                <label className="field"><span>Address</span><input name="address_line" placeholder="1900 Airport Way S #103" /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <label className="field"><span>City</span><input name="city" placeholder="Seattle" /></label>
                    <label className="field"><span>State</span><input name="state_region" placeholder="WA" /></label>
                    <label className="field"><span>ZIP</span><input name="postal" placeholder="98134" /></label>
                </div>
                <label className="field"><span>Region</span><input name="region" placeholder="PNW" /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="field"><span>Phone</span><input name="contact_phone" type="tel" placeholder="(206) 555-0000" /></label>
                    <label className="field"><span>Support email</span><input name="support_email" type="email" placeholder="hello@yourshop.com" /></label>
                </div>
                <label className="field"><span>Website</span><input name="website_url" type="url" placeholder="https://yourshop.com" /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="field"><span>Instagram</span><input name="social_instagram" placeholder="@yourshop" /></label>
                    <label className="field"><span>TikTok</span><input name="social_tiktok" placeholder="@yourshop" /></label>
                </div>
            </fieldset>

            {withCommerce ? (
                <fieldset style={{ border: '1px solid var(--line)', padding: 16, margin: 0, display: 'grid', gap: 14, borderRadius: 8 }}>
                    <legend className="eyebrow eyebrow-gold" style={{ padding: '0 8px' }}>／ SELL ON NEFERSTOCK</legend>
                    <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>
                        To sell products you’ll complete a short KYC. Enter your UBI now; we’ll request
                        your business license and reseller certificate after you submit.
                    </p>
                    <label className="field"><span>Legal business name</span><input name="legal_name" placeholder="Unity USA LLC" /></label>
                    <label className="field"><span>UBI (9 digits)</span><input name="ubi" inputMode="numeric" pattern="\d{9}" placeholder="123456789" /></label>
                    <div className="admin-empty" style={{ fontSize: 12 }}>
                        Payouts setup (Stripe) — <b>coming soon</b>. You can be approved to sell on interim
                        settlement before payouts are connected.
                    </div>
                </fieldset>
            ) : null}

            <button type="submit" className="btn" disabled={pending} style={{ justifySelf: 'start' }}>
                {pending ? 'Submitting…' : 'Submit application'}
            </button>
            <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0 }}>
                You’ll become the owner immediately. Your shop stays hidden until a Rollout admin verifies it.
            </p>
        </form>
    );
}
