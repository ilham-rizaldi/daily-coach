import { useId } from "react";
import { DataCard } from "./CardDetails.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { GarminLoadChart, GarminLoadRanges } from "./GarminLoadChart.jsx";
import { connectLoadGuide, garminLoadReading, garminLoadWindow, garminLoadWindowDays } from "./garminLoad.js";
import { decimal } from "./report.js";

export function DailyLoad({ report }) {
  const titleId = useId();
  const history = garminLoadWindow(report);
  const latest = history.rows.findLast(row => Number.isFinite(row.acute) || Number.isFinite(row.chronic));
  const reading = garminLoadReading(report, latest);
  return <DataCard className="daily-load" title="Training Load" history="garmin-load"
    initialHistoryDays={garminLoadWindowDays} aria-labelledby={titleId}>
    <header className="daily-load-heading">
      <div>
        <h2 id={titleId}>Training Load</h2>
        {latest ? <EvidenceMeta source={report.preview ? "Illustrative Garmin data" : "Garmin Connect"} date={latest.date} dateLabel="Latest">
          <span>{history.pairedDays} / {garminLoadWindowDays} days</span>
        </EvidenceMeta> : <p>Past {garminLoadWindowDays} days</p>}
      </div>
      {latest && <dl className="daily-load-key">
        {Number.isFinite(latest.acute) && <div data-metric="acute"><dt>Acute</dt><dd>{decimal(latest.acute, 0)}</dd>{reading.acuteStatus && <small data-attention={Boolean(reading.acuteNote)}>{reading.acuteStatus}</small>}</div>}
        {Number.isFinite(latest.chronic) && <div data-metric="chronic"><dt>Chronic</dt><dd>{decimal(latest.chronic, 0)}</dd></div>}
        {Number.isFinite(reading.ratio) && <div data-metric="ratio"><dt>Ratio</dt><dd>{decimal(reading.ratio)}</dd>{reading.ratioStatus && <small data-attention={Boolean(reading.ratioNote)}>{reading.ratioStatus}</small>}</div>}
      </dl>}
    </header>
    {latest && <GarminLoadRanges range={reading.range} />}
    <GarminLoadChart window={history} />
    {(reading.acuteNote || reading.ratioNote) && <div className="load-attention">
      <strong>Above optimal</strong>
      <div>{reading.acuteNote && <p>{reading.acuteNote}</p>}{reading.ratioNote && <p>{reading.ratioNote}</p>}</div>
      {!report.preview && <a href={connectLoadGuide} target="_blank" rel="noreferrer">Garmin guide</a>}
    </div>}
  </DataCard>;
}
