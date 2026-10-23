/**
 * /shop/[slug]/customers/new — create a legacy (public.customers) customer,
 * optionally with a first vehicle (stamped with this shop_id so the customer
 * becomes visible to the shop immediately).
 */
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createCustomer } from '../actions';
import { Lock, UserPlus } from 'lucide-react';
import { ConsoleHead, Field } from '@/components/glide-console/parts';
import { GlideButton } from '@/components/glide/primitives';
import { Panel, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'New Customer' };

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export default async function NewCustomerPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { role } = await requireShopMemberBySlug(slug);
    const canCreate = MANAGER_ROLES.has(role);
    const action = createCustomer.bind(null, slug);

    return (
        <div className={sh.stack} style={{ maxWidth: 820 }}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/customers`, label: 'All customers' }}
                title="New customer"
                sub="A contact, and their first vehicle if you have it"
            />

            {!canCreate ? (
                <div className={sh.note} role="note">
                    <Lock size={20} strokeWidth={2} aria-hidden="true" />
                    <span className={sh.noteText}>
                        Manager role required
                        <small>Ask a manager or the owner to add customers.</small>
                    </span>
                </div>
            ) : (
                <form action={action} className={sh.stack}>
                    <Panel id="nc-contact" title="Contact">
                        <div className={sh.grid2}>
                            <Field label="First name" htmlFor="nc-first_name">
                                <input id="nc-first_name" name="first_name" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Last name" htmlFor="nc-last_name">
                                <input id="nc-last_name" name="last_name" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Email" htmlFor="nc-email">
                                <input id="nc-email" name="email" type="text" inputMode="email" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Phone" htmlFor="nc-phone">
                                <input id="nc-phone" name="phone" type="text" inputMode="tel" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Company" htmlFor="nc-company" className={sh.full}>
                                <input id="nc-company" name="company" type="text" placeholder="Optional" className={sh.field} />
                            </Field>
                                <Field label="Notes" htmlFor="nc-notes" className={sh.full}>
                                <textarea id="nc-notes" name="notes" placeholder="Optional" rows={3} className={sh.field} />
                                </Field>
                        </div>
                    </Panel>
                    <Panel id="nc-vehicle" title="First vehicle" sub="Optional">
                        <div className={sh.grid2}>
                            <Field label="Year" htmlFor="nc-year">
                                <input id="nc-year" name="year" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Make" htmlFor="nc-make">
                                <input id="nc-make" name="make" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Model" htmlFor="nc-model">
                                <input id="nc-model" name="model" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Trim" htmlFor="nc-trim">
                                <input id="nc-trim" name="trim" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Color" htmlFor="nc-color">
                                <input id="nc-color" name="color" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="Plate" htmlFor="nc-license_plate">
                                <input id="nc-license_plate" name="license_plate" type="text" placeholder="" className={sh.field} />
                            </Field>
                            <Field label="VIN" htmlFor="nc-vin" className={sh.full}>
                                <input id="nc-vin" name="vin" type="text" placeholder="" className={sh.field} />
                            </Field>
                        </div>
                    </Panel>
                    <div>
                        <GlideButton type="submit" icon={<UserPlus size={20} strokeWidth={2} />}>
                            Create customer
                        </GlideButton>
                    </div>
                </form>
            )}
        </div>
    );
}
