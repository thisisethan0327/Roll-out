/**
 * The service form fields, shared by "Add service" and the inline edit row.
 * Same input names and defaults as before, so the FormData the server actions
 * read is unchanged. Server-safe (uncontrolled inputs, no hooks).
 */
import { Field } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { cx } from './parts';
import bz from './biz.module.css';

export type ServiceFieldValues = {
    name?: string;
    category?: string;
    subcategory?: string | null;
    base_price?: number | null;
    duration_hours?: number | null;
    sort_order?: number;
    description?: string | null;
    notes?: string | null;
    active?: boolean;
};

export function ServiceFields({ idp, v, isNew }: { idp: string; v?: ServiceFieldValues; isNew?: boolean }) {
    const inp = cx(cs.input, bz.in);
    return (
        <div className={cs.form}>
            <div className={bz.editGrid}>
                <Field label="Name" htmlFor={`${idp}-name`}>
                    <input id={`${idp}-name`} name="name" required defaultValue={v?.name} placeholder={isNew ? 'Full vehicle wrap' : undefined} className={inp} />
                </Field>
                <Field label="Category" htmlFor={`${idp}-cat`} hint={isNew ? 'Wrap, PPF, Tint, Ceramic, Parts or Other' : undefined}>
                    <input id={`${idp}-cat`} name="category" defaultValue={isNew ? 'OTHER' : v?.category} className={inp} />
                </Field>
                <Field label="Subcategory" htmlFor={`${idp}-sub`}>
                    <input id={`${idp}-sub`} name="subcategory" defaultValue={v?.subcategory ?? ''} placeholder={isNew ? 'Colour change' : undefined} className={inp} />
                </Field>
                <Field label="Base price" htmlFor={`${idp}-price`} hint={isNew ? 'Leave blank to ask for a quote' : undefined}>
                    <div className={cs.affix}>
                        <span aria-hidden="true">$</span>
                        <input id={`${idp}-price`} type="number" step="0.01" name="base_price" defaultValue={v?.base_price ?? ''} className={inp} />
                    </div>
                </Field>
                <Field label="Duration (hours)" htmlFor={`${idp}-dur`}>
                    <input id={`${idp}-dur`} type="number" step="0.5" name="duration_hours" defaultValue={v?.duration_hours ?? ''} className={inp} />
                </Field>
                <Field label="Sort order" htmlFor={`${idp}-sort`}>
                    <input id={`${idp}-sort`} type="number" name="sort_order" defaultValue={isNew ? '0' : v?.sort_order} className={inp} />
                </Field>
            </div>
            <Field label="Description" htmlFor={`${idp}-desc`}>
                <textarea id={`${idp}-desc`} name="description" rows={2} defaultValue={v?.description ?? ''} className={inp} />
            </Field>
            <Field label="Internal notes" htmlFor={`${idp}-notes`} hint="Not shown to customers.">
                <textarea id={`${idp}-notes`} name="notes" rows={2} defaultValue={v?.notes ?? ''} className={inp} />
            </Field>
            <label className={cs.check}>
                <input type="checkbox" name="active" defaultChecked={isNew ? true : v?.active} />
                Active
            </label>
        </div>
    );
}
