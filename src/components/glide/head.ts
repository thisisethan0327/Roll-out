import type { ReactNode } from 'react';

/**
 * The line under a heading (`sub` on AdminHead, SectionHead, ConsoleHead,
 * CardHead, FormSection, PageHead and Panel). **Data only**: a count, a
 * date or range, a handle, the shop's name, a status ("12 shown · 40 total",
 * "Night Run 12 · Nov 8", "Sent as @ana").
 *
 * Not a description. A sub a sighted person could guess from the title is
 * noise; leave it out. A standing rule goes in an `InfoTip` beside the title.
 * Keep only money, privacy or security facts and "this is sent to someone"
 * (Documents/CLAUDE.md §12, "UI copy: let the layout explain").
 */
export type HeadSub = ReactNode;
