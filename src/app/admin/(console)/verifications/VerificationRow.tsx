'use client';

import { useState, useTransition } from 'react';
import { decideVerification, getKycDocuments, type CommerceRegistry } from './actions';
import type { UserFacts } from '@/lib/admin-user-facts';

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
    applicant: { id: string; handle: string; display_name: string | null } | null;
    /** Host requests only: account + activity facts for the decision. */
    facts: UserFacts | null;
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

    const applicantLink = req.applicant ? (
        <a href={`/admin/users/${req.applicant.id}`} className="text-link">
            @{req.applicant.handle}
        </a>
    ) : (
        <>@—</>
    );
    const title =
        req.kind === 'host' ? applicantLink : (req.shop?.name ?? req.shop?.slug ?? '—');
    const why = payloadLine(req.payload, 'why');
    const facts = req.facts;

    return (
        <div className="feature-card vrow" style={{ padding: 16, display: 'grid', gap: 10 }}>
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
                        Owner {applicantLink} · handle <b>{req.shop.slug}</b>
                    </div>
                ) : null}
                {req.kind === 'host' && req.nominatedBy ? (
                    <div>Nominated by @{req.nominatedBy.handle}</div>
                ) : null}
                {req.kind === 'host' ? (
                    <>
                        {req.applicant?.display_name ? <div>{req.applicant.display_name}</div> : null}
                        <div>
                            <span style={{ color: 'var(--text-3, var(--text-2))' }}>WHY: </span>
                            {why ? (
                                <span style={{ fontStyle: 'italic' }}>“{why}”</span>
                            ) : (
                                <span style={{ color: 'var(--text-3, var(--text-2))' }}>No reason given</span>
                            )}
                        </div>
                        <FactsBlock facts={facts} />
                    </>
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
                <div
                    style={{
                        display: 'grid',
                        gap: 12,
                        border: '1px solid var(--line)',
                        background: 'var(--bg-1)',
                        padding: 14,
                    }}
                >
                    <div className="eyebrow eyebrow-gold" style={{ fontSize: 10 }}>／ REGISTRY WIRING (on approve)</div>
                    <Field label="COMMERCE TIER">
                        <select className="admin-form-input" value={tier} onChange={(e) => setTier(e.target.value)}>
                            <option value="1">1 — storefront</option>
                            <option value="2">2 — +customers</option>
                            <option value="3">3 — full ops</option>
                        </select>
                    </Field>
                    <Field label="MEDUSA CATEGORY HANDLES" hint="comma-separated">
                        <input className="admin-form-input" value={handles} onChange={(e) => setHandles(e.target.value)} placeholder="nac, tees" />
                    </Field>
                    <Field label="SENDER EMAIL">
                        <input className="admin-form-input" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="orders@send.neferstock.com" />
                    </Field>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={sellsProducts}
                            onChange={(e) => setSellsProducts(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--gold)', flexShrink: 0, margin: 0 }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                            Mark shop as selling products (sells_products)
                        </span>
                    </label>
                </div>
            ) : null}

            <Field label="REVIEW NOTE" hint="reason — shown to applicant on reject">
                <input
                    className="admin-form-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why this decision?"
                />
            </Field>

            {err ? <div style={{ color: 'var(--danger, #d33)', fontSize: 12 }}>{err}</div> : null}

            <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" disabled={pending} onClick={() => run(true)}>
                    {pending ? '…' : 'Approve'}
                </button>
                <button className="btn btn-ghost" disabled={pending} onClick={() => run(false)}>
                    Reject
                </button>
            </div>

            <style>{`
                .vrow .admin-form-input { width: 100%; box-sizing: border-box; }
                .vrow select.admin-form-input { appearance: none; -webkit-appearance: none; cursor: pointer; }
            `}</style>
        </div>
    );
}

function relative(iso: string | null | undefined): string {
    if (!iso) return '—';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    const rel = days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
    return `${rel} (${new Date(iso).toISOString().slice(0, 10)})`;
}

function FactsBlock({ facts }: { facts: UserFacts | null }) {
    if (!facts) {
        return <div style={{ color: 'var(--text-3, var(--text-2))' }}>No account details found.</div>;
    }
    const c = facts.counts;
    const n = (v: number | null) => (v == null ? '—' : String(v));
    const dim = { color: 'var(--text-3, var(--text-2))' } as const;
    return (
        <div
            style={{
                display: 'grid',
                gap: 3,
                border: '1px solid var(--line)',
                background: 'var(--bg-1)',
                padding: '8px 10px',
                fontSize: 12,
                marginTop: 4,
            }}
        >
            <div>
                <span style={dim}>EMAIL </span>
                {facts.auth?.email ?? '—'}
                {facts.auth && !facts.auth.emailConfirmedAt ? <span style={dim}> (unconfirmed)</span> : null}
            </div>
            <div>
                <span style={dim}>JOINED </span>
                {relative(facts.auth?.createdAt ?? facts.profileCreatedAt)}
            </div>
            <div>
                <span style={dim}>LAST SIGN-IN </span>
                {relative(facts.auth?.lastSignInAt)}
            </div>
            <div>
                {n(c.posts)} posts · {n(c.vehicles)} vehicles · {n(c.followers)} followers · {n(c.rsvps)} RSVPs ·{' '}
                {n(c.hosted)} hosted
            </div>
        </div>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="admin-form-label">
                {label}
                {hint ? (
                    <span style={{ color: 'var(--text-3)', textTransform: 'none', marginLeft: 6 }}>· {hint}</span>
                ) : null}
            </span>
            {children}
        </label>
    );
}
