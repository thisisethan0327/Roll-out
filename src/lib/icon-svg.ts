// Lucide icons as static SVG markup, for HTML strings built outside React
// (Leaflet popups and DOM map markers). Same paths as lucide-react, sized
// to 1em so they match the text they sit in.

const NODES = {
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'map-pin':
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
} as const;

export type SvgIconName = keyof typeof NODES;

export function svgIcon(name: SvgIconName, opts: { fill?: boolean; size?: string } = {}): string {
  const size = opts.size ?? '1em';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="${opts.fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}" aria-hidden="true">` +
    NODES[name] +
    '</svg>'
  );
}

/** '★★★☆☆' as SVG markup. */
export function svgStars(rating: number, max = 5): string {
  const r = Math.max(0, Math.min(max, Math.round(rating)));
  let out = '';
  for (let i = 0; i < max; i++) out += svgIcon('star', { fill: i < r });
  return `<span class="icon-stars" role="img" aria-label="${r} out of ${max} stars">${out}</span>`;
}
