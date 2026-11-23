import React, { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear, scaleLog } from 'd3-scale'

const sgn = (v, d = 1) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)
const pct = (v, d = 1) => v == null ? '–' : (v * 100).toFixed(d) + '%'
const fmt = (n) => n.toLocaleString('en-US')

function useWidth(initial = 760) {
  const ref = useRef(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((e) => setW(Math.max(300, Math.round(e[0].contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
function useTip() {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)
  const show = (e, html) => {
    const r = ref.current.getBoundingClientRect()
    setTip({ x: Math.min(Math.max(e.clientX - r.left, 120), r.width - 120), y: e.clientY - r.top, html })
  }
  return { ref, show, hide: () => setTip(null), node: tip && <div className="tip" style={{ left: tip.x, top: tip.y }} role="status">{tip.html}</div> }
}

const verdict = (c) => {
  if (!c || c.e == null) return { t: 'Not enough data', cls: '' }
  if (c.lo > 0) return { t: 'Above chance: a hot hand', cls: 'up' }
  if (c.hi < 0) return { t: 'Below chance: worse after a streak', cls: 'down' }
  return { t: 'Within chance: no clear effect', cls: 'flat' }
}

function Seg({ label, value, options, onChange }) {
  return (
    <div className="fgroup">
      <div className="flabel">{label}</div>
      <div className="seg wrap-seg" role="group" aria-label={label}>
        {options.map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
      </div>
    </div>
  )
}

/* ───────────── Filter view ───────────── */
function FilterView({ X }) {
  const [t, setT] = useState(0)
  const [q, setQ] = useState(2)
  const [k, setK] = useState(2)
  const [s, setS] = useState(21)
  const seasons = X.meta.seasons
  const cell = X.cube[k][t][s][q]
  const v = verdict(cell)
  const typeName = X.meta.types[t].toLowerCase()
  const series = seasons.map((yr, i) => ({ yr, i, c: X.cube[k][t][i][q] })).filter((d) => d.c.e != null && d.c.nM > 0 && d.c.nH > 0)

  const [wref, W] = useWidth()
  const tp = useTip()
  const H = 220, m = { l: 34, r: 10, t: 14, b: 30 }
  const ext = Math.min(12, Math.max(3, ...series.map((d) => Math.max(Math.abs(d.c.lo), Math.abs(d.c.hi)))))
  const x = scaleLinear().domain([2005.5, 2026.5]).range([m.l, W - m.r])
  const y = scaleLinear().domain([-ext, ext]).range([H - m.b, m.t])
  const cl = (v) => Math.max(-ext, Math.min(ext, v))

  return (
    <div ref={wref}>
      <div className="filters">
        <Seg label="Shot type" value={t} onChange={setT} options={X.meta.types.map((n, i) => [i, n])} />
        <Seg label="Game" value={q} onChange={setQ} options={[[2, 'All games'], [1, 'Close (≤ 5 pts)'], [0, 'Blowouts']]} />
        <Seg label="Streak" value={k} onChange={setK} options={[[0, '1 in a row'], [1, '2 in a row'], [2, '3 in a row']]} />
        <div className="fgroup">
          <div className="flabel">Season</div>
          <select className="sel" value={s} onChange={(e) => setS(+e.target.value)} aria-label="Season">
            <option value={21}>All seasons (2006–2026)</option>
            {seasons.map((yr, i) => <option key={yr} value={i}>{yr - 1}–{String(yr).slice(2)}</option>)}
          </select>
        </div>
      </div>

      <div className="result" aria-live="polite">
        <div>
          <div className={'res-num ' + v.cls}>{sgn(cell.e)}<span>pp</span></div>
          <div className={'res-verdict ' + v.cls}>{v.t}</div>
        </div>
        <p className="res-text">
          {cell.e == null ? 'Too few streaks in this combination to estimate.' : <>
            For {typeName}{q === 1 ? ' in close games' : q === 0 ? ' in blowouts' : ''}{s < 21 ? `, ${seasons[s] - 1}–${String(seasons[s]).slice(2)} season` : ''}: after {k + 1} make{k ? 's' : ''} in a row players hit <strong>{pct(cell.pH)}</strong>, after {k + 1} miss{k ? 'es' : ''} <strong>{pct(cell.pM)}</strong> (raw, all players pooled).
            {' '}Comparing each player with herself and with {X.meta.shuffles}+ shuffled orders, the streak is worth <strong>{sgn(cell.e, 2)} pp</strong> (95% interval {sgn(cell.lo, 2)} to {sgn(cell.hi, 2)}).
            <span className="res-n"> Based on {fmt(cell.nH)} shots after a make streak and {fmt(cell.nM)} after a miss streak.</span>
          </>}
        </p>
      </div>

      <div className="flabel" style={{ marginTop: 10 }}>Season by season · click a season to select it</div>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Effect by season with 95% intervals">
          {[-ext, -ext / 2, 0, ext / 2, ext].map((v) => <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={v === 0 ? 1.5 : 1} /><text className="tick" x={m.l - 6} y={y(v) + 4} textAnchor="end">{v === 0 ? '0' : sgn(v, ext < 6 ? 1 : 0)}</text></g>)}
          {seasons.filter((yr) => yr % (W < 560 ? 5 : 2) === 0).map((yr) => <text key={yr} className="tick" x={x(yr)} y={H - 10} textAnchor="middle">{`'${String(yr).slice(2)}`}</text>)}
          {series.map((d) => {
            const on = d.i === s
            return (
              <g key={d.yr} style={{ cursor: 'pointer' }} onClick={() => setS(on ? 21 : d.i)}
                onMouseMove={(e) => tp.show(e, <><b>{d.yr - 1}–{String(d.yr).slice(2)}</b><br />{sgn(d.c.e, 2)} pp beyond chance<br />95% interval {sgn(d.c.lo, 2)} to {sgn(d.c.hi, 2)}<br />{fmt(d.c.nH + d.c.nM)} streak shots</>)} onMouseLeave={tp.hide}>
                <rect x={x(d.yr) - 12} y={m.t} width={24} height={H - m.b - m.t} fill={on ? 'var(--surface-2)' : 'transparent'} rx="4" />
                <line x1={x(d.yr)} x2={x(d.yr)} y1={y(cl(d.c.lo))} y2={y(cl(d.c.hi))} stroke={t === 0 ? 'var(--series-ft)' : 'var(--series-fg)'} strokeWidth="2.5" strokeLinecap="round" opacity={on || s === 21 ? 1 : 0.45} />
                <circle cx={x(d.yr)} cy={y(cl(d.c.e))} r={on ? 6.5 : 5} fill={t === 0 ? 'var(--series-ft)' : 'var(--series-fg)'} stroke="var(--surface-1)" strokeWidth="2" opacity={on || s === 21 ? 1 : 0.45} />
              </g>
            )
          })}
        </svg>
        {tp.node}
      </div>
      <p className="caption">Dots: effect beyond chance (pp). Lines: 95% intervals, clipped at ±{ext.toFixed(0)}. Early seasons and close-game splits have fewer shots, so their intervals are wide.</p>
    </div>
  )
}

/* ───────────── Player funnel ───────────── */
function PlayerView({ X }) {
  const [type, setType] = useState('fg')
  const [team, setTeam] = useState(X.meta.purdue)
  const [sel, setSel] = useState(null)
  const [query, setQuery] = useState('')
  const teams = useMemo(() => Object.entries(X.teams).map(([id, n]) => [+id, n]).sort((a, b) => a[1].localeCompare(b[1])), [X])
  const all = useMemo(() => { const cc = X.meta.band[type]; return X.players.filter((p) => p[type]).map((p) => ({ ...p, e: p[type][0], w: p[type][2], b: 1.96 * cc / Math.sqrt(p[type][2]), out: Math.abs(p[type][0]) > 1.96 * cc / Math.sqrt(p[type][2]) })) }, [X, type])
  const mine = useMemo(() => team ? all.filter((p) => p.t === team) : [], [all, team])
  useEffect(() => {
    const pool = mine.length ? mine : all
    setSel(pool.length ? pool.reduce((a, b) => (b.w > a.w ? b : a)).id : null)
    setQuery('')
  }, [team, type]) // eslint-disable-line
  const selP = all.find((p) => p.id === sel)
  const c = X.meta.band[type]
  const outAll = all.filter((p) => p.out).length
  const outMine = mine.filter((p) => p.out).length

  const [wref, W] = useWidth()
  const tp = useTip()
  const H = W < 560 ? 300 : 340, m = { l: 40, r: 12, t: 12, b: 38 }
  const wMax = Math.max(...all.map((p) => p.w))
  const x = scaleLog().domain([4, wMax * 1.05]).range([m.l, W - m.r])
  const Y = 40
  const y = scaleLinear().domain([-Y, Y]).range([H - m.b, m.t])
  const cy = (v) => y(Math.max(-Y, Math.min(Y, v)))
  const band = useMemo(() => {
    const pts = []; for (let i = 0; i <= 60; i++) { const w = 4 * Math.pow(wMax * 1.05 / 4, i / 60); pts.push([w, 1.96 * c / Math.sqrt(w)]) }
    return 'M' + pts.map(([w, b]) => `${x(w)},${cy(b)}`).join('L') + 'L' + pts.reverse().map(([w, b]) => `${x(w)},${cy(-b)}`).join('L') + 'Z'
  }, [W, H, c, wMax]) // eslint-disable-line
  const col = type === 'ft' ? 'var(--series-ft)' : 'var(--series-fg)'
  const teamName = team ? X.teams[team] : null
  const pickByName = (v) => {
    setQuery(v)
    const p = (mine.length ? mine : all).find((d) => d.n.toLowerCase() === v.toLowerCase())
    if (p) setSel(p.id)
  }
  const tipFor = (p) => <><b>{p.n}</b> · {X.teams[p.t] || ''}<br />{sgn(p.e, 1)} pp beyond chance<br />chance range ±{p.b.toFixed(1)} · {p.out ? 'outside' : 'inside'} the band</>

  return (
    <div ref={wref}>
      <div className="filters">
        <Seg label="Shot type" value={type} onChange={setType} options={[['fg', 'Field goals'], ['ft', 'Free throws']]} />
        <div className="fgroup">
          <div className="flabel">Team</div>
          <select className="sel" value={team || ''} onChange={(e) => setTeam(e.target.value ? +e.target.value : null)} aria-label="Team">
            <option value="">All teams</option>
            {teams.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <div className="flabel">Find a player</div>
          <input className="sel" list="plist" value={query} placeholder="Type a name" onChange={(e) => pickByName(e.target.value)} aria-label="Find a player" />
          <datalist id="plist">{(mine.length ? mine : all).slice(0, 3000).map((p) => <option key={p.id} value={p.n} />)}</datalist>
        </div>
      </div>

      <p className="takeaway">
        {teamName
          ? <>{teamName}: <strong>{outMine} of {mine.length}</strong> players fall outside the chance band. </>
          : null}
        Across all {fmt(all.length)} players, {(outAll / all.length * 100).toFixed(1)}% do, about the 5% that luck alone produces.
      </p>

      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Funnel plot of ${all.length} players: effect beyond chance against sample size`}>
          <path d={band} fill="var(--surface-2)" stroke="var(--axis)" strokeDasharray="4 4" />
          {[-30, -15, 0, 15, 30].map((v) => <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} /><text className="tick" x={m.l - 6} y={y(v) + 4} textAnchor="end">{v === 0 ? '0' : sgn(v, 0)}</text></g>)}
          {[5, 10, 20, 50, 100, 200, 500].filter((v) => v < wMax).map((v) => <text key={v} className="tick" x={x(v)} y={H - 20} textAnchor="middle">{v}</text>)}
          <text x={(m.l + W) / 2} y={H - 3} textAnchor="middle" style={{ fontSize: 11.5 }}>More streak shots → (log scale)</text>
          {W >= 560 && <text className="halo" x={W - m.r - 4} y={y(1.96 * c / Math.sqrt(wMax)) - 6} textAnchor="end" style={{ fontSize: 11.5 }}>chance band (95%)</text>}
          <g opacity={team ? 0.22 : 0.5}>
            {all.map((p) => <circle key={p.id} cx={x(p.w)} cy={cy(p.e)} r={team ? 2 : 2.6} fill={team ? 'var(--text-muted)' : col} />)}
          </g>
          {mine.map((p) => (
            <circle key={p.id} cx={x(p.w)} cy={cy(p.e)} r={p.id === sel ? 8 : 5.5} fill={col} stroke={p.id === sel ? 'var(--text-primary)' : 'var(--surface-1)'} strokeWidth={p.id === sel ? 2.5 : 1.5}
              style={{ cursor: 'pointer' }} onClick={() => setSel(p.id)} onMouseMove={(e) => tp.show(e, tipFor(p))} onMouseLeave={tp.hide} />
          ))}
          {selP && !mine.includes(selP) && <circle cx={x(selP.w)} cy={cy(selP.e)} r="8" fill={col} stroke="var(--text-primary)" strokeWidth="2.5" />}
          {selP && <text className="lbl-strong halo" x={x(selP.w) + (x(selP.w) > W - 150 ? -12 : 12)} y={cy(selP.e) + 4} textAnchor={x(selP.w) > W - 150 ? 'end' : 'start'}>{selP.n}</text>}
        </svg>
        {tp.node}
      </div>

      {selP && (
        <div className="pcard">
          <div><div className="pname">{selP.n}</div><div className="pmeta">{X.teams[selP.t] || 'Unknown team'} · {selP.s[0] - 1}–{String(selP.s[1]).slice(2)} · {fmt(selP.c[0])} FT, {fmt(selP.c[1])} FG</div></div>
          <div className="pstat"><b>{sgn(selP.e)} pp</b> vs chance range ±{selP.b.toFixed(1)}</div>
          <div className={'pver ' + (selP.out ? (selP.e > 0 ? 'up' : 'down') : 'flat')}>{selP.out ? (selP.e > 0 ? 'Outside the band: streakier than chance' : 'Outside the band: worse after streaks') : 'Inside the band: consistent with luck'}</div>
        </div>
      )}
      <p className="caption">Each dot is a player with enough three-in-a-row situations (effective sample ≥ 4). Up = shoots better after three makes than after three misses, beyond what shuffling her own shots produces. The shaded funnel is where 95% of players would land if streaks meant nothing. Individual estimates are noisy: a dot outside the band is not proof of a hot hand.</p>
    </div>
  )
}

export default function Explore() {
  const [X, setX] = useState(null)
  const [view, setView] = useState('filter')
  const [err, setErr] = useState(false)
  useEffect(() => { fetch('./data/explore.json').then((r) => r.json()).then(setX).catch(() => setErr(true)) }, [])
  if (err) return <p>Could not load the explore data.</p>
  if (!X) return <p>Loading every combination…</p>
  return (
    <>
      <div className="viewtabs" role="tablist">
        <button role="tab" aria-selected={view === 'filter'} onClick={() => setView('filter')}>Filter the data</button>
        <button role="tab" aria-selected={view === 'players'} onClick={() => setView('players')}>Find a player</button>
      </div>
      {view === 'filter' ? <FilterView X={X} /> : <PlayerView X={X} />}
    </>
  )
}
