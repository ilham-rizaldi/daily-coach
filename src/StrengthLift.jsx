import { useId } from "react";
import { DataCard, DetailTable } from "./CardDetails.jsx";
import { datedHistory } from "./cardHistory.js";
import { formatDate } from "./report.js";
import { equipmentTypes, formatKg, strengthSummary } from "./strength.js";
import "./strength-lift.css";

const formatDateWithYear = date => formatDate(date, { year: "numeric" });
const heliCount = value => value.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const garminLink = id => /^\d+$/.test(id) ? `https://connect.garmin.com/app/activity/${id}` : null;

function Illustration({ tile, className = "" }) {
  const x = (tile % 4) * 100 / 3;
  const y = Math.floor(tile / 4) * 50;
  return <span aria-hidden="true" className={`strength-illustration ${className}`} style={{ backgroundPosition: `${x}% ${y}%` }} />;
}

function LiftDate({ record }) {
  const date = formatDateWithYear(record.date);
  const url = garminLink(record.activityId);
  return url ? <a href={url} target="_blank" rel="noreferrer">{date}</a> : <time dateTime={record.date}>{date}</time>;
}

function SessionName({ row }) {
  const url = garminLink(row.activityId);
  const name = row.name || "Strength";
  return url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : name;
}

function LiftDetails({ data, preview }) {
  return <div className="strength-details">
    {data.best && <p className="strength-peak">
      Heaviest session <strong>{formatKg(data.best.volumeKg)} kg</strong>
      <span> · </span><LiftDate record={data.best} />
    </p>}
    <section aria-label="Heaviest lift records">
      <h3>Heaviest set per exercise</h3>
      {data.sessionsWithSets > 0 && <p>
        {data.sessionsWithSets} of {data.sessions.length} sessions have set details. Ties are ranked by reps, then most recent date.
      </p>}
      <DetailTable caption="Lifts by recorded weight" columns={["Exercise", "Weight", "Reps", "Equipment", "Date"]}
        rows={data.records.map(record => {
          const tool = equipmentTypes.find(([key]) => key === record.tool);
          return [record.exercise, `${formatKg(record.weightKg)} kg`, record.reps, tool?.[1], <LiftDate record={record} />];
        })}
        empty="This report has no named, weighted exercise sets." />
      {data.unassigned && <p className="strength-unassigned">
        {data.unassignedSets} weighted sets have no exercise name. Heaviest unassigned set <strong>{formatKg(data.unassigned.weightKg)} kg × {data.unassigned.reps}</strong>
        <span> · </span><LiftDate record={data.unassigned} />
      </p>}
    </section>
    {data.equipment.length > 0 && <section aria-label="Equipment illustrations">
      <h3>Equipment illustrated</h3>
      <p>Equipment types come from exercise labels. Illustrations depict example models.</p>
      <ul className="strength-equipment">
        {data.equipment.map(([key, label, tile]) => <li key={key}>
          <Illustration tile={tile} /><span>{label}</span>
        </li>)}
      </ul>
    </section>}
    <p className="strength-basis">
      {preview ? "Illustrative workouts." : "Source · Garmin Connect workout sets."} Volume is logged weight × reps, summed across sets.
      The helicopter comparison uses the <a href="https://www.robinsonheli.com/helicopters/r22-beta-ii" target="_blank" rel="noreferrer">399 kg empty Robinson R22 Beta II</a>.
    </p>
  </div>;
}

export function StrengthLift({ report }) {
  const id = useId();
  const data = strengthSummary(report);
  if (!data.sessions.length) return null;
  const progress = data.equivalents != null;
  const label = report.preview ? "Illustrative strength sessions" : "Strength sessions · Garmin Connect";
  const history = datedHistory(label, ["Volume", "Workout", "Sets", "Reps"], data.sessions, row => [
    Number.isFinite(row.volumeKg) ? `${formatKg(row.volumeKg)} kg` : null, <SessionName row={row} />, row.sets, row.reps,
  ], { chart: [["Session volume · kg", row => row.volumeKg]] });
  history.display = "bars";
  return <DataCard className="strength-lift" title="Helicopter Lift" aria-labelledby={id} history={history}
    initialHistoryDays={null} detail={<LiftDetails data={data} preview={report.preview} />} detailInline>
    <div className="strength-hero">
      <Illustration tile={0} className="strength-aircraft" />
      <div className="strength-stat">
        <h2 id={id}>Helicopter Lift</h2>
        <div className="strength-total">{progress ? <>{formatKg(data.volumeKg)} <small>kg</small></> : "Volume unavailable"}</div>
        <p>{data.sessions.length} {data.sessions.length === 1 ? "strength session" : "strength sessions"}
          {data.measured !== data.sessions.length && ` · ${data.measured} with volume`}</p>
      </div>
      {progress && <div className="strength-progress">
        <div className="strength-progress-head">
          <strong>{heliCount(data.equivalents)} <span>/ {data.next} helicopters</span></strong>
          {data.unlocked != null && <span className="strength-unlocked">{data.unlocked} unlocked</span>}
        </div>
        <progress aria-label="Progress toward the next helicopter milestone" value={data.equivalents} max={data.next} />
        <p>{formatKg(data.remainingKg)} kg to the next milestone</p>
      </div>}
    </div>
  </DataCard>;
}
