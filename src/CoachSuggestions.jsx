import { useId } from "react";
import { formatDate } from "./report.js";
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

  return (
    <section className="coach-suggestions" aria-labelledby={headingId}>
      <header className="coach-suggestions-header">
        <div>
          <p className="coach-suggestions-label">Coach suggestions{plan.plannedDate && <> · <time dateTime={plan.plannedDate}>{formatDate(plan.plannedDate)}</time></>}</p>
          <h1 id={headingId}>{plan.title}</h1>
        </div>
        {typeof onEvidence === "function" && plan.referenceIds.length > 0 && (
          <button type="button" className="coach-suggestions-evidence" onClick={() => onEvidence(plan.referenceIds)}>
            Research
          </button>
        )}
      </header>
      {plan.why.length > 0 && (
        <ul className="coach-suggestions-signals" role="list" aria-label="Signals used">
          {plan.why.map(signal => <li key={signal}>{signal}</li>)}
        </ul>
      )}
      <div className="coach-suggestions-grid">
        {plan.sections.map(({ kind, title, items }, index) => (
          <section key={`${kind}-${index}`} className="coach-suggestion" data-kind={kind}>
            <h2>{title}</h2>
            <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </div>
      {(plan.alternative || plan.reassess) && (
        <dl className="coach-suggestions-options">
          {plan.alternative && <div><dt>Alternative</dt><dd>{plan.alternative}</dd></div>}
          {plan.reassess && <div><dt>Reassess</dt><dd>{plan.reassess}</dd></div>}
        </dl>
      )}
      {showSession && (
        <details className="coach-suggestions-session">
          <summary>Session plan</summary>
          {children}
        </details>
      )}
    </section>
  );
}
