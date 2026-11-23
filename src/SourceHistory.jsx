import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { formatDate } from "./report.js";
import { EvidenceMeta } from "./EvidenceMeta.jsx";

const span = item => item.first && item.last
  ? `${formatDate(item.first, { year: "numeric" })} – ${formatDate(item.last, { year: "numeric" })}` : "Dates unavailable";

export function SourceHistory({ capture }) {
  if (!capture) return null;
  const battery = capture.bodyBattery;
  const intervalsFiles = capture.intervalsDownloads;
  const wellbeing = intervalsFiles?.wellness;
  return <section className="training-section" aria-labelledby="source-history-heading">
    <div className="training-heading"><div><h2 id="source-history-heading">Historical source coverage</h2>
      <p>Activity counts are per provider. The same workout can appear in multiple sources.</p></div></div>
    <div className="threshold-grid">
      {capture.providers?.map(item => <DataCard key={item.source} title={item.source} className="training-panel"
        history={{ kind: "source", source: item.source }}
        detail={<DetailFacts rows={[["Source", item.source], ["Activity summaries", item.records], ["Recorded dates", span(item)],
          ["Files", item.status], ["Coverage note", item.detail],
          ...(item.source === "Intervals.icu" && intervalsFiles?.fit ? [
            ["FIT files matched", `${intervalsFiles.fit.matchedFiles} / ${intervalsFiles.fit.files}`],
            ["FIT activity dates", span(intervalsFiles.fit)],
          ] : []),
        ]} />}>
        <h3>{item.source}</h3><strong className="training-number">{item.records}<small> activities</small></strong>
        <EvidenceMeta className="evidence-footer" from={item.first} date={item.last} year state={item.status} />
      </DataCard>)}
      {battery && <DataCard title="Body Battery source coverage" className="training-panel" history="battery"
        detail={<DetailFacts rows={[["Source", battery.detail], ["Recorded dates", span(battery)],
          ["Days with low and high", battery.records], ["Files", battery.files],
          ["Conflicting dates", battery.unresolvedDates?.length || "None in downloaded windows"]]} />}>
        <h3>Body Battery</h3><strong className="training-number">{battery.records}<small> days</small></strong>
        <EvidenceMeta className="evidence-footer" source="Garmin Connect" from={battery.first} date={battery.last} year state={battery.status} />
      </DataCard>}
      {wellbeing && <DataCard title="Intervals.icu wellness" className="training-panel" history="intervals-wellness"
        detail={<DetailFacts rows={[["Source", "Intervals.icu wellness CSV"], ["Export window", span(wellbeing)],
          ["Calendar rows", wellbeing.csvRows], ["Days with a wellness reading", wellbeing.recordedDays],
          ["Dates with CTL and ATL", wellbeing.fitnessDays]]} />}>
        <h3>Intervals.icu wellness</h3><strong className="training-number">{wellbeing.recordedDays}<small> recorded days</small></strong>
        <EvidenceMeta className="evidence-footer" from={wellbeing.first} date={wellbeing.last} year>
          <span>{wellbeing.fitnessDays} dates with CTL and ATL</span>
        </EvidenceMeta>
      </DataCard>}
    </div>
  </section>;
}
