'use client';
/**
 * Commerce-KYC application form. Uploads business license + reseller certificate
 * (optional extra) to the PRIVATE verification-docs bucket via server-minted
 * signed upload URLs, collects UBI + legal name, then files the application.
 *
 * Upload path: request a signed URL from the server → uploadToSignedUrl from the
 * browser (bytes never touch our server) → hand the resulting storage path back
 * to submitCommerceApplication.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import {
    createCommerceUploadUrl,
    submitCommerceApplication,
    type SubmitDoc,
} from './actions';

// Kept in sync with lib/verification-docs.ts (that module is server-only, so a
// Client Component can't import from it — hence this local literal).
const VERIFICATION_BUCKET = 'verification-docs';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

type Slot = 'business_license' | 'reseller_certificate' | 'other';

const SLOTS: { key: Slot; label: string; required: boolean; hint: string }[] = [
    { key: 'business_license', label: 'Business license', required: true, hint: 'State/city business license (PDF or image).' },
    { key: 'reseller_certificate', label: 'Reseller certificate', required: true, hint: 'Reseller permit / sales-tax certificate.' },
    { key: 'other', label: 'Additional document (optional)', required: false, hint: 'Anything else that supports your application.' },
];

export function SellForm({ shopId, slug }: { shopId: number; slug: string }) {
    const router = useRouter();
    const [ubi, setUbi] = useState('');
    const [legalName, setLegalName] = useState('');
    const [files, setFiles] = useState<Record<Slot, File | null>>({
        business_license: null,
        reseller_certificate: null,
        other: null,
    });
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string | null>(null);

    const pickFile = (slot: Slot, f: File | null) => {
        setError(null);
        if (f && f.size > MAX_BYTES) {
            setError(`${f.name} is larger than 10 MB.`);
            return;
        }
        setFiles((prev) => ({ ...prev, [slot]: f }));
    };

    const onSubmit = () => {
        setError(null);
        const chosen = (Object.entries(files) as [Slot, File | null][]).filter(([, f]) => f);
        if (!files.business_license && !files.reseller_certificate) {
            setError('Upload at least your business license and reseller certificate.');
            return;
        }
        start(async () => {
            const supabase = getSupabaseBrowser();
            const uploaded: SubmitDoc[] = [];
            for (const [slot, file] of chosen) {
                if (!file) continue;
                setProgress(`Uploading ${file.name}…`);
                const urlRes = await createCommerceUploadUrl(shopId, slot, file.type);
                if (!urlRes.ok || !urlRes.path || !urlRes.token) {
                    setProgress(null);
                    setError(urlRes.error ?? 'Could not start upload.');
                    return;
                }
                const { error: upErr } = await supabase.storage
                    .from(VERIFICATION_BUCKET)
                    .uploadToSignedUrl(urlRes.path, urlRes.token, file);
                if (upErr) {
                    setProgress(null);
                    setError(`Upload failed for ${file.name}: ${upErr.message}`);
                    return;
                }
                uploaded.push({
                    docType: slot,
                    path: urlRes.path,
                    originalName: file.name,
                    mimeType: file.type,
                    sizeBytes: file.size,
                });
            }

            setProgress('Filing application…');
            const res = await submitCommerceApplication(shopId, slug, {
                ubi,
                legalName,
                docs: uploaded,
            });
            setProgress(null);
            if (!res.ok) {
                setError(res.error ?? 'Could not submit.');
                return;
            }
            router.refresh();
        });
    };

    return (
        <div className="admin-form" style={{ maxWidth: 640 }}>
            <SectionHeading>BUSINESS DETAILS</SectionHeading>
            <label className="admin-form-label">LEGAL BUSINESS NAME</label>
            <input className="admin-form-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Neferstock LLC" disabled={pending} />

            <label className="admin-form-label">UBI NUMBER (9 DIGITS)</label>
            <input className="admin-form-input" value={ubi} onChange={(e) => setUbi(e.target.value)} inputMode="numeric" placeholder="601234567" disabled={pending} />

            <SectionHeading>DOCUMENTS</SectionHeading>
            {SLOTS.map((s) => (
                <div key={s.key} style={{ marginBottom: 14 }}>
                    <label className="admin-form-label">
                        {s.label.toUpperCase()} {s.required ? '*' : ''}
                    </label>
                    <input
                        type="file"
                        accept={ACCEPT}
                        disabled={pending}
                        onChange={(e) => pickFile(s.key, e.target.files?.[0] ?? null)}
                        className="admin-form-input"
                        style={{ padding: 8 }}
                    />
                    <div className="admin-form-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{s.hint}</div>
                    {files[s.key] ? (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                            Selected: {files[s.key]!.name} ({Math.round(files[s.key]!.size / 1024)} KB)
                        </div>
                    ) : null}
                </div>
            ))}

            <SectionHeading>PAYOUTS</SectionHeading>
            <div style={{ border: '1px dashed var(--line)', padding: 14, borderRadius: 4, color: 'var(--text-2)', fontSize: 13 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 2, color: 'var(--gold)', marginBottom: 6 }}>
                    STRIPE CONNECT
                </div>
                Payouts setup — coming soon. You’ll connect your bank through Stripe’s hosted onboarding once the payouts platform is live. Until then, approved sellers settle through Rollout’s interim process.
            </div>

            {error ? <div style={{ color: 'var(--danger, #d33)', fontSize: 13, marginTop: 12 }}>{error}</div> : null}
            {progress ? <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 12 }}>{progress}</div> : null}

            <div style={{ marginTop: 18 }}>
                <button type="button" className="admin-form-btn" onClick={onSubmit} disabled={pending}>
                    {pending ? 'SUBMITTING…' : 'SUBMIT APPLICATION ›'}
                </button>
            </div>
            <div className="admin-form-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                Documents are stored privately and only visible to Rollout reviewers. Rejected-application documents are purged after 90 days.
            </div>
        </div>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ marginTop: 14, marginBottom: 6, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)', color: 'var(--gold)', borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            {children}
        </div>
    );
}
