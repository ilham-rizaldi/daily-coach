import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { formatDate, jakartaDate } from "./report.js";
import { parseAccessInput, unlockReports } from "./archive.js";
import { demoReport } from "./demo.js";
import { ActivityTable, ChartBoundary, Session, TrainingChart, Trends } from "./components.jsx";
import { LoadForecast } from "./LoadForecast.jsx";
import { ConditionOverview } from "./ConditionOverview.jsx";
import CoachSuggestions, { hasCoachSuggestions } from "./CoachSuggestions.jsx";
import { Reference } from "./Reference.jsx";
import { SessionCheckIn } from "./SessionCheckIn.jsx";

const PerformanceTrends = lazy(() => import("./PerformanceTrends.jsx"));
const BenchmarkView = lazy(() => import("./BenchmarkView.jsx"));
const WeekPlanner = lazy(() => import("./WeekPlanner.jsx"));
const sections = ["Daily", "Trends", "Benchmarks", "Plan", "Archive", "Reference"];

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
  const [researchOpen, setResearchOpen] = useState(false);
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

  function changeSection(name, showResearch = false) {
    setSection(name);
    setDetail(false);
    setResearchOpen(showResearch);
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
  const today = jakartaDate();

  if (!report) return <Locked onUnlock={unlock} loading={loading} error={error} />;

  return (
    <>
      <a className="skip-link" href="#main">Skip to report</a>
      <header className="app-header">
        <a className="wordmark" href={location.pathname} onClick={event => { event.preventDefault(); selectReport(0); }}>Performance Desk</a>
        {report && <nav aria-label="Report sections">{sections.map(name => <button key={name} onClick={() => changeSection(name)} aria-current={section === name ? "page" : undefined}>{name}</button>)}</nav>}
        {!preview && <button className="header-lock" onClick={lockArchive}>Lock</button>}
      </header>
      {!report ? <Locked onUnlock={unlock} loading={loading} error={error} /> : (
        <main id="main" ref={mainRef} tabIndex={-1}>
          {copyState && <p className="notice" role="status">{copyState}</p>}
          <div className="report-meta">
            <time dateTime={report.date}>{formatDate(report.date, { weekday: "short", year: "numeric" })}</time>
            <span>{preview ? "Demo" : `${report.date === today ? "Snapshot" : "Historical"} · ${new Date(report.capturedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", timeStyle: "short" })} WIB`}</span>
            {reports.length > 1 && <nav className="report-switcher" aria-label="Report dates"><button disabled={reportIndex >= reports.length - 1} onClick={() => selectReport(reportIndex + 1)} aria-label="Older report">←</button><span>{reportIndex + 1} of {reports.length}</span><button disabled={reportIndex === 0} onClick={() => selectReport(reportIndex - 1)} aria-label="Newer report">→</button></nav>}
          </div>
          {section === "Daily" && (
            <>
              <ConditionOverview report={report} />
              {hasCoachSuggestions(report) ? (
                <CoachSuggestions key={report.date} report={report} onEvidence={() => changeSection("Reference", true)}>
                  <Session report={report} expanded={detail} onExpand={() => setDetail(!detail)} />
                </CoachSuggestions>
              ) : (
                <>
                  <section className="decision"><h1>{report.coaching.headline.split(";")[0]}</h1></section>
                  <Session key={report.date} report={report} expanded={detail} onExpand={() => setDetail(!detail)} />
                </>
              )}
              <details className="check-in-panel"><summary>Session check-in</summary><SessionCheckIn key={`${report.date}:${accessKey}`} report={report} accessKey={accessKey} preview={preview} /></details>
            </>
          )}
          {section === "Trends" && (
            <>
              <h1 className="sr-only">Trends</h1>
              <ChartBoundary key={`insights:${report.date}:${report.capturedAt}`}>
                <Suspense fallback={<p className="quiet" role="status">Loading…</p>}><PerformanceTrends report={report} /></Suspense>
              </ChartBoundary>
              <details className="volume-detail">
                <summary>Volume & activity history</summary>
                <TrainingChart report={report} />
                <Trends key={report.date} report={report} />
                {!preview && <ActivityTable key={report.date} report={report} />}
              </details>
            </>
          )}
          {section === "Benchmarks" && (
            <ChartBoundary key={`benchmarks:${report.date}:${report.capturedAt}`}>
              <Suspense fallback={<p className="quiet" role="status">Loading…</p>}><BenchmarkView report={report} /></Suspense>
            </ChartBoundary>
          )}
          {section === "Plan" && (
            <>
              <ChartBoundary key={`plan:${report.date}:${report.capturedAt}`}>
                <Suspense fallback={<p className="quiet" role="status">Loading…</p>}>
                  <WeekPlanner report={report} />
                </Suspense>
              </ChartBoundary>
              <details className="check-in-panel">
                <summary>Next-day load simulator</summary>
                <LoadForecast key={`${report.date}:${report.capturedAt}`} report={report} />
              </details>
            </>
          )}
          {section === "Reference" && <Reference report={report} researchOpen={researchOpen} />}
          {section === "Archive" && (
            <>
              <div className="page-title"><h1>Archive</h1></div>
              <div className="archive-list">{reports.map((item, index) => <button key={item.date} onClick={() => selectReport(index)} aria-current={index === reportIndex ? "true" : undefined}><time>{formatDate(item.date, { weekday: "short", year: "numeric" })}</time><strong>{item.coaching.headline.split(";")[0]}</strong><span>{index === reportIndex ? "Selected" : "Open"}</span></button>)}</div>
              {!preview && <div className="archive-actions"><button onClick={copyLink}>Copy link</button><button onClick={lockArchive}>Lock</button></div>}
            </>
          )}
        </main>
      )}
    </>
  );
}
