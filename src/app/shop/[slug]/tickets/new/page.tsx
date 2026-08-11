/**
 * /shop/[slug]/tickets/new — structured ticket creation (walk-ins + phone-ins).
 *
 * Parity with emwraps-tickets: customer typeahead / inline-create, vehicle
 * pick / add with NHTSA VIN decode, catalog service line items, scheduling,
 * status, priority, and notes. The heavy lifting lives in NewTicketForm (client)
 * and the createTicketStructured server action.
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { NewTicketForm } from './NewTicketForm';

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
                    <div className="admin-page-sub">{shop.name.toUpperCase()} · MANUAL ENTRY</div>
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

            <NewTicketForm slug={slug} canCreate={canCreate} />
        </>
    );
}
