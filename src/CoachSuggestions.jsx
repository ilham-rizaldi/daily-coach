import { useId } from "react";
import { duration, formatDate } from "./report.js";
import { DataCard, DetailFacts } from "./CardDetails.jsx";
import "./coach-suggestions.css";

const kinds = new Set(["training", "recovery", "fuel", "rest"]);
const inactiveStatuses = new Set(["unavailable", "missing", "unknown", "pending", "not recommended"]);
const clean = value => typeof value === "string" ? value.trim() : "";
const textList = value => Array.isArray(value) ? [...new Set(value.map(clean).filter(Boolean))] : [];

function readLegacyRest(report) {
  const coaching = report?.coaching;
  const session = coaching?.nextSession;
  if (session?.minutes !== 0) return null;
  const title = clean(session.name) || clean(coaching.headline);
  const target = clean(session.target);
  const status = clean(session.recommendationStatus || coaching.recommendationStatus).toLowerCase().replaceAll("-", " ");
  const explicitRest = /^(?:rest(?:$|[.!]|\s+(?:today|only|until|for|and reassess)\b)|no (?:further )?(?:structured )?training\b|take (?:a |the )?(?:rest day|day off)\b|skip (?:all )?(?:structured )?training\b)/i.test(target);
  if (!title || !target || inactiveStatuses.has(status) || (status !== "recommended" && !explicitRest)) return null;

  const plannedDate = /^\d{4}-\d{2}-\d{2}$/.test(session.date) && Number.isFinite(Date.parse(session.date))
    && session.date !== report.date ? session.date : null;
  return {
    title, plannedDate, sections: [{ kind: "rest", title: "Rest", items: [target] }],
    why: [], alternative: clean(session.alternative), reassess: clean(session.condition), referenceIds: [],
  };
}

function readPlan(report) {
  const plan = report?.coaching?.actionPlan;
  const title = clean(plan?.title);
  if (!title || !Array.isArray(plan?.sections)) return readLegacyRest(report);
  const sections = plan.sections.flatMap(section => {
    const kind = section?.kind;
    const title = clean(section?.title);
    const items = textList(section?.items);
    return kinds.has(kind) && title && items.length ? [{ kind, title, items }] : [];
  });
  return sections.length ? {
    title, sections, why: textList(plan.why), alternative: clean(plan.alternative),
    reassess: clean(plan.reassess), referenceIds: textList(plan.referenceIds),
  } : readLegacyRest(report);
}

export function hasCoachSuggestions(report) {
  return Boolean(readPlan(report));
}

export default function CoachSuggestions({ report, onEvidence, children }) {
  const headingId = useId();
  const plan = readPlan(report);
  if (!plan) return null;

  const showSession = children && report?.coaching?.nextSession?.minutes > 0
    && plan.sections.some(section => section.kind === "training");
  const w = report.wellness;
  const sameDate = (w?.date || w?.provenance?.datedRecovery?.date) === report.date;
  const signals = sameDate ? [
    ["Sleep", Number.isFinite(w.sleepMinutes) && duration(w.sleepMinutes * 60)],
    ["Readiness", Number.isFinite(w.readiness) && `${w.readiness}/100`],
    ["Recovery left", Number.isFinite(w.recoveryTimeMinutes) && duration(w.recoveryTimeMinutes * 60)],
  ].filter(([, value]) => value) : [];

  return (
    <section className="coach-suggestions" aria-labelledby={headingId}>
      <header className="coach-suggestions-header">
        <div>
          <p className="coach-suggestions-label">Saved coach plan{plan.plannedDate && <> · <time dateTime={plan.plannedDate}>{formatDate(plan.plannedDate)}</time></>}</p>
          <h2 id={headingId}>{plan.title}</h2>
        </div>
      </header>
      <div className="coach-suggestions-grid">
        {plan.sections.map(({ kind, title, items }, index) => (
          <DataCard as="section" key={`${kind}-${index}`} className="coach-suggestion" data-kind={kind} title={title} history="coach"
            detail={<><ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
              <DetailFacts rows={[["Report", formatDate(report.date, { year: "numeric" })],
                ["Signals", plan.why.join(" · ")], ["Alternative", plan.alternative], ["Reassess", plan.reassess]]} />
            </>}>
            <h2>{title}</h2>
            <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
          </DataCard>
        ))}
      </div>
      {signals.length > 0 && <dl className="coach-plan-readings">
        {signals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>}
      {(plan.alternative || plan.reassess) && (
        <dl className="coach-suggestions-options">
          {plan.alternative && <div><dt>Alternative</dt><dd>{plan.alternative}</dd></div>}
          {plan.reassess && <div><dt>Reassess</dt><dd>{plan.reassess}</dd></div>}
        </dl>
      )}
      {plan.why.length > 0 && <details className="coach-suggestions-session">
        <summary>Why this plan</summary>
        <ul className="coach-suggestions-signals" aria-label="Signals used">{plan.why.map(signal => <li key={signal}>{signal}</li>)}</ul>
      </details>}
      {typeof onEvidence === "function" && plan.referenceIds.length > 0 && <button type="button"
        className="coach-suggestions-evidence" onClick={() => onEvidence(plan.referenceIds)}>Research</button>}
      {showSession && (
        <details className="coach-suggestions-session">
          <summary>Session plan</summary>
          {children}
        </details>
      )}
    </section>
  );
}
