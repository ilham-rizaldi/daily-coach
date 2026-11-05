import { useEffect, useRef, useState } from "react";
import { decimal, duration, formatDate, jakartaDate } from "./report.js";
import { parseAccessInput, unlockReports } from "./archive.js";
import { demoReport } from "./demo.js";
import { ActivityTable, Session, Sources, TrainingChart, Trends } from "./components.jsx";

const sections = ["Daily", "Trends", "Archive", "Sources"];

function Locked({ onUnlock, error, loading }) {
  const [key, setKey] = useState("");
  return (
    <main className="unlock">
      <p className="eyebrow">Performance Desk</p><h1>Your training.<br />Your private report.</h1>
      <p id="access-help">Open the private link in your coaching email, or paste it below.</p>
      <form onSubmit={event => { event.preventDefault(); onUnlock(key.trim()); }}>
        <label htmlFor="access-key">Private link or access key</label>
        <input id="access-key" type="password" value={key} onChange={event => setKey(event.target.value)} aria-describedby={error ? "access-help access-error" : "access-help"} aria-invalid={Boolean(error)} autoComplete="off" autoCapitalize="none" spellCheck="false" required disabled={loading} />
        <button className="primary" disabled={loading}>{loading ? "Opening report…" : "Open my report"}</button>
      </form>
      {error && <p className="error" id="access-error" role="alert">{error}</p>}
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
  const mainRef = useRef(null);
  const unlockVersion = useRef(0);

  async function unlock(input) {
    const version = ++unlockVersion.current;
    setLoading(true);
    setError("");
    try {
      const { key, incoming } = parseAccessInput(input, location.hash);
      let stored = [];
      try { stored = JSON.parse(localStorage.getItem("daily-coach-encrypted-reports") || "[]"); } catch { stored = []; }
      const opened = await unlockReports(key, incoming, stored);
      if (version !== unlockVersion.current) return;
      try { localStorage.setItem("daily-coach-encrypted-reports", JSON.stringify(opened.payloads)); }
      catch { setCopyState("Report opened. Browser storage is unavailable; keep the original email to reopen it."); }
      setReports(opened.reports);
      setReportPayloads(opened.reportPayloads);
      setReportIndex(opened.reportIndex);
      setAccessKey(key);
      try { sessionStorage.setItem("daily-coach-access", key); } catch { /* A private link still opens without browser storage. */ }
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    } catch (failure) {
      if (version === unlockVersion.current) setError(failure.message);
    } finally {
      if (version === unlockVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (preview) return;
    const params = new URLSearchParams(location.hash.slice(1));
    if (["key", "iv", "data"].some(name => params.has(name))) { unlock(""); return; }
    let key;
    try { key = sessionStorage.getItem("daily-coach-access"); } catch { /* Storage may be blocked in private browsing. */ }
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
    requestAnimationFrame(() => { mainRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); });
  }

  function selectReport(index) {
    setReportIndex(index);
    changeSection("Daily");
  }

  function lockArchive() {
    unlockVersion.current++;
    try { sessionStorage.removeItem("daily-coach-access"); } catch { /* The in-memory key is cleared below. */ }
    setReports([]);
    setReportPayloads({});
    setAccessKey("");
    setCopyState("");
    setError("");
    setLoading(false);
    setSection("Daily");
    setDetail(false);
  }

  const report = reports[reportIndex];
  const recentRide = report?.activities.filter(activity => activity.sport === "Ride" && activity.classification !== "non-training").sort((a, b) => b.date.localeCompare(a.date))[0];
  const sleep = report?.wellness.sleepMinutes;
  const readiness = report?.wellness.readiness;
  const today = jakartaDate();

  if (!report) return <Locked onUnlock={unlock} loading={loading} error={error} />;

  return (
    <>
      <a className="skip-link" href="#main">Skip to report</a>
      <header className="app-header">
        <a className="wordmark" href={location.pathname} onClick={event => { event.preventDefault(); selectReport(0); }}>Daily Coach</a>
        <span className="product-name">Performance Desk <span className="athlete-name">for Riezaldd</span></span>
        {report && <nav aria-label="Report sections">{sections.map(name => <button key={name} onClick={() => changeSection(name)} aria-current={section === name ? "page" : undefined}>{name}</button>)}</nav>}
        <span className="header-private">Private archive</span>
        {report && <time dateTime={report.date}>{formatDate(report.date, { weekday: "short", year: "numeric" })}</time>}
        {!preview && <button className="header-lock" onClick={lockArchive}>Lock</button>}
      </header>
      {!report ? <Locked onUnlock={unlock} loading={loading} error={error} /> : (
        <main id="main" ref={mainRef} tabIndex={-1}>
          {copyState && <p className="notice" role="status">{copyState}</p>}
          <div className="report-meta">
            <time dateTime={report.date}>{formatDate(report.date, { weekday: "long", year: "numeric", month: "long" })}</time>
            <span>{preview ? "Design preview / illustrative data" : `${report.date === today ? "Today so far" : "Historical report"} · Captured ${new Date(report.capturedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB`}</span>
            {reports.length > 1 && <nav className="report-switcher" aria-label="Report dates"><button disabled={reportIndex >= reports.length - 1} onClick={() => selectReport(reportIndex + 1)}>Older report</button><span>{reportIndex + 1} of {reports.length}</span><button disabled={reportIndex === 0} onClick={() => selectReport(reportIndex - 1)}>Newer report</button></nav>}
          </div>
          {section === "Daily" && (
            <>
              <section className="decision"><h1>{report.coaching.headline}</h1><p>{report.coaching.rationale}</p></section>
              <Session key={report.date} report={report} expanded={detail} onExpand={() => setDetail(!detail)} />
              <div className="metric-row">
                <div><span>Sleep</span><strong>{Number.isFinite(sleep) ? `${Math.floor(sleep / 60)}h ${sleep % 60}m` : "Unavailable"}</strong><small>{preview ? "Sample data" : `Garmin${report.wellness.sleepScore != null ? ` · score ${report.wellness.sleepScore}` : ""}`}</small></div>
                <div><span>Readiness</span><strong className={Number.isFinite(readiness) && readiness < 50 ? "amber" : undefined}>{readiness ?? "Unavailable"}</strong><small>{preview ? "Sample data" : "Garmin · latest synced value"}</small></div>
                <div><span>Recent ride</span><strong>{recentRide ? duration(recentRide.movingSeconds) : "Unavailable"}</strong><small>{preview ? "Sample data" : recentRide ? `${formatDate(recentRide.date)}${Number.isFinite(recentRide.distanceKm) ? ` · ${decimal(recentRide.distanceKm, 2)} km` : ""}` : "Ride data unavailable"}</small></div>
              </div>
              <section className="evidence-grid">
                <TrainingChart report={report} />
                <aside className="coach-note"><h2>Coach note</h2><span className="confidence">{report.coaching.confidence}</span><p>{report.coaching.note}</p></aside>
              </section>
              {!preview && (
                <>
                  <div className="recovery-strip">
                    <div><span>Resting HR</span><strong>{report.wellness.restingHr ?? "Unavailable"} <small>bpm</small></strong><p>7-day average {report.wellness.restingHr7d ?? "unavailable"}</p></div>
                    <div><span>HRV status</span><strong>{report.wellness.hrvStatus || "Unavailable"}</strong><p>Garmin · latest synced</p></div>
                    <div><span>Intervals form</span><strong>{report.intervals.form == null ? "Unavailable" : `${report.intervals.form > 0 ? "+" : ""}${report.intervals.form}`}</strong><p>Fitness {report.intervals.fitness ?? "unavailable"} · fatigue {report.intervals.fatigue ?? "unavailable"}</p></div>
                    <div><span>Garmin load ratio</span><strong>{report.wellness.garminLoadRatio ?? "Unavailable"}</strong><p>Acute {report.wellness.garminAcuteLoad ?? "unavailable"} · chronic {report.wellness.garminChronicLoad ?? "unavailable"}</p></div>
                  </div>
                  <ActivityTable key={report.date} report={report} />
                </>
              )}
            </>
          )}
          {section === "Trends" && <Trends key={report.date} report={report} />}
          {section === "Sources" && <Sources report={report} />}
          {section === "Archive" && (
            <>
              <div className="page-title"><div><p className="eyebrow">Your coaching history</p><h1>Reports opened on this device.</h1><p className="quiet">Open a coaching email’s private link to add its report here.</p></div></div>
              <div className="archive-list">{reports.map((item, index) => <button key={item.date} onClick={() => selectReport(index)} aria-current={index === reportIndex ? "true" : undefined}><time>{formatDate(item.date, { weekday: "long", year: "numeric" })}</time><strong>{item.coaching.headline}</strong><span>{index === reportIndex ? "Current report" : "Open report"}</span></button>)}</div>
              {!preview && <div className="archive-actions"><button onClick={copyLink}>Copy this report’s private link</button><button onClick={lockArchive}>Lock archive</button></div>}
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
