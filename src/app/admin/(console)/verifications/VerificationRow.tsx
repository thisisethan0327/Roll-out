'use client';

import { useState, useTransition } from 'react';
import { decideVerification, getKycDocuments, type CommerceRegistry } from './actions';
import type { UserFacts } from '@/lib/admin-user-facts';
import { isBannedUntil } from '@/lib/ban';
import { Check, FileText } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { adminStyles as a, sentence } from '@/components/glide-admin/parts';

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
        <article className={`${a.card} ${a.cardPad} ${a.stack}`} aria-label={`${sentence(req.kind)} verification`}>
            <div className={a.chipRow}>
                <span className="admin-pill gold">{sentence(req.kind)}</span>
                <span className={a.meta}>
                    <span>{originName(req.origin_app ?? req.shop?.origin_app ?? 'rollout')}</span>
                    <span>{new Date(req.created_at).toLocaleDateString()}</span>
                </span>
            </div>

            <div className={a.vTitle}>{title}</div>

            <div className={a.facts} style={{ color: 'var(--ink-2)' }}>
                {req.kind !== 'host' && req.shop ? (
                    <div>
                        Owner {applicantLink} · handle <b style={{ color: 'var(--ink)' }}>{req.shop.slug}</b>
                    </div>
                ) : null}
                {req.kind === 'host' && req.nominatedBy ? <div>Nominated by @{req.nominatedBy.handle}</div> : null}
                {req.kind === 'host' ? (
                    <>
                        {req.applicant?.display_name ? <div style={{ color: 'var(--ink)' }}>{req.applicant.display_name}</div> : null}
                        <div>
                            <span>Why: </span>
                            {why ? <span style={{ color: 'var(--ink)' }}>“{why}”</span> : <span>No reason given</span>}
                        </div>
                        <FactsBlock facts={facts} />
                    </>
                ) : null}
                {req.kind === 'shop' ? (
                    <>
                        {payloadLine(req.payload, 'category') && <div>Category: {payloadLine(req.payload, 'category')}</div>}
                        {payloadLine(req.payload, 'city') && (
                            <div>
                                Location:{' '}
                                {[payloadLine(req.payload, 'city'), payloadLine(req.payload, 'state_region')].filter(Boolean).join(', ')}
                            </div>
                        )}
                        {payloadLine(req.payload, 'website_url') && <div>Web: {payloadLine(req.payload, 'website_url')}</div>}
                        {payloadLine(req.payload, 'description') && (
                            <div style={{ color: 'var(--ink)' }}>“{payloadLine(req.payload, 'description')}”</div>
                        )}
                    </>
                ) : null}
                {req.kind === 'commerce' ? (
                    <>
                        {payloadLine(req.payload, 'legal_name') && <div>Legal name: {payloadLine(req.payload, 'legal_name')}</div>}
                        {payloadLine(req.payload, 'ubi') && <div>UBI: {payloadLine(req.payload, 'ubi')}</div>}
                        <div style={{ marginTop: 6 }}>
                            {docs === null ? (
                                <button type="button" className="admin-action-btn muted" disabled={docsPending} onClick={loadDocs}>
                                    <FileText size={15} strokeWidth={2} aria-hidden="true" />
                                    {docsPending ? 'Loading…' : 'View KYC documents'}
                                </button>
                            ) : docs.length === 0 ? (
                                <div>No documents uploaded.</div>
                            ) : (
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                                    {docs.map((d) => (
                                        <li key={d.id}>
                                            {d.signedUrl ? (
                                                <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" className="text-link">
                                                    {d.docType.replace(/_/g, ' ')}
                                                </a>
                                            ) : (
                                                <span>{d.docType.replace(/_/g, ' ')} (missing)</span>
                                            )}
                                            {d.originalName ? <span> — {d.originalName}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {docsErr ? (
                                <div className="admin-login-error" role="alert" style={{ marginTop: 8 }}>
                                    {docsErr}
                                </div>
                            ) : null}
                            {docs && docs.length > 0 ? <div className={a.small}>Links expire in about 5 minutes.</div> : null}
                        </div>
                    </>
                ) : null}
            </div>

            {req.kind === 'commerce' ? (
                <div className={a.quote} style={{ display: 'grid', gap: 12, whiteSpace: 'normal' }}>
                    <div className={a.formSub} style={{ margin: 0, padding: 0, border: 0 }}>
                        Registry wiring (applied on approve)
                    </div>
                    <Field label="Commerce tier">
                        <select className="admin-form-input" value={tier} onChange={(e) => setTier(e.target.value)}>
                            <option value="1">1 — storefront</option>
                            <option value="2">2 — +customers</option>
                            <option value="3">3 — full ops</option>
                        </select>
                    </Field>
                    <Field label="Medusa category handles" hint="comma-separated">
                        <input className="admin-form-input" value={handles} onChange={(e) => setHandles(e.target.value)} placeholder="nac, tees" />
                    </Field>
                    <Field label="Sender email">
                        <input
                            className="admin-form-input"
                            value={senderEmail}
                            onChange={(e) => setSenderEmail(e.target.value)}
                            placeholder="orders@send.neferstock.com"
                        />
                    </Field>
                    <label className={a.choice} style={{ alignSelf: 'start' }}>
                        <input type="checkbox" checked={sellsProducts} onChange={(e) => setSellsProducts(e.target.checked)} />
                        Mark shop as selling products (sells_products)
                    </label>
                </div>
            ) : null}

            <Field label="Review note" hint="the reason, shown to the applicant on reject">
                <input
                    className="admin-form-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why this decision?"
                />
            </Field>

            {err ? (
                <div className="admin-login-error" role="alert">
                    {err}
                </div>
            ) : null}

            <div className={a.actRow}>
                <GlideButton size="sm" disabled={pending} aria-disabled={pending || undefined} onClick={() => run(true)} icon={<Check size={18} strokeWidth={2} />}>
                    {pending ? 'Working…' : 'Approve'}
                </GlideButton>
                <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => run(false)}>
                    Reject
                </button>
            </div>
        </article>
    );
}

function originName(app: string): string {
    const k = app.toLowerCase();
    return k === 'neferstock' ? 'NeferStock' : k === 'emwraps' ? 'EMWRAPS' : k === 'rollout' ? 'Rollout' : sentence(app);
}
function relative(iso: string | null | undefined): string {
    if (!iso) return '—';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    const rel = days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
    return `${rel} (${new Date(iso).toISOString().slice(0, 10)})`;
}

function FactsBlock({ facts }: { facts: UserFacts | null }) {
    if (!facts) {
        return <div>No account details found.</div>;
    }
    const c = facts.counts;
    const n = (v: number | null) => (v == null ? '—' : String(v));
    const dim = { color: 'var(--ink-2)' } as const;
    return (
        <div className={a.quote} style={{ display: 'grid', gap: 4, fontSize: 13.5, marginTop: 6, whiteSpace: 'normal' }}>
            {isBannedUntil(facts.profileBannedUntil) ? (
                <div>
                    <span className="admin-pill warn">Banned</span>
                    <span style={dim}> Rollout-suspended: approving is refused until the ban is lifted.</span>
                </div>
            ) : null}
            <div>
                <span style={dim}>Email </span>
                {facts.auth?.email ?? '—'}
                {facts.auth && !facts.auth.emailConfirmedAt ? <span style={dim}> (unconfirmed)</span> : null}
            </div>
            <div>
                <span style={dim}>Joined </span>
                {relative(facts.auth?.createdAt ?? facts.profileCreatedAt)}
            </div>
            <div>
                <span style={dim}>Last sign-in </span>
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
        <label className={a.field}>
            <span className="admin-form-label">
                {label}
                {hint ? <span className={a.hint}> · {hint}</span> : null}
            </span>
            {children}
        </label>
    );
}
