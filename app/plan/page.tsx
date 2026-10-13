import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, gte, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workouts, metricSamples } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Run plan",
  robots: { index: false, follow: false },
};

/* ---------------- plan data (miles) ---------------- */
const PHASES = ["Foundation", "10K build", "Reset", "Half build", "Peak", "Taper and race"];
type Wk = { ph: number; mon: string; tue: string; wed: string; thu: string; fri: string; mi: number; race?: string };
const PLAN: Wk[] = ([
[0, "Run 1 min / walk 2 min × 8 (24 min)", "Rest, or a 20–30 min brisk walk", "Run 1 min / walk 2 min × 6 (18 min)", "Run 1 min / walk 2 min × 8 (24 min)", "Run 1 min / walk 2 min × 10 (30 min)", 5.3, ""],
[0, "Run 2 / walk 2 × 6 (24 min)", "Rest, or a 20–30 min brisk walk", "Run 2 / walk 2 × 5 (20 min)", "Run 2 / walk 2 × 6 (24 min)", "Run 2 / walk 2 × 8 (32 min)", 6.2, ""],
[0, "Run 3 / walk 2 × 5 (25 min)", "Rest, or a 20–30 min brisk walk", "Run 3 / walk 2 × 4 (20 min)", "Run 3 / walk 2 × 5 (25 min)", "Run 3 / walk 2 × 6 (30 min)", 6.2, ""],
[0, "Run 5 / walk 2 × 4 (28 min)", "Rest, or a 20–30 min brisk walk", "Run 5 / walk 2 × 3 (21 min)", "Run 5 / walk 2 × 4 (28 min)", "Run 5 / walk 2 × 5 (35 min)", 6.9, ""],
[0, "Run 8 / walk 2 × 3 (30 min)", "Rest, or a 20–30 min brisk walk", "Run 8 / walk 2 × 2 (20 min)", "Run 8 / walk 2 × 3 (30 min)", "Run 10 / walk 2 × 3 (36 min)", 7.5, ""],
[0, "Run 15 / walk 1 × 2 (32 min)", "Rest, or a 20–30 min brisk walk", "Run 15 min non-stop, easy", "Run 20 min non-stop, easy", "Run 30 min non-stop, easy. Milestone.", 8.2, ""],
[1, "2.2 mi easy", "Optional 5th run: 1.9 mi easy", "1.5 mi easy", "2.2 mi easy + 4 × 20 sec strides", "3.1 mi easy", 9.0, ""],
[1, "2.5 mi easy", "Optional 5th run: 1.9 mi easy", "1.8 mi easy", "2.5 mi with 6 × 1 min steady (RPE 6), 2 min easy jog between", "3.7 mi easy", 10.5, ""],
[1, "2.5 mi easy", "Optional 5th run: 1.9 mi easy", "1.8 mi easy", "2.5 mi with 6 × 90 sec steady, 90 sec easy between", "4.3 mi easy", 11.1, ""],
[1, "1.9 mi easy", "Optional 5th run: 1.9 mi easy", "1.3 mi easy", "2.2 mi easy + 4 strides", "3.1 mi easy", 8.4, ""],
[1, "2.5 mi easy", "Optional 5th run: 1.9 mi easy", "1.8 mi easy", "2.5 mi with 10 min tempo in the middle (RPE 6 to 7)", "5 mi easy. Longest run yet.", 11.7, ""],
[1, "1.9 mi easy", "Optional 5th run: 1.9 mi easy", "1.3 mi easy", "1.9 mi easy + 4 strides (keep it short)", "10K race or solo time trial. Friday, or move to the weekend.", 11.2, "10K"],
[2, "1.9 mi easy", "Optional 5th run: 1.9 mi easy", "1.3 mi easy", "1.9 mi easy", "3.1 mi easy", 8.1, ""],
[3, "3.1 mi easy", "Optional 5th run: 2.5 mi easy", "2.2 mi easy", "3.1 mi with 6 × 2 min steady, 2 min easy between", "5 mi easy", 13.4, ""],
[3, "3.1 mi easy", "Optional 5th run: 2.5 mi easy", "2.2 mi easy", "3.1 mi with 10 min tempo", "6.2 mi easy", 14.6, ""],
[3, "3.7 mi easy", "Optional 5th run: 2.5 mi easy", "2.6 mi easy", "3.7 mi with 15 min tempo", "7.5 mi easy", 17.5, ""],
[3, "3.1 mi easy", "Optional 5th run: 2.5 mi easy", "2.2 mi easy", "3.1 mi easy + 4 strides", "5.6 mi easy", 14.0, ""],
[3, "3.7 mi easy", "Optional 5th run: 2.5 mi easy", "2.6 mi easy", "3.7 mi with 2 × 10 min tempo, 3 min easy between", "8.1 mi easy", 18.1, ""],
[3, "3.7 mi easy", "Optional 5th run: 2.5 mi easy", "2.6 mi easy", "3.7 mi with 5 × 3 min at RPE 7, 2 min jog between", "9.3 mi easy", 19.4, ""],
[4, "3.1 mi easy", "Optional 5th run: 2.5 mi easy", "2.2 mi easy", "3.1 mi easy + 4 strides", "6.8 mi easy", 15.2, ""],
[4, "4.3 mi easy", "Optional 5th run: 2.5 mi easy", "3 mi easy", "4.3 mi with 20 min tempo", "9.9 mi easy", 21.6, ""],
[4, "4.3 mi easy", "Optional 5th run: 2.5 mi easy", "3 mi easy", "3.7 mi progression: last 1.2 mi at RPE 6", "11.2 mi easy. Longest run of the plan.", 22.3, ""],
[5, "3.1 mi easy", "Rest", "2.2 mi easy", "3.1 mi with 10 min tempo", "6.2 mi easy", 14.6, ""],
[5, "1.9 mi easy", "Rest", "1.3 mi easy", "1.2 mi easy + 4 strides (shakeout)", "HALF MARATHON, 13.1 mi. Weekend is ideal, Friday works.", 17.5, "HALF"]
] as [number,string,string,string,string,string,number,string][]).map(([ph,mon,tue,wed,thu,fri,mi,race])=>({ph,mon,tue,wed,thu,fri,mi,race:race||undefined}));

/* ---------------- auth ---------------- */
function expectedToken(): string | null {
  const pw = process.env.PLAN_PASSWORD;
  const secret = process.env.MCP_SECRET;
  if (!pw || !secret) return null;
  return createHmac("sha256", secret).update("plan-dashboard:" + pw).digest("hex");
}
function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "");
  const expected = process.env.PLAN_PASSWORD ?? "";
  const token = expectedToken();
  await new Promise((r) => setTimeout(r, 700));
  if (!token || !expected || !safeEq(pw, expected)) redirect("/plan?e=1");
  const jar = await cookies();
  jar.set("plan_auth", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/plan", maxAge: 60 * 60 * 24 * 30 });
  redirect("/plan");
}

/* ---------------- settings ---------------- */
// Age 40-49 -> estimated max HR (Tanaka: 208 - 0.7 x 45). Balanced adaptation.
const HR_MAX = 176;
const ZONES = [
  { z: "Z1 Recovery", lo: 0.5, hi: 0.6 },
  { z: "Z2 Easy", lo: 0.6, hi: 0.7 },
  { z: "Z3 Steady", lo: 0.7, hi: 0.8 },
  { z: "Z4 Tempo", lo: 0.8, hi: 0.9 },
  { z: "Z5 Hard", lo: 0.9, hi: 1.0 },
];
const EASY_CAP = Math.round(HR_MAX * 0.74); // easy runs should stay under ~130 bpm
const HR_VALID_MIN = 90; // treadmill grip readings below this during a run are ignored

/* ---------------- date helpers ---------------- */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validTz = (tz: string) => {
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return true; } catch { return false; }
};
const ymd = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
const utc = (s: string) => Date.parse(s + "T00:00:00Z");
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 864e5);
const addDays = (s: string, n: number) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
const monday = (s: string) => addDays(s, -((new Date(utc(s)).getUTCDay() + 6) % 7));
const nice = (s: string) => new Date(utc(s)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const niceDow = (s: string) => new Date(utc(s)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const KEYS = ["mon", "tue", "wed", "thu", "fri"] as const;

/* ---------------- activities ---------------- */
type Row = typeof workouts.$inferSelect;
type Kind = "run" | "walk" | "strength" | "other";
type Act = { id: string; name: string; start: Date; day: string; mi: number; min: number; avgHr: number | null; maxHr: number | null; kind: Kind };
const num = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
function kindOf(name: string): Kind {
  if (/walk|hik/i.test(name)) return "walk";
  if (/run|jog|treadmill/i.test(name)) return "run";
  if (/strength|weight|dumbbell|resistance|functional|core/i.test(name)) return "strength";
  return "other";
}
function toMiles(d: number | null, units: string | null): number {
  if (!d) return 0;
  const u = (units ?? "").toLowerCase();
  if (u.startsWith("mi")) return d;
  if (u === "m" || u.startsWith("meter")) return d / 1609.344;
  return d * 0.621371;
}
function toActs(rows: Row[], tz: string): Act[] {
  const seen = new Map<string, Act>();
  for (const w of rows) {
    if (!w.start) continue;
    const name = w.name ?? "Workout";
    const a: Act = {
      id: w.id, name, start: w.start, day: ymd(w.start, tz),
      mi: toMiles(num(w.distance), w.distanceUnits), min: (num(w.durationS) ?? 0) / 60,
      avgHr: num(w.avgHr), maxHr: num(w.maxHr), kind: kindOf(name),
    };
    // The same session often arrives twice (iFit + Health). Keep one, preferring the one with heart rate.
    const key = a.kind + "|" + Math.floor(a.start.getTime() / 60000) + "|" + a.mi.toFixed(1);
    const prev = seen.get(key);
    if (!prev || (!prev.avgHr && a.avgHr)) seen.set(key, a);
  }
  return [...seen.values()].sort((x, y) => y.start.getTime() - x.start.getTime());
}
const pace = (a: Act) => {
  if (a.mi < 0.05 || a.min <= 0) return "";
  const p = a.min / a.mi; let m = Math.floor(p), s = Math.round((p - m) * 60); if (s === 60) { m++; s = 0; }
  return m + ":" + String(s).padStart(2, "0") + " /mi";
};
const mph = (a: Act) => (a.min > 0 ? a.mi / (a.min / 60) : 0);
const fmtMin = (m: number) => (m >= 60 ? Math.floor(m / 60) + "h " + Math.round(m % 60) + "m" : Math.round(m) + " min");
const hrOk = (a: Act) => a.avgHr != null && (a.kind !== "run" || a.avgHr >= HR_VALID_MIN);
const zoneOf = (bpm: number) => {
  const f = bpm / HR_MAX;
  const z = ZONES.find((x) => f < x.hi) ?? ZONES[ZONES.length - 1];
  return f < 0.5 ? "Below Z1" : z.z;
};

/* ---------------- adaptive engine ---------------- */
function plannedLong(p: Wk): { mi?: number; min?: number } {
  const m = p.fri.match(/(\d+(?:\.\d+)?) mi\b/);
  if (m) return { mi: Number(m[1]) };
  const t = p.fri.match(/\((\d+) min\)/) ?? p.fri.match(/(\d+) min non-stop/);
  return t ? { min: Number(t[1]) } : {};
}
type Step = { weekStart: string; idx: number; miles: number; runs: number; longOk: boolean; hrHigh: boolean; score: number; action: "advance" | "repeat" | "back"; reason: string };
function adapt(acts: Act[], startMon: string, startIdx: number, curMon: string) {
  let idx = startIdx;
  const log: Step[] = [];
  for (let ws = startMon; daysBetween(ws, curMon) > 0; ws = addDays(ws, 7)) {
    const runs = acts.filter((a) => a.kind === "run" && daysBetween(ws, a.day) >= 0 && daysBetween(ws, a.day) < 7);
    const p = PLAN[idx];
    const miles = runs.reduce((s, a) => s + a.mi, 0);
    const score = 0.5 * Math.min(1, miles / p.mi) + 0.5 * Math.min(1, runs.length / 4);
    const L = plannedLong(p);
    const longOk = L.mi ? runs.some((a) => a.mi >= 0.8 * L.mi!) : L.min ? runs.some((a) => a.min >= 0.8 * L.min!) : true;
    const valid = runs.filter((a) => hrOk(a));
    const hrHigh = valid.length >= 2 && valid.filter((a) => a.avgHr! > EASY_CAP).length > valid.length / 2;
    let action: Step["action"]; let reason: string;
    if (runs.length === 0) { action = "back"; reason = "No runs logged. Easing back in."; }
    else if (score >= 0.85 && longOk && !hrHigh) { action = "advance"; reason = "Week completed."; }
    else if (score >= 0.6) {
      action = "repeat";
      reason = hrHigh ? "Easy runs ran hot (HR above " + EASY_CAP + "). Repeat and slow down." : !longOk ? "Long run came up short. Repeat the week." : "Most of the week done. Repeat it to lock it in.";
    } else { action = "back"; reason = "Under 60% of the week. Dropping back one week."; }
    log.push({ weekStart: ws, idx, miles, runs: runs.length, longOk, hrHigh, score, action, reason });
    if (action === "advance") idx = Math.min(PLAN.length - 1, idx + 1);
    if (action === "back") idx = Math.max(0, idx - 1);
  }
  return { idx, log };
}

/* ---------------- tiny SVG charts ---------------- */
function bars(vals: { label: string; v: number; plan?: number }[]) {
  const W = 640, H = 150, pad = 22, n = vals.length, bw = (W - pad) / n;
  const max = Math.max(1, ...vals.map((x) => Math.max(x.v, x.plan ?? 0))) * 1.15;
  return (
    <svg viewBox={"0 0 " + W + " " + H} width="100%" role="img" aria-label="Weekly miles">
      {vals.map((x, i) => {
        const h = (x.v / max) * (H - pad - 14), X = pad + i * bw + 3;
        const ph = x.plan ? (x.plan / max) * (H - pad - 14) : 0;
        return (
          <g key={i}>
            <rect x={X} y={H - pad - h} width={bw - 6} height={h} rx="3" fill="var(--accent)" />
            {x.plan ? <line x1={X - 1} x2={X + bw - 5} y1={H - pad - ph} y2={H - pad - ph} stroke="var(--ink)" strokeDasharray="3 2" /> : null}
            {x.v > 0 ? <text x={X + (bw - 6) / 2} y={H - pad - h - 3} fontSize="10" textAnchor="middle" fill="var(--muted)">{x.v.toFixed(1)}</text> : null}
            <text x={X + (bw - 6) / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">{x.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
function spark(pts: { label: string; v: number }[], unit: string) {
  if (pts.length < 2) return <div className="muted">Not enough readings yet.</div>;
  const W = 640, H = 110, pad = 24;
  const lo = Math.min(...pts.map((p) => p.v)) - 3, hi = Math.max(...pts.map((p) => p.v)) + 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
  return (
    <svg viewBox={"0 0 " + W + " " + H} width="100%" role="img" aria-label={"Trend in " + unit}>
      <path d={d} fill="none" stroke="var(--p5)" strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="3" fill="var(--p5)" />)}
      <text x={x(0)} y={H - 6} fontSize="10" fill="var(--muted)">{pts[0].label}</text>
      <text x={x(pts.length - 1)} y={H - 6} fontSize="10" textAnchor="end" fill="var(--muted)">{pts[pts.length - 1].label}</text>
      <text x={W - pad} y={y(pts[pts.length - 1].v) - 6} fontSize="11" textAnchor="end" fill="var(--ink)">{Math.round(pts[pts.length - 1].v) + " " + unit}</text>
    </svg>
  );
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlanPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));

  const css = `
:root{--bg:#F4F5F7;--surface:#fff;--ink:#16232B;--muted:#5B6B73;--line:#E1E5EA;--accent:#FC4C02;--ok:#1E7F5C;--warn:#B26A00;--p0:#7FB69F;--p1:#3B7CC0;--p2:#A9B7BF;--p3:#2A3F9E;--p4:#E2A400;--p5:#D6455D}
@media (prefers-color-scheme:dark){:root{--bg:#0E1114;--surface:#171B20;--ink:#E9EDF0;--muted:#9AA6AE;--line:#2A3138;--accent:#FF6A2B;--ok:#5FD3A2;--warn:#F0B92B;--p5:#F0758A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:18px 14px 56px}
h1{font-size:26px;margin:0}h2{font-size:17px;margin:0 0 10px}
.muted{color:var(--muted);font-size:13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.stat .v{font-size:26px;font-weight:700;letter-spacing:-.01em}.stat .l{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.act{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:12px 0;border-bottom:1px solid var(--line)}.act:last-child{border:0}
.act .t{font-weight:600}.metrics{display:flex;flex-wrap:wrap;gap:18px;margin-top:6px}.metrics div b{display:block;font-size:17px}.metrics div span{font-size:11px;color:var(--muted);text-transform:uppercase}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:10px;background:var(--line);color:var(--muted);margin-left:6px}
.ok{color:var(--ok);font-weight:600}.warn{color:var(--warn);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.sess{display:flex;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)}.sess:last-child{border:0}.sess b{min-width:38px}
.banner{border-left:4px solid var(--accent)}
input,button,select{font:inherit;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
button{background:var(--accent);color:#fff;border:0;font-weight:600;cursor:pointer}
.scroll{overflow-x:auto}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}`;

  // ---------- auth gate ----------
  const token = expectedToken();
  const jar = await cookies();
  const authed = !!token && safeEq(jar.get("plan_auth")?.value ?? "", token);
  if (!authed) {
    return (
      <main className="wrap">
        <style>{css}</style>
        <h1>Run plan</h1>
        {!token ? (
          <div className="card"><b>Not set up yet.</b><p className="muted">Add a <code>PLAN_PASSWORD</code> environment variable in Vercel, redeploy, then reload.</p></div>
        ) : (
          <form action={login} className="card">
            <p className="muted">This page shows personal health data. Enter the password to continue.</p>
            {one("e") ? <p className="warn">Wrong password.</p> : null}
            <input type="password" name="password" placeholder="Password" autoComplete="current-password" required />{" "}
            <button type="submit">Open</button>
          </form>
        )}
      </main>
    );
  }

  // ---------- inputs ----------
  let tz = one("tz") ?? "America/New_York";
  if (!validTz(tz)) tz = "America/New_York";
  const today = ymd(new Date(), tz);
  const curMon = monday(today);
  const startQ = one("start");
  const startMon = monday(startQ && YMD.test(startQ) ? startQ : curMon);
  const swQ = Number(one("sw"));
  const startIdx = Number.isInteger(swQ) && swQ >= 1 && swQ <= PLAN.length ? swQ - 1 : 0;
  const yearStart = today.slice(0, 4) + "-01-01";

  // ---------- data ----------
  const fromDay = [yearStart, addDays(startMon, -7), addDays(curMon, -84)].sort()[0];
  let rows: Row[] = [];
  let hrRows: { metricName: string; date: Date; qty: string | null; avg: string | null }[] = [];
  let dbError = "";
  try {
    const db = getDb();
    rows = await db.select().from(workouts).where(gte(workouts.start, new Date(utc(fromDay) - 864e5))).orderBy(desc(workouts.start));
    hrRows = await db
      .select({ metricName: metricSamples.metricName, date: metricSamples.date, qty: metricSamples.qty, avg: metricSamples.avg })
      .from(metricSamples)
      .where(and(inArray(metricSamples.metricName, ["resting_heart_rate", "heart_rate_variability", "vo2_max"]), gte(metricSamples.date, new Date(Date.now() - 90 * 864e5))));
  } catch (e) {
    dbError = e instanceof Error ? e.message : "database error";
  }
  const acts = toActs(rows, tz);
  const runs = acts.filter((a) => a.kind === "run");
  const inRange = (a: Act, from: string) => daysBetween(from, a.day) >= 0;
  const sum = (xs: Act[]) => ({ n: xs.length, mi: xs.reduce((s, a) => s + a.mi, 0), min: xs.reduce((s, a) => s + a.min, 0) });
  const wk = sum(runs.filter((a) => inRange(a, curMon)));
  const mo = sum(runs.filter((a) => inRange(a, today.slice(0, 7) + "-01")));
  const yr = sum(runs.filter((a) => inRange(a, yearStart)));
  const walksYr = sum(acts.filter((a) => a.kind === "walk" && inRange(a, yearStart)));

  // ---------- adaptive plan ----------
  const started = daysBetween(startMon, curMon) >= 0;
  const { idx, log } = started ? adapt(acts, startMon, startIdx, curMon) : { idx: startIdx, log: [] as Step[] };
  const P = PLAN[idx];
  const raceMon = addDays(curMon, (PLAN.length - 1 - idx) * 7);
  const origRaceMon = addDays(startMon, (PLAN.length - 1 - startIdx) * 7);
  const shift = Math.round(daysBetween(origRaceMon, raceMon) / 7);
  const last = log[log.length - 1];

  // ---------- fitness journey ----------
  const planRuns = runs.filter((a) => inRange(a, startMon));
  const longest = planRuns.reduce<Act | null>((b, a) => (!b || a.mi > b.mi ? a : b), null);
  const speedAvg = (xs: Act[]) => { const t = xs.reduce((s, a) => s + a.min, 0); return t > 0 ? xs.reduce((s, a) => s + a.mi, 0) / (t / 60) : 0; };
  const last4 = runs.filter((a) => daysBetween(addDays(curMon, -28), a.day) >= 0);
  const prev4 = runs.filter((a) => daysBetween(addDays(curMon, -56), a.day) >= 0 && daysBetween(addDays(curMon, -28), a.day) < 0);
  const recent = runs.filter((a) => daysBetween(addDays(today, -14), a.day) >= 0 && a.min >= 10).map(mph).sort((a, b) => a - b);
  const easyMph = recent.length ? recent[Math.floor(recent.length / 2)] : 0;
  let streak = 0;
  for (let ws = addDays(curMon, -7); ; ws = addDays(ws, -7)) {
    const n = runs.filter((a) => daysBetween(ws, a.day) >= 0 && daysBetween(ws, a.day) < 7).length;
    if (n >= 3) streak++; else break;
    if (streak > 104) break;
  }

  // ---------- weekly chart (last 12 weeks) ----------
  const planFor = new Map(log.map((s) => [s.weekStart, PLAN[s.idx].mi]));
  if (started) planFor.set(curMon, P.mi);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(curMon, -(11 - i) * 7)).map((ws) => ({
    label: nice(ws),
    v: runs.filter((a) => daysBetween(ws, a.day) >= 0 && daysBetween(ws, a.day) < 7).reduce((s, a) => s + a.mi, 0),
    plan: planFor.get(ws),
  }));

  // ---------- heart ----------
  const byDay = (metric: string) => {
    const m = new Map<string, number[]>();
    for (const r of hrRows.filter((r) => r.metricName === metric)) {
      const v = Number(r.qty ?? r.avg);
      if (!isFinite(v) || v <= 0) continue;
      const d = ymd(r.date, tz); m.set(d, [...(m.get(d) ?? []), v]);
    }
    return [...m.entries()].sort().map(([d, vs]) => ({ label: nice(d), v: vs.reduce((a, b) => a + b, 0) / vs.length }));
  };
  const rhr = byDay("resting_heart_rate");
  const hrv = byDay("heart_rate_variability");
  const vo2 = byDay("vo2_max");
  const avgOf = (xs: { v: number }[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x.v, 0) / xs.length) : null);
  const hrRuns = runs.filter((a) => inRange(a, addDays(today, -30)) && hrOk(a));

  const tzScript = `(function(){try{var u=new URL(location.href);var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;var ch=false;if(!u.searchParams.get('tz')){u.searchParams.set('tz',tz);ch=true}['start','sw'].forEach(function(k){var v=u.searchParams.get(k);var ls=localStorage.getItem('plan_'+k);if(v)localStorage.setItem('plan_'+k,v);else if(ls){u.searchParams.set(k,ls);ch=true}});if(ch)location.replace(u.toString())}catch(e){}})();`;

  return (
    <main className="wrap">
      <style>{css}</style>
      <script dangerouslySetInnerHTML={{ __html: tzScript }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>Half marathon training</h1><div className="muted">Live from Apple Health · {tz}</div></div>
      </div>
      {dbError ? <div className="card"><b className="warn">Could not read the database.</b><div className="muted">{dbError}</div></div> : null}

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="l">This week</div><div className="v">{wk.mi.toFixed(1)} mi</div><div className="muted">{wk.n} runs · {fmtMin(wk.min)}</div></div>
        <div className="stat"><div className="l">This month</div><div className="v">{mo.mi.toFixed(1)} mi</div><div className="muted">{mo.n} runs · {fmtMin(mo.min)}</div></div>
        <div className="stat"><div className="l">{today.slice(0, 4)}</div><div className="v">{yr.mi.toFixed(1)} mi</div><div className="muted">{yr.n} runs · {fmtMin(yr.min)} · +{walksYr.mi.toFixed(1)} mi walking</div></div>
        <div className="stat"><div className="l">Resting HR</div><div className="v">{rhr.length ? Math.round(rhr[rhr.length - 1].v) + " bpm" : "–"}</div><div className="muted">{avgOf(rhr) ? "avg " + avgOf(rhr) + " · " : ""}{avgOf(hrv) ? "HRV " + avgOf(hrv) + " ms" : ""}</div></div>
      </div>

      <div className="card banner">
        <h2>{!started ? "Plan starts " + nice(startMon) : "Plan week " + (idx + 1) + " of " + PLAN.length + " · " + PHASES[P.ph]}</h2>
        {last ? <div><span className={last.action === "advance" ? "ok" : "warn"}>{last.action === "advance" ? "Moved up" : last.action === "repeat" ? "Repeating a week" : "Dropped back"}</span> <span className="muted">· last week: {last.runs} runs, {last.miles.toFixed(1)} of {PLAN[last.idx].mi} mi. {last.reason}</span></div> : null}
        <div className="muted" style={{ marginTop: 4 }}>Projected half marathon: week of {nice(raceMon)}{shift ? " (" + (shift > 0 ? shift + " week" + (shift > 1 ? "s" : "") + " later" : -shift + " earlier") + " than the original plan)" : " (on schedule)"}.</div>
        <div style={{ marginTop: 10 }}>
          {KEYS.map((k, i) => {
            const date = addDays(curMon, i);
            const here = acts.filter((a) => a.day === date);
            const ran = here.some((a) => a.kind === "run");
            const lifted = here.some((a) => a.kind === "strength");
            const plan = P[k];
            const needsRun = !/^(rest|optional)/i.test(plan);
            const past = daysBetween(date, today) > 0;
            const lift = k === "mon" ? "Strength A (legs)" : k === "wed" ? "Strength B (upper, core)" : "";
            return (
              <div className="sess" key={k}>
                <b>{DOW[i]}</b>
                <div>
                  <div>{plan} {ran ? <span className="ok">✓ done</span> : needsRun && past ? <span className="warn">missed</span> : date === today && needsRun ? <span className="tag">today</span> : null}</div>
                  {lift ? <div className="muted">{lift} {lifted ? <span className="ok">✓</span> : null}</div> : null}
                  {here.filter((a) => a.kind !== "other").map((a) => <div className="muted" key={a.id}>↳ {a.name} · {a.mi.toFixed(2)} mi · {fmtMin(a.min)} · {pace(a)}{hrOk(a) ? " · " + Math.round(a.avgHr!) + " bpm" : ""}</div>)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ marginTop: 6 }}>This week target: {P.mi} mi over 4 runs. Easy runs: keep heart rate under {EASY_CAP} bpm{easyMph ? ", around " + easyMph.toFixed(1) + " mph on the treadmill based on your last 2 weeks" : ""}.</div>
      </div>

      <div className="card">
        <h2>Weekly miles <span className="muted">(bars = actual, dashed = plan)</span></h2>
        {bars(weeks)}
      </div>

      <div className="grid">
        <div className="card" style={{ margin: 0 }}>
          <h2>Fitness journey</h2>
          <table><tbody>
            <tr><td>Plan progress</td><td><b>{started ? "Week " + (idx + 1) + " / " + PLAN.length : "Not started"}</b></td></tr>
            <tr><td>Miles since plan start</td><td><b>{planRuns.reduce((s, a) => s + a.mi, 0).toFixed(1)} mi</b> · {planRuns.length} runs</td></tr>
            <tr><td>Longest run</td><td>{longest ? <b>{longest.mi.toFixed(2)} mi</b> : "–"}{longest ? " · " + fmtMin(longest.min) + " · " + niceDow(longest.day) : ""}</td></tr>
            <tr><td>Avg speed, last 4 wks</td><td><b>{speedAvg(last4) ? speedAvg(last4).toFixed(2) + " mph" : "–"}</b>{speedAvg(prev4) && speedAvg(last4) ? " (" + (speedAvg(last4) - speedAvg(prev4) >= 0 ? "+" : "") + (speedAvg(last4) - speedAvg(prev4)).toFixed(2) + " vs prior 4)" : ""}</td></tr>
            <tr><td>Consistency streak</td><td><b>{streak}</b> week{streak === 1 ? "" : "s"} with 3+ runs</td></tr>
            {vo2.length ? <tr><td>VO₂ max</td><td><b>{vo2[vo2.length - 1].v.toFixed(1)}</b></td></tr> : null}
          </tbody></table>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h2>Heart rate zones <span className="muted">(max HR ~{HR_MAX})</span></h2>
          <table><tbody>
            {ZONES.map((z) => <tr key={z.z}><td>{z.z}</td><td>{Math.round(z.lo * HR_MAX)}–{Math.round(z.hi * HR_MAX)} bpm</td></tr>)}
          </tbody></table>
          <div className="muted" style={{ marginTop: 6 }}>{hrRuns.length ? hrRuns.length + " run(s) with usable heart rate in the last 30 days." : "No usable run heart rate yet. Wear your Apple Watch or a chest strap on runs; treadmill grip readings are ignored."}</div>
        </div>
      </div>

      <div className="card">
        <h2>Resting heart rate</h2>
        {spark(rhr, "bpm")}
        {hrv.length >= 2 ? <><h2 style={{ marginTop: 10 }}>HRV</h2>{spark(hrv, "ms")}</> : null}
      </div>

      <div className="card">
        <h2>Activities</h2>
        {acts.filter((a) => a.kind !== "other").slice(0, 20).map((a) => (
          <div className="act" key={a.id}>
            <div>
              <div className="t">{a.name}<span className="tag">{a.kind}</span></div>
              <div className="muted">{niceDow(a.day)} · {hm(a.start, tz)}</div>
              <div className="metrics">
                {a.mi > 0 ? <div><b>{a.mi.toFixed(2)} mi</b><span>Distance</span></div> : null}
                <div><b>{fmtMin(a.min)}</b><span>Time</span></div>
                {pace(a) ? <div><b>{pace(a)}</b><span>Pace</span></div> : null}
                {hrOk(a) ? <div><b>{Math.round(a.avgHr!)} bpm</b><span>Avg HR · {zoneOf(a.avgHr!)}</span></div> : null}
                {a.maxHr && hrOk(a) ? <div><b>{Math.round(a.maxHr)} bpm</b><span>Max HR</span></div> : null}
              </div>
            </div>
          </div>
        ))}
        {!acts.length ? <div className="muted">No activities yet.</div> : null}
      </div>

      <div className="card">
        <h2>How the plan adjusted itself</h2>
        {log.length ? (
          <div className="scroll"><table>
            <thead><tr><th>Week of</th><th>Plan wk</th><th>Runs</th><th>Miles</th><th>Result</th></tr></thead>
            <tbody>{[...log].reverse().map((s) => (
              <tr key={s.weekStart}><td>{nice(s.weekStart)}</td><td>{s.idx + 1}</td><td>{s.runs}/4</td><td>{s.miles.toFixed(1)} / {PLAN[s.idx].mi}</td><td><span className={s.action === "advance" ? "ok" : "warn"}>{s.action}</span> <span className="muted">{s.reason}</span></td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="muted">Adjustments start after your first full week. Each Monday the plan checks last week: 85%+ done moves you up, 60–85% repeats the week, under 60% drops back one.</div>}
      </div>

      <div className="card">
        <h2>Coming up</h2>
        <table><tbody>
          {[1, 2, 3].filter((d) => idx + d < PLAN.length).map((d) => {
            const q = PLAN[idx + d];
            return <tr key={d}><td>{nice(addDays(curMon, d * 7))}</td><td>Week {idx + d + 1} · {PHASES[q.ph]}</td><td>{q.mi} mi · long run: {q.fri}</td></tr>;
          })}
        </tbody></table>
        <div className="muted" style={{ marginTop: 6 }}>Shown as if each week goes to plan. It updates every Monday from what you actually did.</div>
      </div>

      <form method="get" className="card row">
        <label className="muted">Plan start (Monday) <input type="date" name="start" defaultValue={startMon} /></label>
        <label className="muted">Starting plan week <input type="number" name="sw" min="1" max={PLAN.length} defaultValue={startIdx + 1} style={{ width: 70 }} /></label>
        <input type="hidden" name="tz" value={tz} />
        <button type="submit">Save</button>
        <span className="muted">Use your Week 0 test result as the starting week.</span>
      </form>
    </main>
  );
}
