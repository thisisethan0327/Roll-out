'use client';

import { useActionState } from 'react';
import { ArrowRight, ChevronDown, CircleAlert, Info, LoaderCircle } from 'lucide-react';
import { submitShopApplication } from './actions';
import { APPLY_INITIAL, SHOP_CATEGORIES } from './types';
import { Card } from '@/components/glide/primitives';

export function ApplyForm({ withCommerce }: { withCommerce: boolean }) {
    const [state, action, pending] = useActionState(submitShopApplication, APPLY_INITIAL);

    return (
        <Card as="section" className="ga-apply-form" aria-label="Shop application">
            <form action={action} className="ga-form">
                {withCommerce ? <input type="hidden" name="with_commerce" value="1" /> : null}

                {state.error ? (
                    <div className="ga-note" style={{ margin: '18px 20px 0' }}>
                        <p className="g-note" role="alert">
                            <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
                            <span>{state.error}</span>
                        </p>
                    </div>
                ) : null}

                {/* ── Shop basics ── */}
                <div className="ga-section">
                    <h2>Shop basics</h2>

                    <Field id="ap-name" label="Shop name" required>
                        <input id="ap-name" className="ga-in" name="name" required maxLength={60} placeholder="Apex Auto Styling" />
                    </Field>

                    <Field id="ap-slug" label="URL handle" required hint="rollout.club/u/your-handle">
                        <input
                            id="ap-slug"
                            className="ga-in"
                            name="slug"
                            required
                            placeholder="apex-auto"
                            pattern="[a-z0-9][a-z0-9\-]{2,29}"
                            autoCapitalize="none"
                            spellCheck={false}
                        />
                    </Field>

                    <Field id="ap-category" label="Category" required>
                        <span className="ga-sel">
                            <select id="ap-category" className="ga-in" name="category" required defaultValue="">
                                <option value="" disabled>
                                    Select…
                                </option>
                                {SHOP_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                        </span>
                    </Field>

                    <Field id="ap-description" label="Description">
                        <textarea
                            id="ap-description"
                            className="ga-in"
                            name="description"
                            rows={4}
                            maxLength={600}
                            placeholder="What you do, brands you run, what makes you you."
                        />
                    </Field>
                </div>

                {/* ── Location & contact ── */}
                <div className="ga-section">
                    <h2>Location &amp; contact</h2>

                    <Field id="ap-address" label="Address">
                        <input id="ap-address" className="ga-in" name="address_line" placeholder="123 Main St" autoComplete="street-address" />
                    </Field>

                    <div className="ga-grid ga-grid-3">
                        <Field id="ap-city" label="City">
                            <input id="ap-city" className="ga-in" name="city" placeholder="Seattle" autoComplete="address-level2" />
                        </Field>
                        <Field id="ap-state" label="State">
                            <input id="ap-state" className="ga-in" name="state_region" placeholder="CA" autoComplete="address-level1" />
                        </Field>
                        <Field id="ap-zip" label="ZIP">
                            <input id="ap-zip" className="ga-in" name="postal" placeholder="90210" autoComplete="postal-code" />
                        </Field>
                    </div>

                    <Field id="ap-region" label="Region">
                        <input id="ap-region" className="ga-in" name="region" placeholder="SoCal" />
                    </Field>

                    <div className="ga-grid ga-grid-2">
                        <Field id="ap-phone" label="Phone">
                            <input id="ap-phone" className="ga-in" name="contact_phone" type="tel" placeholder="(555) 555-0100" autoComplete="tel" />
                        </Field>
                        <Field id="ap-support" label="Support email">
                            <input id="ap-support" className="ga-in" name="support_email" type="email" placeholder="hello@yourshop.com" />
                        </Field>
                    </div>

                    <Field id="ap-web" label="Website">
                        <input id="ap-web" className="ga-in" name="website_url" type="url" placeholder="https://yourshop.com" autoComplete="url" />
                    </Field>

                    <div className="ga-grid ga-grid-2">
                        <Field id="ap-ig" label="Instagram">
                            <input id="ap-ig" className="ga-in" name="social_instagram" placeholder="@yourshop" />
                        </Field>
                        <Field id="ap-tt" label="TikTok">
                            <input id="ap-tt" className="ga-in" name="social_tiktok" placeholder="@yourshop" />
                        </Field>
                    </div>
                </div>

                {/* ── Sell on NeferStock ── */}
                {withCommerce ? (
                    <div className="ga-sell">
                        <div className="ga-section" style={{ margin: 0, padding: 0, border: 0 }}>
                            <h2>Sell on NeferStock</h2>
                            <p>
                                To sell products you’ll complete a short KYC. Enter your UBI now; we’ll request your business license and
                                reseller certificate after you submit.
                            </p>
                        </div>
                        <Field id="ap-legal" label="Legal business name">
                            <input id="ap-legal" className="ga-in" name="legal_name" placeholder="Apex Auto Styling LLC" />
                        </Field>
                        <Field id="ap-ubi" label="UBI (9 digits)">
                            <input id="ap-ubi" className="ga-in" name="ubi" inputMode="numeric" pattern="\d{9}" placeholder="601123456" />
                        </Field>
                        <p className="ga-msg is-quiet" style={{ marginTop: 14 }}>
                            <Info size={18} strokeWidth={2} aria-hidden="true" />
                            <span>
                                You can be approved to sell before Stripe payouts are connected.
                            </span>
                        </p>
                    </div>
                ) : null}

                <div className="ga-apply-submit">
                    <button type="submit" className="g-btn g-btn--block" disabled={pending} aria-busy={pending}>
                        <span>{pending ? 'Submitting' : 'Submit application'}</span>
                        <span className="g-btn-k" aria-hidden="true">
                            {pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <ArrowRight size={20} strokeWidth={2} />}
                        </span>
                    </button>
                    <p>You’ll become the owner immediately. Your shop stays hidden until a Rollout admin verifies it.</p>
                </div>
            </form>
        </Card>
    );
}

function Field({
    id,
    label,
    hint,
    required,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="ga-label" htmlFor={id}>
                {label}
                {required ? <span aria-hidden="true"> *</span> : null}
                {hint ? <small> · {hint}</small> : null}
            </label>
            {children}
        </div>
    );
}
