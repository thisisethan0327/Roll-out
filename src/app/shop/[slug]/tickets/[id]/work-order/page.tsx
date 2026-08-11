/**
 * /shop/[slug]/tickets/[id]/work-order — printable shop work order.
 *
 * Branded from rollout.shops (never hardcoded). Includes vehicle, services,
 * assigned installers, inspection/check-in records with photos, and materials.
 * Chrome is hidden in @media print (Save as PDF).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { PrintButton } from '../invoice/PrintButton';
import { parseServices, lineTotal } from '@/lib/ticket-services';

export const metadata = { title: 'Work Order' };

function fmtDate(iso: string | null): string {
    const d = iso ? new Date(iso) : new Date();
    try {
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'America/Los_Angeles',
        });
    } catch {
        return '';
    }
}

export default async function WorkOrderPage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    const pub = getSupabasePublicAdmin();
    const admin = getSupabaseAdmin();
    const [ticketRes, shopRes] = await Promise.all([
        pub.from('tickets').select('*').eq('id', id).eq('shop_id', shop.shopId).maybeSingle(),
        admin
            .from('shops')
            .select('name, slug, primary_color, from_name, email_logo_url, support_email, city, region')
            .eq('id', shop.shopId)
            .maybeSingle(),
    ]);
    const t = ticketRes.data as any;
    if (!t) notFound();
    const branding = (shopRes.data ?? {}) as any;

    const [checkinsRes, materialsRes, workersRes] = await Promise.all([
        pub
            .from('ticket_checkins')
            .select('id, type, condition_notes, odometer, fuel_level, media, created_at')
            .eq('ticket_id', id)
            .order('created_at', { ascending: true }),
        pub
            .from('ticket_materials')
            .select('id, quantity_used, unit, applied_area, serial_number:serial_numbers(serial_number, product:products(name))')
            .eq('ticket_id', id),
        pub.from('ticket_workers').select('worker_id').eq('ticket_id', id),
    ]);

    const checkins = (checkinsRes.data ?? []) as any[];
    const materials = (materialsRes.data ?? []) as any[];
    const workerIds = ((workersRes.data ?? []) as any[]).map((r) => r.worker_id).filter(Boolean);
    let workerNames: string[] = [];
    if (workerIds.length > 0) {
        const { data: staff } = await pub
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', workerIds);
        workerNames = (staff ?? []).map(
            (s: any) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || 'Staff',
        );
    }

    const accent = branding.primary_color || '#ffb733';
    const shopName = branding.from_name || branding.name || shop.name;
    const vehicle = [t.car_year, t.car_make, t.car_model, t.trim].filter(Boolean).join(' ');
    const lineItems = parseServices(t.services);
    const location = [branding.city, branding.region].filter(Boolean).join(', ');

    return (
        <>
            <style
                dangerouslySetInnerHTML={{
                    __html: `
@media print {
  .shop-sidebar, .admin-sidebar, .no-print { display: none !important; }
  .admin-main, .shop-layout, .admin-layout { padding: 0 !important; margin: 0 !important; display: block !important; }
  body { background: #fff !important; }
  @page { margin: 14mm; }
}`,
                }}
            />

            <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <Link href={`/shop/${slug}/tickets/${id}`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                    ‹ BACK TO TICKET
                </Link>
                <PrintButton />
            </div>

            <div
                className="workorder-doc"
                style={{
                    maxWidth: 800,
                    margin: '0 auto',
                    background: '#ffffff',
                    color: '#111111',
                    border: '1px solid #e2e2e2',
                    padding: '40px 44px',
                    fontFamily: 'var(--font-body, sans-serif)',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${accent}`, paddingBottom: 20, marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
                    <div>
                        {branding.email_logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={branding.email_logo_url} alt={shopName} style={{ maxHeight: 56, marginBottom: 8 }} />
                        ) : (
                            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{shopName}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                            @{branding.slug || shop.slug}
                            {location ? ` · ${location}` : ''}
                            {branding.support_email ? ` · ${branding.support_email}` : ''}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: accent }}>WORK ORDER</div>
                        <div style={{ fontSize: 13, fontFamily: 'monospace', marginTop: 6 }}>{t.ticket_id ?? id}</div>
                        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{fmtDate(t.created_at)}</div>
                        {t.service_day ? <div style={{ fontSize: 12, color: '#555' }}>Service day: {t.service_day}</div> : null}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 40, marginBottom: 24, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 200 }}>
                        <SectionLabel accent={accent}>Customer</SectionLabel>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{t.customer_name || '—'}</div>
                        {t.email ? <div style={{ fontSize: 13, color: '#555' }}>{t.email}</div> : null}
                        {t.phone ? <div style={{ fontSize: 13, color: '#555' }}>{t.phone}</div> : null}
                    </div>
                    {vehicle ? (
                        <div style={{ minWidth: 200 }}>
                            <SectionLabel accent={accent}>Vehicle</SectionLabel>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{vehicle}</div>
                            {t.color ? <div style={{ fontSize: 13, color: '#555' }}>{t.color}</div> : null}
                            {t.vin ? <div style={{ fontSize: 12, color: '#777', fontFamily: 'monospace' }}>VIN {t.vin}</div> : null}
                        </div>
                    ) : null}
                    <div style={{ minWidth: 160 }}>
                        <SectionLabel accent={accent}>Assigned</SectionLabel>
                        {workerNames.length > 0 ? (
                            workerNames.map((n) => <div key={n} style={{ fontSize: 13 }}>{n}</div>)
                        ) : (
                            <div style={{ fontSize: 13, color: '#888' }}>Unassigned</div>
                        )}
                    </div>
                </div>

                <SectionLabel accent={accent}>Services</SectionLabel>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 24 }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #222', textAlign: 'left' }}>
                            <th style={{ padding: '8px 0', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#666' }}>Description</th>
                            <th style={{ padding: '8px 0', fontSize: 11, textTransform: 'uppercase', color: '#666', textAlign: 'center', width: 60 }}>Qty</th>
                            <th style={{ padding: '8px 0', fontSize: 11, textTransform: 'uppercase', color: '#666', textAlign: 'right', width: 110 }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.length === 0 ? (
                            <tr><td colSpan={3} style={{ padding: '12px 0', color: '#888' }}>No services listed.</td></tr>
                        ) : (
                            lineItems.map((li, i) => {
                                const amt = lineTotal(li);
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '9px 0' }}>{li.service || 'Service'}</td>
                                        <td style={{ padding: '9px 0', textAlign: 'center' }}>{li.quantity || 1}</td>
                                        <td style={{ padding: '9px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                                            {amt != null ? `$${amt.toFixed(2)}` : '—'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {materials.length > 0 && (
                    <>
                        <SectionLabel accent={accent}>Materials</SectionLabel>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 }}>
                            <tbody>
                                {materials.map((m: any) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '7px 0' }}>{m.serial_number?.product?.name ?? '—'}</td>
                                        <td style={{ padding: '7px 0', color: '#777', fontFamily: 'monospace' }}>{m.serial_number?.serial_number ?? '—'}</td>
                                        <td style={{ padding: '7px 0', textAlign: 'right' }}>{m.quantity_used ?? '—'} {m.unit ?? ''}</td>
                                        <td style={{ padding: '7px 0', textAlign: 'right', color: '#555' }}>{m.applied_area ?? ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                <SectionLabel accent={accent}>Inspection Records</SectionLabel>
                {checkins.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>No inspection records.</div>
                ) : (
                    checkins.map((c: any) => {
                        const media = Array.isArray(c.media) ? c.media : [];
                        return (
                            <div key={c.id} style={{ marginBottom: 18, breakInside: 'avoid' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>
                                    {(c.type ?? '—').replace('-', ' ')}
                                    <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>{fmtDate(c.created_at)}</span>
                                </div>
                                {c.condition_notes && <div style={{ fontSize: 13, color: '#444', marginTop: 3, whiteSpace: 'pre-wrap' }}>{c.condition_notes}</div>}
                                {(c.odometer || c.fuel_level) && (
                                    <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>
                                        {c.odometer ? `Odometer ${c.odometer}` : ''}{c.odometer && c.fuel_level ? ' · ' : ''}{c.fuel_level ? `Fuel ${c.fuel_level}` : ''}
                                    </div>
                                )}
                                {media.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
                                        {media.map((m: any, i: number) =>
                                            m?.url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img key={i} src={m.url} alt={`Photo ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', border: '1px solid #ddd' }} />
                                            ) : null,
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {t.notes ? (
                    <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 14 }}>
                        <SectionLabel accent={accent}>Notes</SectionLabel>
                        <div style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.notes}</div>
                    </div>
                ) : null}

                <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', gap: 40 }}>
                    <SignatureLine label="Customer signature" />
                    <SignatureLine label="Technician signature" />
                </div>
                <div style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: '#999', letterSpacing: 1 }}>
                    {shopName.toUpperCase()} · WORK ORDER
                </div>
            </div>
        </>
    );
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent: string }) {
    return (
        <div style={{ fontSize: 10, letterSpacing: 2, color: accent, textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
            {children}
        </div>
    );
}

function SignatureLine({ label }: { label: string }) {
    return (
        <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #333', marginTop: 30 }} />
            <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{label}</div>
        </div>
    );
}
