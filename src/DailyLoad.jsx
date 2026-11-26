import { useId } from "react";
import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { GarminLoadChart, GarminLoadRanges } from "./GarminLoadChart.jsx";
import { garminLoadReading, garminLoadWindow, garminLoadWindowDays } from "./garminLoad.js";
import { GarminLoadInsight } from "./LoadInsight.jsx";
import { decimal, shiftDate } from "./report.js";

export function DailyLoad({ report }) {
  const titleId = useId();
  const history = garminLoadWindow(report);
  const latest = history.rows.findLast(row => Number.isFinite(row.acute) || Number.isFinite(row.chronic));
  const reading = garminLoadReading(report, latest);
  const prior = latest && history.rows.find(row => row.date === shiftDate(latest.date, -1));
  return <DataCard className="daily-load" title="Training Load" history="garmin-load"
    initialHistoryDays={garminLoadWindowDays} aria-labelledby={titleId}
    detail={<DetailFacts rows={[["Source", report.preview ? "Illustrative Garmin data" : "Garmin Connect"],
      ["Acute and chronic coverage", `${history.pairedDays} / ${garminLoadWindowDays} days`]]} />}>
    <header className="daily-load-heading">
      <div>
        <h2 id={titleId}>Training Load</h2>
        {latest && <EvidenceMeta source={report.preview ? "Illustrative Garmin data" : "Garmin Connect"} />}
      </div>
      {latest && <dl className="daily-load-key">
        {Number.isFinite(latest.acute) && <div data-metric="acute"><dt>Acute</dt><dd>{decimal(latest.acute, 0)}</dd>{reading.acuteStatus && <small data-attention={Boolean(reading.acuteNote)}>{reading.acuteStatus}</small>}</div>}
        {Number.isFinite(latest.chronic) && <div data-metric="chronic"><dt>Chronic</dt><dd>{decimal(latest.chronic, 0)}</dd></div>}
        {Number.isFinite(reading.ratio) && <div data-metric="ratio"><dt>Ratio</dt><dd>{decimal(reading.ratio)}</dd>{reading.ratioStatus && <small data-attention={Boolean(reading.ratioNote)}>{reading.ratioStatus}</small>}</div>}
      </dl>}
    </header>
    {latest && <GarminLoadRanges range={reading.range} />}
    <GarminLoadChart window={history} />
    <GarminLoadInsight reading={reading} latest={latest} previous={prior} compact preview={report.preview} />
  </DataCard>;
}
