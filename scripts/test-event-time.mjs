/**
 * event-time.ts, against the cases that actually break this kind of code.
 * The invariant that matters: wall -> instant -> wall is lossless in ANY zone,
 * because that is what stops an edit from moving the meet.
 */
import fs from 'fs'
const tsMod = await import('file:///C:/Users/Ethanc/Documents/rollout/web/node_modules/typescript/lib/typescript.js')
const ts = tsMod.default ?? tsMod
const src = fs.readFileSync('C:/Users/Ethanc/Documents/rollout/web/src/lib/event-time.ts', 'utf8')
const js = ts.transpileModule(src.replace(/^export /gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText
const { zonedWallClockToUtc, utcToZonedWallClock, resolveFormZone, isValidTimeZone } =
  new Function(js + '\nreturn { zonedWallClockToUtc, utcToZonedWallClock, resolveFormZone, isValidTimeZone };')()

const r = []
const check = (n, ok, d = '') => { r.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? ' — ' + d : '')) }

// 1. The exact case from the run: 11:00 AM in Los Angeles is 18:00Z, not 11:00Z.
const la = zonedWallClockToUtc('2026-09-12T11:00', 'America/Los_Angeles')
check('11:00 in LA (PDT) -> 18:00Z', la.toISOString() === '2026-09-12T18:00:00.000Z', la.toISOString())

// 2. And back again — the round trip that was moving the meet.
check('...and back to 11:00', utcToZonedWallClock(la, 'America/Los_Angeles') === '2026-09-12T11:00',
  utcToZonedWallClock(la, 'America/Los_Angeles'))

// 3. Winter, same zone: PST is UTC-8, so the offset must CHANGE.
const win = zonedWallClockToUtc('2026-01-15T11:00', 'America/Los_Angeles')
check('11:00 in LA in January (PST) -> 19:00Z', win.toISOString() === '2026-01-15T19:00:00.000Z', win.toISOString())

// 4. DST SPRING FORWARD — 02:30 on 2026-03-08 does not exist in LA.
//    It must not throw and must not come back as a different wall clock silently.
const spring = zonedWallClockToUtc('2026-03-08T02:30', 'America/Los_Angeles')
check('a nonexistent spring-forward time still yields an instant', spring instanceof Date && !isNaN(spring),
  spring ? spring.toISOString() : 'null')

// 5. DST FALL BACK — 01:30 on 2026-11-01 happens twice in LA. One of the two is fine;
//    what matters is that it round-trips to the same wall clock.
const fall = zonedWallClockToUtc('2026-11-01T01:30', 'America/Los_Angeles')
check('an ambiguous fall-back time round-trips to itself',
  utcToZonedWallClock(fall, 'America/Los_Angeles') === '2026-11-01T01:30',
  utcToZonedWallClock(fall, 'America/Los_Angeles'))

// 6. The invariant, swept across zones and dates.
const zones = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kolkata', 'UTC']
let bad = []
for (const z of zones) {
  for (let day = 1; day <= 365; day += 7) {
    const d = new Date(Date.UTC(2026, 0, day, 0, 0))
    const wall = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T14:45`
    const inst = zonedWallClockToUtc(wall, z)
    const back = utcToZonedWallClock(inst, z)
    if (back !== wall) bad.push(z + ' ' + wall + ' -> ' + back)
  }
}
check('wall -> instant -> wall is lossless across 7 zones x 53 dates', bad.length === 0,
  bad.length ? bad.slice(0,3).join(' | ') : '371 round trips')

// 7. Half-hour and 45-minute zones, where naive offset maths goes wrong.
const kol = zonedWallClockToUtc('2026-09-12T11:00', 'Asia/Kolkata')
check('Kolkata is UTC+5:30, not +5 or +6', kol.toISOString() === '2026-09-12T05:30:00.000Z', kol.toISOString())
const kat = zonedWallClockToUtc('2026-09-12T11:00', 'Asia/Kathmandu')
check('Kathmandu is UTC+5:45', kat.toISOString() === '2026-09-12T05:15:00.000Z', kat.toISOString())

// 8. Bad input must be refused, not turned into an Invalid Date that stores null.
check('junk wall clock -> null', zonedWallClockToUtc('not-a-date', 'UTC') === null)
check('empty -> null', zonedWallClockToUtc('', 'UTC') === null)
check('a bogus zone falls back rather than throwing',
  zonedWallClockToUtc('2026-09-12T11:00', 'Mars/Olympus')?.toISOString() === '2026-09-12T11:00:00.000Z')
check('resolveFormZone reports a missing zone', resolveFormZone(undefined).supplied === false
  && resolveFormZone(undefined).timeZone === 'UTC')
check('resolveFormZone accepts a real one', resolveFormZone('Europe/Berlin').supplied === true)
check('isValidTimeZone rejects nonsense', !isValidTimeZone('Nowhere/Nothing') && isValidTimeZone('UTC'))

// 9. The OLD behaviour, for the record: this is what shipped.
console.log('\n  for the record — old write path, zoneless parse on a UTC server:')
console.log('    new Date("2026-09-12T11:00") = ' + new Date('2026-09-12T11:00').toISOString() + '  (TZ=' + (process.env.TZ ?? 'system') + ')')

console.log('\n' + r.filter(Boolean).length + '/' + r.length + ' passed')
process.exit(r.every(Boolean) ? 0 : 2)
