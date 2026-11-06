import { decimal, formatDate, jakartaDate, shiftDate } from "./report.js";
import { projectGarminRest } from "./garminForecast.js";
import { ForecastBars, forecastColors } from "./ForecastGraphics.jsx";

export function GarminRestForecast({ report }) {
  const result = projectGarminRest(report);
  const historical = report.date !== jakartaDate() && !report.preview;
  const date = result.date || shiftDate(report.date, 1);
  const ratio = result.baseline?.displayRatio ?? report.wellness.garminLoadRatio;
  const acute = result.baseline?.acute ?? report.wellness.garminAcuteLoad;
  const chronic = result.baseline?.chronic ?? report.wellness.garminChronicLoad;
  return <section className="garmin-rest garmin-rest-compact" aria-labelledby="garmin-rest-heading">
    <div className="forecast-heading">
      <div><p className="eyebrow">Garmin · no new load</p><h2 id="garmin-rest-heading">Rest projection <span className="quiet">{formatDate(date)}</span></h2></div>
      <div className="forecast-calibration"><span title="Estimated · low confidence; calibration in Reference">Est.</span>{historical && <span>Snapshot {formatDate(report.date)}</span>}{result.extrapolation && <span>Extrapolated</span>}</div>
    </div>
    {result.available ? <div className="garmin-rest-summary">
      <div className="garmin-ratio-shift"><span className="forecast-stat-label">Acute / chronic</span><div><strong>{decimal(ratio, 1)}</strong><span aria-hidden="true">→</span><strong style={{ color: forecastColors.rest }}>≈{decimal(result.estimate.ratio, 2)}</strong></div><small>{decimal(result.range.ratio.low, 2)}–{decimal(result.range.ratio.high, 2)}</small></div>
      <ForecastBars title="Garmin acute to chronic load ratio" rows={[{ label: "Current", value: ratio, color: forecastColors.current }, { label: "Rest", value: result.estimate.ratio, low: result.range.ratio.low, high: result.range.ratio.high, color: forecastColors.rest }]} />
      <dl className="forecast-load-deltas"><div><dt>Acute</dt><dd>{decimal(acute, 0)} <span>→</span> <strong>{decimal(result.estimate.acute, 0)}</strong></dd></div><div><dt>Chronic</dt><dd>{decimal(chronic, 0)} <span>→</span> <strong>{decimal(result.estimate.chronic, 0)}</strong></dd></div></dl>
    </div> : <div className="garmin-rest-summary">
      <div className="garmin-ratio-shift"><span className="forecast-stat-label">Acute / chronic</span><strong>{decimal(ratio, 1)}</strong><small>Acute {decimal(acute, 0)} · chronic {decimal(chronic, 0)}</small></div>
      <p className="forecast-compact-status" role="status">Projection unavailable · dated load history required</p>
    </div>}
  </section>;
}
