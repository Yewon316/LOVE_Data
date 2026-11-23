import React, { useCallback, useEffect, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { ticks, max } from 'd3-array'
import Explore from './Explore.jsx'

const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%'
const pTxt = (p) => (p < 0.01 ? 'p < 0.01' : 'p = ' + p.toFixed(2))
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const FT = 'var(--series-ft)', FG = 'var(--series-fg)'
const TYP = { 0: 'Free throw', 1: 'Three-pointer', 2: 'Mid-range jumper', 3: 'Layup / dunk / tip' }
const CLOSE = 'Close game (final margin <= 5)', BLOW = 'Blowout (final margin > 5)'

/* ───────────── hooks ───────────── */
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
  const hide = () => setTip(null)
  const node = tip && <div className="tip" style={{ left: tip.x, top: tip.y }} role="status">{tip.html}</div>
  return { ref, show, hide, node }
}

const roundTop = (x, y, w, h, r) => {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

/* ───────────── Chapter 1: prediction game ───────────── */
function Game({ sits, onNext, onSkip }) {
  const [phase, setPhase] = useState('intro')
  const [belief, setBelief] = useState(null)
  const [rounds, setRounds] = useState([])
  const [i, setI] = useState(0)
  const [guess, setGuess] = useState(null)
  const [log, setLog] = useState([])

  const start = (b) => {
    const pick = (kind, streak, n) => shuffle(sits.filter((s) => s.kind === kind && s.streak === streak)).slice(0, n)
    setBelief(b)
    setRounds(shuffle([...pick('fg', 'hot', 3), ...pick('fg', 'cold', 3), ...pick('ft', 'hot', 2), ...pick('ft', 'cold', 2)]))
    setI(0); setGuess(null); setLog([]); setPhase('play')
  }
  const next = () => {
    const nl = [...log, { ...rounds[i], guess }]
    setLog(nl)
    if (i + 1 >= rounds.length) setPhase('done'); else { setI(i + 1); setGuess(null) }
  }

  if (phase === 'intro') {
    return (
      <div className="card">
        <h3>Gut check first</h3>
        <p>A player has just made three shots in a row. Is her next shot more likely to go in?</p>
        <div className="btn-row">
          <button className="btn" onClick={() => start('yes')}>Yes, she’s heating up</button>
          <button className="btn" onClick={() => start('slight')}>Maybe slightly</button>
          <button className="btn" onClick={() => start('no')}>No, it’s a myth</button>
        </div>
        <p className="caption" style={{ marginTop: 14 }}>Then predict 10 real shots, each taken right after three makes or three misses in a row. <button className="linkbtn" onClick={onSkip}>Skip to the answer →</button></p>
      </div>
    )
  }

  if (phase === 'play') {
    const r = rounds[i]
    const hot = r.streak === 'hot'
    const done = guess !== null
    const right = done && ((guess === 'make') === (r.made === 1))
    return (
      <div className="card" aria-live="polite">
        <div className="progress">Shot {i + 1} of {rounds.length}</div>
        <div className="shots" role="img" aria-label={`Her last three shots: ${hot ? 'three makes' : 'three misses'}`}>
          {[0, 1, 2].map((k) => <div key={k} className={'dot ' + (hot ? 'made' : 'miss')}>{hot ? '✓' : '✕'}</div>)}
          <div className="dot next">{done ? (r.made ? '✓' : '✕') : '?'}</div>
        </div>
        <div className="facts">
          <span><b>{TYP[r.typ]}</b></span>
          <span>Quarter <b>{r.period > 4 ? 'OT' : r.period}</b></span>
          <span>Score margin <b>{r.margin}</b> pts</span>
          <span>Her average on {r.kind === 'ft' ? 'free throws' : 'field goals'}: <b>{pct(r.base, 0)}</b></span>
        </div>
        {!done ? (
          <div className="btn-row">
            <button className="btn" onClick={() => setGuess('make')}>She makes it</button>
            <button className="btn" onClick={() => setGuess('miss')}>She misses</button>
          </div>
        ) : (
          <>
            <div className="reveal">{r.made ? 'It went in.' : 'It missed.'} {right ? 'You got it.' : 'Not this time.'}</div>
            <div className="btn-row"><button className="btn primary" onClick={next}>{i + 1 >= rounds.length ? 'See how you did' : 'Next shot'}</button></div>
          </>
        )}
      </div>
    )
  }

  const hotL = log.filter((l) => l.streak === 'hot'), coldL = log.filter((l) => l.streak === 'cold')
  const rate = (a, f) => (a.length ? a.filter(f).length / a.length : 0)
  const correct = log.filter((l) => (l.guess === 'make') === (l.made === 1)).length
  const bTxt = { yes: 'You said a streak clearly helps.', slight: 'You said a streak helps a little.', no: 'You said the hot hand is a myth.' }[belief]
  return (
    <div className="card">
      <div className="kicker">Your result</div>
      <div className="bignum">{correct}/{log.length}</div>
      <p style={{ marginTop: 10 }}>
        After three makes you called a make <strong>{pct(rate(hotL, (l) => l.guess === 'make'), 0)}</strong> of the time; after three misses, <strong>{pct(rate(coldL, (l) => l.guess === 'make'), 0)}</strong>.
        {' '}{bTxt}
      </p>
      <p>Ten shots are mostly luck, and they mix strong and weak shooters, which is exactly the trap that fooled people for decades. Here is what 8.3 million shots say.</p>
      <div className="btn-row">
        <button className="btn primary" onClick={onNext}>See the answer →</button>
        <button className="btn" onClick={() => setPhase('intro')}>Play again</button>
      </div>
    </div>
  )
}

/* ───────────── Chapter 2: the answer ───────────── */
function Answer({ R, go }) {
  const ft = R.streak.ft['3'], fg = R.streak.fg['3']
  return (
    <>
      <div className="answer-grid">
        <div className="stat ft">
          <div className="stat-label">Free throws</div>
          <div className="stat-num">{sgn(ft.effect)}<span>pp</span></div>
          <div className="stat-verdict">Yes, a little</div>
          <p>Players make slightly more free throws after three makes than chance explains (95% interval {sgn(ft.lo)} to {sgn(ft.hi)}).</p>
        </div>
        <div className="stat fg">
          <div className="stat-label">Field goals</div>
          <div className="stat-num">{sgn(fg.effect)}<span>pp</span></div>
          <div className="stat-verdict">No</div>
          <p>After three makes, field-goal accuracy is not higher, and is slightly lower, than chance predicts (95% interval {sgn(fg.lo)} to {sgn(fg.hi)}).</p>
        </div>
      </div>
      <p className="caption">pp = percentage points: make rate after three straight makes minus make rate after three straight misses, compared with what shuffled shot orders produce. NCAA women’s basketball, 2006–2026, 8.3 million shots.</p>
      <p>The rest of this page shows how we got there, and why a naive look at the same data says the opposite.</p>
      <div className="btn-row">
        <button className="btn" onClick={() => go(5)}>Where it shows up</button>
        <button className="btn primary" onClick={() => go(6)}>Explore it yourself</button>
      </div>
    </>
  )
}

/* ───────────── Chapter 4: what is left after each correction ───────────── */
function Shrink({ R }) {
  const [wref, W] = useWidth()
  const narrow = W < 560
  const rowH = narrow ? 50 : 38, left = narrow ? 34 : 250, right = 64, gap = 52
  const panels = [{ key: 'ft', title: 'Free throws', color: FT }, { key: 'fg', title: 'Field goals', color: FG }]
  const x = scaleLinear().domain([-2, 16]).range([left, W - right])
  const tp = useTip()
  const ph = 3 * rowH + gap
  return (
    <div ref={wref}>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" width={W} height={panels.length * ph + 24} viewBox={`0 0 ${W} ${panels.length * ph + 24}`} role="img"
          aria-label="Bar chart of the streak effect shrinking after each correction, for free throws and field goals">
          {panels.map((p, pi) => {
            const rt = R.rates[p.key]['3'], st = R.streak[p.key]['3']
            const rows = [
              { l: 'Raw: everyone pooled', v: (rt.pH - rt.pM) * 100, t: `All shots after three makes (${pct(rt.pH)}) vs after three misses (${pct(rt.pM)}). Good shooters dominate the first group.` },
              { l: 'Each player vs herself', v: st.obs, t: 'Gap computed within each player, then averaged. Skill differences are gone, but the counting bias remains.' },
              { l: 'Beyond chance (shuffled)', v: st.effect, t: `Minus the average of ${pi === 0 ? R.meta.perm_ft : R.meta.perm_fg} shuffled shot orders. 95% interval ${sgn(st.lo, 2)} to ${sgn(st.hi, 2)}.` },
            ]
            return (
              <g key={p.key} transform={`translate(0,${22 + pi * ph})`}>
                <text className="lbl-strong" x={0} y={-6} style={{ fontSize: 15 }}>{p.title}</text>
                {[0, 5, 10, 15].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={4} y2={3 * rowH} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={t === 0 ? 1.5 : 1} /><text className="tick" x={x(t)} y={3 * rowH + 16} textAnchor="middle">{t === 0 ? '0' : '+' + t}</text></g>)}
                {rows.map((r, k) => {
                  const bx = Math.min(x(0), x(r.v)), bw = Math.abs(x(r.v) - x(0))
                  const by = narrow ? 22 : 8, bh = narrow ? 20 : rowH - 16
                  return (
                    <g key={k} transform={`translate(0,${k * rowH})`}
                      onMouseMove={(e) => tp.show(e, <><b>{r.l}</b><br />{sgn(r.v, 2)} percentage points<br />{r.t}</>)} onMouseLeave={tp.hide}>
                      <rect x={0} y={0} width={W} height={rowH} fill="transparent" />
                      <text className={narrow ? 'halo' : ''} x={narrow ? 0 : 0} y={narrow ? 15 : rowH / 2 + 4}>{r.l}</text>
                      <rect x={bx} y={by} width={Math.max(bw, 2)} height={bh} rx={4} fill={p.color} opacity={[0.35, 0.65, 1][k]} />
                      <text className="lbl-strong" x={r.v >= 0 ? x(r.v) + 7 : x(r.v) - 7} y={by + bh / 2 + 4} textAnchor={r.v >= 0 ? 'start' : 'end'}>{sgn(r.v)}</text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
        {tp.node}
      </div>
    </div>
  )
}

/* ───────────── Chapter 5: shuffled baseline histogram ───────────── */
function NullHist({ R }) {
  const [kind, setKind] = useState('ft')
  const [k, setK] = useState('3')
  const [wref, W] = useWidth()
  const h = R.hist[kind][k], st = R.streak[kind][k]
  const color = kind === 'ft' ? FT : FG
  const H = 280, m = { l: 12, r: 12, t: 58, b: 50 }
  const x = scaleLinear().domain([h.edges[0], h.edges[h.edges.length - 1]]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, max(h.counts) * 1.1]).range([H - m.b, m.t])
  const tp = useTip()
  const nperm = kind === 'ft' ? R.meta.perm_ft : R.meta.perm_fg
  const side = (v) => (x(v) > W - 170 ? ['end', -8] : ['start', 8])
  const [na, nd] = side(h.nullMean), [oa, od] = side(h.obs)
  return (
    <div ref={wref}>
      <div className="controls">
        <div className="seg" role="group" aria-label="Shot type">
          <button aria-pressed={kind === 'ft'} onClick={() => setKind('ft')}>Free throws</button>
          <button aria-pressed={kind === 'fg'} onClick={() => setKind('fg')}>Field goals</button>
        </div>
        <div className="seg" role="group" aria-label="Streak length">
          {['1', '2', '3'].map((v) => <button key={v} aria-pressed={k === v} onClick={() => setK(v)}>{v} in a row</button>)}
        </div>
      </div>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Histogram of ${nperm} shuffled results. Real data ${sgn(h.obs, 2)} points; shuffled average ${sgn(h.nullMean, 2)} points.`}>
          {ticks(h.edges[0], h.edges[h.edges.length - 1], W < 560 ? 4 : 7).map((t) => (
            <g key={t}><line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke="var(--grid)" /><text className="tick" x={x(t)} y={H - m.b + 17} textAnchor="middle">{sgn(t, Number.isInteger(t) ? 0 : t * 10 % 1 ? 2 : 1)}</text></g>
          ))}
          {h.counts.map((c, i) => {
            const bx = x(h.edges[i]) + 1, bw = Math.max(1, x(h.edges[i + 1]) - x(h.edges[i]) - 2)
            return <path key={i} d={roundTop(bx, y(c), bw, y(0) - y(c), 3)} fill={color} opacity=".55"
              onMouseMove={(e) => tp.show(e, <><b>{c}</b> of {nperm} shuffles<br />between {sgn(h.edges[i], 2)} and {sgn(h.edges[i + 1], 2)} pp</>)} onMouseLeave={tp.hide} />
          })}
          <line x1={x(h.nullMean)} x2={x(h.nullMean)} y1={m.t - 20} y2={H - m.b} stroke="var(--text-secondary)" strokeWidth="2" strokeDasharray="5 4" />
          <text x={x(h.nullMean) + nd} y={m.t - 10} textAnchor={na}>Chance: {sgn(h.nullMean, 2)}</text>
          <line x1={x(h.obs)} x2={x(h.obs)} y1={m.t - 44} y2={H - m.b} stroke="var(--text-primary)" strokeWidth="2.5" />
          <text className="lbl-strong" x={x(h.obs) + od} y={m.t - 34} textAnchor={oa}>Real data: {sgn(h.obs, 2)}</text>
          <text x={W / 2} y={H - 6} textAnchor="middle">Gap after a streak vs after a slump (percentage points)</text>
        </svg>
        {tp.node}
      </div>
      <p className="caption">Each bar counts shuffles: every player’s makes and misses were randomly reordered within the same game{kind === 'fg' ? ' and shot type' : ''}, {nperm} times. Real − chance = <strong>{sgn(st.effect, 2)} pp</strong> (95% interval {sgn(st.lo, 2)} to {sgn(st.hi, 2)}, {pTxt(st.p)}).</p>
    </div>
  )
}

/* ───────────── Chapter 6: forest plot by group ───────────── */
function Forest({ R }) {
  const S = R.streak, sub = R.sub
  const groups = [
    { id: 'type', name: 'Shot type', rows: [
      { l: 'Free throws', ft: S.ft['3'] },
      { l: 'Three-pointers', fg: sub.fg.type['3PT'] },
      { l: 'Mid-range jumpers', fg: sub.fg.type['2PT jumper'] },
      { l: 'Layups, dunks, tips', fg: sub.fg.type['Inside (layup/dunk/tip)'] }],
      take: `Among field goals, only three-pointers show a lift (${sgn(sub.fg.type['3PT'].effect)} pp). Jumpers and shots at the rim show none.` },
    { id: 'game', name: 'Close vs blowout', rows: [
      { l: 'Blowouts (final margin > 5)', ft: sub.ft.game[BLOW], fg: sub.fg.game[BLOW] },
      { l: 'Close games (final margin ≤ 5)', ft: sub.ft.game[CLOSE], fg: sub.fg.game[CLOSE] }],
      take: `Close games stretch both effects: free throws ${sgn(sub.ft.game[CLOSE].effect)} pp, field goals ${sgn(sub.fg.game[CLOSE].effect)} pp. Pressure helps at the line and hurts streaky field-goal shooters.` },
    { id: 'streak', name: 'Streak length', rows: [
      { l: '1 in a row', ft: S.ft['1'], fg: S.fg['1'] },
      { l: '2 in a row', ft: S.ft['2'], fg: S.fg['2'] },
      { l: '3 in a row', ft: S.ft['3'], fg: S.fg['3'] }],
      take: 'The pattern holds at every streak length: free throws a little above chance, field goals a little below.' },
    { id: 'player', name: 'Player volume', rows: [
      { l: 'Top 10% by attempts', ft: sub.ft.player['Top 10% by attempts'], fg: sub.fg.player['Top 10% by attempts'] },
      { l: 'Everyone else', ft: sub.ft.player['Other players'], fg: sub.fg.player['Other players'] }],
      take: `High-volume players drive the field-goal result (${sgn(sub.fg.player['Top 10% by attempts'].effect)} pp). For everyone else the interval crosses zero.` },
    { id: 'era', name: 'Era', rows: [
      { l: '2006–2019 seasons', ft: sub.ft.era['2006-2019'], fg: sub.fg.era['2006-2019'] },
      { l: '2020–2026 seasons', ft: sub.ft.era['2020-2026'], fg: sub.fg.era['2020-2026'] }],
      take: 'Same direction in both eras. Older seasons have thinner play-by-play coverage, so treat them with care.' },
  ]
  const [gid, setGid] = useState('type')
  const g = groups.find((d) => d.id === gid)
  const [wref, W] = useWidth()
  const narrow = W < 560
  const left = narrow ? 8 : 240, right = 16, rowH = narrow ? 58 : 46
  const H = g.rows.length * rowH + 44
  const x = scaleLinear().domain([-3, 5.5]).range([left, W - right])
  const tp = useTip()
  const tipFor = (name, r, l) => <><b>{name}: {l}</b><br />{sgn(r.effect, 2)} pp beyond chance<br />95% interval {sgn(r.lo, 2)} to {sgn(r.hi, 2)}<br />{pTxt(r.p)}</>
  return (
    <div ref={wref}>
      <div className="controls">
        <div className="seg wrap-seg" role="group" aria-label="Compare by">
          {groups.map((d) => <button key={d.id} aria-pressed={gid === d.id} onClick={() => setGid(d.id)}>{d.name}</button>)}
        </div>
      </div>
      <p className="takeaway">{g.take}</p>
      <div className="legend">
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="var(--series-ft)" /></svg>Free throws</span>
        <span><svg width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="2" fill="var(--series-fg)" /></svg>Field goals</span>
      </div>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Effect beyond chance with 95% intervals, by ${g.name}`}>
          {[-2, 0, 2, 4].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={0} y2={H - 40} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={t === 0 ? 1.8 : 1} /><text className="tick" x={x(t)} y={H - 24} textAnchor="middle">{t === 0 ? '0' : sgn(t, 0)}</text></g>)}
          <text x={x(0)} y={H - 6} textAnchor="middle" style={{ fontSize: 11.5 }}>pp beyond chance · left of 0 = worse after a streak</text>
          {g.rows.map((r, i) => {
            const y0 = i * rowH
            const cy = narrow ? y0 + 36 : y0 + rowH / 2
            const both = r.ft && r.fg
            return (
              <g key={r.l}>
                <text x={narrow ? 0 : 0} y={narrow ? y0 + 16 : cy + 4} className={narrow ? 'lbl-strong halo' : ''}>{r.l}</text>
                {r.ft && (
                  <g onMouseMove={(e) => tp.show(e, tipFor('Free throws', r.ft, r.l))} onMouseLeave={tp.hide}>
                    <rect x={left} y={cy - (both ? 13 : 10)} width={W - left} height={both ? 13 : 20} fill="transparent" />
                    <line x1={x(r.ft.lo)} x2={x(r.ft.hi)} y1={cy - (both ? 6 : 0)} y2={cy - (both ? 6 : 0)} stroke="var(--series-ft)" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx={x(r.ft.effect)} cy={cy - (both ? 6 : 0)} r="6" fill="var(--series-ft)" stroke="var(--surface-1)" strokeWidth="2" />
                  </g>
                )}
                {r.fg && (
                  <g onMouseMove={(e) => tp.show(e, tipFor('Field goals', r.fg, r.l))} onMouseLeave={tp.hide}>
                    <rect x={left} y={cy + (both ? 0 : -10)} width={W - left} height={both ? 13 : 20} fill="transparent" />
                    <line x1={x(r.fg.lo)} x2={x(r.fg.hi)} y1={cy + (both ? 6 : 0)} y2={cy + (both ? 6 : 0)} stroke="var(--series-fg)" strokeWidth="2.5" strokeLinecap="round" />
                    <rect x={x(r.fg.effect) - 5.5} y={cy + (both ? 6 : 0) - 5.5} width="11" height="11" rx="2" fill="var(--series-fg)" stroke="var(--surface-1)" strokeWidth="2" />
                  </g>
                )}
              </g>
            )
          })}
        </svg>
        {tp.node}
      </div>
      <p className="caption">Marks are estimates; lines are 95% intervals. A line crossing 0 means “no effect” can’t be ruled out.</p>
    </div>
  )
}

/* ───────────── Chapter 7: coaches ───────────── */
function Coach({ R }) {
  const S = R.streak, sub = R.sub
  return (
    <>
      <div className="cols3">
        <div className="card"><div className="pill ft">Free throws</div><h3>Trust the routine</h3><p>A make streak at the line adds about <strong>{sgn(S.ft['3'].effect)} pp</strong>, more in close games ({sgn(sub.ft.game[CLOSE].effect)} pp). Real, but too small to change who goes to the line.</p></div>
        <div className="card"><div className="pill fg">Field goals</div><h3>Don’t feed the streak</h3><p>A shooter on a run is no more likely to hit her next field goal (<strong>{sgn(S.fg['3'].effect)} pp</strong>), and in close games slightly less ({sgn(sub.fg.game[CLOSE].effect)} pp). Run the best shot, not the hottest player.</p></div>
        <div className="card"><div className="pill fg">Three-pointers</div><h3>The one exception</h3><p>Threes are the only field goals with a lift ({sgn(sub.fg.type['3PT'].effect)} pp). Worth a look in scouting, not a reason to force shots.</p></div>
      </div>
      <div className="rule">
        <div className="kicker">Decision rule</div>
        <p>Pick shots and shooters by season-long accuracy and shot quality. A streak tells you what already happened; across 8.3 million shots it barely predicts what happens next.</p>
      </div>
    </>
  )
}

/* ───────────── Chapter 8: method ───────────── */
function Method({ R }) {
  return (
    <>
      <details open><summary>Data and cleaning</summary>
        <ul>
          <li>NCAA women’s basketball play-by-play, 2006–2026 seasons: 8.3 million made or missed shots.</li>
          <li>Streaks count only within one player’s shots in one game. Free throws and field goals are analyzed separately.</li>
          <li>Field goals within 6 seconds of the same player’s previous shot (mostly putbacks after her own miss) are excluded as targets; they are unusually easy and would fake a “cold hand”.</li>
          <li>Shot coordinates cover only a small share of shots, so shot type (three, jumper, inside) stands in for distance.</li>
        </ul>
      </details>
      <details><summary>Statistics</summary>
        <ul>
          <li>For each player: make rate after k straight makes minus rate after k straight misses (k = 1, 2, 3), averaged across players, weighted by sample size.</li>
          <li>Chance baseline: shuffle each player’s outcomes within the same game ({R.meta.perm_ft} shuffles for free throws, {R.meta.perm_fg} for field goals, which also stay within shot type), then recompute. This removes the Miller–Sanjurjo streak-selection bias.</li>
          <li>Effect = real value − shuffled average. Intervals are ±1.96 SD of the shuffles; p-values are two-sided.</li>
          <li>Explore chapter: all 990 combinations of shot type, season, game situation and streak length were precomputed with 90 shuffles each (headline numbers use the larger runs above). Player-level chance bands come from the same shuffles; players need an effective sample of at least 4 three-in-a-row situations.</li>
        </ul>
      </details>
      <details><summary>Limitations</summary>
        <ul>
          <li>Pre-2020 seasons have thinner play-by-play coverage.</li>
          <li>Defense, shot clock and lineups are not observed: this measures what follows a streak, not why.</li>
          <li>Free throws in one trip are shot back to back, so “after a streak” partly means “later in the same trip”.</li>
          <li>With millions of shots, tiny effects become statistically clear. Judge the size, not only the p-value.</li>
        </ul>
      </details>
      <p className="caption" style={{ marginTop: 20 }}>Built for the Boiler Up, Hammer Data Challenge (Purdue Love Data Week). Data: NCAA women’s basketball play-by-play provided by the challenge. Analysis in Python (pandas, NumPy); visualization in React and D3.</p>
    </>
  )
}

/* ───────────── Page shell ───────────── */
export default function App() {
  const [R, setR] = useState(null)
  const [sits, setSits] = useState(null)
  const [err, setErr] = useState(false)
  const readHash = () => { const n = parseInt((window.location.hash || '').replace(/\D/g, ''), 10); return n >= 1 && n <= 9 ? n - 1 : 0 }
  const [ch, setCh] = useState(readHash)

  useEffect(() => {
    Promise.all([fetch('./data/results.json').then((r) => r.json()), fetch('./data/situations.json').then((r) => r.json())])
      .then(([a, b]) => { setR(a); setSits(b) }).catch(() => setErr(true))
  }, [])

  const CH = [
    { t: 'Play', title: 'Is the hot hand real?' },
    { t: 'Answer', title: 'The short answer' },
    { t: 'Debate', title: 'A famous answer, then a twist' },
    { t: 'The trap', title: 'The raw numbers lie' },
    { t: 'Chance', title: 'Chance is not zero' },
    { t: 'Where', title: 'Where it shows up' },
    { t: 'Explore', title: 'Explore it yourself' },
    { t: 'Coaches', title: 'What this means for a coach' },
    { t: 'Method', title: 'Method and limits' },
  ]
  const go = useCallback((n) => {
    const c = Math.max(0, Math.min(CH.length - 1, n))
    setCh(c)
    window.history.replaceState(null, '', '#' + (c + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [CH.length])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return
      if (e.key === 'ArrowRight') go(ch + 1)
      if (e.key === 'ArrowLeft') go(ch - 1)
    }
    const onHash = () => setCh(readHash())
    window.addEventListener('keydown', onKey); window.addEventListener('hashchange', onHash)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onHash) }
  }, [ch, go])

  useEffect(() => {
    const el = document.querySelector('.tabs [aria-current="step"]')
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [ch, R])

  if (err) return <div className="wrap"><p style={{ paddingTop: 80 }}>Could not load the data files.</p></div>
  if (!R) return <div className="wrap"><p style={{ paddingTop: 80 }}>Loading 8.3 million shots…</p></div>

  const body = [
    <>
      <p className="lede">Do players shoot better right after a streak of makes, or is it a trick of the mind? We tested every shot in 20 seasons of NCAA women’s basketball play-by-play.</p>
      <Game sits={sits} onNext={() => go(1)} onSkip={() => go(1)} />
    </>,
    <Answer R={R} go={go} />,
    <>
      <div className="timeline">
        <div className="card"><span className="year">1985</span><p>Gilovich, Vallone and Tversky studied basketball shooting and concluded the hot hand is an illusion: streaks look meaningful, but shots behave like independent coin flips.</p></div>
        <div className="card"><span className="year">2018</span><p>Miller and Sanjurjo showed that counting streaks inside short sequences has a built-in downward bias. Corrected, the old evidence no longer says “no hot hand”.</p></div>
      </div>
      <p>The fix is to compare real sequences with <strong>shuffled versions of themselves</strong>. That is what this project does, on 8.3 million shots, far more than either study had.</p>
    </>,
    <>
      <p>Pool every shot after three makes and compare with every shot after three misses, and you get a big “hot hand”. Compare each player with herself, then with chance, and it shrinks to almost nothing.</p>
      <Shrink R={R} />
      <p className="caption">Hover a bar for details. pp = percentage points.</p>
    </>,
    <>
      <p>Even if shots were pure coin flips, the counting method would not give a gap of zero. So we shuffled each game’s shots hundreds of times to see what “no hot hand” really looks like, then compared the real data with that pile.</p>
      <NullHist R={R} />
    </>,
    <Forest R={R} />,
    <>
      <p>Pick any combination of shot type, game situation, streak length and season, or look up a team and its players. Every number was precomputed with the same shuffle test.</p>
      <Explore />
    </>,
    <Coach R={R} />,
    <Method R={R} />,
  ]

  return (
    <div className="shell">
      <nav className="topnav" aria-label="Chapters">
        <div className="topnav-in">
          <button className="brand" onClick={() => go(0)}>Hot Hand</button>
          <ol className="tabs">
            {CH.map((c, i) => (
              <li key={i}><button aria-current={i === ch ? 'step' : undefined} className={i < ch ? 'seen' : ''} onClick={() => go(i)}>
                <span className="num">{i + 1}</span><span className="tlabel">{c.t}</span></button></li>
            ))}
          </ol>
        </div>
        <div className="bar"><div style={{ width: `${((ch + 1) / CH.length) * 100}%` }} /></div>
      </nav>

      <main className="wrap chapter" key={ch}>
        <div className="kicker">{String(ch + 1).padStart(2, '0')} / {String(CH.length).padStart(2, '0')} · {CH[ch].t}</div>
        {ch === 0 ? <h1>{CH[ch].title}</h1> : <h2>{CH[ch].title}</h2>}
        {body[ch]}
      </main>

      <footer className="pager wrap">
        <button className="btn" disabled={ch === 0} onClick={() => go(ch - 1)}>← {ch > 0 ? CH[ch - 1].t : 'Back'}</button>
        <span className="hint">Use ← → keys</span>
        {ch < CH.length - 1
          ? <button className="btn primary" onClick={() => go(ch + 1)}>{CH[ch + 1].t} →</button>
          : <button className="btn" onClick={() => go(0)}>Start over</button>}
      </footer>
    </div>
  )
}
