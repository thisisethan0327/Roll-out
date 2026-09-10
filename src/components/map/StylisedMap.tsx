'use client';

/**
 * The drawn map — UI polish §6, ported from the cancelled restyle's 6F mockup
 * (rollout/docs/restyle/mockups/d6f.html) into the night-drive system: gold
 * #ffb733 on black. Land polygons, ribbons, a water grid, labels, shop pins,
 * meet pins, and the _NAC Run route (Seattle → Mukilteo ferry → Clinton →
 * Whidbey) drawn on scroll with a dot on the path.
 *
 * Props:
 *   crop    which viewBox — 'hero' (1440×660, full), 'phone' (the corridor,
 *           portrait), 'loc' (event location, desktop), 'loc-p' (its phone)
 *   route   draw the route (only for an event that runs it — lib/map-sites)
 *   pins    meet pins in viewBox units (snapped sites), `hi` = the featured one
 *   shops   shop pins in viewBox units
 *
 * Motion (gsap, inside a context reverted on unmount): pins bloom in with a
 * random stagger when the map enters, the route + halo draw and the dot rides
 * the path (MotionPath), once. Under reduced motion park(): pins on, route
 * drawn, dot at the end — the same end state, without the journey. Gradient
 * and filter ids are prefixed with useId so several maps can share a page.
 */
import { useEffect, useId, useRef } from 'react';
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion/gsap';

export type MapCrop = 'hero' | 'phone' | 'loc' | 'loc-p';
const VIEW: Record<MapCrop, string> = {
    hero: '0 0 1440 660',
    phone: '560 0 460 660',
    loc: '250 70 1000 425',
    'loc-p': '530 130 560 364',
};

export type MapPin = { x: number; y: number; hi?: boolean; label?: string };

const ROUTE_D = 'M940 462 C928 428, 916 396, 902 364 C890 336, 878 314, 862 298 C810 294, 752 292, 700 300 C678 272, 654 240, 630 210 C618 196, 606 182, 596 168';

export function StylisedMap({
    crop = 'hero',
    route = false,
    pins = [],
    shops = [],
    hideLabels = [],
    className,
}: {
    crop?: MapCrop;
    route?: boolean;
    pins?: MapPin[];
    shops?: MapPin[];
    /** City labels to skip — the ones a popover would sit on. */
    hideLabels?: ('everett' | 'mukilteo' | 'clinton' | 'whidbey' | 'tacoma' | 'bainbridge' | 'redmond')[];
    className?: string;
}) {
    const hide = new Set<string>(hideLabels);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const id = (n: string) => `${n}-${uid}`;
    const ref = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const svg = ref.current;
        if (!svg) return;
        const routeEl = svg.querySelector<SVGPathElement>('.route');
        const halo = svg.querySelector<SVGPathElement>('.route-halo');
        const dot = svg.querySelector<SVGCircleElement>('.route-dot');
        const dotH = svg.querySelector<SVGCircleElement>('.route-dot-h');
        const pinEls = Array.from(svg.querySelectorAll<SVGGElement>('.pin'));
        const blooms = Array.from(svg.querySelectorAll<SVGCircleElement>('.pin-bloom'));

        const park = () => {
            pinEls.forEach((p) => {
                p.style.opacity = '1';
                p.style.transform = 'none';
            });
            blooms.forEach((b) => {
                b.style.opacity = '0';
            });
            [routeEl, halo].forEach((p) => {
                if (!p) return;
                p.style.strokeDasharray = 'none';
                p.style.strokeDashoffset = '0';
                p.style.opacity = '1';
            });
            if (routeEl && dot) {
                const pt = routeEl.getPointAtLength(routeEl.getTotalLength());
                [dot, dotH].forEach((c) => {
                    if (!c) return;
                    c.setAttribute('cx', String(pt.x));
                    c.setAttribute('cy', String(pt.y));
                    c.style.opacity = '1';
                    c.style.transform = 'none';
                });
            }
        };

        if (prefersReducedMotion()) {
            park();
            return;
        }

        const ctx = gsap.context(() => {
            gsap.set(pinEls, { opacity: 0, scale: 0, transformOrigin: '50% 50%' });
            ScrollTrigger.create({
                trigger: svg,
                start: 'top 82%',
                once: true,
                onEnter: () => {
                    gsap.to(pinEls, { opacity: 1, scale: 1, duration: 0.62, ease: 'back.out(2.2)', stagger: { each: 0.07, from: 'random' } });
                    gsap.fromTo(
                        blooms,
                        { opacity: 0.85, scale: 1 },
                        { opacity: 0, scale: 2.8, duration: 1.5, ease: 'power2.out', delay: 0.2, transformOrigin: '50% 50%', stagger: { each: 0.07, from: 'random' } },
                    );
                },
            });
            if (!routeEl) return;
            const L = routeEl.getTotalLength();
            [routeEl, halo].forEach((p) => {
                if (!p) return;
                p.style.strokeDasharray = `${L} ${L}`;
                p.style.strokeDashoffset = String(L);
            });
            gsap.set([dot, dotH].filter(Boolean), { opacity: 0 });
            gsap.timeline({ scrollTrigger: { trigger: svg, start: 'top 76%', end: 'bottom 58%', scrub: 0.7 } })
                .to([routeEl, halo].filter(Boolean), { strokeDashoffset: 0, ease: 'none', duration: 1 }, 0)
                .to([dot, dotH].filter(Boolean), { opacity: 1, duration: 0.06 }, 0)
                .to([dot, dotH].filter(Boolean), { motionPath: { path: routeEl, align: routeEl, alignOrigin: [0.5, 0.5] }, ease: 'none', duration: 1 }, 0);
        }, svg);
        return () => ctx.revert();
    }, [route, pins.length, shops.length]);

    const loc = crop.startsWith('loc');
    return (
        <svg
            ref={ref}
            className={`stylised-map${className ? ' ' + className : ''}`}
            viewBox={VIEW[crop]}
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label={route ? 'Drawn map of the route from The Shop Club to Whidbey Island via the Mukilteo ferry' : 'Drawn map of the meets and shops around Puget Sound'}
        >
            <defs>
                <radialGradient id={id('pglow')} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffb733" stopOpacity=".62" />
                    <stop offset="45%" stopColor="#ffb733" stopOpacity=".19" />
                    <stop offset="100%" stopColor="#ffb733" stopOpacity="0" />
                </radialGradient>
                <radialGradient id={id('wglow')} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity=".34" />
                    <stop offset="45%" stopColor="#ffffff" stopOpacity=".11" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={id('water')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0b0b0d" />
                    <stop offset="100%" stopColor="#050505" />
                </linearGradient>
                <radialGradient id={id('emb')} cx="54%" cy="44%" r="44%">
                    <stop offset="0%" stopColor="#ffb733" stopOpacity=".10" />
                    <stop offset="100%" stopColor="#ffb733" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={id('rgrad')} x1="1" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#ffb733" stopOpacity=".74" />
                    <stop offset="100%" stopColor="#ffd98a" />
                </linearGradient>
                <filter id={id('rglow')} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="4" result="b" />
                    <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <rect x="-200" y="-200" width="1840" height="1060" fill={`url(#${id('water')})`} />
            <rect x="-200" y="-200" width="1840" height="1060" fill={`url(#${id('emb')})`} />
            <g className="map-grid">
                <path d="M0 90H1440M0 210H1440M0 330H1440M0 450H1440M0 570H1440" />
                <path d="M120 0V660M280 0V660M440 0V660M600 0V660M760 0V660M920 0V660M1080 0V660M1240 0V660" />
            </g>
            <path className="land" d="M-20 -20 L300 -20 L336 60 L322 150 L358 236 L336 322 L296 396 L318 482 L276 566 L300 680 L-20 680 Z" />
            <path className="land" d="M1460 -20 L1460 680 L980 680 L962 620 L946 560 L934 512 L912 486 L906 452 L926 432 L918 402 L896 386 L884 352 L870 322 L858 296 L836 292 L820 262 L800 236 L806 206 L792 178 L800 146 L786 112 L800 74 L788 30 L802 -20 Z" />
            <g className="ribbon-e">
                <path style={{ strokeWidth: 90.5 }} d="M452 250 C470 320, 448 380, 470 440 C492 500, 470 560, 496 646" />
                <path style={{ strokeWidth: 36.5 }} d="M700 300 C676 262, 652 226, 626 196 C600 166, 574 138, 540 112" />
                <path style={{ strokeWidth: 28.5 }} d="M772 246 C760 214, 754 188, 760 158" />
                <path style={{ strokeWidth: 48.5 }} d="M634 402 C644 432, 630 462, 644 494" />
                <path style={{ strokeWidth: 42.5 }} d="M700 560 C706 586, 698 612, 710 646" />
            </g>
            <g>
                <path className="ribbon" style={{ strokeWidth: 88 }} d="M452 250 C470 320, 448 380, 470 440 C492 500, 470 560, 496 646" />
                <path className="ribbon" style={{ strokeWidth: 34 }} d="M700 300 C676 262, 652 226, 626 196 C600 166, 574 138, 540 112" />
                <path className="ribbon" style={{ strokeWidth: 26 }} d="M772 246 C760 214, 754 188, 760 158" />
                <path className="ribbon" style={{ strokeWidth: 46 }} d="M634 402 C644 432, 630 462, 644 494" />
                <path className="ribbon" style={{ strokeWidth: 40 }} d="M700 560 C706 586, 698 612, 710 646" />
            </g>

            {route ? (
                <>
                    <path className="route-halo" d={ROUTE_D} />
                    <path className="route" stroke={`url(#${id('rgrad')})`} filter={`url(#${id('rglow')})`} d={ROUTE_D} />
                    <circle className="route-dot-h" r="11" cx="940" cy="462" />
                    <circle className="route-dot" r="4.5" cx="940" cy="462" />
                    <text className="ferry-lab" x="744" y="336" textAnchor="middle">
                        Ferry · 20 min
                    </text>
                </>
            ) : null}

            {shops.map((p, i) => (
                <g className="pin pin-shop" key={`s${i}`}>
                    <circle className="pin-glow" fill={`url(#${id('wglow')})`} cx={p.x} cy={p.y} r="26" />
                    <circle className="pin-ring" cx={p.x} cy={p.y} r="10" />
                    <circle className="pin-core" cx={p.x} cy={p.y} r="3.6" />
                </g>
            ))}
            {pins.map((p, i) => (
                <g className="pin" key={`m${i}`}>
                    <circle className="pin-bloom" cx={p.x} cy={p.y} r="14" />
                    <circle className="pin-glow" fill={`url(#${id('pglow')})`} cx={p.x} cy={p.y} r={p.hi ? 34 : 30} />
                    <circle className="pin-ring" cx={p.x} cy={p.y} r={p.hi ? 12 : 11} />
                    <circle className="pin-core" cx={p.x} cy={p.y} r={p.hi ? 5 : 4.4} />
                </g>
            ))}

            <text className="pin-lab pin-lab-hi" x="958" y="466">{loc ? 'The Shop Club' : 'Seattle'}</text>
            {!hide.has('everett') ? <text className="pin-lab" x="904" y="260">Everett</text> : null}
            {!hide.has('mukilteo') ? <text className="pin-lab" x="788" y="282" textAnchor="end">Mukilteo</text> : null}
            {!hide.has('clinton') ? <text className="pin-lab" x="684" y="322" textAnchor="end">Clinton</text> : null}
            {!hide.has('whidbey') ? <text className="pin-lab pin-lab-hi" x="612" y="158">Whidbey Island</text> : null}
            {!hide.has('tacoma') ? <text className="pin-lab pin-lab-edge" x="978" y="608">Tacoma</text> : null}
            {!hide.has('bainbridge') ? <text className="pin-lab pin-lab-edge" x="660" y="452">Bainbridge</text> : null}
            {!hide.has('redmond') ? <text className="pin-lab pin-lab-edge" x="1064" y="396" textAnchor="end">Redmond</text> : null}
        </svg>
    );
}
