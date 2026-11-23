// Hot Hand Explorer
// Every filter change re-adds the precomputed cells in the browser, so all numbers
// on screen always describe exactly the shots that pass the filters.

const C = {
  ink: "#1d1d27", muted: "#6b6f7b", rule: "#e1e2e8", panel: "#f6f6f9",
  make: "#DDCC77", makeEdge: "#b8a652", makeText: "#7a6a12", miss: "#332288", dot: "#9a9caa",
};
const STREAKS = [-3, -2, -1, 1, 2, 3];
const STREAK_LABEL = { "-3": "Missed 3+", "-2": "Missed 2", "-1": "Missed 1", 1: "Made 1", 2: "Made 2", 3: "Made 3+" };
const SHOT_WORD = { FT: "free throws", FG: "field goals", "2PT": "2-pointers", "3PT": "3-pointers" };

const DEFAULTS = { shot: "FT", k: 3, close: "all", half: "all", tier: "all", conf: "all", team: "all", min: 50, player: null, only: false };
const state = { ...DEFAULTS };

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
Promise.all([
  d3.csv("data/cells.csv", d => ({
    player: d.player, type: d.shot_type, close: d.close, half: d.half, streak: +d.streak,
    n: +d.n, made: +d.made, avg: +d.avg_sum, en: +d.exp_n, em: +d.exp_made, ea: +d.exp_avg_sum,
  })),
  d3.csv("data/players.csv", d => ({
    id: d.player, name: d.name, team: d.team_name || d.team, conf: d.conference || "", tier: d.tier,
    fga: +d.fga, fta: +d.fta,
  })),
  d3.csv("data/sequences.csv", d => ({ player: d.player, group: d.group, game: d.game, shots: d.shots })),
]).then(([cells, players, seqs]) => {
  const P = new Map(players.map(p => [p.id, p]));
  const seqBy = d3.group(seqs, d => d.player, d => d.group);
  setupFilters(players, P);
  const redraw = () => render(cells, P, seqBy);
  window.__redraw = redraw;
  redraw();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(redraw, 120); });
});

// ---------------------------------------------------------------
// Filters
// ---------------------------------------------------------------
function setupFilters(players, P) {
  d3.selectAll(".seg").each(function () {
    const seg = d3.select(this), key = this.dataset.key;
    seg.selectAll("button").on("click", function () {
      seg.selectAll("button").classed("on", false);
      d3.select(this).classed("on", true);
      state[key] = key === "k" ? +this.dataset.v : this.dataset.v;
      window.__redraw();
    });
  });

  const confs = ["all", ...[...new Set(players.map(p => p.conf).filter(Boolean))].sort()];
  const confSel = d3.select("#f-conf");
  confSel.selectAll("option").data(confs).join("option").attr("value", d => d).text(d => (d === "all" ? "All" : d));
  const fillTeams = () => {
    const teams = ["all", ...[...new Set(players.filter(p => state.conf === "all" || p.conf === state.conf).map(p => p.team))].sort()];
    d3.select("#f-team").selectAll("option").data(teams).join("option").attr("value", d => d).text(d => (d === "all" ? "All" : d));
    d3.select("#f-team").property("value", state.team);
  };
  fillTeams();
  confSel.on("change", function () { state.conf = this.value; state.team = "all"; fillTeams(); window.__redraw(); });
  d3.select("#f-team").on("change", function () { state.team = this.value; window.__redraw(); });

  d3.select("#f-min").on("input", function () {
    state.min = +this.value;
    d3.select("#f-min-val").text(state.min);
    window.__redraw();
  });

  const label = p => `${p.name} (${p.team})`;
  d3.select("#player-list").selectAll("option").data(players).join("option").attr("value", label);
  const byLabel = new Map(players.map(p => [label(p), p.id]));
  d3.select("#f-player").on("change input", function () {
    const id = byLabel.get(this.value);
    if (id || this.value === "") { state.player = id || null; window.__redraw(); }
  });
  d3.select("#f-only").on("change", function () { state.only = this.checked; window.__redraw(); });

  d3.select("#reset").on("click", () => {
    Object.assign(state, DEFAULTS);
    d3.selectAll(".seg").each(function () {
      const key = this.dataset.key;
      d3.select(this).selectAll("button").classed("on", function () { return String(DEFAULTS[key]) === this.dataset.v; });
    });
    confSel.property("value", "all"); fillTeams();
    d3.select("#f-min").property("value", DEFAULTS.min); d3.select("#f-min-val").text(DEFAULTS.min);
    d3.select("#f-player").property("value", ""); d3.select("#f-only").property("checked", false);
    window.__redraw();
  });

  // let the selected player be set from charts
  window.__selectPlayer = id => {
    state.player = id;
    d3.select("#f-player").property("value", id ? label(P.get(id)) : "");
    window.__redraw();
  };
}

// ---------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------
const groupOf = shot => (shot === "FT" ? "FT" : "FG");
const typesOf = shot => (shot === "FG" ? ["2PT", "3PT"] : [shot]);

function eligible(p) {
  if (!p) return false;
  if (state.tier !== "all" && p.tier !== state.tier) return false;
  if (state.conf !== "all" && p.conf !== state.conf) return false;
  if (state.team !== "all" && p.team !== state.team) return false;
  const vol = groupOf(state.shot) === "FT" ? p.fta : p.fga;
  return vol >= state.min;
}

function filterCells(cells, P, { usePlayerOnly = true } = {}) {
  const types = new Set(typesOf(state.shot));
  const ok = new Map();
  return cells.filter(c => {
    if (!types.has(c.type)) return false;
    if (state.close !== "all" && c.close !== state.close) return false;
    if (state.half !== "all" && c.half !== state.half) return false;
    if (usePlayerOnly && state.only && state.player) return c.player === state.player;
    if (!ok.has(c.player)) ok.set(c.player, eligible(P.get(c.player)));
    return ok.get(c.player);
  });
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

function compare(rows, k) {
  const H = sum(rows.filter(r => r.streak >= k));
  const M = sum(rows.filter(r => r.streak <= -k));
  const raw = H.act - M.act, chance = H.chance - M.chance, effect = raw - chance;
  const se = Math.sqrt(H.pct * (1 - H.pct) / H.n + M.pct * (1 - M.pct) / M.n) * 100;
  return { H, M, raw, chance, effect, se };
}

// ---------------------------------------------------------------
// Render everything
// ---------------------------------------------------------------
function render(cells, P, seqBy) {
  const rows = filterCells(cells, P);
  const byStreak = new Map(STREAKS.map(s => [s, sum(rows.filter(r => r.streak === s))]));
  const cmp = compare(rows, state.k);
  const nPlayers = new Set(rows.map(r => r.player)).size;

  renderKpis(rows, cmp, nPlayers);
  renderStreakChart(byStreak, cmp);
  renderPlayerChart(filterCells(cells, P, { usePlayerOnly: false }), P);
  renderDetail(cells, P, seqBy);
}

function renderKpis(rows, cmp, nPlayers) {
  const k = state.k, kTxt = k === 3 ? "3+" : k;
  const total = d3.sum(rows, r => r.n);
  const clear = Math.abs(cmp.effect) > 1.96 * cmp.se;
  const dir = cmp.effect > 0 ? "better" : "worse";
  const items = [
    { name: "Shots in view", val: d3.format(",")(total), unit: "", note: `${nPlayers} players, ${SHOT_WORD[state.shot]}` },
    { name: `After ${kTxt} makes vs. after ${kTxt} misses`, val: fmtPts(cmp.raw), unit: "pts",
      note: `Made ${fmtPct(cmp.H.pct)}% vs. ${fmtPct(cmp.M.pct)}% of next shots` },
    { name: "What chance alone gives", val: fmtPts(cmp.chance), unit: "pts", note: "Same gap in games with shuffled shot order" },
    { name: "Hot hand effect", val: fmtPts(cmp.effect), unit: "pts", main: true,
      badge: isNaN(cmp.effect) ? "" : clear ? '<span class="badge clear">Clear</span>' : '<span class="badge noise">Could be noise</span>',
      note: isNaN(cmp.effect) ? "Not enough shots with these filters"
        : `${Math.abs(cmp.effect).toFixed(1)} pts ${dir} than chance, ± ${(1.96 * cmp.se).toFixed(1)}` },
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

  const data = STREAKS.map(s => ({ s, ...byStreak.get(s) }));
  const x = d3.scaleBand().domain(STREAKS).range([0, w]).padding(0.12);
  const ext = d3.max(data, d => Math.max(Math.abs(d.act || 0) + (d.ci || 0), Math.abs(d.chance || 0))) || 5;
  const y = d3.scaleLinear().domain([-Math.max(4, ext), Math.max(4, ext)]).nice().range([h, 0]);

  // shade the columns used in the comparison
  g.selectAll(".band").data(STREAKS.filter(s => Math.abs(s) >= state.k)).join("rect")
    .attr("x", s => x(s)).attr("width", x.bandwidth()).attr("y", 0).attr("height", h)
    .attr("fill", s => (s > 0 ? C.make : C.miss)).attr("fill-opacity", s => (s > 0 ? 0.18 : 0.06));

  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(d => (d === 0 ? "Usual rate" : fmtPts(d, 0) + " pts")))
    .call(s => s.select(".domain").remove());
  g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", C.muted);
  const xa = g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(10).tickFormat(s => STREAK_LABEL[s]))
    .call(s => s.select(".domain").remove());
  xa.selectAll("text").style("fill", s => (s > 0 ? C.makeText : C.miss));

  const cx = s => x(s) + x.bandwidth() / 2;
  const col = g.selectAll(".col").data(data.filter(d => d.n > 0)).join("g")
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
      .text("Not enough shots with these filters. Try lowering the minimum.");
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

function renderDetail(cells, P, seqBy) {
  const root = d3.select("#detail");
  const p = state.player && P.get(state.player);
  if (!p) {
    root.html(`<div class="detail-empty">Pick a player with the search box or click a dot in the player chart to see their games shot by shot.</div>`);
    return;
  }
  const types = new Set(typesOf(state.shot));
  const mine = cells.filter(c => c.player === p.id && types.has(c.type)
    && (state.close === "all" || c.close === state.close) && (state.half === "all" || c.half === state.half));
  const all = sum(mine), H = sum(mine.filter(c => c.streak >= 1)), M = sum(mine.filter(c => c.streak <= -1));
  const group = groupOf(state.shot);
  const games = (seqBy.get(p.id)?.get(group)) || [];

  root.html(`
    <div class="detail-grid">
      <div>
        <p class="d-name">${p.name}</p>
        <div class="d-meta">${p.team}${p.conf ? ", " + p.conf : ""}. ${p.tier}.</div>
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
  if (!games.length) { wrap.append("p").attr("class", "hint").text("No games with enough shots."); return; }
  games.slice(0, 24).forEach((g, i) => {
    const row = wrap.append("div").attr("class", "game-row");
    row.append("span").text(`Game ${i + 1}`);
    drawStrip(row.append("div").attr("class", "strip").node(), g.shots.split("").map(Number));
  });
  if (group === "FG" && state.shot !== "FG") {
    wrap.append("p").attr("class", "hint").style("grid-column", "1 / -1")
      .text("Game rows show all field goals, since streaks are counted across 2s and 3s together.");
  }
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
