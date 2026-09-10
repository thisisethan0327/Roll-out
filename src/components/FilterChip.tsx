import Link from 'next/link';

/**
 * A filter pill (Copper Map, 6F .chip). One definition — /meets and /store each
 * carried their own square, 35px-tall copy (run R12 R6 #7: sub-44 targets).
 * Height 40 with the row's 8px gap gives a full 44px hit band.
 */
export function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
    return (
        <Link href={href} className={`chip chip-nav${active ? ' chip-on' : ''}`} aria-current={active ? 'page' : undefined}>
            {label}
        </Link>
    );
}
