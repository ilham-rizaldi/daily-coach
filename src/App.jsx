import { useEffect, useState } from "react";
import { decimal, duration, formatDate, validateReport } from "./report.js";
import { openArchive, payloadFromFragment } from "./archive.js";
import { demoReport } from "./demo.js";
import { ActivityTable, Session, Sources, TrainingChart, Trends } from "./components.jsx";

const sections = ["Daily", "Trends", "Archive", "Sources"];

function Locked({ onUnlock, error, loading }) {
  const [key, setKey] = useState("");
  return (
    <main className="unlock">
      <p className="eyebrow">Performance Desk</p><h1>Your training.<br />Your private report.</h1>
      <p>Open the private link in your coaching email, or enter its access key.</p>
      <form onSubmit={event => { event.preventDefault(); onUnlock(key.trim()); }}>
        <label htmlFor="access-key">Archive access key</label>
        <input id="access-key" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" spellCheck="false" required />
        <button className="primary" disabled={loading}>{loading ? "Opening report…" : "Open my report"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="quiet">The private link contains your encrypted report. Reports you open are kept encrypted in this browser. Anyone you share the full link with can read that report.</p>
      <a href="?preview=1">View the design preview</a>
    </main>
  );
}

export function App() {
  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const [reports, setReports] = useState(preview ? [demoReport] : []);
  const [reportIndex, setReportIndex] = useState(0);
  const [section, setSection] = useState("Daily");
  const [detail, setDetail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [reportPayloads, setReportPayloads] = useState({});

  async function unlock(key) {
    setLoading(true);
    setError("");
    try {
      const incoming = payloadFromFragment(location.hash);
      let stored = [];
      try { stored = JSON.parse(localStorage.getItem("daily-coach-encrypted-reports") || "[]"); } catch { stored = []; }
      if (!Array.isArray(stored)) stored = [];
      const payloads = incoming ? [incoming, ...stored.filter(item => item.iv !== incoming.iv)] : stored;
      const opened = [];
      const byDate = {};
      for (const payload of payloads) {
        try {
          const archive = await openArchive(key, payload);
          for (const item of archive.reports.map(validateReport)) {
            if (!byDate[item.date]) { opened.push(item); byDate[item.date] = payload; }
          }
        } catch (failure) { if (payload === incoming) throw failure; }
      }
      if (!opened.length) throw new Error("Open the complete private link from your coaching email to load a report on this device.");
      const validated = opened.sort((a, b) => b.date.localeCompare(a.date));
      if (incoming) {
        try { localStorage.setItem("daily-coach-encrypted-reports", JSON.stringify(payloads.slice(0, 180))); }
        catch { setCopyState("Browser storage is full. Keep the original coaching email to reopen this report."); }
      }
      setReports(validated);
      setReportPayloads(byDate);
      setReportIndex(0);
      setAccessKey(key);
      sessionStorage.setItem("daily-coach-access", key);
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (preview) return;
    const key = new URLSearchParams(location.hash.slice(1)).get("key") || sessionStorage.getItem("daily-coach-access");
    if (key) unlock(key);
  }, []);

  async function copyLink() {
    try {
      const payload = reportPayloads[reports[reportIndex].date];
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#key=${accessKey}&iv=${payload.iv}&data=${payload.ciphertext}`);
      setCopyState("Private link copied");
    } catch {
      setCopyState("Copy the private link from your coaching email.");
    }
  }

  function changeSection(name) {
    setSection(name);
    setDetail(false);
  }

  const report = reports[reportIndex];
  const recentRide = report?.activities.find(activity => activity.sport === "Ride" && activity.classification !== "non-training");
  const sleep = report?.wellness.sleepMinutes;
  const readiness = report?.wellness.readiness;

  return (
    <>
      <a className="skip-link" href="#main">Skip to report</a>
      <header className="app-header">
        <a className="wordmark" href={location.pathname}>Daily Coach</a>
        <span className="product-name">Performance Desk <span className="athlete-name">for Riezaldd</span></span>
        {report && <nav aria-label="Report sections">{sections.map(name => <button key={name} onClick={() => changeSection(name)} aria-current={section === name ? "page" : undefined}>{name}</button>)}</nav>}
        <span className="header-private">Private archive</span>
        {report && <time dateTime={report.date}>{formatDate(report.date, { weekday: "short", year: "numeric" })}</time>}
      </header>
      {!report ? <Locked onUnlock={unlock} loading={loading} error={error} /> : (
        <main id="main">
          <div className="report-meta">
            <time dateTime={report.date}>{formatDate(report.date, { weekday: "long", year: "numeric", month: "long" })}</time>
            <span>{preview ? "Design preview / illustrative data" : `Captured ${new Date(report.capturedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB · Today so far`}</span>
          </div>
          {section === "Daily" && (
            <>
              <section className="decision"><h1>{report.coaching.headline}</h1><p>{report.coaching.rationale}</p></section>
              <div className="metric-row">
                <div><span>Sleep</span><strong>{Number.isFinite(sleep) ? `${Math.floor(sleep / 60)}h ${sleep % 60}m` : "Unavailable"}</strong><small>{preview ? "Sample data" : `Garmin${report.wellness.sleepScore != null ? ` · score ${report.wellness.sleepScore}` : ""}`}</small></div>
                <div><span>Readiness</span><strong className="amber">{readiness ?? "Unavailable"}</strong><small>{preview ? "Sample data" : "Garmin · latest synced value"}</small></div>
                <div><span>Recent ride</span><strong>{recentRide ? duration(recentRide.movingSeconds) : "Unavailable"}</strong><small>{preview ? "Sample data" : `${formatDate(recentRide?.date || report.date)} · ${decimal(recentRide?.distanceKm, 2)} km`}</small></div>
              </div>
              <section className="evidence-grid">
                <TrainingChart report={report} />
                <aside className="coach-note"><h2>Coach note</h2><span className="confidence">{report.coaching.confidence}</span><p>{report.coaching.note}</p></aside>
              </section>
              <Session report={report} expanded={detail} onExpand={() => setDetail(!detail)} />
              {!preview && (
                <>
                  <div className="recovery-strip">
                    <div><span>Resting HR</span><strong>{report.wellness.restingHr ?? "Unavailable"} <small>bpm</small></strong><p>7-day average {report.wellness.restingHr7d ?? "unavailable"}</p></div>
                    <div><span>HRV status</span><strong>{report.wellness.hrvStatus || "Unavailable"}</strong><p>Garmin · latest synced</p></div>
                    <div><span>Intervals form</span><strong>{report.intervals.form == null ? "Unavailable" : `${report.intervals.form > 0 ? "+" : ""}${report.intervals.form}`}</strong><p>Fitness {report.intervals.fitness ?? "unavailable"} · fatigue {report.intervals.fatigue ?? "unavailable"}</p></div>
                    <div><span>Garmin load ratio</span><strong>{report.wellness.garminLoadRatio ?? "Unavailable"}</strong><p>Acute {report.wellness.garminAcuteLoad ?? "unavailable"} · chronic {report.wellness.garminChronicLoad ?? "unavailable"}</p></div>
                  </div>
                  <ActivityTable report={report} />
                </>
              )}
            </>
          )}
          {section === "Trends" && <Trends report={report} />}
          {section === "Sources" && <Sources report={report} />}
          {section === "Archive" && (
            <>
              <div className="page-title"><div><p className="eyebrow">Your coaching history</p><h1>Reports opened on this device.</h1><p className="quiet">Open a coaching email’s private link to add its report here.</p></div></div>
              <div className="archive-list">{reports.map((item, index) => <button key={item.date} onClick={() => { setReportIndex(index); changeSection("Daily"); }}><time>{formatDate(item.date, { weekday: "long", year: "numeric" })}</time><strong>{item.coaching.headline}</strong><span>Open report</span></button>)}</div>
              {!preview && <div className="archive-actions"><button onClick={copyLink}>Copy private access link</button><button onClick={() => { sessionStorage.removeItem("daily-coach-access"); setReports([]); setAccessKey(""); changeSection("Daily"); }}>Lock archive</button><span role="status">{copyState}</span></div>}
            </>
          )}
          <footer>
            <p><strong>Sources</strong> Garmin Connect, Intervals.icu, Strava</p>
            <p>{preview ? "Sample sync · Thu 5 Nov 2026, 09.24" : `Report captured ${new Date(report.capturedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB`}</p>
            <button onClick={() => changeSection("Sources")}>Sources and definitions</button>
          </footer>
        </main>
      )}
    </>
  );
}
