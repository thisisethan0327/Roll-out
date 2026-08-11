'use client';
/**
 * Detail-page VEHICLE panel with edit capability: shows the linked vehicle and
 * (for managers) a toggle to pick one of the customer's vehicles or add a new
 * one with NHTSA VIN decode → relinkTicketVehicle.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { VehiclePicker, type VehicleValue } from '../VehiclePicker';
import { relinkTicketVehicle } from '../form-actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function TicketVehicleEditor({
    slug,
    ticketRowId,
    callerRole,
    customerId,
    current,
}: {
    slug: string;
    ticketRowId: string;
    callerRole: string;
    customerId: string | null;
    current: {
        vehicleId: string | null;
        year: string | null;
        make: string | null;
        model: string | null;
        trim: string | null;
        color: string | null;
        vin: string | null;
    };
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [pending, start] = useTransition();
    const [value, setValue] = useState<VehicleValue>({
        vehicleId: current.vehicleId,
        year: current.year ?? '',
        make: current.make ?? '',
        model: current.model ?? '',
        trim: current.trim ?? '',
        color: current.color ?? '',
        vin: current.vin ?? '',
    });
    const canManage = MANAGER_ROLES.has(callerRole);

    const save = () => {
        start(async () => {
            try {
                await relinkTicketVehicle(
                    slug,
                    ticketRowId,
                    value.vehicleId,
                    value.vehicleId
                        ? undefined
                        : {
                              year: value.year,
                              make: value.make,
                              model: value.model,
                              trim: value.trim,
                              color: value.color,
                              vin: value.vin,
                          },
                );
                setEditing(false);
                router.refresh();
            } catch (e: any) {
                alert('Link vehicle failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const vehicleLabel = [current.year, current.make, current.model].filter(Boolean).join(' ');

    if (!editing) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <KV label="YEAR / MAKE / MODEL" value={vehicleLabel || '—'} />
                <KV label="TRIM" value={current.trim ?? '—'} />
                <KV label="COLOR" value={current.color ?? '—'} />
                <KV label="VIN" value={current.vin ?? '—'} mono />
                {canManage && (
                    <div>
                        <button type="button" className="admin-action-btn muted" onClick={() => setEditing(true)}>
                            CHANGE VEHICLE
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <VehiclePicker
                slug={slug}
                customerId={customerId}
                value={value}
                onChange={setValue}
                disabled={pending}
            />
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="admin-action-btn" disabled={pending} onClick={save}>
                    {pending ? 'SAVING…' : 'SAVE VEHICLE'}
                </button>
                <button
                    type="button"
                    className="admin-action-btn muted"
                    disabled={pending}
                    onClick={() => setEditing(false)}
                >
                    CANCEL
                </button>
            </div>
        </div>
    );
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, fontSize: 12, lineHeight: 1.5 }}>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 9,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--text-3)',
                    paddingTop: 2,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    fontFamily: mono ? 'var(--font-mono, monospace)' : 'var(--font-body)',
                    color: 'var(--text)',
                    wordBreak: 'break-word',
                }}
            >
                {value}
            </div>
        </div>
    );
}
