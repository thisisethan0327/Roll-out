'use client';
import { Printer } from 'lucide-react';

export function PrintButton() {
    return (
        <button className="g-btn g-btn--sm no-print" type="button" onClick={() => window.print()}>
            <span>Print or save PDF</span>
            <span className="g-btn-k" aria-hidden="true">
                <Printer size={18} strokeWidth={2} />
            </span>
        </button>
    );
}
