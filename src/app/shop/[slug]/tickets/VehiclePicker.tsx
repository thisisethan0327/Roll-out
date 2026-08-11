'use client';
/**
 * Shared vehicle selector for new + edit ticket flows.
 *
 * When a customer is linked, offers their existing vehicles to pick; otherwise
 * (or via "add new") enter year/make/model/trim/color/VIN with a NHTSA VPIC
 * decode assist. Reports up via onChange as:
 *   { vehicleId: string|null, year, make, model, trim, color, vin }
 * (vehicleId null == a new-vehicle draft to be created on submit.)
 */
import { useEffect, useState, useTransition } from 'react';
import { decodeVin, listCustomerVehicles, type VehicleHit } from './form-actions';

export type VehicleValue = {
    vehicleId: string | null;
    year: string;
    make: string;
    model: string;
    trim: string;
    color: string;
    vin: string;
};

export const EMPTY_VEHICLE: VehicleValue = {
    vehicleId: null,
    year: '',
    make: '',
    model: '',
    trim: '',
    color: '',
    vin: '',
};

export function VehiclePicker({
    slug,
    customerId,
    value,
    onChange,
    disabled,
}: {
    slug: string;
    customerId: string | null;
    value: VehicleValue;
    onChange: (v: VehicleValue) => void;
    disabled?: boolean;
}) {
    const [existing, setExisting] = useState<VehicleHit[]>([]);
    const [loading, startLoad] = useTransition();
    const [decoding, startDecode] = useTransition();
    const [decodeMsg, setDecodeMsg] = useState<string | null>(null);

    // Load the customer's vehicles when the linked customer changes.
    useEffect(() => {
        if (!customerId) {
            setExisting([]);
            return;
        }
        startLoad(async () => {
            try {
                setExisting(await listCustomerVehicles(slug, customerId));
            } catch {
                setExisting([]);
            }
        });
    }, [customerId, slug]);

    const pickExisting = (v: VehicleHit) => {
        onChange({
            vehicleId: v.id,
            year: v.year != null ? String(v.year) : '',
            make: v.make ?? '',
            model: v.model ?? '',
            trim: v.trim ?? '',
            color: v.color ?? '',
            vin: v.vin ?? '',
        });
    };

    const decode = () => {
        setDecodeMsg(null);
        startDecode(async () => {
            try {
                const d = await decodeVin(slug, value.vin);
                onChange({
                    ...value,
                    vehicleId: null,
                    year: d.year ?? value.year,
                    make: d.make ?? value.make,
                    model: d.model ?? value.model,
                    trim: d.trim ?? value.trim,
                });
                setDecodeMsg(`Decoded ${[d.year, d.make, d.model].filter(Boolean).join(' ')}`);
            } catch (e: any) {
                setDecodeMsg(e?.message ?? 'Decode failed.');
            }
        });
    };

    const field = (k: keyof VehicleValue, v: string) =>
        // Editing any field means it's no longer the picked existing vehicle.
        onChange({ ...value, vehicleId: null, [k]: v });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customerId && (existing.length > 0 || loading) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-3)' }}>
                        {loading ? 'LOADING VEHICLES…' : 'CUSTOMER VEHICLES'}
                    </div>
                    {existing.map((v) => {
                        const label = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
                        const picked = value.vehicleId === v.id;
                        return (
                            <button
                                key={v.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => pickExisting(v)}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 8,
                                    textAlign: 'left',
                                    padding: '7px 10px',
                                    background: picked ? 'var(--bg-hover, var(--bg-2))' : 'transparent',
                                    border: `1px solid ${picked ? 'var(--accent, var(--line))' : 'var(--line)'}`,
                                    cursor: 'pointer',
                                    color: 'var(--text)',
                                }}
                            >
                                <span style={{ fontSize: 13 }}>{label || '(vehicle)'}</span>
                                <span className="admin-handle" style={{ fontSize: 11 }}>
                                    {picked ? 'SELECTED' : v.vin ? v.vin.slice(-6) : v.color ?? ''}
                                </span>
                            </button>
                        );
                    })}
                    <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-3)', marginTop: 4 }}>
                        OR ADD A NEW VEHICLE
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                    className="admin-form-input"
                    placeholder="VIN (17 chars → decode)"
                    value={value.vin}
                    disabled={disabled}
                    maxLength={17}
                    onChange={(e) => field('vin', e.target.value.toUpperCase())}
                    style={{ flex: 1, minWidth: 200, fontFamily: 'var(--font-mono, monospace)' }}
                />
                <button
                    type="button"
                    className="admin-action-btn"
                    onClick={decode}
                    disabled={disabled || decoding || value.vin.trim().length !== 17}
                >
                    {decoding ? 'DECODING…' : 'DECODE VIN'}
                </button>
            </div>
            {decodeMsg && (
                <div className="admin-handle" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {decodeMsg}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 8 }}>
                <input
                    className="admin-form-input"
                    placeholder="Year"
                    value={value.year}
                    disabled={disabled}
                    onChange={(e) => field('year', e.target.value)}
                />
                <input
                    className="admin-form-input"
                    placeholder="Make"
                    value={value.make}
                    disabled={disabled}
                    onChange={(e) => field('make', e.target.value)}
                />
                <input
                    className="admin-form-input"
                    placeholder="Model"
                    value={value.model}
                    disabled={disabled}
                    onChange={(e) => field('model', e.target.value)}
                />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                    className="admin-form-input"
                    placeholder="Trim"
                    value={value.trim}
                    disabled={disabled}
                    onChange={(e) => field('trim', e.target.value)}
                />
                <input
                    className="admin-form-input"
                    placeholder="Color"
                    value={value.color}
                    disabled={disabled}
                    onChange={(e) => field('color', e.target.value)}
                />
            </div>
        </div>
    );
}
