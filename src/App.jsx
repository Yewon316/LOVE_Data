import React, { useEffect, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { ticks, max } from 'd3-array'

const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%'
const pTxt = (p) => (p < 0.01 ? 'p < 0.01' : 'p = ' + p.toFixed(2))
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const FT = 'var(--series-ft)', FG = 'var(--series-fg)'
const TYP = { 0: 'Free throw', 1: 'Three-pointer', 2: 'Mid-range jumper', 3: 'Layup / dunk / tip' }

function useTip() {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)
  const show = (e, html) => {
    const r = ref.current.getBoundingClientRect()
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, html })
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

/* ───────────── Section 1: prediction game ───────────── */
function Game({ sits, S }) {
  const [phase, setPhase] = useState('intro') // intro | play | done
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
  const answer = (g) => { if (guess === null) setGuess(g) }
  const next = () => {
    const r = rounds[i]
    const nl = [...log, { ...r, guess }]
    setLog(nl)
    if (i + 1 >= rounds.length) setPhase('done'); else { setI(i + 1); setGuess(null) }
  }

  if (phase === 'intro') {
    return (
      <div className="card">
        <h3>Gut check first</h3>
        <p>A player has just made three shots in a row. In your view, is her next shot more likely to go in?</p>
        <div className="btn-row">
          <button className="btn" onClick={() => start('yes')}>Yes, she’s heating up</button>
          <button className="btn" onClick={() => start('slight')}>Maybe slightly</button>
          <button className="btn" onClick={() => start('no')}>No, it’s a myth</button>
        </div>
        <p className="caption" style={{ marginTop: 14 }}>Then predict 10 real shots from NCAA women’s basketball games. Each one follows either three makes or three misses in a row.</p>
      </div>
    )
  }

  if (phase === 'play') {
    const r = rounds[i]
    const last = [r.streak === 'hot', r.streak === 'hot', r.streak === 'hot']
    const done = guess !== null
    const right = done && ((guess === 'make') === (r.made === 1))
    return (
      <div className="card" aria-live="polite">
        <div className="progress">Shot {i + 1} of {rounds.length}</div>
        <div className="shots" role="img" aria-label={`Her last three shots: ${r.streak === 'hot' ? 'three makes' : 'three misses'}`}>
          {last.map((m, k) => <div key={k} className={'dot ' + (m ? 'made' : 'miss')}>{m ? '✓' : '✕'}</div>)}
          <div className={'dot next'}>{done ? (r.made ? '✓' : '✕') : '?'}</div>
        </div>
        <div className="facts">
          <span><b>{TYP[r.typ]}</b></span>
          <span>Quarter <b>{r.period > 4 ? 'OT' : r.period}</b></span>
          <span>Score margin <b>{r.margin}</b> pts</span>
          <span>Her season average on {r.kind === 'ft' ? 'free throws' : 'field goals'}: <b>{pct(r.base, 0)}</b></span>
        </div>
        {!done ? (
          <div className="btn-row">
            <button className="btn" onClick={() => answer('make')}>She makes it</button>
            <button className="btn" onClick={() => answer('miss')}>She misses</button>
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

  // done
  const hot = log.filter((l) => l.streak === 'hot'), cold = log.filter((l) => l.streak === 'cold')
  const rate = (a, f) => (a.length ? a.filter(f).length / a.length : 0)
  const correct = log.filter((l) => (l.guess === 'make') === (l.made === 1)).length
  const bTxt = { yes: 'You started out thinking a streak clearly helps.', slight: 'You started out thinking a streak helps a little.', no: 'You started out thinking the hot hand is a myth.' }[belief]
  const ft3 = S.ft['3'], fg3 = S.fg['3']
  return (
    <div className="card">
      <div className="kicker">Your result</div>
      <div className="bignum">{correct}/{log.length}</div>
      <p style={{ marginTop: 10 }}>
        After three makes you predicted a make <strong>{pct(rate(hot, (l) => l.guess === 'make'), 0)}</strong> of the time; after three misses, <strong>{pct(rate(cold, (l) => l.guess === 'make'), 0)}</strong>.
        In the shots you saw, players actually made <strong>{pct(rate(hot, (l) => l.made === 1), 0)}</strong> after three makes and <strong>{pct(rate(cold, (l) => l.made === 1), 0)}</strong> after three misses.
      </p>
      <p><strong>{bTxt}</strong> Ten shots can’t settle a debate that has run for forty years, and the raw numbers above hide a trap. Scroll on: across 8.3 million shots, the answer is
        {' '}<strong style={{ color: 'var(--series-ft-ink)' }}>{sgn(ft3.effect)} points for free throws</strong> and
        {' '}<strong style={{ color: 'var(--series-fg-ink)' }}>{sgn(fg3.effect)} points for field goals</strong>, beyond what chance alone produces.</p>
      <div className="btn-row"><button className="btn" onClick={() => setPhase('intro')}>Play again</button></div>
    </div>
  )
}

/* ───────────── Section 3: what is left after each correction ───────────── */
function Shrink({ R }) {
  const W = 760, rowH = 44, left = 250, right = 70
  const panels = [
    { key: 'ft', title: 'Free throws', color: FT, ink: 'var(--series-ft-ink)' },
    { key: 'fg', title: 'Field goals', color: FG, ink: 'var(--series-fg-ink)' },
  ]
  const x = scaleLinear().domain([-2, 16]).range([left, W - right])
  const tp = useTip()
  return (
    <div className="chartbox" ref={tp.ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${panels.length * (3 * rowH + 56) + 30}`} role="img"
        aria-label="Bar chart of the streak effect shrinking after each correction, for free throws and field goals">
        {panels.map((p, pi) => {
          const rt = R.rates[p.key]['3'], st = R.streak[p.key]['3']
          const rows = [
            { l: 'Raw: all shots after 3 makes vs 3 misses', v: (rt.pH - rt.pM) * 100, t: `Pooled across all players: ${pct(rt.pH)} after three makes vs ${pct(rt.pM)} after three misses.` },
            { l: 'Same player: remove skill differences', v: st.obs, t: 'Each player compared with herself, then averaged. Better shooters no longer inflate the gap.' },
            { l: 'Beyond a shuffled baseline', v: st.effect, t: `Observed minus the average of ${pi === 0 ? R.meta.perm_ft : R.meta.perm_fg} shuffles of the same shots. 95% CI ${sgn(st.lo, 2)} to ${sgn(st.hi, 2)} points.` },
          ]
          const y0 = 30 + pi * (3 * rowH + 56)
          return (
            <g key={p.key} transform={`translate(0,${y0})`}>
              <text className="lbl-strong" x={0} y={-8} style={{ fontSize: 16 }}>{p.title}</text>
              {[0, 5, 10, 15].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={0} y2={3 * rowH} stroke="var(--grid)" /><text className="tick" x={x(t)} y={3 * rowH + 18} textAnchor="middle">{t === 0 ? '0' : '+' + t}</text></g>)}
              <text className="tick" x={x(-2)} y={3 * rowH + 18} textAnchor="middle">−2</text>
              <line x1={x(0)} x2={x(0)} y1={0} y2={3 * rowH} stroke="var(--axis)" strokeWidth="1.5" />
              {rows.map((r, k) => {
                const bx = Math.min(x(0), x(r.v)), bw = Math.abs(x(r.v) - x(0))
                const op = [0.35, 0.65, 1][k]
                return (
                  <g key={k} transform={`translate(0,${k * rowH})`}
                    onMouseMove={(e) => tp.show(e, <><b>{r.l}</b><br />{sgn(r.v, 2)} percentage points<br />{r.t}</>)} onMouseLeave={tp.hide}>
                    <rect x={0} y={0} width={W} height={rowH} fill="transparent" />
                    <text x={0} y={rowH / 2 + 4}>{r.l}</text>
                    <rect x={bx} y={9} width={Math.max(bw, 1)} height={rowH - 18} rx={4} fill={p.color} opacity={op} />
                    <text className="lbl-strong" x={r.v >= 0 ? x(r.v) + 8 : x(r.v) - 8} y={rowH / 2 + 4} textAnchor={r.v >= 0 ? 'start' : 'end'}>{sgn(r.v)} pp</text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {tp.node}
    </div>
  )
}

/* ───────────── Section 4: shuffled baseline histogram ───────────── */
function NullHist({ R }) {
  const [kind, setKind] = useState('ft')
  const [k, setK] = useState('3')
  const h = R.hist[kind][k], st = R.streak[kind][k]
  const color = kind === 'ft' ? FT : FG
  const W = 760, H = 300, m = { l: 14, r: 14, t: 62, b: 54 }
  const x = scaleLinear().domain([h.edges[0], h.edges[h.edges.length - 1]]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, max(h.counts) * 1.1]).range([H - m.b, m.t])
  const tp = useTip()
  const nperm = kind === 'ft' ? R.meta.perm_ft : R.meta.perm_fg
  return (
    <div>
      <div>
        <div className="seg" role="group" aria-label="Shot type">
          <button aria-pressed={kind === 'ft'} onClick={() => setKind('ft')}>Free throws</button>
          <button aria-pressed={kind === 'fg'} onClick={() => setKind('fg')}>Field goals</button>
        </div>
        <div className="seg" role="group" aria-label="Streak length">
          {['1', '2', '3'].map((v) => <button key={v} aria-pressed={k === v} onClick={() => setK(v)}>{v}-shot streak</button>)}
        </div>
      </div>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Histogram of ${nperm} shuffled results. Observed ${sgn(h.obs, 2)} points; shuffled average ${sgn(h.nullMean, 2)} points.`}>
          {ticks(h.edges[0], h.edges[h.edges.length - 1], 7).map((t) => (
            <g key={t}><line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke="var(--grid)" /><text className="tick" x={x(t)} y={H - m.b + 18} textAnchor="middle">{sgn(t, t % 1 ? 1 : 0)}</text></g>
          ))}
          {h.counts.map((c, i) => {
            const bx = x(h.edges[i]) + 1, bw = x(h.edges[i + 1]) - x(h.edges[i]) - 2
            return <path key={i} d={roundTop(bx, y(c), bw, y(0) - y(c), 4)} fill={color} opacity=".55"
              onMouseMove={(e) => tp.show(e, <><b>{c}</b> of {nperm} shuffles<br />landed between {sgn(h.edges[i], 2)} and {sgn(h.edges[i + 1], 2)} pp</>)} onMouseLeave={tp.hide} />
          })}
          <line x1={x(h.nullMean)} x2={x(h.nullMean)} y1={m.t - 22} y2={H - m.b} stroke="var(--text-secondary)" strokeWidth="2" strokeDasharray="5 4" />
          <text x={x(h.nullMean) + (x(h.nullMean) > W - 190 ? -8 : 8)} y={m.t - 14} textAnchor={x(h.nullMean) > W - 190 ? 'end' : 'start'}>Shuffled average {sgn(h.nullMean, 2)}</text>
          <line x1={x(h.obs)} x2={x(h.obs)} y1={m.t - 42} y2={H - m.b} stroke="var(--text-primary)" strokeWidth="2.5" />
          <text className="lbl-strong" x={x(h.obs) + (x(h.obs) > W - 190 ? -8 : 8)} y={m.t - 34} textAnchor={x(h.obs) > W - 190 ? 'end' : 'start'}>Real data {sgn(h.obs, 2)}</text>
          <text x={W / 2} y={H - 8} textAnchor="middle">After-streak make rate minus after-slump make rate, percentage points</text>
        </svg>
        {tp.node}
      </div>
      <p className="caption">Each bar counts shuffles: every player’s makes and misses were randomly reordered within the same game (and shot type) {nperm} times, which keeps skill and shot mix fixed but destroys any momentum. Real data − shuffled average = <strong>{sgn(st.effect, 2)} points</strong> (95% interval {sgn(st.lo, 2)} to {sgn(st.hi, 2)}, {pTxt(st.p)}).</p>
    </div>
  )
}

/* ───────────── Section 5: forest plot ───────────── */
function Forest({ R }) {
  const S = R.streak, sub = R.sub
  const rows = [
    { g: 'Streak length' },
    { l: '1 make vs 1 miss', ft: S.ft['1'], fg: S.fg['1'] },
    { l: '2 makes vs 2 misses', ft: S.ft['2'], fg: S.fg['2'] },
    { l: '3 makes vs 3 misses', ft: S.ft['3'], fg: S.fg['3'] },
    { g: 'Shot type (3-shot streak)' },
    { l: 'Free throws', ft: S.ft['3'] },
    { l: 'Three-pointers', fg: sub.fg.type['3PT'] },
    { l: 'Mid-range jumpers', fg: sub.fg.type['2PT jumper'] },
    { l: 'Layups, dunks, tips', fg: sub.fg.type['Inside (layup/dunk/tip)'] },
    { g: 'Game closeness' },
    { l: 'Blowouts (final margin > 5)', ft: sub.ft.game['Blowout (final margin > 5)'], fg: sub.fg.game['Blowout (final margin > 5)'] },
    { l: 'Close games (final margin ≤ 5)', ft: sub.ft.game['Close game (final margin <= 5)'], fg: sub.fg.game['Close game (final margin <= 5)'] },
    { g: 'Player tier' },
    { l: 'Top 10% by attempts', ft: sub.ft.player['Top 10% by attempts'], fg: sub.fg.player['Top 10% by attempts'] },
    { l: 'Everyone else', ft: sub.ft.player['Other players'], fg: sub.fg.player['Other players'] },
    { g: 'Era' },
    { l: '2006–2019 seasons', ft: sub.ft.era['2006-2019'], fg: sub.fg.era['2006-2019'] },
    { l: '2020–2026 seasons', ft: sub.ft.era['2020-2026'], fg: sub.fg.era['2020-2026'] },
  ]
  const W = 760, left = 250, right = 20, rowH = 34, gH = 34
  let yy = 24
  const placed = rows.map((r) => { const o = { ...r, y: yy }; yy += r.g ? gH : rowH; return o })
  const H = yy + 36
  const x = scaleLinear().domain([-3, 5.5]).range([left, W - right])
  const tp = useTip()
  const tipFor = (name, r, l) => <><b>{name}: {l}</b><br />{sgn(r.effect, 2)} points beyond chance<br />95% interval {sgn(r.lo, 2)} to {sgn(r.hi, 2)}<br />{pTxt(r.p)}</>
  return (
    <div>
      <div className="legend">
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="var(--series-ft)" /></svg>Free throws</span>
        <span><svg width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="2" fill="var(--series-fg)" /></svg>Field goals</span>
      </div>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Forest plot of the hot-hand effect with 95% intervals across subgroups">
          {[-2, 0, 2, 4].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={10} y2={H - 30} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={t === 0 ? 1.8 : 1} /><text className="tick" x={x(t)} y={H - 12} textAnchor="middle">{t === 0 ? '0' : sgn(t, 0)}</text></g>)}
          <text x={x(0)} y={H - 0} textAnchor="middle" style={{ fontSize: 11.5 }}>Effect beyond shuffled baseline (percentage points)</text>
          {placed.map((r, i) => r.g ? (
            <text key={i} className="lbl-strong" x={0} y={r.y + 20}>{r.g}</text>
          ) : (
            <g key={i}>
              <rect x={0} y={r.y} width={W} height={rowH} fill="transparent" />
              <text x={12} y={r.y + rowH / 2 + 4}>{r.l}</text>
              {r.ft && (
                <g onMouseMove={(e) => tp.show(e, tipFor('Free throws', r.ft, r.l))} onMouseLeave={tp.hide}>
                  <line x1={x(r.ft.lo)} x2={x(r.ft.hi)} y1={r.y + rowH / 2 - (r.fg ? 5 : 0)} y2={r.y + rowH / 2 - (r.fg ? 5 : 0)} stroke="var(--series-ft)" strokeWidth="2" />
                  <circle cx={x(r.ft.effect)} cy={r.y + rowH / 2 - (r.fg ? 5 : 0)} r="5.5" fill="var(--series-ft)" stroke="var(--surface-1)" strokeWidth="2" />
                </g>
              )}
              {r.fg && (
                <g onMouseMove={(e) => tp.show(e, tipFor('Field goals', r.fg, r.l))} onMouseLeave={tp.hide}>
                  <line x1={x(r.fg.lo)} x2={x(r.fg.hi)} y1={r.y + rowH / 2 + (r.ft ? 5 : 0)} y2={r.y + rowH / 2 + (r.ft ? 5 : 0)} stroke="var(--series-fg)" strokeWidth="2" />
                  <rect x={x(r.fg.effect) - 5} y={r.y + rowH / 2 + (r.ft ? 5 : 0) - 5} width="10" height="10" rx="2" fill="var(--series-fg)" stroke="var(--surface-1)" strokeWidth="2" />
                </g>
              )}
            </g>
          ))}
        </svg>
        {tp.node}
      </div>
      <p className="caption">Dots are estimates, lines are 95% intervals. A line that crosses 0 means the data cannot rule out “no effect”. Close-game and tier splits use fewer shots, so their intervals are wider.</p>
    </div>
  )
}

/* ───────────── Page ───────────── */
export default function App() {
  const [R, setR] = useState(null)
  const [sits, setSits] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    Promise.all([fetch('./data/results.json').then((r) => r.json()), fetch('./data/situations.json').then((r) => r.json())])
      .then(([a, b]) => { setR(a); setSits(b) }).catch(() => setErr(true))
  }, [])
  if (err) return <div className="wrap"><p>Could not load the data files.</p></div>
  if (!R) return <div className="wrap"><p style={{ paddingTop: 80 }}>Loading 8.3 million shots…</p></div>
  const S = R.streak
  return (
    <>
      <header className="hero wrap">
        <div className="kicker">NCAA women’s basketball · 8.3 million shots · 2006–2026</div>
        <h1>Is the hot hand real?</h1>
        <p className="lede">Do players shoot better right after a streak of makes, or is it a trick of the mind? Statisticians and psychologists have argued about this for forty years. We put the question to every shot in the play-by-play data.</p>
        <Game sits={sits} S={S} />
      </header>

      <main className="wrap">
        <section id="debate">
          <div className="kicker">The debate</div>
          <h2>A famous answer, then a twist</h2>
          <div className="timeline">
            <div className="card"><span className="year">1985</span><p>Gilovich and colleagues examined basketball shooting and concluded that the hot hand is an illusion: streaks look meaningful, but shots behave like independent coin flips.</p></div>
            <div className="card"><span className="year">2018</span><p>Miller and Sanjurjo showed that the standard way of counting streaks inside short sequences carries a built-in downward bias. Corrected, the old evidence no longer points to “no hot hand”.</p></div>
          </div>
          <p>So who is right? The bias only disappears if you compare real sequences with <strong>shuffled versions of themselves</strong>, so that is what this project does, on a far larger dataset than either study had.</p>
        </section>

        <section id="trap">
          <div className="kicker">Step 1</div>
          <h2>The raw numbers lie</h2>
          <p>Look at all shots taken after three makes versus after three misses and a hot hand appears. Remove the fact that good shooters have more streaks, then compare with chance, and most of it melts away.</p>
          <Shrink R={R} />
          <p className="caption">pp = percentage points. Free throws keep a small positive effect; field goals end up slightly negative.</p>
        </section>

        <section id="shuffle">
          <div className="kicker">Step 2</div>
          <h2>Chance is not zero</h2>
          <p>A tempting mistake is to expect “no hot hand” to produce a gap of exactly zero. It does not: the way streaks are counted shifts the expected gap. The honest baseline comes from shuffling each game’s shots and recounting. Compare the thick line (real data) with the pile of shuffles.</p>
          <NullHist R={R} />
        </section>

        <section id="answer">
          <div className="kicker">Step 3</div>
          <h2>Where the hot hand shows up, and where it doesn’t</h2>
          <Forest R={R} />
        </section>

        <section id="meaning">
          <div className="kicker">So what?</div>
          <h2>What this means for a coach</h2>
          <div className="cols">
            <div className="card"><h3 style={{ color: 'var(--series-ft-ink)' }}>Free throws: a small real lift</h3><p>After a streak of made free throws, players make about <strong>{sgn(S.ft['3'].effect)} points</strong> more than chance explains, and the lift is larger in close games ({sgn(R.sub.ft.game['Close game (final margin <= 5)'].effect)} points). It is real but modest. It does not justify changing who shoots.</p></div>
            <div className="card"><h3 style={{ color: 'var(--series-fg-ink)' }}>Field goals: don’t chase the streak</h3><p>There is no evidence that a shooter on a run is more likely to hit her next field goal; the estimate is <strong>{sgn(S.fg['3'].effect)} points</strong>. Three-pointers are the one exception worth watching ({sgn(R.sub.fg.type['3PT'].effect)} points). Feeding the “hot” player is not backed by the data.</p></div>
          </div>
          <p>The practical lesson: streaks <em>feel</em> predictive because we notice them after the fact. Effects here are measured in fractions of a percentage point on millions of shots, so even the “significant” ones are small.</p>
        </section>

        <section id="method">
          <div className="kicker">Under the hood</div>
          <h2>Method and limits</h2>
          <details><summary>Data and cleaning</summary>
            <ul>
              <li>NCAA women’s basketball play-by-play, 2006–2026 seasons: 8.3 million made or missed shots (free throws, jumpers, three-pointers, layups, dunks, tip-ins).</li>
              <li>Streaks are counted only inside one player’s sequence in one game. Free throws and field goals are analyzed separately.</li>
              <li>Field goals taken within 6 seconds of the same player’s previous shot (mostly putbacks after her own miss) are excluded as targets, because they are unusually easy and would fake a cold-hand effect.</li>
              <li>Shot coordinates exist for only a small share of shots, so shot type (three, jumper, inside) stands in for distance.</li>
            </ul>
          </details>
          <details><summary>Statistics</summary>
            <ul>
              <li>For each player, the make rate after k straight makes minus the rate after k straight misses (k = 1, 2, 3), averaged across players with weights proportional to the smaller samples.</li>
              <li>Null distribution: shuffle each player’s outcomes within the same game ({R.meta.perm_ft} shuffles for free throws, {R.meta.perm_fg} for field goals; field goals are also kept within shot type), then recompute. This is the Miller–Sanjurjo-consistent baseline.</li>
              <li>Effect = real value − shuffled average. Intervals are ±1.96 standard deviations of the shuffles; p-values are two-sided from the shuffles.</li>
            </ul>
          </details>
          <details><summary>Limitations</summary>
            <ul>
              <li>Pre-2020 seasons have thinner play-by-play coverage; the 2006–2019 and 2020–2026 estimates are shown separately for that reason.</li>
              <li>Defender, shot clock and teammates are not observed, so we measure what happens after a streak, not why.</li>
              <li>Free throws within a trip are shot back to back, so “after a streak” partly means “earlier in the same trip”.</li>
              <li>With millions of shots, tiny effects become statistically clear. Judge the size, not just the p-value.</li>
            </ul>
          </details>
        </section>
      </main>
      <footer className="wrap">Built for the Boiler Up, Hammer Data Challenge (Purdue Love Data Week). Data: NCAA women’s basketball play-by-play provided by the challenge. Analysis in Python (pandas, NumPy); visualization in React and D3.</footer>
    </>
  )
}
