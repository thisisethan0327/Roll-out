'use client';
/**
 * TICKETS / DOOR LIST — shared by the shop console event page and the member
 * host page (/me/events/[id]). Pure display + a per-ticket CHECK IN button;
 * the server decides who may read the list or check anyone in (the RPCs), the
 * `checkIn` prop is a server action bound to the right guard by each page.
 *
 * The RPC returns confirmed tickets only, with no emails, no order id and no
 * check-in timestamp, so: orders are grouped by purchaser name, search covers
 * name / @handle / purchaser / size / spot, and checked-in rows show a badge
 * (plus the time for anyone checked in during this session).
 */
import { useMemo, useState, useTransition } from 'react';
import type { HostTicketRow } from '@/lib/event-tickets';
import { SWEATER_SIZES } from '@/lib/event-tickets-shared';

type CheckInResult = { ok: true; already: boolean; claimed: boolean } | { ok: false; error: string };

export function DoorList({
    rows,
    checkIn,
    canCheckIn = true,
}: {
    rows: HostTicketRow[];
    checkIn: (ticketId: string) => Promise<CheckInResult>;
    /** false for cancelled events: the RPC refuses, so don't offer the button. */
    canCheckIn?: boolean;
}) {
    const [q, setQ] = useState('');
    // ticketId -> ISO time of a check-in done in this browser session
    const [done, setDone] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [err, setErr] = useState<{ id: string; msg: string } | null>(null);
    const [, start] = useTransition();

    const isIn = (r: HostTicketRow) => r.checkedIn || r.ticketId in done;

    const tally = useMemo(() => {
        const t: Record<string, number> = {};
        for (const s of SWEATER_SIZES) t[s] = 0;
        let none = 0;
        for (const r of rows) {
            if (r.sweaterSize && r.sweaterSize in t) t[r.sweaterSize] += 1;
            else none += 1;
        }
        return { t, none };
    }, [rows]);

    const checkedCount = rows.filter(isIn).length;

    const groups = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const match = (r: HostTicketRow) =>
            !needle ||
            [r.attendeeName, r.attendeeHandle, r.buyerName, r.sweaterSize, r.spotNo != null ? `#${r.spotNo}` : '']
                .filter(Boolean)
                .some((s) => String(s).toLowerCase().includes(needle));
        const m = new Map<string, HostTicketRow[]>();
        for (const r of rows) {
            if (!match(r)) continue;
            const key = r.buyerName?.trim() || 'UNKNOWN BUYER';
            const list = m.get(key) ?? [];
            list.push(r);
            m.set(key, list);
        }
        for (const list of m.values()) list.sort((a, b) => a.seat - b.seat);
        return [...m.entries()];
    }, [rows, q]);

    const onCheckIn = (r: HostTicketRow) => {
        setErr(null);
        setBusy(r.ticketId);
        start(async () => {
            try {
                const res = await checkIn(r.ticketId);
                if (res.ok) setDone((d) => ({ ...d, [r.ticketId]: new Date().toISOString() }));
                else setErr({ id: r.ticketId, msg: res.error });
            } catch {
                setErr({ id: r.ticketId, msg: 'Something went wrong. Try again in a moment.' });
            } finally {
                setBusy(null);
            }
        });
    };

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <div className="admin-stat-grid" style={{ marginBottom: 0 }}>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">CHECKED IN</div>
                    <div className={`admin-stat-num ${checkedCount > 0 ? 'gold' : ''}`}>
                        {checkedCount} / {rows.length}
                    </div>
                </div>
                {SWEATER_SIZES.map((s) => (
                    <div className="admin-stat" key={s}>
                        <div className="admin-stat-lbl">SWEATER {s}</div>
                        <div className="admin-stat-num">{tally.t[s]}</div>
                    </div>
                ))}
                {tally.none > 0 && (
                    <div className="admin-stat">
                        <div className="admin-stat-lbl">NO SIZE</div>
                        <div className="admin-stat-num warn">{tally.none}</div>
                    </div>
                )}
            </div>

            <input
                className="admin-form-input"
                type="search"
                placeholder="Search name, @handle, purchaser, size or spot #"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search the door list"
                autoComplete="off"
                style={{ fontSize: 16 }}
            />

            {rows.length === 0 ? (
                <div className="admin-empty">NO CONFIRMED TICKETS YET.</div>
            ) : groups.length === 0 ? (
                <div className="admin-empty">NO TICKETS MATCH “{q.trim()}”.</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>SEAT</th>
                                <th>ATTENDEE</th>
                                <th>SIZE</th>
                                <th>SPOT</th>
                                <th>STATUS</th>
                                <th style={{ textAlign: 'right' }}>DOOR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(([buyer, list]) => (
                                <GroupRows
                                    key={buyer}
                                    buyer={buyer}
                                    list={list}
                                    isIn={isIn}
                                    done={done}
                                    busy={busy}
                                    err={err}
                                    canCheckIn={canCheckIn}
                                    onCheckIn={onCheckIn}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function GroupRows({
    buyer,
    list,
    isIn,
    done,
    busy,
    err,
    canCheckIn,
    onCheckIn,
}: {
    buyer: string;
    list: HostTicketRow[];
    isIn: (r: HostTicketRow) => boolean;
    done: Record<string, string>;
    busy: string | null;
    err: { id: string; msg: string } | null;
    canCheckIn: boolean;
    onCheckIn: (r: HostTicketRow) => void;
}) {
    return (
        <>
            <tr>
                <td colSpan={6} style={{ background: 'var(--bg-1)' }}>
                    <span style={{ letterSpacing: 1.5, fontSize: 11 }}>
                        ORDER · {buyer.toUpperCase()} · {list.length} {list.length === 1 ? 'TICKET' : 'TICKETS'}
                    </span>
                </td>
            </tr>
            {list.map((r) => {
                const checked = isIn(r);
                const at = done[r.ticketId];
                return (
                    <tr key={r.ticketId}>
                        <td>{r.seat}</td>
                        <td>
                            <div>{r.attendeeName || '—'}</div>
                            <div className="admin-handle">
                                {r.claimed && r.attendeeHandle ? `@${r.attendeeHandle}` : r.claimed ? 'ROLLOUT MEMBER' : 'NOT CLAIMED'}
                            </div>
                        </td>
                        <td>{r.sweaterSize ?? '—'}</td>
                        <td>{r.spotNo != null ? `#${r.spotNo}` : '—'}</td>
                        <td>
                            {checked ? (
                                <span className="admin-pill neon">
                                    CHECKED IN
                                    {at
                                        ? ` · ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                                        : ''}
                                </span>
                            ) : (
                                <span className="admin-pill">CONFIRMED</span>
                            )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                            {!checked && canCheckIn && (
                                <button
                                    type="button"
                                    className="admin-action-btn"
                                    disabled={busy !== null}
                                    onClick={() => onCheckIn(r)}
                                >
                                    {busy === r.ticketId ? 'CHECKING IN…' : 'CHECK IN'}
                                </button>
                            )}
                            {err?.id === r.ticketId && (
                                <div style={{ color: 'var(--warn)', fontSize: 12, marginTop: 4 }}>{err.msg}</div>
                            )}
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
