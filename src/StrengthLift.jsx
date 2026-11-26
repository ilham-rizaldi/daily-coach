import { useId } from "react";
import { DataCard, DetailTable } from "./CardDetails.jsx";
import { CardHistoryChart } from "./CardHistoryChart.jsx";
import { datedHistory } from "./cardHistory.js";
import { formatDate } from "./report.js";
import { equipmentTypes, formatKg, strengthSummary } from "./strength.js";
import "./strength-lift.css";

const formatDateWithYear = date => formatDate(date, { year: "numeric" });
const garminLink = id => /^\d+$/.test(id) ? `https://connect.garmin.com/app/activity/${id}` : null;

function Illustration({ tile }) {
  const x = (tile % 4) * 100 / 3;
  const y = Math.floor(tile / 4) * 50;
  return <span aria-hidden="true" className="strength-illustration" style={{ backgroundPosition: `${x}% ${y}%` }} />;
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
    </p>
  </div>;
}

export function StrengthLift({ report }) {
  const id = useId();
  const data = strengthSummary(report);
  if (!data.sessions.length) return null;
  const label = report.preview ? "Illustrative strength sessions" : "Strength sessions · Garmin Connect";
  const history = datedHistory(label, ["Volume", "Workout", "Sets", "Reps"], data.sessions, row => [
    Number.isFinite(row.volumeKg) ? `${formatKg(row.volumeKg)} kg` : null, <SessionName row={row} />, row.sets, row.reps,
  ], { chart: [["Session volume · kg", row => row.volumeKg]] });
  history.display = "bars";
  return <DataCard className="progression-card strength-lift" title="Strength progression" aria-labelledby={id} history={history}
    initialHistoryDays={null} detail={<LiftDetails data={data} preview={report.preview} />} detailInline>
    <div className="strength-stat">
      <h3 id={id}>Strength progression</h3>
      <p>Total lifted</p>
      <div className="strength-total">{data.volumeKg == null ? "Volume unavailable" : <span>{formatKg(data.volumeKg)} <small>kg</small></span>}</div>
      <p>{data.sessions.length} {data.sessions.length === 1 ? "strength session" : "strength sessions"}
        {data.measured !== data.sessions.length && ` · ${data.measured} with volume`}</p>
    </div>
    {data.measured > 0 && <CardHistoryChart history={history} rows={history.rows}
      first={data.sessions.at(-1).date} last={data.sessions[0].date} compact />}
  </DataCard>;
}
