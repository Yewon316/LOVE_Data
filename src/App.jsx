import React, { useCallback, useEffect, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'

const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%'
const fmt = (n) => n.toLocaleString('en-US')
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const TYP = { 0: 'Free throw', 1: 'Three-pointer', 2: 'Mid-range jumper', 3: 'Layup / dunk / tip' }

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

/* ───────────── 1. Game + answer ───────────── */
function Game({ sits, onDone, onSkip }) {
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
    setLog([...log, { ...rounds[i], guess }])
    if (i + 1 >= rounds.length) { setPhase('done'); onDone() } else { setI(i + 1); setGuess(null) }
  }
  if (phase === 'intro') return (
    <div className="card">
      <h3>Gut check first</h3>
      <p>A player has just made three shots in a row. Is her next shot more likely to go in?</p>
      <div className="btn-row">
        <button className="btn" onClick={() => start('yes')}>Yes, she’s heating up</button>
        <button className="btn" onClick={() => start('slight')}>Maybe slightly</button>
        <button className="btn" onClick={() => start('no')}>No, it’s a myth</button>
      </div>
      <p className="caption" style={{ marginTop: 14 }}>Then predict 10 real shots, each taken right after three makes or three misses in a row.</p>
    </div>
  )
  if (phase === 'play') {
    const r = rounds[i], hot = r.streak === 'hot', done = guess !== null
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
      <p style={{ marginTop: 10 }}>After three makes you called a make <strong>{pct(rate(hotL, (l) => l.guess === 'make'), 0)}</strong> of the time; after three misses, <strong>{pct(rate(coldL, (l) => l.guess === 'make'), 0)}</strong>. {bTxt}</p>
      <p>Ten shots are mostly luck. The answer from 8.3 million shots is on the page behind this window.</p>
      <div className="btn-row"><button className="btn primary" onClick={onSkip}>See the real answer</button><button className="btn" onClick={() => setPhase('intro')}>Play again</button></div>
    </div>
  )
}

function Answer({ H }) {
  const ft = H.ft, fg = H.fg
  return (
    <div className="answer-chips" id="answer">
      <div className="chip ft">
        <div className="chip-label">Free throws</div>
        <div className="chip-num">{sgn(ft.effect)}<span>pts</span></div>
        <div className="chip-verdict">Yes, a little</div>
      </div>
      <div className="chip fg">
        <div className="chip-label">Field goals</div>
        <div className="chip-num">{sgn(fg.effect)}<span>pts</span></div>
        <div className="chip-verdict">No</div>
      </div>
      <p className="chip-note">How much better players shoot after three straight makes than after three straight misses, beyond what chance produces (± {ft.ci.toFixed(1)} and ± {fg.ci.toFixed(1)}).</p>
    </div>
  )
}

function GameModal({ sits, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Predict 10 real shots">
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        <Game sits={sits} onDone={() => {}} onSkip={onClose} />
      </div>
    </div>
  )
}

/* ───────────── 3. Why it fooled people ───────────── */
function Shrink({ H }) {
  const [wref, W] = useWidth()
  const narrow = W < 560
  const rowH = narrow ? 50 : 38, left = narrow ? 34 : 250, right = 64, gap = 52
  const panels = [{ key: 'ft', title: 'Free throws', color: 'var(--series-ft)' }, { key: 'fg', title: 'Field goals', color: 'var(--series-fg)' }]
  const x = scaleLinear().domain([-2, 16]).range([left, W - right])
  const tp = useTip()
  const ph = 3 * rowH + gap
  return (
    <div ref={wref}>
      <div className="chartbox" ref={tp.ref}>
        <svg className="chart" width={W} height={panels.length * ph + 24} viewBox={`0 0 ${W} ${panels.length * ph + 24}`} role="img" aria-label="How the streak gap shrinks after each correction">
          {panels.map((p, pi) => {
            const h = H[p.key]
            const rows = [
              { l: 'Raw: everyone pooled', v: h.pooled, t: `All shots after three makes (${pct(h.pH)}) vs after three misses (${pct(h.pM)}). Good shooters dominate the first group.` },
              { l: 'Vs. each shooter’s own average', v: h.own, t: 'Skill differences removed. The way streaks are counted still tilts this number.' },
              { l: 'Beyond chance (shuffled)', v: h.effect, t: `What is left after subtracting the gap that ${H.shuffles} reshuffled versions of the same games produce (${sgn(h.chance, 2)}). ± ${h.ci.toFixed(2)}.` },
            ]
            return (
              <g key={p.key} transform={`translate(0,${22 + pi * ph})`}>
                <text className="lbl-strong" x={0} y={-6} style={{ fontSize: 15 }}>{p.title}</text>
                {[0, 5, 10, 15].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={4} y2={3 * rowH} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={t === 0 ? 1.5 : 1} /><text className="tick" x={x(t)} y={3 * rowH + 16} textAnchor="middle">{t === 0 ? '0' : '+' + t}</text></g>)}
                {rows.map((r, k) => {
                  const bx = Math.min(x(0), x(r.v)), bw = Math.abs(x(r.v) - x(0))
                  const by = narrow ? 22 : 8, bh = narrow ? 20 : rowH - 16
                  return (
                    <g key={k} transform={`translate(0,${k * rowH})`} onMouseMove={(e) => tp.show(e, <><b>{r.l}</b><br />{sgn(r.v, 2)} points<br />{r.t}</>)} onMouseLeave={tp.hide}>
                      <rect x={0} y={0} width={W} height={rowH} fill="transparent" />
                      <text className={narrow ? 'halo' : ''} x={0} y={narrow ? 15 : rowH / 2 + 4}>{r.l}</text>
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

function Why({ H }) {
  return (
    <>
      <h3 className="sub-h">Why the hot hand fooled people for 40 years</h3>
      <div className="timeline">
        <div className="card"><span className="year">1985</span><p>Gilovich, Vallone and Tversky concluded the hot hand is an illusion: streaks look meaningful, but shots behave like coin flips.</p></div>
        <div className="card"><span className="year">2018</span><p>Miller and Sanjurjo showed that counting streaks inside short sequences has a built-in bias. The fix is to compare real games with shuffled versions of themselves.</p></div>
      </div>
      <p>Look at every shot after three makes versus three misses and you see a huge “hot hand”. Compare each shooter with her own average, then with chance, and it nearly disappears.</p>
      <Shrink H={H} />
      <p className="caption">Hover a bar for details. Points = percentage points.</p>
    </>
  )
}

function Coach({ H }) {
  return (
    <>
      <h3 className="sub-h">What this means for a coach</h3>
      <div className="cols3">
        <div className="card"><div className="pill ft">Free throws</div><h3>Trust the routine</h3><p>A make streak at the line is worth about <strong>{sgn(H.ft.effect)} pts</strong>. Real, but far too small to change who goes to the line.</p></div>
        <div className="card"><div className="pill fg">Field goals</div><h3>Don’t feed the streak</h3><p>A shooter on a run is no more likely to hit her next field goal (<strong>{sgn(H.fg.effect)} pts</strong>, ± {H.fg.ci.toFixed(1)}). Run the best shot, not the hottest player.</p></div>
        <div className="card"><div className="pill fg">Three-pointers</div><h3>The one exception</h3><p>Threes are the only field goals with a clear lift (<strong>{sgn(H.three.effect)} pts</strong>, ± {H.three.ci.toFixed(1)}). Worth a look in scouting, not a reason to force shots.</p></div>
      </div>
      <div className="rule">
        <div className="kicker">Decision rule</div>
        <p>Pick shots and shooters by season-long accuracy and shot quality. A streak tells you what already happened; across 8.3 million shots it barely predicts what happens next.</p>
      </div>
    </>
  )
}

function Method({ H }) {
  return (
    <>
      <h3 className="sub-h">Method and limits</h3>
      <details><summary>Data</summary>
        <ul>
          <li>NCAA women’s basketball play-by-play, 2006–2026 seasons: 8.3 million made or missed shots, 42,936 players.</li>
          <li>Streaks count only within one player’s shots in one game. Free throws and field goals are counted separately.</li>
          <li>Field goals within 6 seconds of the same player’s previous shot (mostly putbacks after her own miss) are not counted as “next shots”; they are unusually easy and would fake a cold hand.</li>
          <li>Halves: seasons before 2015–16 were played in halves, later seasons in quarters (Q1–2 = 1st half, Q3–4 = 2nd half). “Close” means the score was within 5 points when the shot was taken.</li>
          <li>Teams with fewer than 1,000 counted shots (mostly non-Division I opponents) are grouped as “Other teams”.</li>
        </ul>
      </details>
      <details><summary>Statistics</summary>
        <ul>
          <li>Each next shot is compared with the shooter’s own average for that kind of shot, so good shooters don’t inflate the result.</li>
          <li>Chance baseline: each player’s makes and misses were reshuffled within the same game and shot type {H.shuffles} times, and the same comparison recomputed. This removes the Miller–Sanjurjo streak-selection bias.</li>
          <li>Hot hand effect = real gap − chance gap. The ± range is a 95% interval from the binomial standard error; “Clear” means the effect is larger than that range.</li>
        </ul>
      </details>
      <details><summary>Limitations</summary>
        <ul>
          <li>Pre-2020 seasons have thinner play-by-play coverage.</li>
          <li>Defense, shot clock and lineups are not observed: this measures what follows a streak, not why.</li>
          <li>Free throws in one trip are shot back to back, so “after a streak” partly means “later in the same trip”.</li>
          <li>Single players have few streaks, so individual results are noisy. With millions of shots, tiny effects become statistically clear: judge the size, not only the label.</li>
        </ul>
      </details>
      <p className="caption" style={{ marginTop: 18 }}>Built for the Boiler Up, Hammer Data Challenge (Purdue Love Data Week) by Yewon and Shinyoung. Data: NCAA women’s basketball play-by-play provided by the challenge. Analysis in Python (pandas, NumPy); visualization in React and D3.</p>
    </>
  )
}

/* ───────────── Page shell ───────────── */
export default function App() {
  const [H, setH] = useState(null)
  const [sits, setSits] = useState(null)
  const [err, setErr] = useState(false)
  const [game, setGame] = useState(false)
  const readHash = () => { const n = parseInt((window.location.hash || '').replace(/\D/g, ''), 10); return n === 2 ? 1 : 0 }
  const [ch, setCh] = useState(readHash)

  useEffect(() => {
    Promise.all([fetch('./data/dash/headline.json').then((r) => r.json()), fetch('./data/situations.json').then((r) => r.json())])
      .then(([a, b]) => { setH(a); setSits(b) }).catch(() => setErr(true))
  }, [])

  const CH = [{ t: 'Explore' }, { t: 'What it means' }]
  const go = useCallback((n) => {
    const c = Math.max(0, Math.min(1, n))
    setCh(c)
    window.history.replaceState(null, '', '#' + (c + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  useEffect(() => {
    const onHash = () => setCh(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const closeGame = useCallback(() => setGame(false), [])

  if (err) return <div className="wrap"><p style={{ paddingTop: 80 }}>Could not load the data files.</p></div>
  if (!H) return <div className="wrap"><p style={{ paddingTop: 80 }}>Loading 8.3 million shots…</p></div>

  return (
    <div className="shell">
      <nav className="topnav" aria-label="Sections">
        <div className="topnav-in">
          <button className="brand" onClick={() => go(0)}><img src="./trophy.webp" alt="" />Hot Hand</button>
          <ol className="tabs">
            {CH.map((c, i) => (
              <li key={i}><button aria-current={i === ch ? 'step' : undefined} onClick={() => go(i)}>
                <span className="num">{i + 1}</span><span className="tlabel">{c.t}</span></button></li>
            ))}
          </ol>
        </div>
      </nav>

      {ch === 0 ? (
        <main className="chapter wide" key={ch}>
          <header className="hero">
            <div className="hero-text">
              <div className="kicker">NCAA women’s basketball · 8.3 million shots · 2006–2026</div>
              <h1>Is the hot hand real?</h1>
              <p className="lede">Do players shoot better right after a streak of makes, or is it a trick of the mind? Here is the answer, and every shot behind it.</p>
              <div className="btn-row">
                <button className="btn gold" onClick={() => setGame(true)}>🏀 Test your gut first (10 shots)</button>
                <button className="btn" onClick={() => document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' })}>Explore the data ↓</button>
              </div>
            </div>
            <Answer H={H} />
          </header>
          <div className="wide-head" id="explorer">
            <h2 className="explore-h">Explore it yourself</h2>
            <p className="lede-sm">Every number is recomputed from the shots that pass your filters. Try Purdue, a shot type, or a single player.</p>
            <a className="linkbtn" href="./explorer/index.html" target="_blank" rel="noopener">Open full screen ↗</a>
          </div>
          <iframe className="explorer" src="./explorer/index.html" title="Hot Hand Explorer: filter 8.3 million shots by shot type, streak, score, half, team and player" />
        </main>
      ) : (
        <main className="wrap chapter" key={ch}>
          <div className="kicker">What it means</div>
          <h2>Why it fooled us, and what to do about it</h2>
          <Why H={H} />
          <Coach H={H} />
          <Method H={H} />
        </main>
      )}

      {ch === 1 && (
        <footer className="pager wrap">
          <button className="textlink" onClick={() => go(0)}>← Back to Explore</button>
        </footer>
      )}
      {game && <GameModal sits={sits} onClose={closeGame} />}
    </div>
  )
}
