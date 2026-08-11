'use client';

import { useState, useTransition } from 'react';
import { decideVerification, getKycDocuments, type CommerceRegistry } from './actions';

type KycDoc = {
    id: string;
    docType: string;
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    signedUrl: string | null;
};

export type VReq = {
    id: string;
    kind: 'shop' | 'commerce' | 'host';
    created_at: string;
    origin_app: string | null;
    payload: Record<string, unknown>;
    shop: { id: number; slug: string; name: string | null; origin_app: string | null } | null;
    applicant: { handle: string; display_name: string | null } | null;
    nominatedBy: { handle: string } | null;
};

function payloadLine(p: Record<string, unknown>, key: string): string | null {
    const v = p?.[key];
    return v === undefined || v === null || v === '' ? null : String(v);
}

export function VerificationRow({ req }: { req: VReq }) {
    const [note, setNote] = useState('');
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    // commerce registry fields (admin fills at approval)
    const [tier, setTier] = useState('1');
    const [handles, setHandles] = useState<string>(
        req.shop?.slug ? req.shop.slug : '',
    );
    const [senderEmail, setSenderEmail] = useState('');
    const [sellsProducts, setSellsProducts] = useState(true);

    // KYC document viewer (commerce rows) — short-TTL signed URLs on demand.
    const [docs, setDocs] = useState<KycDoc[] | null>(null);
    const [docsPending, startDocs] = useTransition();
    const [docsErr, setDocsErr] = useState<string | null>(null);

    const loadDocs = () => {
        if (!req.shop) return;
        setDocsErr(null);
        startDocs(async () => {
            const res = await getKycDocuments(req.shop!.id);
            if (res.ok) setDocs(res.docs ?? []);
            else setDocsErr(res.error ?? 'Failed to load documents');
        });
    };

    function run(approve: boolean) {
        setErr(null);
        const registry: CommerceRegistry | undefined =
            req.kind === 'commerce' && approve
                ? {
                      sells_products: sellsProducts,
                      commerce_tier: Number(tier) || 1,
                      medusa_category_handles: handles
                          .split(',')
                          .map((h) => h.trim())
                          .filter(Boolean),
                      sender_email: senderEmail.trim() || undefined,
                  }
                : undefined;
        startTransition(async () => {
            const res = await decideVerification({ requestId: req.id, approve, note, registry });
            if (!res.ok) setErr(res.error ?? 'Failed');
        });
    }

    const title =
        req.kind === 'host'
            ? `@${req.applicant?.handle ?? '—'}`
            : (req.shop?.name ?? req.shop?.slug ?? '—');

    return (
        <div className="feature-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="mono-row" style={{ fontSize: 11 }}>
                <span className="accent">{req.kind.toUpperCase()}</span>
                <span className="sep" />
                <span>{(req.origin_app ?? req.shop?.origin_app ?? 'rollout').toUpperCase()}</span>
                <span className="sep" />
                <span>{new Date(req.created_at).toLocaleDateString()}</span>
            </div>

            <div style={{ fontSize: 17, letterSpacing: 0.4 }}>{title}</div>

            <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'grid', gap: 3 }}>
                {req.kind !== 'host' && req.shop ? (
                    <div>
                        Owner @{req.applicant?.handle ?? '—'} · handle <b>{req.shop.slug}</b>
                    </div>
                ) : null}
                {req.kind === 'host' && req.nominatedBy ? (
                    <div>Nominated by @{req.nominatedBy.handle}</div>
                ) : null}
                {req.kind === 'shop' ? (
                    <>
                        {payloadLine(req.payload, 'category') && <div>Category: {payloadLine(req.payload, 'category')}</div>}
                        {payloadLine(req.payload, 'city') && (
                            <div>Location: {[payloadLine(req.payload, 'city'), payloadLine(req.payload, 'state_region')].filter(Boolean).join(', ')}</div>
                        )}
                        {payloadLine(req.payload, 'website_url') && <div>Web: {payloadLine(req.payload, 'website_url')}</div>}
                        {payloadLine(req.payload, 'description') && <div style={{ fontStyle: 'italic' }}>“{payloadLine(req.payload, 'description')}”</div>}
                    </>
                ) : null}
                {req.kind === 'commerce' ? (
                    <>
                        {payloadLine(req.payload, 'legal_name') && <div>Legal name: {payloadLine(req.payload, 'legal_name')}</div>}
                        {payloadLine(req.payload, 'ubi') && <div>UBI: {payloadLine(req.payload, 'ubi')}</div>}
                        <div style={{ marginTop: 4 }}>
                            {docs === null ? (
                                <button
                                    type="button"
                                    className="admin-action-btn muted"
                                    disabled={docsPending}
                                    onClick={loadDocs}
                                >
                                    {docsPending ? 'LOADING…' : 'VIEW KYC DOCUMENTS'}
                                </button>
                            ) : docs.length === 0 ? (
                                <div style={{ color: 'var(--text-3, var(--text-2))' }}>No documents uploaded.</div>
                            ) : (
                                <ul style={{ margin: '4px 0 0', paddingLeft: 16, display: 'grid', gap: 3 }}>
                                    {docs.map((d) => (
                                        <li key={d.id} style={{ fontSize: 12 }}>
                                            {d.signedUrl ? (
                                                <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" className="accent" style={{ textDecoration: 'underline' }}>
                                                    {d.docType.replace(/_/g, ' ')}
                                                </a>
                                            ) : (
                                                <span>{d.docType.replace(/_/g, ' ')} (missing)</span>
                                            )}
                                            {d.originalName ? <span style={{ color: 'var(--text-3, var(--text-2))' }}> — {d.originalName}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {docsErr ? <div style={{ color: 'var(--danger, #d33)', fontSize: 12 }}>{docsErr}</div> : null}
                            {docs && docs.length > 0 ? (
                                <div style={{ color: 'var(--text-3, var(--text-2))', fontSize: 10, marginTop: 3 }}>
                                    Links expire in ~5 min.
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
            </div>

            {req.kind === 'commerce' ? (
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <div className="eyebrow" style={{ fontSize: 10 }}>／ REGISTRY WIRING (on approve)</div>
                    <label className="field" style={{ fontSize: 12 }}>
                        <span>Commerce tier</span>
                        <select value={tier} onChange={(e) => setTier(e.target.value)}>
                            <option value="1">1 — storefront</option>
                            <option value="2">2 — +customers</option>
                            <option value="3">3 — full ops</option>
                        </select>
                    </label>
                    <label className="field" style={{ fontSize: 12 }}>
                        <span>Medusa category handles (comma-separated)</span>
                        <input value={handles} onChange={(e) => setHandles(e.target.value)} placeholder="nac, tees" />
                    </label>
                    <label className="field" style={{ fontSize: 12 }}>
                        <span>Sender email</span>
                        <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="orders@send.neferstock.com" />
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                        <input type="checkbox" checked={sellsProducts} onChange={(e) => setSellsProducts(e.target.checked)} />
                        <span>Mark shop as selling products (sells_products)</span>
                    </label>
                </div>
            ) : null}

            <input
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Review note (reason — shown to applicant on reject)"
                style={{ fontSize: 13 }}
            />

            {err ? <div style={{ color: 'var(--danger, #d33)', fontSize: 12 }}>{err}</div> : null}

            <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" disabled={pending} onClick={() => run(true)}>
                    {pending ? '…' : 'Approve'}
                </button>
                <button className="btn btn-ghost" disabled={pending} onClick={() => run(false)}>
                    Reject
                </button>
            </div>
        </div>
    );
}
