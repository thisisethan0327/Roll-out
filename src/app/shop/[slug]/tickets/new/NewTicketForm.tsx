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

            <FormSection title="CUSTOMER">
                <CustomerPicker slug={slug} value={customer} onChange={setCustomer} disabled={disabled} />
            </FormSection>

            <FormSection title="VEHICLE">
                <VehiclePicker
                    slug={slug}
                    customerId={customer.customerId}
                    value={vehicle}
                    onChange={setVehicle}
                    disabled={disabled}
                />
            </FormSection>

            <FormSection title="SERVICES">
                <ServiceLinesEditor slug={slug} lines={services} onChange={setServices} disabled={disabled} />
            </FormSection>

            <FormSection title="SCHEDULING">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">SERVICE DAY</span>
                        <input
                            type="date"
                            className="admin-form-input"
                            value={serviceDay}
                            disabled={disabled}
                            onChange={(e) => setServiceDay(e.target.value)}
                        />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">END DATE</span>
                        <input
                            type="date"
                            className="admin-form-input"
                            value={endDate}
                            disabled={disabled}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">STATUS</span>
                        <select
                            className="admin-form-input"
                            value={status}
                            disabled={disabled}
                            onChange={(e) => setStatus(e.target.value)}
                        >
                            {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                    {s.toUpperCase().replace(/-/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="admin-form-label">PRIORITY</span>
                        <select
                            className="admin-form-input"
                            value={priority}
                            disabled={disabled}
                            onChange={(e) => setPriority(e.target.value)}
                        >
                            {PRIORITY_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                    {p.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </FormSection>

            <FormSection title="NOTES">
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

            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="admin-form-btn" disabled={disabled} onClick={submit}>
                    {pending ? 'CREATING…' : 'CREATE TICKET ›'}
                </button>
            </div>
        </div>
    );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: 'var(--track-widest)',
                    color: 'var(--text-3)',
                    marginBottom: 12,
                }}
            >
                {title}
            </div>
            {children}
        </section>
    );
}
