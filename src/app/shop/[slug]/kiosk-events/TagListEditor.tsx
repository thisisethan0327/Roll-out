'use client';
import { useState } from 'react';

/**
 * Chip-list editor that serializes into a hidden input so the surrounding
 * <form> can stay a plain server-action form.
 *
 * mode 'plain'        → hidden value '["a","b"]'          (partners text[])
 * mode 'label-object' → hidden value '[{"label":"a"}, …]' (highlights jsonb)
 */
export function TagListEditor({
    initial,
    mode,
    hiddenInputName,
    placeholder,
    disabled,
}: {
    initial: string[];
    mode: 'plain' | 'label-object';
    hiddenInputName: string;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [items, setItems] = useState<string[]>(initial);
    const [draft, setDraft] = useState('');

    const serialized = JSON.stringify(
        mode === 'plain' ? items : items.map((label) => ({ label })),
    );

    const add = () => {
        const v = draft.trim();
        if (!v) return;
        if (items.includes(v)) {
            setDraft('');
            return;
        }
        setItems([...items, v]);
        setDraft('');
    };

    return (
        <div>
            <input type="hidden" name={hiddenInputName} value={serialized} />
            {items.length > 0 && (
                <div className="admin-chip-list">
                    {items.map((item, i) => (
                        <span key={`${i}-${item}`} className="admin-chip">
                            {item}
                            {!disabled && (
                                <button
                                    type="button"
                                    className="admin-chip-x"
                                    aria-label={`Remove ${item}`}
                                    onClick={() => setItems(items.filter((i) => i !== item))}
                                >
                                    ✕
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    className="admin-form-input"
                    style={{ flex: 1 }}
                    value={draft}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                />
                <button
                    type="button"
                    className="admin-action-btn"
                    disabled={disabled || !draft.trim()}
                    onClick={add}
                >
                    + ADD
                </button>
            </div>
        </div>
    );
}
