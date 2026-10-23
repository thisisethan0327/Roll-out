'use client';
/**
 * Structured new-ticket form (parity with emwraps-tickets TicketCreate):
 * customer typeahead / inline-create → vehicle pick / add + NHTSA decode →
 * catalog service line items with running total → scheduling + status +
 * priority → notes. Submits to the `createTicketStructured` server action which
 * find-or-creates the customer/vehicle and writes the ticket (source
 * 'dashboard') in the emwraps-compatible shape.
 */
import { useState, useTransition } from 'react';
import { CustomerPicker, EMPTY_CUSTOMER, type CustomerValue } from '../CustomerPicker';
import { VehiclePicker, EMPTY_VEHICLE, type VehicleValue } from '../VehiclePicker';
import { ServiceLinesEditor } from '../ServiceLinesEditor';
import { createTicketStructured } from '../actions';
import type { ServiceLine } from '@/lib/ticket-services';
import { Plus } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { Panel, shopStyles as sh } from '@/components/glide-shop/parts';

const STATUS_OPTIONS = [
    'quote',
    'estimate',
    'pending',
    'in-progress',
    'completed',
    'declined',
    'cancelled',
];
const PRIORITY_OPTIONS = ['normal', 'rush'];

export function NewTicketForm({ slug, canCreate }: { slug: string; canCreate: boolean }) {
    const [customer, setCustomer] = useState<CustomerValue>({ ...EMPTY_CUSTOMER });
    const [vehicle, setVehicle] = useState<VehicleValue>({ ...EMPTY_VEHICLE });
    const [services, setServices] = useState<ServiceLine[]>([]);
    const [serviceDay, setServiceDay] = useState('');
    const [endDate, setEndDate] = useState('');
    const [status, setStatus] = useState('pending');
    const [priority, setPriority] = useState('normal');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, start] = useTransition();

    const hasCustomer = !!customer.customerId || customer.name.trim().length > 0;
    const hasVehicle =
        !!vehicle.vehicleId || !!(vehicle.make.trim() || vehicle.model.trim() || vehicle.vin.trim());

    const submit = () => {
        setError(null);
        if (!hasCustomer) {
            setError('Select an existing customer or enter a customer name.');
            return;
        }
        start(async () => {
            try {
                await createTicketStructured(slug, {
                    customer,
                    vehicle: hasVehicle ? vehicle : null,
                    services,
                    serviceDay: serviceDay || null,
                    endDate: endDate || null,
                    status,
                    priority,
                    notes: notes || null,
                });
                // Success → the server action redirects to the new ticket.
            } catch (e: any) {
                setError(e?.message ?? 'Create failed.');
            }
        });
    };

    const disabled = !canCreate || pending;

    return (
        <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && (
                <div
                    style={{
                        padding: 12,
                        border: '1px solid var(--warn)',
                        color: 'var(--warn)',
                        fontSize: 12,
                    }}
                >
                    {error}
                </div>
            )}

            <FormSection title="Customer">
                <CustomerPicker slug={slug} value={customer} onChange={setCustomer} disabled={disabled} />
            </FormSection>

            <FormSection title="Vehicle">
                <VehiclePicker
                    slug={slug}
                    customerId={customer.customerId}
                    value={vehicle}
                    onChange={setVehicle}
                    disabled={disabled}
                />
            </FormSection>

            <FormSection title="Services">
                <ServiceLinesEditor slug={slug} lines={services} onChange={setServices} disabled={disabled} />
            </FormSection>

            <FormSection title="Scheduling">
                <div className={sh.grid2}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">Service day</span>
                        <input
                            type="date"
                            className="admin-form-input"
                            value={serviceDay}
                            disabled={disabled}
                            onChange={(e) => setServiceDay(e.target.value)}
                        />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">End date</span>
                        <input
                            type="date"
                            className="admin-form-input"
                            value={endDate}
                            disabled={disabled}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">Status</span>
                        <select
                            className="admin-form-input"
                            value={status}
                            disabled={disabled}
                            onChange={(e) => setStatus(e.target.value)}
                        >
                            {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                    {s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">Priority</span>
                        <select
                            className="admin-form-input"
                            value={priority}
                            disabled={disabled}
                            onChange={(e) => setPriority(e.target.value)}
                        >
                            {PRIORITY_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </FormSection>

            <FormSection title="Notes">
                <textarea
                    className="admin-form-input"
                    rows={4}
                    value={notes}
                    disabled={disabled}
                    placeholder="Anything else relevant…"
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ resize: 'vertical', width: '100%' }}
                />
            </FormSection>

            <div>
                <GlideButton onClick={submit} disabled={disabled} icon={<Plus size={20} strokeWidth={2} />}>
                    {pending ? 'Creating…' : 'Create ticket'}
                </GlideButton>
            </div>
        </div>
    );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return <Panel title={title}>{children}</Panel>;
}
