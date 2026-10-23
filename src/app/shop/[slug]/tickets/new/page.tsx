/**
 * /shop/[slug]/tickets/new — structured ticket creation (walk-ins + phone-ins).
 *
 * Parity with emwraps-tickets: customer typeahead / inline-create, vehicle
 * pick / add with NHTSA VIN decode, catalog service line items, scheduling,
 * status, priority, and notes. The heavy lifting lives in NewTicketForm (client)
 * and the createTicketStructured server action.
 */
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { NewTicketForm } from './NewTicketForm';
import { Lock } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { shopStyles as sh } from '@/components/glide-shop/parts';

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
        <div className={sh.stack} style={{ maxWidth: 900 }}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/tickets`, label: 'All tickets' }}
                title="New ticket"
                sub={`${shop.name} · manual entry for walk-ins and phone-ins`}
            />

            {!canCreate && (
                <div className={sh.note} role="note">
                    <Lock size={20} strokeWidth={2} aria-hidden="true" />
                    <span className={sh.noteText}>
                        Your role ({role}) can&apos;t create tickets
                        <small>Ask a manager to open the ticket.</small>
                    </span>
                </div>
            )}

            <NewTicketForm slug={slug} canCreate={canCreate} />
        </div>
    );
}
