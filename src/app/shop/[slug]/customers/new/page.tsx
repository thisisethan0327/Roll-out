/**
 * /shop/[slug]/customers/new — create a legacy (public.customers) customer,
 * optionally with a first vehicle (stamped with this shop_id so the customer
 * becomes visible to the shop immediately).
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createCustomer } from '../actions';

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
        <>
            <div className="admin-page-head">
                <div>
                    <Link
                        href={`/shop/${slug}/customers`}
                        className="text-link"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wider)',
                            textDecoration: 'none',
                        }}
                    >
                        ‹ ALL CUSTOMERS
                    </Link>
                    <div className="admin-page-title">NEW CUSTOMER</div>
                    <div className="admin-page-sub">CREATE A CONTACT + OPTIONAL FIRST VEHICLE</div>
                </div>
            </div>

            {!canCreate ? (
                <div className="admin-empty">MANAGER ROLE REQUIRED TO CREATE CUSTOMERS.</div>
            ) : (
                <form action={action} className="admin-form" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 'var(--track-widest)', color: 'var(--text-3)' }}>
                        CONTACT
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input name="first_name" placeholder="First name" className="admin-form-input" style={{ flex: 1, minWidth: 140 }} />
                        <input name="last_name" placeholder="Last name" className="admin-form-input" style={{ flex: 1, minWidth: 140 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input name="email" placeholder="Email" className="admin-form-input" style={{ flex: 1, minWidth: 160 }} />
                        <input name="phone" placeholder="Phone" className="admin-form-input" style={{ width: 160 }} />
                    </div>
                    <input name="company" placeholder="Company (optional)" className="admin-form-input" />
                    <textarea name="notes" placeholder="Notes (optional)" rows={2} className="admin-form-input" style={{ resize: 'vertical' }} />

                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 'var(--track-widest)', color: 'var(--text-3)', marginTop: 8 }}>
                        FIRST VEHICLE (OPTIONAL)
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input name="year" placeholder="Year" className="admin-form-input" style={{ width: 80 }} />
                        <input name="make" placeholder="Make" className="admin-form-input" style={{ flex: 1, minWidth: 100 }} />
                        <input name="model" placeholder="Model" className="admin-form-input" style={{ flex: 1, minWidth: 100 }} />
                        <input name="trim" placeholder="Trim" className="admin-form-input" style={{ width: 110 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input name="color" placeholder="Color" className="admin-form-input" style={{ width: 120 }} />
                        <input name="vin" placeholder="VIN" className="admin-form-input" style={{ flex: 1, minWidth: 140 }} />
                        <input name="license_plate" placeholder="Plate" className="admin-form-input" style={{ width: 110 }} />
                    </div>

                    <div>
                        <button type="submit" className="admin-action-btn">
                            CREATE CUSTOMER ›
                        </button>
                    </div>
                </form>
            )}
        </>
    );
}
