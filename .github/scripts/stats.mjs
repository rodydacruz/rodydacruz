// Builds stats/terminal.svg: one full-width, old-terminal-style card.
// Run by .github/workflows/profile-stats.yml. No dependencies (Node 18+).
import fs from "node:fs";
import path from "node:path";

const USER = process.env.GH_USER || "rodydacruz";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUT = process.env.OUT_DIR || "stats";
// Repos you work on that live under another account or org ("owner/name").
// Their languages are counted too. Add more here.
const EXTRA_REPOS = ["katxupa/algebra-linear"];

// dark: green phosphor on black. light: black text on a see-through background.
const THEMES = {
  dark: { BG: "#000000", BAR_BG: "#0c0c0c", FG: "#33ff66", DIM: "#1a7a35", HI: "#ccffdd" },
  light: { BG: "none", BAR_BG: "#f6f8fa", FG: "#1f2328", DIM: "#8c959f", HI: "#000000" },
};
const FONT = "Consolas, 'Courier New', 'DejaVu Sans Mono', monospace";
const W = 840, LH = 22; // card width, line height
const L = 24, R = 440;  // left and right column x

async function api(p, body) {
  const res = await fetch(p.startsWith("http") ? p : "https://api.github.com" + p, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "profile-stats",
      ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${p}`);
  return res.json();
}

async function ownedRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await api(`/users/${USER}/repos?type=owner&per_page=100&page=${page}`);
    repos.push(...batch.filter((r) => !r.fork));
    if (batch.length < 100) return repos;
  }
}

async function languages(repos, top = 6) {
  const totals = {};
  for (const r of repos) {
    for (const [lang, size] of Object.entries(await api(`/repos/${r.full_name}/languages`))) {
      totals[lang] = (totals[lang] || 0) + size;
    }
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, size]) => [name, (100 * size) / total]);
}

// Every day since the account was created, as [[YYYY-MM-DD, count]], oldest first.
async function contributionDays(createdAt) {
  const q = `query($u:String!,$f:DateTime!,$t:DateTime!){user(login:$u){
    contributionsCollection(from:$f,to:$t){contributionCalendar{
    weeks{contributionDays{date contributionCount}}}}}}`;
  const today = new Date().toISOString().slice(0, 10);
  const days = new Map();
  for (let y = +createdAt.slice(0, 4); y <= +today.slice(0, 4); y++) {
    const res = await api("/graphql", {
      query: q,
      variables: { u: USER, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` },
    });
    if (res.errors) throw new Error(res.errors[0].message);
    for (const w of res.data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const d of w.contributionDays) if (d.date <= today) days.set(d.date, d.contributionCount);
    }
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function streaks(days) {
  const total = days.reduce((a, [, c]) => a + c, 0);
  const first = days.find(([, c]) => c)?.[0] ?? null;
  let longest = 0, run = 0, start = null, best = [null, null];
  for (const [d, c] of days) {
    if (c) {
      if (!run) start = d;
      run++;
      if (run > longest) { longest = run; best = [start, d]; }
    } else run = 0;
  }
  // today may still be empty, so the current streak may start from yesterday
  let current = 0, i = days.length - 1;
  if (i >= 0 && days[i][1] === 0) i--;
  while (i >= 0 && days[i][1]) { current++; i--; }
  return { total, first, current, longest, best };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "-";
const plural = (n, w) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;

export function render({ name, followers, repos, commits, prs, langs, streak }, theme = THEMES.dark) {
  const { BG, BAR_BG, FG, DIM, HI } = theme;
  const parts = [];
  const text = (x, y, s, fill = FG, anchor = "start", weight = "normal") =>
    parts.push(`<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`);
  const leader = (x1, x2, y) =>
    parts.push(`<line x1="${x1}" y1="${y - 4}" x2="${x2}" y2="${y - 4}" stroke="${DIM}" stroke-width="1.5" stroke-dasharray="2 4"/>`);
  const prompt = (x, y, cmd) => { text(x, y, "$", DIM); text(x + 16, y, cmd, HI); };
  const bar = (x, y, pct, cells = 20) => {
    const filled = Math.round((cells * pct) / 100);
    for (let i = 0; i < cells; i++) {
      const on = i < filled;
      parts.push(`<rect x="${x + i * 9}" y="${y - 11}" width="7" height="12" fill="${on ? FG : "none"}" stroke="${on ? FG : DIM}"/>`);
    }
  };
  const row = (y, label, value) => { text(L, y, label); leader(L + 140, 310, y); text(390, y, value, HI, "end", "bold"); };

  let y = 66;
  prompt(L, y, "whoami");
  y += LH;
  text(L, y, `${name || USER}  (${USER})`, FG, "start", "bold");

  y += LH * 2;
  prompt(L, y, "stats");
  prompt(R, y, "langs --top");
  const rows = [
    ["commits", commits], ["pull requests", prs], ["public repos", repos.length],
    ["stars", repos.reduce((a, r) => a + r.stargazers_count, 0)], ["followers", followers],
  ];
  rows.forEach(([label, v], i) => row(y + LH * (i + 1), label, v.toLocaleString("en-US")));
  langs.forEach(([lang, pct], i) => {
    const ry = y + LH * (i + 1);
    text(R, ry, lang);
    bar(R + 130, ry, pct);
    text(W - 24, ry, `${pct.toFixed(1)}%`, HI, "end", "bold");
  });
  y += LH * (Math.max(rows.length, langs.length) + 2);

  if (streak) {
    prompt(L, y, "streak");
    const lines = [
      ["contributions", streak.total.toLocaleString("en-US"), `since ${fmtDate(streak.first)}`],
      ["current streak", plural(streak.current, "day"), ""],
      ["longest streak", plural(streak.longest, "day"),
        streak.best[0] ? `${fmtDate(streak.best[0])} - ${fmtDate(streak.best[1])}` : ""],
    ];
    lines.forEach(([label, v, note], i) => {
      const ry = y + LH * (i + 1);
      row(ry, label, v);
      text(R, ry, note, DIM);
    });
    y += LH * (lines.length + 2);
  }

  text(L, y, "$", DIM);
  parts.push(`<rect x="${L + 16}" y="${y - 13}" width="9" height="16" fill="${FG}"><animate attributeName="opacity" values="1;1;0;0" dur="1.2s" repeatCount="indefinite"/></rect>`);

  const h = y + 24;
  const stamp = "updated " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" font-family="${FONT}" font-size="14">` +
    `<rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="6" fill="${BG}" stroke="${FG}" stroke-width="1.5"/>` +
    `<path d="M1 34 V7 a6 6 0 0 1 6 -6 H${W - 7} a6 6 0 0 1 6 6 V34 Z" fill="${BAR_BG}" stroke="${FG}" stroke-width="1.5"/>` +
    `<text x="${L}" y="23" fill="${FG}">[x]</text>` +
    `<text x="${W / 2}" y="23" fill="${FG}" text-anchor="middle">${esc(USER)}@github: ~</text>` +
    `<text x="${W - 24}" y="23" fill="${DIM}" text-anchor="end" font-size="12">${stamp}</text>` +
    parts.join("") + `</svg>`;
}

async function main() {
  const user = await api(`/users/${USER}`);
  const repos = await ownedRepos();
  const commits = (await api(`/search/commits?q=author:${USER}&per_page=1`)).total_count;
  const prs = (await api(`/search/issues?q=author:${USER}+type:pr&per_page=1`)).total_count;
  const langs = await languages([...repos, ...EXTRA_REPOS.map((full_name) => ({ full_name }))]);
  let streak = null;
  try {
    streak = streaks(await contributionDays(user.created_at));
  } catch (e) {
    // streak needs GraphQL, which needs a token; leave it out rather than fail
    console.error("streak skipped:", e.message);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const data = { name: user.name, followers: user.followers, repos, commits, prs, langs, streak };
  for (const [mode, theme] of Object.entries(THEMES)) {
    fs.writeFileSync(path.join(OUT, `terminal-${mode}.svg`), render(data, theme));
  }
  for (const old of ["overview.svg", "languages.svg", "terminal.svg"]) fs.rmSync(path.join(OUT, old), { force: true });
  console.error(`Wrote terminal card for ${USER}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("stats.mjs")) await main();
