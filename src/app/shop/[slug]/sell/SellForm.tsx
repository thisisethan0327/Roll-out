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
import { FileCheck, LoaderCircle, ShieldCheck } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { Field, FormSection } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

// Kept in sync with lib/verification-docs.ts (that module is server-only, so a
// Client Component can't import from it — hence this local literal).
const VERIFICATION_BUCKET = 'verification-docs';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

type Slot = 'business_license' | 'reseller_certificate' | 'other';

const SLOTS: { key: Slot; label: string; required: boolean; hint: string }[] = [
    { key: 'business_license', label: 'Business license', required: true, hint: 'State/city business license (PDF or image).' },
    { key: 'reseller_certificate', label: 'Reseller certificate', required: true, hint: 'Reseller permit / sales-tax certificate.' },
    { key: 'other', label: 'Additional document', required: false, hint: 'Anything else that supports your application.' },
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

    const inp = cx(cs.input, bz.in);

    return (
        <div className={cx(cs.col, bz.narrow)}>
            <FormSection id="sell-biz" title="Business details" edge>
                <Field label="Legal business name" htmlFor="sell-legal">
                    <input id="sell-legal" className={inp} value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Apex Auto Styling LLC" disabled={pending} />
                </Field>
                <Field label="UBI number (9 digits)" htmlFor="sell-ubi">
                    <input id="sell-ubi" className={inp} value={ubi} onChange={(e) => setUbi(e.target.value)} inputMode="numeric" placeholder="601123456" disabled={pending} />
                </Field>
            </FormSection>

            <FormSection id="sell-docs" title="Documents" sub="PDF or image, up to 10 MB each.">
                {SLOTS.map((s) => (
                    <div key={s.key} className={cs.field}>
                        <label className={cs.label} htmlFor={`sell-${s.key}`}>
                            {s.label}
                            {s.required ? ' (required)' : ''}
                        </label>
                        <div className={bz.file}>
                            <input
                                id={`sell-${s.key}`}
                                type="file"
                                accept={ACCEPT}
                                disabled={pending}
                                onChange={(e) => pickFile(s.key, e.target.files?.[0] ?? null)}
                                aria-describedby={`sell-${s.key}-hint`}
                            />
                        </div>
                        <p className={cs.hint} id={`sell-${s.key}-hint`}>
                            {s.hint}
                        </p>
                        {files[s.key] ? (
                            <span className={bz.picked}>
                                <FileCheck size={16} strokeWidth={2} aria-hidden="true" />
                                Selected: {files[s.key]!.name} ({Math.round(files[s.key]!.size / 1024)} KB)
                            </span>
                        ) : null}
                    </div>
                ))}
            </FormSection>

            <FormSection id="sell-pay" title="Payouts" sub="Stripe Connect">
                <p className={cs.small} style={{ fontSize: 14.5 }}>
                    Payouts setup — coming soon. You’ll connect your bank through Stripe’s hosted onboarding once the payouts platform is live. Until then, approved sellers settle through Rollout’s interim process.
                </p>
            </FormSection>

            {error ? <Notice tone="bad" live>{error}</Notice> : null}
            {progress ? (
                <Notice live icon={<LoaderCircle size={20} strokeWidth={2} className="g-spin" aria-hidden="true" />}>
                    {progress}
                </Notice>
            ) : null}

            <div className={cs.form}>
                <div>
                    <GlideButton type="button" onClick={onSubmit} disabled={pending} aria-busy={pending}>
                        {pending ? 'Submitting…' : 'Submit application'}
                    </GlideButton>
                </div>
                <p className={bz.fine}>
                    <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
                    Documents are stored privately and only visible to Rollout reviewers. Rejected-application documents are purged after 90 days.
                </p>
            </div>
        </div>
    );
}
