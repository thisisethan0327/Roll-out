'use client';

export function PrintButton() {
    return (
        <button className="admin-form-btn no-print" type="button" onClick={() => window.print()}>
            PRINT / SAVE PDF
        </button>
    );
}
