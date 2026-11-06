import { useState } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { decimal, duration, formatDate } from "./report.js";
import { palette } from "./MetricGraphics.jsx";
import { cyclingProgression, recoverySeries, trainingPlacement } from "./performance.js";
import "./performance.css";

const number = (value, places = 1) => Number.isFinite(value) ? decimal(value, places) : "—";
const signed = value => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${decimal(value, 0)}` : "—";
const tooltipStyle = { background: "#242930", border: "1px solid #52606c", borderRadius: 5, color: "#f0f4f8", fontSize: 11 };
const ticks = { fill: "#aeb9c4", fontSize: 10 };

function Plot({ data, label, children, domain = ["auto", "auto"], formatter }) {
  return <div className="performance-plot" role="group" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 7, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="#37414b" />
        <XAxis dataKey="label" tick={ticks} axisLine={false} tickLine={false} minTickGap={28} interval="preserveStartEnd" />
        <YAxis width={35} domain={domain} tick={ticks} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatter} />
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

function Recovery({ report }) {
  const [days, setDays] = useState(28), data = recoverySeries(report, days);
  const available = data.some(row => [row.hrvMs, row.rhrBpm, row.sleepMinutes, row.bodyBatteryHigh].some(Number.isFinite));
  const last = data.at(-1) || {};
  return <section className="performance-recovery" aria-labelledby="recovery-trend-title">
    <div className="performance-heading"><h2 id="recovery-trend-title" title={`Garmin wellness · captured ${report.wellnessHistory?.observedAt || "unrecorded"}`}>Recovery trends</h2><div className="performance-period" aria-label="Recovery period">{[7, 28, 56].map(value => <button key={value} aria-pressed={value === days} onClick={() => setDays(value)}>{value}d</button>)}</div></div>
    {available ? <>
      <div className="performance-chart-grid">
        <article><div className="performance-chart-title"><h3>HRV <small>ms</small></h3><strong style={{ color: palette.blue }}>{number(last.hrvMs, 0)} <small>7d {number(last.hrv7dMs, 0)}</small></strong></div>
          <Plot data={data} label="Overnight and seven-day HRV against captured personal baseline" formatter={(value, name) => [Array.isArray(value) ? value.map(v => number(v, 0)).join("–") : number(value, 0), name]}>
            <Area dataKey="hrvBand" name="Baseline · ms" fill={palette.green} fillOpacity={0.16} stroke="none" connectNulls={false} isAnimationActive={false} />
            <Line dataKey="hrvMs" name="Overnight · ms" stroke="#8499a9" strokeWidth={1.3} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="hrv7dMs" name="7d · ms" stroke={palette.blue} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </Plot><div className="performance-key"><span style={{ color: palette.blue }}>7d</span><span>Overnight</span><span style={{ color: palette.green }}>Baseline</span></div>
        </article>
        <article><div className="performance-chart-title"><h3>RHR Δ <small>bpm</small></h3><strong style={{ color: palette.red }}>{signed(last.rhrDelta)}</strong></div>
          <Plot data={data} label="Resting HR deviation from preceding 28-day median, requiring seven prior readings" formatter={(value) => [`${number(value)} bpm`, "RHR Δ"]}>
            <ReferenceLine y={0} stroke="#7d8892" strokeDasharray="3 3" />
            <Line dataKey="rhrDelta" name="RHR Δ" stroke={palette.red} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </Plot><div className="performance-key">28d personal median</div>
        </article>
        <article><div className="performance-chart-title"><h3>Sleep − need <small>min</small></h3><strong style={{ color: Number.isFinite(last.sleepGap) && last.sleepGap >= 0 ? palette.green : palette.orange }}>{signed(last.sleepGap)}</strong></div>
          <Plot data={data} label="Sleep duration minus captured sleep need in minutes" formatter={(value) => [`${signed(value)} min`, "Sleep − need"]}>
            <ReferenceLine y={0} stroke="#7d8892" />
            <Bar dataKey="sleepGap" name="Sleep − need" maxBarSize={12} isAnimationActive={false}>{data.map(row => <Cell key={row.date} fill={row.sleepGap >= 0 ? palette.green : palette.orange} />)}</Bar>
          </Plot>
        </article>
        <article><div className="performance-chart-title"><h3>Body Battery <small>low–high</small></h3><strong style={{ color: palette.blue }}>{number(last.bodyBatteryLow, 0)}–{number(last.bodyBatteryHigh, 0)}</strong></div>
          <Plot data={data} label="Recorded Body Battery daily low and high" domain={[0, 100]} formatter={(value, name) => [Array.isArray(value) ? value.map(v => number(v, 0)).join("–") : number(value, 0), name]}>
            <Area dataKey="bodyBatteryRange" name="Daily low–high" stroke={palette.blue} strokeWidth={1} fill={palette.blue} fillOpacity={0.2} connectNulls={false} isAnimationActive={false} />
          </Plot>
        </article>
      </div>
      <details className="performance-data"><summary>Recovery data</summary><div className="table-scroll"><table><caption className="sr-only">Garmin recovery history</caption><thead><tr><th>Date</th><th>HRV · ms</th><th>7d · ms</th><th>RHR · bpm</th><th>RHR Δ</th><th>Sleep − need · min</th><th>BB low–high</th></tr></thead><tbody>{data.map(row => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{number(row.hrvMs, 0)}</td><td>{number(row.hrv7dMs, 0)}</td><td>{number(row.rhrBpm, 0)}</td><td>{signed(row.rhrDelta)}</td><td>{signed(row.sleepGap)}</td><td>{row.bodyBatteryRange ? row.bodyBatteryRange.join("–") : "—"}</td></tr>)}</tbody></table></div></details>
    </> : <p className="performance-empty">Recovery history unavailable</p>}
  </section>;
}

function Cycling({ report }) {
  const data = cyclingProgression(report), placement = trainingPlacement(report), latest = data.at(-1) || {};
  return <section className="performance-cycling" aria-labelledby="cycling-progression-title">
    <div className="performance-heading"><h2 id="cycling-progression-title" title="Garmin canonical timers · Intervals activity load · completed calendar days">Cycling progression</h2><span className="quiet">6 × 7d{data.some(row => row.partial) ? " · Partial" : " · completed"}</span></div>
    <div className="performance-cycling-stats"><div><span>Ride time</span><strong>{Number.isFinite(latest.hours) ? duration(latest.hours * 3600) : "—"}</strong></div><div><span>Frequency</span><strong>{number(latest.sessions, 0)}<small> / 7d</small></strong></div><div><span>Longest ride</span><strong>{Number.isFinite(latest.longestMinutes) ? duration(latest.longestMinutes * 60) : "—"}</strong></div><div><span>TL · Intervals</span><strong>{number(latest.load, 0)}{latest.missingLoad > 0 && <small> Partial</small>}</strong></div></div>
    <div className="performance-chart-grid cycling-charts">
      <article><h3>Ride time <small>h</small></h3><Plot data={data} label="Cycling hours per completed seven-day block" domain={[0, "auto"]} formatter={(value) => [`${number(value, 2)} h`, "Ride time"]}><Bar dataKey="hours" fill={palette.blue} maxBarSize={25} isAnimationActive={false}>{data.map(row => <Cell key={row.end} fill={palette.blue} fillOpacity={row.partial ? 0.45 : 1} />)}</Bar></Plot></article>
      <article><h3>TL <small>Intervals</small></h3><Plot data={data} label="Cycling Intervals load per seven-day block; missing session load produces gaps" domain={[0, "auto"]} formatter={(value) => [number(value, 0), "TL · Intervals"]}><Bar dataKey="load" fill={palette.purple} maxBarSize={25} isAnimationActive={false}>{data.map(row => <Cell key={row.end} fill={palette.purple} fillOpacity={row.partial ? 0.45 : 1} />)}</Bar></Plot></article>
      <article className="cycling-longest"><h3>Longest ride <small>min</small></h3><Plot data={data} label="Longest recorded ride duration per seven-day block" domain={[0, "auto"]} formatter={(value) => [`${number(value, 0)} min`, "Longest ride"]}><Line dataKey="longestMinutes" stroke={palette.orange} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} /></Plot></article>
    </div>
    <div className="performance-placement-heading"><h3>Session placement <small>28d</small></h3><span><i style={{ background: palette.blue }} />Ride <i style={{ background: palette.purple }} />Strength <i style={{ background: palette.gray }} />Other</span></div>
    <div className="performance-placement" role="list" aria-label="Completed training placement by day">{placement.map(row => <div key={row.date} role="listitem" className={!row.complete ? "placement-partial" : undefined} title={`${formatDate(row.date)} · Ride ${row.rides} · Strength ${row.strength} · Other ${row.other}${row.complete ? "" : " · Partial coverage"}`} aria-label={`${formatDate(row.date)}: ${row.rides} rides, ${row.strength} strength, ${row.other} other${row.complete ? "" : ", partial coverage"}`}><time dateTime={row.date}>{Number(row.date.slice(-2))}</time><span>{row.rides > 0 && <i style={{ background: palette.blue }} />}{row.strength > 0 && <i style={{ background: palette.purple }} />}{row.other > 0 && <i style={{ background: palette.gray }} />}</span></div>)}</div>
    <details className="performance-data"><summary>Progression data</summary><div className="table-scroll"><table><caption className="sr-only">Cycling seven-day blocks ending before the report date</caption><thead><tr><th>Period</th><th>Ride time</th><th>Rides</th><th>Longest · min</th><th>TL · Intervals</th><th>Strength</th></tr></thead><tbody>{data.map(row => <tr key={row.end}><td>{formatDate(row.start)}–{formatDate(row.end)}{!row.complete && <small>Partial coverage</small>}</td><td>{Number.isFinite(row.hours) ? duration(row.hours * 3600) : "—"}</td><td>{number(row.sessions, 0)}</td><td>{number(row.longestMinutes, 0)}</td><td>{number(row.load, 0)}{row.missingLoad > 0 && <small>{number(row.knownLoad, 0)} known · {row.missingLoad} missing</small>}</td><td>{number(row.strengthSessions, 0)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export default function PerformanceTrends({ report }) {
  return <div className="performance-trends"><Recovery report={report} /><Cycling report={report} /></div>;
}
