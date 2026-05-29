/**
 * /shop/[slug]/tickets/new — manual ticket creation for walk-ins.
 *
 * Single form submitted directly to the `createTicket` server action which
 * generates the next T-#### id for the shop and redirects to the detail page.
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createTicket } from '../actions';

export const metadata = { title: 'New Ticket' };

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export default async function NewTicketPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    const canCreate = MANAGER_ROLES.has(role);

    const action = createTicket.bind(null, slug);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <Link
                        href={`/shop/${slug}/tickets`}
                        className="text-link"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wider)',
                            textDecoration: 'none',
                        }}
                    >
                        ‹ ALL TICKETS
                    </Link>
                    <div className="admin-page-title">NEW TICKET</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · MANUAL ENTRY
                    </div>
                </div>
            </div>

            {!canCreate && (
                <div
                    style={{
                        marginBottom: 16,
                        padding: 14,
                        border: '1px solid var(--warn)',
                        color: 'var(--warn)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    YOUR ROLE ({role.toUpperCase()}) CAN&apos;T CREATE TICKETS. ASK A MANAGER.
                </div>
            )}

            <form action={action} className="admin-form" style={{ maxWidth: 640 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="admin-form-label">CUSTOMER NAME *</label>
                    <input
                        name="customer_name"
                        required
                        disabled={!canCreate}
                        className="admin-form-input"
                        placeholder="JANE DOE"
                    />
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="admin-form-label">EMAIL</label>
                        <input
                            type="email"
                            name="email"
                            disabled={!canCreate}
                            className="admin-form-input"
                            placeholder="jane@example.com"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="admin-form-label">PHONE</label>
                        <input
                            name="phone"
                            disabled={!canCreate}
                            className="admin-form-input"
                            placeholder="(206) 555-0123"
                        />
                    </div>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '100px 1fr 1fr',
                        gap: 12,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="admin-form-label">YEAR</label>
                        <input
                            name="car_year"
                            type="number"
                            min="1900"
                            max="2100"
                            disabled={!canCreate}
                            className="admin-form-input"
                            placeholder="2024"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="admin-form-label">MAKE</label>
                        <input
                            name="car_make"
                            disabled={!canCreate}
                            className="admin-form-input"
                            placeholder="TESLA"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="admin-form-label">MODEL</label>
                        <input
                            name="car_model"
                            disabled={!canCreate}
                            className="admin-form-input"
                            placeholder="MODEL 3"
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="admin-form-label">SERVICES (FREE-FORM)</label>
                    <textarea
                        name="services_text"
                        rows={3}
                        disabled={!canCreate}
                        className="admin-form-input"
                        placeholder="Full vinyl wrap — satin black. PPF front bumper."
                        style={{ resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="admin-form-label">PRIORITY</label>
                    <select
                        name="priority"
                        defaultValue="normal"
                        disabled={!canCreate}
                        className="admin-form-input"
                    >
                        <option value="normal">NORMAL</option>
                        <option value="high">HIGH</option>
                        <option value="urgent">URGENT</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="admin-form-label">NOTES</label>
                    <textarea
                        name="notes"
                        rows={4}
                        disabled={!canCreate}
                        className="admin-form-input"
                        placeholder="Anything else relevant…"
                        style={{ resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="submit"
                        disabled={!canCreate}
                        className="admin-form-btn"
                    >
                        CREATE TICKET ›
                    </button>
                    <Link
                        href={`/shop/${slug}/tickets`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        CANCEL
                    </Link>
                </div>
            </form>
        </>
    );
}
