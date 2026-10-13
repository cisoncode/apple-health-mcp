import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workouts } from "@/db/schema";

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
  await new Promise((r) => setTimeout(r, 700)); // slow down guessing
  if (!token || !expected || !safeEq(pw, expected)) redirect("/plan?e=1");
  const jar = await cookies();
  jar.set("plan_auth", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/plan",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/plan");
}

/* ---------------- helpers ---------------- */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validTz = (tz: string) => {
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return true; } catch { return false; }
};
const ymd = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const utc = (s: string) => Date.parse(s + "T00:00:00Z");
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 864e5);
const addDays = (s: string, n: number) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
const nice = (s: string) =>
  new Date(utc(s)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const KEYS = ["mon", "tue", "wed", "thu", "fri"] as const;

type Row = typeof workouts.$inferSelect;
function miles(w: Row): number | null {
  const d = Number(w.distance);
  if (!isFinite(d) || d <= 0) return null;
  const u = (w.distanceUnits ?? "").toLowerCase();
  if (u.startsWith("mi")) return d;
  if (u === "m" || u.startsWith("meter")) return d / 1609.344;
  return d * 0.621371; // km
}
const isRun = (w: Row) => /run|jog|walk|treadmill|hik/i.test(w.name ?? "");
const isStrength = (w: Row) => /strength|weight|dumbbell|resistance/i.test(w.name ?? "");

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlanPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));

  const css = `
:root{--bg:#F2F5F4;--surface:#fff;--ink:#16232B;--muted:#5B6B73;--line:#D8E0DE;--accent:#1F4FD8;--ok:#1E7F5C;--warn:#B26A00;--p0:#7FB69F;--p1:#3B7CC0;--p2:#A9B7BF;--p3:#2A3F9E;--p4:#E2A400;--p5:#D6455D}
@media (prefers-color-scheme:dark){:root{--bg:#0F1719;--surface:#182226;--ink:#E7EFEE;--muted:#9BAEB3;--line:#2B393E;--accent:#7C9CFF;--ok:#5FD3A2;--warn:#F0B92B;--p0:#6FAE96;--p1:#5B9BE0;--p2:#71828A;--p3:#7E92F0;--p4:#F0B92B;--p5:#F0758A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:20px 16px 56px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:0 0 8px}
.muted{color:var(--muted);font-size:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:12px 0}
.big{font-size:22px;font-weight:700}
.ok{color:var(--ok);font-weight:600}.warn{color:var(--warn);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
tr.now td{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden;min-width:70px}.bar i{display:block;height:100%}
.sess{display:flex;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)}.sess:last-child{border:0}.sess b{min-width:38px}
input,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
button{background:var(--accent);color:#fff;border:0;font-weight:600;cursor:pointer}
.scroll{overflow-x:auto}`;

  // ---------- auth gate ----------
  const token = expectedToken();
  const jar = await cookies();
  const cookie = jar.get("plan_auth")?.value ?? "";
  const authed = !!token && safeEq(cookie, token);

  if (!authed) {
    return (
      <main className="wrap">
        <style>{css}</style>
        <h1>Run plan</h1>
        {!token ? (
          <div className="card">
            <b>Not set up yet.</b>
            <p className="muted">Add a <code>PLAN_PASSWORD</code> environment variable in Vercel, redeploy, then reload this page.</p>
          </div>
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
  const dow = new Date(utc(today)).getUTCDay(); // 0=Sun
  const defaultStart = addDays(today, -((dow + 6) % 7));
  const startQ = one("start");
  const start = startQ && YMD.test(startQ) ? startQ : defaultStart;

  // ---------- data ----------
  const since = new Date(utc(start) - 2 * 864e5);
  let rows: Row[] = [];
  let dbError = "";
  try {
    rows = await getDb().select().from(workouts).where(gte(workouts.start, since)).orderBy(desc(workouts.start));
  } catch (e) {
    dbError = e instanceof Error ? e.message : "database error";
  }
  const items = rows
    .filter((w) => w.start)
    .map((w) => ({ w, day: ymd(w.start as Date, tz) }))
    .filter((x) => daysBetween(start, x.day) >= 0);

  const weekMiles = PLAN.map(() => 0);
  const weekRuns = PLAN.map(() => 0);
  for (const { w, day } of items) {
    if (!isRun(w)) continue;
    const wi = Math.floor(daysBetween(start, day) / 7);
    if (wi >= 0 && wi < PLAN.length) {
      weekMiles[wi] += miles(w) ?? 0;
      weekRuns[wi] += 1;
    }
  }

  const cw = Math.floor(daysBetween(start, today) / 7); // -1 = before start
  const todays = items.filter((x) => x.day === today);
  const mmin = (w: Row) => (Number(w.durationS) > 0 ? Math.round(Number(w.durationS) / 60) + " min" : "");
  const hr = (w: Row) => (Number(w.avgHr) > 0 ? "avg HR " + Math.round(Number(w.avgHr)) : "");
  const desc1 = (w: Row) =>
    [w.name ?? "Workout", miles(w) ? miles(w)!.toFixed(2) + " mi" : "", mmin(w), hr(w)].filter(Boolean).join(" · ");

  const total = PLAN.reduce((a, p) => a + p.mi, 0);
  const doneMi = weekMiles.reduce((a, b) => a + b, 0);

  const tzScript = `(function(){try{var u=new URL(location.href);var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;var s=u.searchParams.get('start');var ls=localStorage.getItem('planStart');var ch=false;if(!u.searchParams.get('tz')){u.searchParams.set('tz',tz);ch=true}if(!s&&ls){u.searchParams.set('start',ls);ch=true}if(s)localStorage.setItem('planStart',s);if(ch)location.replace(u.toString())}catch(e){}})();`;

  return (
    <main className="wrap">
      <style>{css}</style>
      <script dangerouslySetInnerHTML={{ __html: tzScript }} />
      <h1>Half marathon plan</h1>
      <p className="muted">
        Live from your Apple Health data. Plan starts {nice(start)}. Times are in {tz}.
      </p>
      <form method="get" className="muted" style={{ margin: "8px 0" }}>
        <label>Plan start (a Monday): <input type="date" name="start" defaultValue={start} /></label>{" "}
        <input type="hidden" name="tz" value={tz} />
        <button type="submit">Update</button>
      </form>
      {dbError ? <div className="card"><b className="warn">Could not read the database.</b><div className="muted">{dbError}</div></div> : null}

      <div className="card">
        <h2>Did I work out today?</h2>
        {todays.length ? (
          <>
            <div className="big ok">Yes</div>
            {todays.map(({ w }) => (
              <div key={w.id} className="muted">{desc1(w)}</div>
            ))}
          </>
        ) : (
          <>
            <div className="big warn">Nothing logged yet today</div>
            <div className="muted">Data syncs about hourly. Open Health Auto Export to force a sync.</div>
          </>
        )}
      </div>

      <div className="card">
        <h2>{cw < 0 ? "Plan starts in " + -daysBetween(today, start) + " day(s)" : cw >= PLAN.length ? "Plan finished" : "Week " + (cw + 1) + " of " + PLAN.length + " · " + PHASES[PLAN[cw].ph]}</h2>
        {cw >= 0 && cw < PLAN.length ? (
          <>
            <div className="muted">
              {weekMiles[cw].toFixed(1)} of {PLAN[cw].mi} mi planned · {weekRuns[cw]} run(s) logged
            </div>
            {KEYS.map((k, i) => {
              const date = addDays(start, cw * 7 + i);
              const here = items.filter((x) => x.day === date);
              const ran = here.some((x) => isRun(x.w));
              const lifted = here.some((x) => isStrength(x.w));
              const isPast = daysBetween(date, today) > 0;
              const lift = k === "mon" ? "Strength A" : k === "wed" ? "Strength B" : "";
              const needsRun = !PLAN[cw][k].toLowerCase().startsWith("rest") && !PLAN[cw][k].toLowerCase().startsWith("optional");
              return (
                <div className="sess" key={k}>
                  <b>{DOW[i]}</b>
                  <div>
                    <div>
                      {PLAN[cw][k]}{" "}
                      {ran ? <span className="ok">✓ done</span> : needsRun && isPast ? <span className="warn">missed</span> : null}
                    </div>
                    {lift ? (
                      <div className="muted">
                        {lift} {lifted ? <span className="ok">✓ logged</span> : null}
                      </div>
                    ) : null}
                    {here.map(({ w }) => (
                      <div className="muted" key={w.id}>↳ {desc1(w)}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}
      </div>

      <div className="card">
        <h2>All 24 weeks</h2>
        <div className="muted" style={{ marginBottom: 6 }}>
          {doneMi.toFixed(1)} mi run so far of {total.toFixed(0)} mi planned (the 4 main runs per week; optional runs add extra).
        </div>
        <div className="scroll">
          <table>
            <thead><tr><th>Wk</th><th>Dates</th><th>Phase</th><th>Planned</th><th>Actual</th><th></th></tr></thead>
            <tbody>
              {PLAN.map((p, i) => {
                const pct = Math.min(100, (weekMiles[i] / p.mi) * 100);
                return (
                  <tr key={i} className={i === cw ? "now" : ""}>
                    <td>{i + 1}</td>
                    <td>{nice(addDays(start, i * 7))}</td>
                    <td>{PHASES[p.ph]}{p.race ? " · race" : ""}</td>
                    <td>{p.mi} mi</td>
                    <td>{weekMiles[i] > 0 ? weekMiles[i].toFixed(1) + " mi" : "–"}</td>
                    <td><div className="bar"><i style={{ width: pct + "%", background: `var(--p${p.ph})` }} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted">Workouts are matched by date and name (run, walk, jog, treadmill count as runs; strength counts as lifting).</p>
    </main>
  );
}
