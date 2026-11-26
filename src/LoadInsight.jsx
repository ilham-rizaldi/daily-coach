import { connectLoadGuide, connectRatioRange, rangeLabel } from "./garminLoad.js";
import { decimal, formatDate } from "./report.js";

const proseChange = (value, previous) => value > previous ? "rose" : value < previous ? "fell" : "held";
const comparison = (name, value, previous) => value === previous ? `${name} held at ${decimal(value)}`
  : `${name} ${proseChange(value, previous)} from ${decimal(previous)} to ${decimal(value)}`;

export function GarminLoadInsight({ reading, latest, previous, compact = false, preview }) {
  if (!latest || !Number.isFinite(reading.acute)) return null;
  const { acute, range, ratio, ratioStatus } = reading;
  const hasPair = [latest.chronic, previous?.acute, previous?.chronic].every(Number.isFinite);
  const excess = range ? acute - range.high : null;
  const elevated = Boolean(reading.acuteNote || reading.ratioNote);
  const ratioHigh = /high/i.test(ratioStatus || "");
  const title = elevated ? "Recent load is elevated"
    : hasPair && acute !== previous.acute ? `Recent load ${proseChange(acute, previous.acute)}` : "Training load today";
  const rangeText = excess > 0 ? `Acute load is about ${decimal(excess)} points above the upper edge of your Garmin range (≈${rangeLabel(range)}).`
    : range && acute >= range.low ? `Acute load is within your Garmin range (≈${rangeLabel(range)}).`
    : range ? `Acute load is about ${decimal(range.low - acute)} points below your Garmin range (≈${rangeLabel(range)}).` : null;
  const changes = hasPair ? `Since ${formatDate(previous.date)}, ${comparison("acute load", acute, previous.acute)} and ${comparison("chronic load", latest.chronic, previous.chronic)}.` : null;
  if (!rangeText && !changes && !reading.acuteNote && !reading.ratioNote) return null;
  return <div className="load-attention load-interpretation" data-level={elevated ? "watch" : "steady"}>
    <strong>{title}</strong>
    {compact ? <p>{rangeText || changes || reading.acuteNote || reading.ratioNote}</p> : <>
      {changes && <p>{changes} Acute load responds to recent workouts. Chronic load tracks your longer-term workload.</p>}
      <p>{rangeText || reading.acuteNote} {ratioHigh && Number.isFinite(ratio) ? <>
        Garmin rated the displayed ratio of <b>{decimal(ratio)}</b> High.
        {ratio === connectRatioRange.high && " The rounded display sits at the top of the reference range."}
      </> : reading.ratioNote}</p>
    </>}
    {!compact && !preview && <a href={connectLoadGuide} target="_blank" rel="noreferrer">Garmin guide</a>}
  </div>;
}

export function FitnessInsight({ latest, prior, week }) {
  const [fitness, fatigue, form] = latest?.plot ?? [];
  if (![fitness, fatigue, form].every(Number.isFinite)) return null;
  const [priorFitness, priorFatigue] = prior?.plot ?? [];
  const [weekFitness, weekFatigue] = week?.plot ?? [];
  const shortTerm = [priorFitness, priorFatigue].every(Number.isFinite);
  const longerTerm = [weekFitness, weekFatigue].every(Number.isFinite);
  const gap = Math.abs(fatigue - fitness);
  const formText = gap ? `Short-term load is ${decimal(gap)} points ${fatigue > fitness ? "above" : "below"} your longer-term load.`
    : "Short- and longer-term loads are level in the model.";
  return <div className="load-attention load-interpretation" data-level="fitness">
    <strong>{fatigue > fitness ? "Fatigue is ahead of Fitness" : fatigue < fitness ? "Fatigue has eased below Fitness" : "Fitness and Fatigue are level"}</strong>
    {shortTerm && <p>Since {formatDate(prior.date)}, {comparison("Fitness", fitness, priorFitness)} and {comparison("Fatigue", fatigue, priorFatigue)}.
      {longerTerm && <> On {formatDate(week.date)}, Fitness was {decimal(weekFitness)} and Fatigue was {decimal(weekFatigue)}.</>}</p>}
    <p>{formText} Form is Fitness minus Fatigue. Fitness here tracks accumulated training load. Compare repeatable watts or pace at a similar HR to see whether your performance is improving.</p>
  </div>;
}
