import { DetailFacts, DetailTable } from "./CardDetails.jsx";
import { palette } from "./MetricGraphics.jsx";
import { DurationValue } from "./Readout.jsx";

const stages = [
  { key: "awake", label: "Awake", color: palette.orange, duration: "awakeMinutes" },
  { key: "rem", label: "REM", color: palette.rem, duration: "remSleepMinutes" },
  { key: "light", label: "Light", color: palette.light, duration: "lightSleepMinutes" },
  { key: "deep", label: "Deep", color: palette.deep, duration: "deepSleepMinutes" },
];
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });
const minutes = value => Number.isFinite(value) && value >= 0 ? <DurationValue seconds={value * 60} /> : null;

function validSegments(timeline, date) {
  if (timeline?.date !== date || !Array.isArray(timeline?.segments)) return [];
  const rows = timeline.segments.flatMap(segment => {
    const index = stages.findIndex(stage => stage.key === segment?.stage);
    const start = Date.parse(segment?.startAt), end = Date.parse(segment?.endAt);
    return index >= 0 && Number.isFinite(start) && Number.isFinite(end) && start < end ? [{ index, start, end }] : [];
  }).sort((a, b) => a.start - b.start);
  if (!rows.length || rows.at(-1).end - rows[0].start > 86400000) return [];
  return rows.filter((row, index) => index === 0 || row.start >= rows[index - 1].end);
}

function StageTimeline({ timeline, date }) {
  const rows = validSegments(timeline, date);
  if (!rows.length) return <p>Timed stage data is unavailable for this snapshot.</p>;
  const first = rows[0].start, last = rows.at(-1).end;
  const scale = time => 100 * (time - first) / (last - first);
  const ticks = [first, ...[1, 2, 3].map(part => first + part * (last - first) / 4), last];
  return <div className="sleep-timeline">
    <div className="sleep-timeline-grid">
      <div className="sleep-timeline-labels" aria-hidden="true">{stages.map(stage => <span key={stage.key} style={{ "--stage-color": stage.color }}><i />{stage.label}</span>)}</div>
      <div className="sleep-timeline-plot" role="img" aria-label={`Sleep stages from ${clock.format(first)} to ${clock.format(last)} WIB`}>
        {ticks.map(point => <i key={point} className="sleep-time-line" style={{ left: `${scale(point)}%` }} />)}
        {rows.map((row, index) => <span className="sleep-block" key={index} style={{
          left: `${scale(row.start)}%`, width: `${scale(row.end) - scale(row.start)}%`,
          top: `${row.index * 25 + 4}%`, "--stage-color": stages[row.index].color,
        }} title={`${stages[row.index].label} · ${clock.format(row.start)}–${clock.format(row.end)} WIB`} />)}
      </div>
      <div className="sleep-timeline-axis"><span>{clock.format(first)}</span><span>{clock.format(ticks[2])}</span><span>{clock.format(last)}</span></div>
    </div>
    <details className="performance-data"><summary>Timed stage readings</summary>
      <DetailTable columns={["Stage", "Starts · WIB", "Ends · WIB", "Duration"]} rows={rows.map(row =>
        [stages[row.index].label, clock.format(row.start), clock.format(row.end), <DurationValue seconds={(row.end - row.start) / 1000} />])} />
    </details>
  </div>;
}

export function SleepDetail({ wellness, total, readingDate, stamp, source, sourceUrl }) {
  const w = wellness;
  const score = Number.isFinite(w.sleepScore) && w.sleepScore >= 0 && w.sleepScore <= 100 ? w.sleepScore : null;
  const timing = w.bedTimeLocal && w.wakeTimeLocal ? `${w.bedTimeLocal}–${w.wakeTimeLocal}` : null;
  const measured = stages.filter(stage => Number.isFinite(w[stage.duration]) && w[stage.duration] >= 0);
  const durationSum = measured.reduce((sum, stage) => sum + w[stage.duration], 0);
  return <div className="sleep-detail">
    <div className="sleep-detail-hero">
      <div className="sleep-detail-score" style={{ "--sleep-score": `${score ?? 0}%` }} role="img" aria-label={score === null ? "Sleep score unavailable" : `Sleep score ${score} out of 100`}>
        <div><strong>{score ?? "—"}</strong><span>Sleep score</span></div>
      </div>
      <dl className="sleep-detail-key">
        <div><dt>Bedtime · wake time</dt><dd>{timing ? `${timing} WIB` : "Not recorded"}</dd></div>
        <div><dt>Time asleep</dt><dd>{minutes(total) || "Not recorded"}</dd></div>
        {w.sleepScoreStatus && <div><dt>Garmin rating</dt><dd>{w.sleepScoreStatus}</dd></div>}
      </dl>
    </div>
    <section className="sleep-detail-section"><h3>Sleep stages</h3>
      <StageTimeline timeline={w.sleepStageTimeline} date={readingDate} />
      {durationSum > 0 && <div className="sleep-stage-composition" role="img" aria-label={measured.map(stage => `${stage.label} ${w[stage.duration]} minutes`).join(", ")}>
        {measured.map(stage => <i key={stage.key} style={{ width: `${100 * w[stage.duration] / durationSum}%`, background: stage.color }} />)}
      </div>}
      <div className="sleep-detail-tiles">{measured.map(stage => <div key={stage.key} style={{ "--stage-color": stage.color }}>
        <span>{stage.label}</span><strong>{minutes(w[stage.duration])}</strong>
      </div>)}</div>
    </section>
    <DetailFacts rows={[
      ["Restless moments", Number.isFinite(w.restlessMoments) ? w.restlessMoments : null],
      ["Sleep need", minutes(w.sleepNeedMinutes)], ["Overnight HR", Number.isFinite(w.averageOvernightHr) ? `${w.averageOvernightHr} bpm` : null],
      ["Source", sourceUrl?.startsWith("https://") ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source}</a> : source],
      ["Reading", stamp], ["Timed stages captured", w.sleepStageTimeline?.observedAt && Number.isFinite(Date.parse(w.sleepStageTimeline.observedAt)) ? `${clock.format(Date.parse(w.sleepStageTimeline.observedAt))} WIB` : null],
    ]} />
  </div>;
}
