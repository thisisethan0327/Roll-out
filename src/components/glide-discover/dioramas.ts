/**
 * Isometric shop dioramas (GLIDE.md, "Isometric Garage and Shop").
 *
 * Only a shop that HAS its own cutaway gets one: the art carries the shop's
 * name on the wall, so it must never stand in for another business. Every
 * other shop keeps its own photo or logo until the per-shop cutaway round
 * (BUILD-PLAN phase 3) produces theirs. Mock-up grade imagery for now.
 *
 * Hotspots are percentage positions over the image (day and night art differ
 * by a hair), each pointing at a real section of the shop page.
 */
export type DioHotspot = {
    key: 'book' | 'store' | 'about' | 'posts';
    label: string;
    /** Accessible name: what the spot is in the picture and what it opens. */
    aria: string;
    day: [number, number];
    night?: [number, number];
};

export type Diorama = {
    day: string;
    night: string;
    altDay: string;
    altNight: string;
    hotspots: DioHotspot[];
};

const DIORAMAS: Record<string, Diorama> = {
    emwraps: {
        day: '/images/glide/dio-emwraps-day.webp',
        night: '/images/glide/dio-emwraps-night.webp',
        altDay: 'Isometric cutaway of the EMWRAPS shop in daylight: three cars in the bays, design desks and a plotter on the mezzanine, a parts shelf',
        altNight: 'The EMWRAPS shop cutaway at night',
        hotspots: [
            { key: 'book', label: 'Book a time', aria: 'Cars in the bays: book a time', day: [62, 63], night: [62, 64] },
            { key: 'about', label: 'About the shop', aria: 'Design desks: about the shop', day: [25.5, 33] },
            { key: 'posts', label: 'Recent posts', aria: 'Plotter: recent posts', day: [35, 27.5], night: [34.5, 28] },
            { key: 'store', label: 'Store', aria: 'Parts shelf: the store', day: [82.5, 54.5], night: [82.5, 55] },
        ],
    },
};

export function dioramaFor(slug: string | null | undefined): Diorama | null {
    return (slug && DIORAMAS[slug.toLowerCase()]) || null;
}
