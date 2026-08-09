'use client';
/**
 * Vehicle CRUD for a legacy (public.customers) customer. Vehicles are
 * shop-scoped (public.vehicles.shop_id). Add, inline-edit, and remove.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addVehicle, updateVehicle, deleteVehicle } from '../actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type Vehicle = {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    color: string | null;
    vin: string | null;
    license_plate: string | null;
};

function VehicleFields({ v }: { v?: Vehicle }) {
    return (
        <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="year" defaultValue={v?.year ?? ''} placeholder="Year" className="admin-form-input" style={{ width: 80 }} />
                <input name="make" defaultValue={v?.make ?? ''} placeholder="Make" className="admin-form-input" style={{ flex: 1, minWidth: 100 }} />
                <input name="model" defaultValue={v?.model ?? ''} placeholder="Model" className="admin-form-input" style={{ flex: 1, minWidth: 100 }} />
                <input name="trim" defaultValue={v?.trim ?? ''} placeholder="Trim" className="admin-form-input" style={{ width: 110 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="color" defaultValue={v?.color ?? ''} placeholder="Color" className="admin-form-input" style={{ width: 120 }} />
                <input name="vin" defaultValue={v?.vin ?? ''} placeholder="VIN" className="admin-form-input" style={{ flex: 1, minWidth: 140 }} />
                <input name="license_plate" defaultValue={v?.license_plate ?? ''} placeholder="Plate" className="admin-form-input" style={{ width: 110 }} />
            </div>
        </>
    );
}

export function CustomerVehicles({
    slug,
    customerId,
    vehicles,
    callerRole,
}: {
    slug: string;
    customerId: string;
    vehicles: Vehicle[];
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [showAdd, setShowAdd] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const addFormRef = useRef<HTMLFormElement>(null);
    const canInstaller = true; // route already gated to installer+
    const canManage = MANAGER_ROLES.has(callerRole);

    const submitAdd = (form: HTMLFormElement) => {
        const fd = new FormData(form);
        start(async () => {
            try {
                await addVehicle(slug, customerId, fd);
                form.reset();
                setShowAdd(false);
                router.refresh();
            } catch (e: any) {
                alert('Add vehicle failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const submitEdit = (form: HTMLFormElement, vehicleId: string) => {
        const fd = new FormData(form);
        start(async () => {
            try {
                await updateVehicle(slug, vehicleId, customerId, fd);
                setEditId(null);
                router.refresh();
            } catch (e: any) {
                alert('Update vehicle failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const remove = (vehicleId: string) => {
        if (armedDelete !== vehicleId) {
            setArmedDelete(vehicleId);
            setTimeout(() => setArmedDelete(null), 3000);
            return;
        }
        setArmedDelete(null);
        start(async () => {
            try {
                await deleteVehicle(slug, vehicleId, customerId);
                router.refresh();
            } catch (e: any) {
                alert('Delete failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div>
            {vehicles.length === 0 ? (
                <div className="admin-empty">NO VEHICLES ON FILE</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>VEHICLE</th>
                                <th>COLOR</th>
                                <th>VIN</th>
                                <th>PLATE</th>
                                {canInstaller && <th></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {vehicles.map((v) =>
                                editId === v.id ? (
                                    <tr key={v.id}>
                                        <td colSpan={5}>
                                            <form
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    submitEdit(e.currentTarget, v.id);
                                                }}
                                                style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0' }}
                                            >
                                                <VehicleFields v={v} />
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button type="submit" className="admin-action-btn" disabled={pending}>
                                                        {pending ? 'SAVING…' : 'SAVE'}
                                                    </button>
                                                    <button type="button" className="admin-action-btn muted" onClick={() => setEditId(null)}>
                                                        CANCEL
                                                    </button>
                                                </div>
                                            </form>
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={v.id}>
                                        <td>
                                            {`${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() || '—'}
                                            {v.trim ? <div className="admin-handle">{v.trim}</div> : null}
                                        </td>
                                        <td>{v.color ?? '—'}</td>
                                        <td><span className="admin-handle">{v.vin ?? '—'}</span></td>
                                        <td>{v.license_plate ?? '—'}</td>
                                        {canInstaller && (
                                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <button type="button" className="admin-action-btn muted" onClick={() => setEditId(v.id)} disabled={pending}>
                                                    EDIT
                                                </button>
                                                {canManage && (
                                                    <button
                                                        type="button"
                                                        className="admin-action-btn danger"
                                                        onClick={() => remove(v.id)}
                                                        disabled={pending}
                                                        style={{ marginLeft: 6 }}
                                                    >
                                                        {armedDelete === v.id ? 'SURE?' : '✕'}
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ marginTop: 10 }}>
                {showAdd ? (
                    <form
                        ref={addFormRef}
                        onSubmit={(e) => {
                            e.preventDefault();
                            submitAdd(e.currentTarget);
                        }}
                        style={{
                            border: '1px solid var(--line)',
                            background: 'var(--bg-2)',
                            padding: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <VehicleFields />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="admin-action-btn" disabled={pending}>
                                {pending ? 'ADDING…' : 'ADD VEHICLE'}
                            </button>
                            <button type="button" className="admin-action-btn muted" onClick={() => setShowAdd(false)}>
                                CANCEL
                            </button>
                        </div>
                    </form>
                ) : (
                    <button type="button" className="admin-action-btn" onClick={() => setShowAdd(true)}>
                        + ADD VEHICLE
                    </button>
                )}
            </div>
        </div>
    );
}
