import { useState } from "react";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { decimal, duration, formatDate } from "./report.js";
import { BatteryRangeChart, palette } from "./MetricGraphics.jsx";
import { cyclingProgression, recoverySeries, trainingPlacement } from "./performance.js";
import { SportSpeedCards } from "./PerformanceProgression.jsx";
import { activitySpeedSeries } from "./activityProgression.js";
import { StrengthLift } from "./StrengthLift.jsx";
import "./performance.css";
import TrainingMix from "./TrainingMix.jsx";
import { DurationValue, MetricValue } from "./Readout.jsx";

const number = (value, places = 1) => Number.isFinite(value) ? decimal(value, places) : "—";
const signed = value => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${decimal(value, 0)}` : "—";
const tooltipStyle = { background: "var(--surface-raised)", border: "1px solid var(--control-border)", borderRadius: 9, color: "var(--text)", fontSize: 12 };
const ticks = { fill: "var(--muted)", fontSize: 12 };

function Plot({ data, label, children, domain = ["auto", "auto"], formatter }) {
  return <div className="performance-plot" role="group" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 7, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="3 4" />
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
  const lastBattery = data.findLast(row => row.bodyBatteryRange);
  const dated = (columns, values, caption) => <>
    <DetailFacts rows={[["Source", report.wellnessHistory?.source || "Garmin wellness history"], ["Capture", report.wellnessHistory?.observedAt]]} />
    <DetailTable columns={["Date", ...columns]} rows={[...data].reverse().map(row => [formatDate(row.date), ...values(row)])} caption={caption} />
  </>;
  return <section className="performance-recovery" aria-labelledby="recovery-trend-title">
    <div className="performance-heading"><h2 id="recovery-trend-title" title={`Garmin wellness · captured ${report.wellnessHistory?.observedAt || "unrecorded"}`}>Recovery trends</h2><div className="performance-period" aria-label="Recovery period">{[7, 28, 56].map(value => <button key={value} aria-pressed={value === days} onClick={() => setDays(value)}>{value}d</button>)}</div></div>
    {available ? <>
      <div className="performance-chart-grid">
        <DataCard title="Heart rate variability" history="hrv" detail={dated(["Overnight · ms", "7d · ms", "Baseline · ms"], row => [number(row.hrvMs, 0), number(row.hrv7dMs, 0), row.hrvBand?.join("–")], "Daily HRV readings")}><div className="performance-chart-title"><h3>HRV <small>ms</small></h3><div className="recovery-readout"><MetricValue as="strong" value={number(last.hrvMs, 0)} unit="ms" style={{ color: palette.blue }} /><small className="metric-context">7d {number(last.hrv7dMs, 0)}ms</small></div></div>
          <Plot data={data} label="Overnight and seven-day HRV against captured personal baseline" formatter={(value, name) => [Array.isArray(value) ? value.map(v => number(v, 0)).join("–") : number(value, 0), name]}>
            <Area type="monotoneX" dataKey="hrvBand" name="Baseline · ms" fill={palette.green} fillOpacity={0.16} stroke="none" connectNulls={false} isAnimationActive={false} />
            <Line type="monotoneX" dataKey="hrvMs" name="Overnight · ms" stroke={palette.gray} strokeWidth={1.3} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotoneX" dataKey="hrv7dMs" name="7d · ms" stroke={palette.blue} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </Plot><div className="performance-key"><span style={{ color: palette.blue }}>7d</span><span>Overnight</span><span style={{ color: palette.green }}>Baseline</span></div>
        </DataCard>
        <DataCard title="Resting heart rate trend" history="resting-hr" detail={dated(["RHR · bpm", "Change · bpm"], row => [number(row.rhrBpm, 0), signed(row.rhrDelta)], "Change against the preceding 28-day median, with at least seven prior readings")}><div className="performance-chart-title"><h3>RHR Δ <small>bpm</small></h3><MetricValue as="strong" value={signed(last.rhrDelta)} unit="bpm" style={{ color: palette.red }} /></div>
          <Plot data={data} label="Resting HR deviation from preceding 28-day median, requiring seven prior readings" formatter={(value) => [`${number(value)} bpm`, "RHR Δ"]}>
            <ReferenceLine y={0} stroke="var(--control-border)" strokeDasharray="3 3" />
            <Line type="monotoneX" dataKey="rhrDelta" name="RHR Δ" stroke={palette.red} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </Plot><div className="performance-key">28d personal median</div>
        </DataCard>
        <DataCard title="Sleep and sleep need" history="sleep" detail={dated(["Sleep · min", "Need · min", "Gap · min"], row => [number(row.sleepMinutes, 0), number(row.sleepNeedMinutes, 0), signed(row.sleepGap)], "Sleep duration minus the recorded need for that night")}><div className="performance-chart-title"><h3>Sleep − need <small>min</small></h3><MetricValue as="strong" value={signed(last.sleepGap)} unit="min" style={{ color: Number.isFinite(last.sleepGap) && last.sleepGap >= 0 ? palette.green : palette.orange }} /></div>
          <Plot data={data} label="Sleep duration minus captured sleep need in minutes" formatter={(value) => [`${signed(value)} min`, "Sleep − need"]}>
            <ReferenceLine y={0} stroke="var(--control-border)" />
            <Bar dataKey="sleepGap" name="Sleep − need" maxBarSize={12} isAnimationActive={false}>{data.map(row => <Cell key={row.date} fill={row.sleepGap >= 0 ? palette.green : palette.orange} />)}</Bar>
          </Plot>
        </DataCard>
        <DataCard className="battery-trend-card" title="Body Battery history" history="battery" detail={dated(["Low", "High", "Charge"], row => [number(row.bodyBatteryLow, 0), number(row.bodyBatteryHigh, 0), number(row.bodyBatteryCharge, 0)], "Recorded daily Body Battery readings")}>
          <div className="performance-chart-title"><h3>Body Battery <small>daily low–high</small></h3><div className="battery-range-head">
            <MetricValue as="strong" value={lastBattery ? lastBattery.bodyBatteryRange.join("–") : "—"} style={{ color: palette.blue }} />
            <span className="battery-range-period">{lastBattery ? formatDate(lastBattery.date) : `${days}d`}</span>
          </div></div>
          <BatteryRangeChart rows={data} days={days} />
        </DataCard>
      </div>
      <details className="performance-data"><summary>Recovery data</summary><div className="table-scroll"><table><caption className="sr-only">Garmin recovery history</caption><thead><tr><th>Date</th><th>HRV · ms</th><th>7d · ms</th><th>RHR · bpm</th><th>RHR Δ</th><th>Sleep − need · min</th><th>BB low–high</th></tr></thead><tbody>{data.map(row => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{number(row.hrvMs, 0)}</td><td>{number(row.hrv7dMs, 0)}</td><td>{number(row.rhrBpm, 0)}</td><td>{signed(row.rhrDelta)}</td><td>{signed(row.sleepGap)}</td><td>{row.bodyBatteryRange ? row.bodyBatteryRange.join("–") : "—"}</td></tr>)}</tbody></table></div></details>
    </> : <p className="performance-empty">Recovery history unavailable</p>}
  </section>;
}

function Cycling({ report }) {
  const data = cyclingProgression(report), placement = trainingPlacement(report), latest = data.at(-1) || {};
  const weekly = (label, value, source) => <>
    <DetailFacts rows={[["Source", source], ["Window", "Completed seven-day blocks before the report date"]]} />
    <DetailTable columns={["Period", label, "Coverage"]} rows={[...data].reverse().map(row =>
      [`${formatDate(row.start)}–${formatDate(row.end)}`, value(row), row.partial ? "Partial" : "Complete"])} />
  </>;
  const stats = [
    { label: "Ride time", metric: "duration", tone: "power", source: "Captured activity timers",
      readout: <DurationValue as="strong" seconds={Number.isFinite(latest.hours) ? latest.hours * 3600 : NaN} />,
      value: row => Number.isFinite(row.hours) ? duration(row.hours * 3600) : null },
    { label: "Frequency", metric: "sessions", tone: "pace", source: "Captured activity sessions",
      readout: <MetricValue as="strong" value={number(latest.sessions, 0)} unit="/7d" />, value: row => number(row.sessions, 0) },
    { label: "Longest ride", metric: "longest", tone: "alert", source: "Captured activity timers",
      readout: <DurationValue as="strong" seconds={Number.isFinite(latest.longestMinutes) ? latest.longestMinutes * 60 : NaN} />,
      value: row => Number.isFinite(row.longestMinutes) ? duration(row.longestMinutes * 60) : null },
    { label: "TL · Intervals", metric: "intervalsLoad", tone: "model", source: "Intervals.icu activity load",
      readout: <strong>{number(latest.load, 0)}{latest.missingLoad > 0 && <small> Partial</small>}</strong>,
      value: row => row.missingLoad ? `${number(row.knownLoad, 0)} known · ${row.missingLoad} missing` : number(row.load, 0) },
  ];
  return <section className="performance-cycling" aria-labelledby="cycling-progression-title">
    <div className="performance-heading"><h2 id="cycling-progression-title" title="Garmin canonical timers · Intervals activity load · completed calendar days">Cycling progression</h2><span className="quiet">6 × 7d{data.some(row => row.partial) ? " · Partial" : " · completed"}</span></div>
    <div className="performance-cycling-stats">{stats.map(item =>
      <DataCard as="div" key={item.label} title={item.label} history={{ kind: "activity-weeks", sport: "Ride", metric: item.metric }} data-signal={item.tone} detail={weekly(item.label, item.value, item.source)}>
        <span>{item.label}</span>{item.readout}
      </DataCard>)}</div>
    <div className="performance-chart-grid cycling-charts">
      <DataCard title="Cycling ride time" history={{ kind: "activity-weeks", sport: "Ride", metric: "duration" }} detail={weekly("Ride time", row => Number.isFinite(row.hours) ? duration(row.hours * 3600) : "—", "Captured activity timers")}><h3>Ride time <small>h</small></h3><Plot data={data} label="Cycling hours per completed seven-day block" domain={[0, "auto"]} formatter={(value) => [`${number(value, 2)} h`, "Ride time"]}><Bar dataKey="hours" fill={palette.blue} maxBarSize={25} isAnimationActive={false}>{data.map(row => <Cell key={row.end} fill={palette.blue} fillOpacity={row.partial ? 0.45 : 1} />)}</Bar></Plot></DataCard>
      <DataCard title="Cycling training load" history={{ kind: "activity-weeks", sport: "Ride", metric: "intervalsLoad" }} detail={weekly("Intervals load", row => row.missingLoad ? `${number(row.knownLoad, 0)} known · ${row.missingLoad} missing` : number(row.load, 0), "Intervals.icu activity load")}><h3>TL <small>Intervals</small></h3><Plot data={data} label="Cycling Intervals load per seven-day block; missing session load produces gaps" domain={[0, "auto"]} formatter={(value) => [number(value, 0), "TL · Intervals"]}><Bar dataKey="load" fill={palette.purple} maxBarSize={25} isAnimationActive={false}>{data.map(row => <Cell key={row.end} fill={palette.purple} fillOpacity={row.partial ? 0.45 : 1} />)}</Bar></Plot></DataCard>
      <DataCard className="cycling-longest" title="Longest ride" history={{ kind: "activity-weeks", sport: "Ride", metric: "longest" }} detail={weekly("Longest ride · min", row => number(row.longestMinutes, 0), "Captured activity timers")}><h3>Longest ride <small>min</small></h3><Plot data={data} label="Longest recorded ride duration per seven-day block" domain={[0, "auto"]} formatter={(value) => [`${number(value, 0)} min`, "Longest ride"]}><Line type="monotoneX" dataKey="longestMinutes" stroke={palette.orange} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} /></Plot></DataCard>
    </div>
    <DataCard as="div" className="placement-card" title="Session placement" history={{ kind: "activity-days", metric: "sessions" }} detail={<DetailTable caption="Captured sessions by completed day" columns={["Date", "Rides", "Strength", "Other", "Coverage"]} rows={placement.map(row => [formatDate(row.date), row.rides, row.strength, row.other, row.complete ? "Complete" : "Partial"])} />}><div className="performance-placement-heading"><h3>Session placement <small>28d</small></h3><span><i style={{ background: palette.blue }} />Ride <i style={{ background: palette.purple }} />Strength <i style={{ background: palette.gray }} />Other</span></div>
    <div className="performance-placement" role="list" aria-label="Completed training placement by day">{placement.map(row => <div key={row.date} role="listitem" className={!row.complete ? "placement-partial" : undefined} title={`${formatDate(row.date)} · Ride ${row.rides} · Strength ${row.strength} · Other ${row.other}${row.complete ? "" : " · Partial coverage"}`} aria-label={`${formatDate(row.date)}: ${row.rides} rides, ${row.strength} strength, ${row.other} other${row.complete ? "" : ", partial coverage"}`}><time dateTime={row.date}>{Number(row.date.slice(-2))}</time><span>{row.rides > 0 && <i style={{ background: palette.blue }} />}{row.strength > 0 && <i style={{ background: palette.purple }} />}{row.other > 0 && <i style={{ background: palette.gray }} />}</span></div>)}</div>
    </DataCard><details className="performance-data"><summary>Progression data</summary><div className="table-scroll"><table><caption className="sr-only">Cycling seven-day blocks ending before the report date</caption><thead><tr><th>Period</th><th>Ride time</th><th>Rides</th><th>Longest · min</th><th>TL · Intervals</th><th>Strength</th></tr></thead><tbody>{data.map(row => <tr key={row.end}><td>{formatDate(row.start)}–{formatDate(row.end)}{!row.complete && <small>Partial coverage</small>}</td><td>{Number.isFinite(row.hours) ? duration(row.hours * 3600) : "—"}</td><td>{number(row.sessions, 0)}</td><td>{number(row.longestMinutes, 0)}</td><td>{number(row.load, 0)}{row.missingLoad > 0 && <small>{number(row.knownLoad, 0)} known · {row.missingLoad} missing</small>}</td><td>{number(row.strengthSessions, 0)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export default function PerformanceTrends({ report }) {
  return <div className="performance-trends">
    <TrainingMix report={report} />
    <Recovery report={report} />
    <section className="progression" aria-labelledby="sport-progression-title">
      <div className="performance-heading"><h2 id="sport-progression-title">Progression by sport</h2></div>
      <div className="progression-grid progression-sport-grid">
        <SportSpeedCards groups={activitySpeedSeries(report)} />
        <StrengthLift key={report.date} report={report} />
      </div>
    </section>
    <Cycling report={report} />
  </div>;
}
