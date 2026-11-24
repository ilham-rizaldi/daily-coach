import { formatDate, jakartaDate } from "./report.js";
import "./evidence-meta.css";

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
const dated = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function SourceMark({ source, href }) {
  if (!source) return null;
  let url;
  try {
    const candidate = new URL(href);
    if (candidate.protocol === "https:" && !candidate.username && !candidate.password) url = candidate.href;
  } catch { /* Source text may have no associated link. */ }
  return url
    ? <a className="evidence-source" href={url} target="_blank" rel="noopener noreferrer">{source}</a>
    : <span className="evidence-source">{source}</span>;
}

export function EvidenceDay({ date, year = false, precision }) {
  if (!dated(date)) return null;
  const month = precision === "month";
  const options = month ? { day: undefined, year: "numeric" } : year ? { year: "numeric" } : {};
  return <time dateTime={month ? date.slice(0, 7) : date}>{formatDate(date, options)}</time>;
}

function EvidencePeriod({ date, from, label, year, precision }) {
  if (!dated(date)) return null;
  const start = dated(from) && from < date ? from : null;
  const showYear = year || (start && start.slice(0, 4) !== date.slice(0, 4));
  return <span className="evidence-item">
    {label && <span className="evidence-key">{label}</span>}
    <span>{start && <><EvidenceDay date={start} year={showYear} /> – </>}<EvidenceDay date={date} year={showYear} precision={precision} /></span>
  </span>;
}

function CaptureTime({ date, observedAt, window }) {
  const exact = timestamp(observedAt) ? observedAt : null;
  const range = !exact && timestamp(window?.start) && timestamp(window?.end)
    && Date.parse(window.start) <= Date.parse(window.end) ? [window.start, window.end] : null;
  const label = value => {
    const day = jakartaDate(new Date(value));
    return `${day === date ? "" : `${formatDate(day)} `}${clock.format(Date.parse(value))}`;
  };
  if (!exact && !range) return null;
  return <span className="evidence-item">
    <span className="evidence-key">Captured</span>
    {exact
      ? <time dateTime={exact}>{label(exact)} WIB</time>
      : <span><time dateTime={range[0]}>{label(range[0])}</time>–<time dateTime={range[1]}>{label(range[1])} WIB</time></span>}
  </span>;
}

export function EvidenceMeta({ as: Tag = "div", source, href, date, from, dateLabel, year, precision, observedAt, observationWindow,
  state, children, className = "" }) {
  if (!source && !dated(date) && !timestamp(observedAt) && !observationWindow && !children && !state) return null;
  return <Tag className={`evidence-meta ${className}`}>
    <SourceMark source={source} href={href} />
    <EvidencePeriod date={date} from={from} label={dateLabel} year={year} precision={precision} />
    <CaptureTime date={date} observedAt={observedAt} window={observationWindow} />
    {state && <span className="evidence-state">{state}</span>}
    {children}
  </Tag>;
}
