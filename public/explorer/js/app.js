// Hot Hand Explorer (design: Shinyoung) wired to the real NCAA women's play-by-play.
// Data: ../data/dash/core.json  -> team-level cells (team x shot type x close x half x streak),
//       ../data/dash/team/<i>.json -> that team's players: their cells + every game shot by shot.
// Every filter change re-adds the precomputed cells in the browser, so all numbers
// on screen always describe exactly the shots that pass the filters.
// Chance columns (en, em, ea) are averages over shuffles of each player's shots within each
// game and shot type; field goals taken within 6 s of the same player's previous shot
// (putbacks) are not counted as "next shots".

const C = {
  ink: "#1d1d27", muted: "#6b6f7b", rule: "#e1e2e8", panel: "#f6f6f9",
  // trophy theme: made shot = basketball orange, missed shot = ribbon purple (validated pair for color-blind readers)
  make: "#e2681e", makeEdge: "#a9480f", makeText: "#a3460f", miss: "#6b3fc4", dot: "#9a9caa",
};
const STREAKS = [-3, -2, -1, 1, 2, 3];
const STREAK_LABEL = { "-3": "Missed 3+", "-2": "Missed 2", "-1": "Missed 1", 1: "Made 1", 2: "Made 2", 3: "Made 3+" };
const SHOT_WORD = { FT: "free throws", FG: "field goals", "2PT": "2-pointers", "3PT": "3-pointers" };
const TYPES = ["FT", "2PT", "3PT"], HALVES = ["1st", "2nd", "OT"];
const DATA = "../data/dash/";

const DEFAULTS = { shot: "FT", k: 3, close: "all", half: "all", team: "all", player: null, only: false };
const state = { ...DEFAULTS };
const params = new URLSearchParams(location.search);
if (params.get("team")) state.team = params.get("team");

const fmtPts = (v, d = 1) => (v == null || isNaN(v) ? "–" : (v > 0.05 ? "+" : v < -0.05 ? "−" : "") + Math.abs(v).toFixed(d));
const fmtPct = v => (v == null || isNaN(v) ? "–" : (v * 100).toFixed(1));
const tooltip = d3.select("#tooltip");
function tip(event, html) {
  tooltip.style("opacity", 1).html(html)
    .style("left", Math.min(event.clientX + 14, window.innerWidth - 280) + "px")
    .style("top", event.clientY + 14 + "px");
}
const hideTip = () => tooltip.style("opacity", 0);

// ---------------------------------------------------------------
// Load
// ---------------------------------------------------------------
let CORE, CELLS, PLAYERS, P, TOP_ROWS;
const teamCache = new Map(), teamRowsCache = new Map();
const teamData = t => { if (!teamCache.has(t)) teamCache.set(t, d3.json(`${DATA}team/${t}.json`)); return teamCache.get(t); };

// key layout: (((team*3 + type)*2 + close)*3 + half)*6 + state
function unpack(k) {
  const s = k % 6; k = (k - s) / 6; const h = k % 3; k = (k - h) / 3; const c = k % 2; k = (k - c) / 2; const ty = k % 3;
  return { t: (k - ty) / 3, ty, c, h, s };
}
const row = (d, player, n, m, a, en, em, ea) => ({ player, team: d.t, type: TYPES[d.ty], close: String(d.c), half: HALVES[d.h],
  streak: STREAKS[d.s], n, made: m, avg: a, en, em, ea });
const playerRows = (id, pc) => pc[0].map((k, i) => row(unpack(k), id, pc[1][i], pc[2][i], pc[3][i], pc[4][i], pc[5][i], pc[6][i]));

d3.json(DATA + "core.json").then(core => {
  CORE = core;
  const c = core.cells;
  CELLS = c.k.map((k, i) => row(unpack(k), null, c.n[i], c.m[i], c.a[i], c.en[i], c.em[i], c.ea[i]));
  PLAYERS = core.players.map(([id, name, t, fta, ftp, fga, fgp]) => ({ id: String(id), name, tidx: t, team: core.teams[t], fta, fga, ftp, fgp }));
  P = new Map(PLAYERS.map(p => [p.id, p]));
  // "All teams": the 200 players with the most shots (more would pile up in the beeswarm)
  const vol = id => { const q = P.get(id); return q ? q.fga + q.fta : 0; };
  TOP_ROWS = Object.keys(core.top).sort((a, b) => vol(b) - vol(a)).slice(0, 200).flatMap(id => playerRows(id, core.top[id]));
  setupFilters();
  render();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(render, 120); });
}).catch(() => d3.select("#kpis").html('<div class="kpi">Could not load the data.</div>'));

// ---------------------------------------------------------------
// Filters
// ---------------------------------------------------------------
function setupFilters() {
  d3.selectAll(".seg").each(function () {
    const seg = d3.select(this), key = this.dataset.key;
    seg.selectAll("button").on("click", function () {
      seg.selectAll("button").classed("on", false);
      d3.select(this).classed("on", true);
      state[key] = key === "k" ? +this.dataset.v : this.dataset.v;
      render();
    });
  });

  const OTHER = CORE.teams.length - 1;
  const teams = CORE.teams.map((n, i) => [i, n]).filter(([i]) => i !== OTHER).sort((a, b) => a[1].localeCompare(b[1]));
  const sel = d3.select("#f-team");
  sel.selectAll("option").data([["all", "All teams"], ...teams]).join("option").attr("value", d => d[0]).text(d => d[1]);
  sel.property("value", state.team);
  sel.on("change", function () { state.team = this.value; render(); });

  const label = p => `${p.name} (${p.team})`;
  // Player search: only names that START with what was typed ("a" -> A..., "ad" -> Ad...)
  const sorted = PLAYERS.slice().sort((a, b) => a.name.localeCompare(b.name));
  const inp = d3.select("#f-player"), box = d3.select("#player-suggest");
  const MAX = 12;
  let matches = [], active = -1;
  const hide = () => { box.attr("hidden", true); inp.attr("aria-expanded", "false"); active = -1; };
  const pick = p => {
    inp.property("value", label(p)); hide();
    state.player = p.id; render();
  };
  const mark = () => box.selectAll("li.opt").classed("active", (d, i) => i === active)
    .attr("aria-selected", (d, i) => (i === active ? "true" : "false"));
  function suggest() {
    const q = inp.property("value").trim().toLowerCase();
    if (!q) { hide(); if (state.player) { state.player = null; render(); } return; }
    matches = sorted.filter(p => p.name.toLowerCase().startsWith(q));
    active = -1;
    box.html("").attr("hidden", null); inp.attr("aria-expanded", "true");
    if (!matches.length) { box.append("li").attr("class", "none").text(`No player name starts with “${inp.property("value").trim()}”`); return; }
    matches.slice(0, MAX).forEach(p => {
      const li = box.append("li").attr("class", "opt").attr("role", "option").datum(p)
        .on("mousedown", e => { e.preventDefault(); pick(p); });
      const nm = li.append("span").attr("class", "nm");
      nm.append("b").text(p.name.slice(0, q.length));
      nm.append("span").text(p.name.slice(q.length));
      li.append("small").text(p.team);
    });
    if (matches.length > MAX) box.append("li").attr("class", "none").text(`${d3.format(",")(matches.length - MAX)} more. Keep typing to narrow it down.`);
  }
  inp.on("input", suggest)
    .on("focus", () => { if (inp.property("value") && !state.player) suggest(); })
    .on("blur", () => setTimeout(hide, 120))
    .on("keydown", e => {
      const n = Math.min(matches.length, MAX);
      if (box.attr("hidden") !== null || !n) return;
      if (e.key === "ArrowDown") { active = (active + 1) % n; mark(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = (active - 1 + n) % n; mark(); e.preventDefault(); }
      else if (e.key === "Enter") { pick(matches[Math.max(active, 0)]); e.preventDefault(); }
      else if (e.key === "Escape") hide();
    });
  d3.select("#f-only").on("change", function () { state.only = this.checked; render(); });

  d3.select("#reset").on("click", () => {
    Object.assign(state, DEFAULTS);
    d3.selectAll(".seg").each(function () {
      const key = this.dataset.key;
      d3.select(this).selectAll("button").classed("on", function () { return String(DEFAULTS[key]) === this.dataset.v; });
    });
    sel.property("value", "all");
    d3.select("#f-player").property("value", ""); d3.select("#f-only").property("checked", false);
    render();
  });

  window.__selectPlayer = id => {
    state.player = id;
    d3.select("#f-player").property("value", id ? label(P.get(id)) : "");
    render();
  };
}

// ---------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------
const groupOf = shot => (shot === "FT" ? "FT" : "FG");
const typesOf = shot => (shot === "FG" ? ["2PT", "3PT"] : [shot]);
function passes(r) {
  return typesOf(state.shot).includes(r.type)
    && (state.close === "all" || r.close === state.close)
    && (state.half === "all" || r.half === state.half);
}

function sum(rows) {
  const o = { n: 0, made: 0, avg: 0, en: 0, em: 0, ea: 0 };
  for (const r of rows) { o.n += r.n; o.made += r.made; o.avg += r.avg; o.en += r.en; o.em += r.em; o.ea += r.ea; }
  o.pct = o.n ? o.made / o.n : NaN;
  o.act = o.n ? (o.made - o.avg) / o.n * 100 : NaN;          // vs. player's own average, points
  o.chance = o.en ? (o.em - o.ea) / o.en * 100 : NaN;        // same, if shot order were random
  o.ci = o.n ? 1.96 * Math.sqrt(o.pct * (1 - o.pct) / o.n) * 100 : NaN;
  return o;
}

const MIN_SHOTS = 30;   // below this on either side, the comparison is not shown
// binomial SE with the rate kept away from exactly 0 or 1, so a tiny sample can never look "certain"
const seOf = (p, n) => { const q = Math.min(Math.max(p, 0.5 / n), 1 - 0.5 / n); return q * (1 - q) / n; };
function compare(rows, k) {
  const H = sum(rows.filter(r => r.streak >= k));
  const M = sum(rows.filter(r => r.streak <= -k));
  const raw = H.act - M.act, chance = H.chance - M.chance, effect = raw - chance;
  const se = Math.sqrt(seOf(H.pct, H.n) + seOf(M.pct, M.n)) * 100;
  const thin = !(H.n >= MIN_SHOTS && M.n >= MIN_SHOTS);
  return { H, M, raw, chance, effect, se, thin };
}

async function teamRows(t) {
  if (!teamRowsCache.has(t)) {
    const td = await teamData(t);
    teamRowsCache.set(t, Object.entries(td).flatMap(([id, e]) => playerRows(id, e.c)));
  }
  return teamRowsCache.get(t);
}

// ---------------------------------------------------------------
// Render everything
// ---------------------------------------------------------------
let token = 0;
async function render() {
  const tok = ++token;
  const OTHER = CORE.teams.length - 1;
  const p = state.player && P.get(state.player);
  let pRows = null, pGames = [];
  if (p && p.tidx !== OTHER) {
    const td = await teamData(p.tidx);
    if (td[p.id]) { pRows = playerRows(p.id, td[p.id].c); pGames = td[p.id].g; }
  } else if (p && CORE.top[p.id]) pRows = playerRows(p.id, CORE.top[p.id]);
  if (tok !== token) return;

  const only = state.only && pRows;
  const rows = only ? pRows.filter(passes)
    : CELLS.filter(r => passes(r) && (state.team === "all" || r.team === +state.team));
  const byStreak = new Map(STREAKS.map(s => [s, sum(rows.filter(r => r.streak === s))]));
  const cmp = compare(rows, state.k);
  // Player-level data exists for a single team, so count the players whose shots pass the filters there.
  // For "All teams" the data is grouped by team, so no player count is claimed.
  const pr = state.team === "all" ? TOP_ROWS : await teamRows(+state.team);
  if (tok !== token) return;
  let who;
  if (only) who = "1 player";
  else if (state.team === "all") who = "All teams";
  else {
    const n = new Set(pr.filter(r => passes(r) && r.n > 0).map(r => r.player)).size;
    who = `${d3.format(",")(n)} ${n === 1 ? "player" : "players"} (30+ career shots)`;
  }

  renderKpis(rows, cmp, who);
  renderStreakChart(byStreak, cmp);

  d3.select("#players-hint").text(state.team === "all"
    ? "The 200 players with the most shots. Pick a team to see all of its players. Bigger dots took more shots. Small dots are mostly luck."
    : `Every ${CORE.teams[+state.team]} player with enough shots. Bigger dots took more shots. Small dots are mostly luck. Click a dot to see that player's games.`);
  renderPlayerChart(pr.filter(passes), P);
  renderDetail(p, pRows ? pRows.filter(passes) : [], pGames);
}

function renderKpis(rows, cmp, nPlayers) {
  const k = state.k;
  const mk = k === 1 ? "1 make" : k === 2 ? "2 makes" : "3+ makes";
  const ms = k === 1 ? "1 miss" : k === 2 ? "2 misses" : "3+ misses";
  const total = d3.sum(rows, r => r.n);
  const thin = cmp.thin || isNaN(cmp.effect);
  const clear = !thin && Math.abs(cmp.effect) > 1.96 * cmp.se;
  const dir = cmp.effect > 0 ? "better" : "worse";
  const few = `Too few shots to tell: ${d3.format(",")(cmp.H.n || 0)} after ${mk}, ${d3.format(",")(cmp.M.n || 0)} after ${ms} (need ${MIN_SHOTS} each)`;
  const items = [
    { name: "Shots in view", val: d3.format(",")(total), unit: "", note: `${nPlayers}, ${SHOT_WORD[state.shot]}` },
    { name: `After ${mk} vs. after ${ms}`, val: thin ? "–" : fmtPts(cmp.raw), unit: thin ? "" : "pts",
      note: thin ? "Too few shots to tell" : `Made ${fmtPct(cmp.H.pct)}% vs. ${fmtPct(cmp.M.pct)}% of next shots` },
    { name: "What chance alone gives", val: thin ? "–" : fmtPts(cmp.chance), unit: thin ? "" : "pts",
      note: thin ? "Too few shots to tell" : "Same gap in games with shuffled shot order" },
    { name: "Hot hand effect", val: thin ? "–" : fmtPts(cmp.effect), unit: thin ? "" : "pts", main: true,
      badge: thin ? "" : clear ? '<span class="badge clear">Clear</span>' : '<span class="badge noise">Could be noise</span>',
      note: thin ? few : `${Math.abs(cmp.effect).toFixed(1)} pts ${dir} than chance, ± ${(1.96 * cmp.se).toFixed(1)}`
        + (clear && (state.team !== "all" || state.only) ? ". One team or player: with hundreds to pick from, some look clear by luck." : "") },
  ];
  d3.select("#kpis").selectAll(".kpi").data(items).join("div")
    .attr("class", d => "kpi" + (d.main ? " main-kpi" : ""))
    .html(d => `<div class="k-name">${d.name}</div>
                <div class="k-val">${d.val}<small>${d.unit}</small>${d.badge || ""}</div>
                <div class="k-note">${d.note}</div>`);
}
function sizeOf(sel) {
  const el = document.querySelector(sel);
  return [Math.max(280, el.clientWidth), Math.max(180, el.clientHeight)];
}

function renderStreakChart(byStreak, cmp) {
  const [W, H] = sizeOf("#streak-chart");
  const m = { top: 22, right: 16, bottom: 30, left: 58 };
  const w = W - m.left - m.right, h = H - m.top - m.bottom;
  const svg = d3.select("#streak-chart").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const data = STREAKS.map(s => { const o = byStreak.get(s); return { s, ...o, thin: !(o.n >= MIN_SHOTS) }; });
  const x = d3.scaleBand().domain(STREAKS).range([0, w]).padding(0.12);
  const ext = d3.max(data.filter(d => !d.thin), d => Math.max(Math.abs(d.act || 0) + (d.ci || 0), Math.abs(d.chance || 0))) || 5;
  const y0 = d3.scaleLinear().domain([-Math.max(4, ext), Math.max(4, ext)]).nice().range([h, 0]);
  const [lo, hi] = y0.domain(); const y = v => y0(Math.max(lo, Math.min(hi, v)));
  y.domain = () => y0.domain(); y.ticks = (...a) => y0.ticks(...a); y.range = () => y0.range(); y.copy = () => y0.copy(); y.tickFormat = (...a) => y0.tickFormat(...a);

  // shade the columns used in the comparison
  g.selectAll(".band").data(STREAKS.filter(s => Math.abs(s) >= state.k)).join("rect")
    .attr("x", s => x(s)).attr("width", x.bandwidth()).attr("y", 0).attr("height", h)
    .attr("fill", s => (s > 0 ? C.make : C.miss)).attr("fill-opacity", s => (s > 0 ? 0.18 : 0.06));

  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y0).ticks(5).tickSize(-w).tickFormat(d => (d === 0 ? "Usual rate" : fmtPts(d, 0) + " pts")))
    .call(s => s.select(".domain").remove());
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", C.muted);
  const xa = g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(10).tickFormat(s => STREAK_LABEL[s]))
    .call(s => s.select(".domain").remove());
  xa.selectAll("text").style("fill", s => (s > 0 ? C.makeText : C.miss));

  const cx = s => x(s) + x.bandwidth() / 2;
  const shown = data.filter(d => d.n > 0 && !d.thin);
  if (!shown.length) {
    g.append("text").attr("class", "lbl").attr("text-anchor", "middle").attr("x", w / 2).attr("y", y(0) - 22)
      .style("font-size", "14px").style("paint-order", "stroke").style("stroke", "#fff").style("stroke-width", "6px")
      .text("Not enough shots with these filters");
  }
  else if (shown.length < data.filter(d => d.n > 0).length) {
    g.append("text").attr("class", "lbl").attr("text-anchor", "end").attr("x", w).attr("y", -8)
      .text(`Columns with fewer than ${MIN_SHOTS} shots are hidden`);
  }
  const col = g.selectAll(".col").data(shown).join("g")
    .on("mousemove", (e, d) => tip(e,
      `<b>${STREAK_LABEL[d.s]}${Math.abs(d.s) < 3 ? "" : ""} in a row</b><br>
       Next shot went in ${fmtPct(d.pct)}% of the time<br>
       ${fmtPts(d.act)} pts vs. usual (chance: ${fmtPts(d.chance)})<br>${d3.format(",")(d.n)} shots`))
    .on("mouseleave", hideTip);
  col.append("rect").attr("x", d => x(d.s)).attr("width", x.bandwidth()).attr("y", 0).attr("height", h).attr("fill", "transparent");
  // chance marker
  col.append("line").attr("x1", d => cx(d.s) - 18).attr("x2", d => cx(d.s) + 18)
    .attr("y1", d => y(d.chance)).attr("y2", d => y(d.chance))
    .attr("stroke", C.muted).attr("stroke-width", 3).attr("stroke-dasharray", "5 3");
  // interval + dot
  col.append("line").attr("x1", d => cx(d.s)).attr("x2", d => cx(d.s))
    .attr("y1", d => y(d.act - d.ci)).attr("y2", d => y(d.act + d.ci))
    .attr("stroke", C.ink).attr("stroke-width", 1.5);
  // made side: a basketball; missed side: a rim (ring)
  col.each(function (d) {
    const el = d3.select(this);
    if (d.s > 0) ball(el, cx(d.s), y(d.act), 10);
    else el.append("circle").attr("cx", cx(d.s)).attr("cy", y(d.act)).attr("r", 9)
      .attr("fill", "#fff").attr("stroke", C.miss).attr("stroke-width", 3.5);
  });
  col.append("text").attr("class", "lbl strong").attr("text-anchor", "start")
    .attr("x", d => cx(d.s) + 12).attr("y", d => y(d.act) + 4).text(d => fmtPts(d.act));

  d3.select("#streak-title").text(`Next-shot accuracy after each streak, ${SHOT_WORD[state.shot]}`);
}

// One dot per player, spread along a single line:
// right = shot better right after a make than right after a miss, left = worse.
function renderPlayerChart(rows, P) {
  const [W, H] = sizeOf("#player-chart");
  const m = { top: 56, right: 20, bottom: 44, left: 20 };
  const w = W - m.left - m.right, h = H - m.top - m.bottom;
  const svg = d3.select("#player-chart").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const pts = [];
  for (const [id, rs] of d3.group(rows, r => r.player)) {
    const c = compare(rs, 1);
    if (c.H.n < 5 || c.M.n < 5) continue;
    pts.push({ id, p: P.get(id), n: c.H.n + c.M.n, diff: c.H.pct * 100 - c.M.pct * 100, chance: c.chance, H: c.H, M: c.M });
  }
  if (!pts.length) {
    g.append("text").attr("class", "lbl").attr("x", w / 2).attr("y", h / 2).attr("text-anchor", "middle")
      .text("Not enough shots with these filters.");
    return;
  }

  const lim = Math.max(15, d3.quantile(pts.map(d => Math.abs(d.diff)).sort(d3.ascending), 0.96));
  const x = d3.scaleLinear().domain([-lim, lim]).nice().range([0, w]);
  const clampX = v => x(Math.max(x.domain()[0], Math.min(x.domain()[1], v)));
  const r = d3.scaleSqrt().domain([0, d3.max(pts, d => d.n)]).range([2.5, Math.min(9, h / 14)]);
  const mid = h / 2;

  // side shading and plain-language labels
  g.append("rect").attr("x", x(0)).attr("width", w - x(0)).attr("y", 0).attr("height", h)
    .attr("fill", C.make).attr("fill-opacity", 0.14);
  g.append("rect").attr("x", 0).attr("width", x(0)).attr("y", 0).attr("height", h)
    .attr("fill", C.miss).attr("fill-opacity", 0.05);

  const better = pts.filter(d => d.diff > 0).length, worse = pts.filter(d => d.diff < 0).length;
  const head = svg.append("g").attr("transform", `translate(${m.left},${m.top - 14})`);
  head.append("text").attr("class", "side-count").attr("x", 0).attr("y", -14).style("fill", C.miss).text(worse);
  head.append("text").attr("class", "lbl").attr("x", 0).attr("y", 2)
    .text(`players shot worse after a make`);
  head.append("text").attr("class", "side-count").attr("x", w).attr("y", -14).attr("text-anchor", "end")
    .style("fill", C.makeText).text(better);
  head.append("text").attr("class", "lbl").attr("x", w).attr("y", 2).attr("text-anchor", "end")
    .text(`players shot better after a make`);

  // beeswarm: dots pushed apart so none overlap
  const nodes = pts.map(d => ({ ...d, x: clampX(d.diff), y: mid, r: r(d.n) }));
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => clampX(d.diff)).strength(1))
    .force("y", d3.forceY(mid).strength(0.06))
    .force("collide", d3.forceCollide(d => d.r + 0.6))
    .stop();
  for (let i = 0; i < 160; i++) sim.tick();
  nodes.forEach(d => { d.y = Math.max(d.r, Math.min(h - d.r, d.y)); });

  // reference lines
  g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h).attr("stroke", C.ink).attr("stroke-width", 1.5);
  const luck = d3.sum(pts, d => d.chance * d.n) / d3.sum(pts, d => d.n);
  g.append("line").attr("x1", x(luck)).attr("x2", x(luck)).attr("y1", 0).attr("y2", h)
    .attr("stroke", C.muted).attr("stroke-dasharray", "4 4");
  g.append("text").attr("class", "lbl").attr("x", x(luck) - 4).attr("y", h - 4).attr("text-anchor", "end")
    .text(`luck alone: ${fmtPts(luck)}`);

  const sel = state.player;
  g.selectAll(".pdot").data(nodes.sort((a, b) => (a.id === sel) - (b.id === sel))).join("circle")
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => (d.id === sel ? d.r + 2 : d.r))
    .attr("fill", d => (d.id === sel ? C.ink : d.diff > 0 ? C.make : C.miss))
    .attr("fill-opacity", d => (d.id === sel ? 1 : d.diff > 0 ? 0.9 : 0.55))
    .attr("stroke", d => (d.id === sel ? "#fff" : d.diff > 0 ? C.makeEdge : "none")).attr("stroke-width", d => (d.id === sel ? 2 : 0.6))
    .style("cursor", "pointer")
    .on("mousemove", (e, d) => tip(e,
      `<b>${d.p.name}</b>, ${d.p.team}<br>
       Right after a make: ${fmtPct(d.H.pct)}% of ${d.H.n} shots<br>
       Right after a miss: ${fmtPct(d.M.pct)}% of ${d.M.n} shots<br>
       ${d.diff >= 0 ? "Better" : "Worse"} after a make by ${Math.abs(d.diff).toFixed(1)} pts`))
    .on("mouseleave", hideTip)
    .on("click", (e, d) => window.__selectPlayer(d.id === sel ? null : d.id));

  if (sel) {
    const d = nodes.find(q => q.id === sel);
    if (d) {
      const right = d.x < w - 120;
      g.append("text").attr("class", "lbl strong").attr("x", d.x + (right ? d.r + 6 : -d.r - 6)).attr("y", d.y + 4)
        .attr("text-anchor", right ? "start" : "end").text(d.p.name);
    }
  }

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(7).tickFormat(d => (d === 0 ? "Same" : fmtPts(d, 0) + " pts")))
    .call(s => s.select(".domain").attr("stroke", C.muted));
  g.append("text").attr("class", "lbl").attr("x", w / 2).attr("y", h + 36).attr("text-anchor", "middle")
    .text("Shooting % right after a make, minus right after a miss");
}

function renderDetail(p, mine, games) {
  const root = d3.select("#detail");
  if (!p) {
    root.html(`<div class="detail-empty">Pick a player with the search box or click a dot in the player chart to see their games shot by shot.</div>`);
    return;
  }
  const all = sum(mine), H = sum(mine.filter(c => c.streak >= 1)), M = sum(mine.filter(c => c.streak <= -1));
  const group = groupOf(state.shot) === "FT" ? 0 : 1;
  const mine_g = games.filter(g => g[2] === group).slice().reverse();     // most recent first
  const date = d => { const s = String(d).padStart(6, "0"); return `${s.slice(2, 4)}/${s.slice(4, 6)}/${s.slice(0, 2)}`; };
  const fullName = CORE.teams.length;

  root.html(`
    <div class="detail-grid">
      <div>
        <p class="d-name">${p.name}</p>
        <div class="d-meta">${p.team}. ${d3.format(",")(p.fga)} field goals, ${d3.format(",")(p.fta)} free throws.</div>
        <div class="d-stats">
          <div><b>${fmtPct(all.pct)}%</b>${SHOT_WORD[state.shot]}</div>
          <div><b>${d3.format(",")(all.n)}</b>shots counted</div>
          <div><b style="color:${C.makeText}">${fmtPct(H.pct)}%</b>right after a make</div>
          <div><b style="color:${C.miss}">${fmtPct(M.pct)}%</b>right after a miss</div>
        </div>
      </div>
      <div class="games" id="games"></div>
    </div>`);

  const wrap = d3.select("#games");
  if (!mine_g.length) { wrap.append("p").attr("class", "hint").text("No games with at least 3 shots of this kind."); return; }
  mine_g.slice(0, 40).forEach(g => {
    const r = wrap.append("div").attr("class", "game-row");
    r.append("span").attr("title", `vs ${CORE.teams[g[1]]}`).text(date(g[0]));
    drawStrip(r.append("div").attr("class", "strip").node(), g[3].split("").map(Number));
  });
  wrap.append("p").attr("class", "hint").style("grid-column", "1 / -1")
    .text(`${Math.min(40, mine_g.length)} most recent of ${mine_g.length} games.` +
      (group === 1 && state.shot !== "FG" ? " Rows show all field goals, since streaks are counted across 2s and 3s together." : ""));
}

// a gold basketball with seams
function ball(parent, x, y, r) {
  const g = parent.append("g").attr("transform", `translate(${x},${y})`).attr("class", "ball");
  g.append("circle").attr("r", r);
  if (r >= 5) {
    const k = r * 0.7;
    g.append("path").attr("d",
      `M0,${-r}V${r}M${-r},0H${r}M${-k},${-k}Q${-r * 0.2},0 ${-k},${k}M${k},${-k}Q${r * 0.2},0 ${k},${k}`);
  }
  return g;
}

function drawStrip(container, shots, r = 6, gap = 3) {
  const step = r * 2 + gap, width = shots.length * step - gap;
  const svg = d3.select(container).append("svg")
    .attr("viewBox", `-1 -1 ${width + 2} ${r * 2 + 8}`)
    .style("width", "100%").style("max-width", width + 2 + "px").style("height", "auto");
  // underline runs of 3+ makes
  let start = null;
  shots.forEach((s, i) => {
    if (s && start === null) start = i;
    if ((!s || i === shots.length - 1) && start !== null) {
      const end = s ? i : i - 1;
      if (end - start >= 2) svg.append("rect").attr("class", "run")
        .attr("x", start * step).attr("y", r * 2 + 3).attr("width", (end - start) * step + r * 2).attr("height", 2.5);
      start = null;
    }
  });
  shots.forEach((d, i) => {
    if (d) ball(svg, i * step + r, r, r);
    else svg.append("circle").attr("cx", i * step + r).attr("cy", r).attr("r", r - 0.9).attr("class", "miss");
  });
}
