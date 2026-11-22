import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterCardHistory, resolveCardHistory } from "./cardHistory.js";
import { formatDate, shiftDate } from "./report.js";
import { CardHistoryChart } from "./CardHistoryChart.jsx";

const interactive = "a, button, select, input, textarea, label, summary, [role='button'], [role='link'], [contenteditable], dialog";

export const HistoryContext = createContext(null);
const historyPeriods = [["7 days", 7], ["4 weeks", 28], ["3 months", 90], ["All history", null]];
const historyDate = row => formatDate(row.date, row.precision === "month" ?
  { day: undefined, year: "numeric" } : { year: "numeric" });

function HistoryPanel({ history, end, battery }) {
  const all = filterCardHistory(history?.rows, end, null);
  const [period, setPeriod] = useState(() => filterCardHistory(all, end, 28).length ? 28 : null);
  const [limit, setLimit] = useState(30);
  const rows = filterCardHistory(all, end, period);
  const label = history?.caption || "Historical readings";
  if (!all.length) return <p>This card has no dated readings in the available report history.</p>;
  const first = period == null ? rows.at(-1)?.date : shiftDate(end, 1 - period);
  const last = period == null ? rows[0]?.date : end;
  return <div className="card-history" aria-label={label}>
    <div className="card-history-controls" role="group" aria-label="History range">
      {historyPeriods.map(([name, days]) => <button key={name} type="button" className="report-action"
        aria-pressed={period === days} onClick={() => { setPeriod(days); setLimit(30); }}>{name}</button>)}
    </div>
    <CardHistoryChart history={history} rows={rows} first={first} last={last} battery={battery} />
    <p className="card-history-coverage">
      {rows.length} {rows.length === 1 ? "entry" : "entries"} · Available {historyDate(all.at(-1))} – {historyDate(all[0])}
      {battery && all[0].date === end && " · Report day may be partial"}
    </p>
    <DetailTable caption={label} columns={["Date", ...(history?.columns || [])]}
      rows={rows.slice(0, limit).map(row => [historyDate(row), ...row.values])}
      empty={all.length ? "No readings in this range. Choose a longer range." : "This card has no dated readings in the available report history."} />
    {rows.length > limit && <button type="button" className="report-action card-history-more"
      onClick={() => setLimit(count => count + 30)}>Show {Math.min(30, rows.length - limit)} more</button>}
  </div>;
}

export function DataCard({ as: Tag = "article", title, detail, detailExpanded = false, history, className = "", definition = false, children, ...attributes }) {
  const [open, setOpen] = useState(false);
  const archive = useContext(HistoryContext);
  const trigger = useRef(null);
  const dialog = useRef(null);
  const heading = useId();
  const Access = definition ? "dd" : "div";
  const historyData = open ? resolveCardHistory(archive?.report, archive?.reports, history) : null;

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function openCard(event) {
    if (event.defaultPrevented || event.target.closest(interactive)
      || event.target.closest("[data-detail-card]") !== event.currentTarget) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
    trigger.current?.focus({ preventScroll: true });
    setOpen(true);
  }

  return <Tag className={`${className} detail-card`} data-detail-card="" onClick={openCard} {...attributes}>
    {children}
    <Access className="card-details-access">
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-label={`Details for ${title}`} onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> Details
      </button>
    </Access>
    {open && createPortal(<dialog ref={dialog} className="card-details-dialog" aria-labelledby={heading}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="card-details-content">
        <header><h2 id={heading}>{title}</h2><button type="button" className="report-action" onClick={() => dialog.current.close()}>Close</button></header>
        <div className="card-details-data">
          <HistoryPanel history={historyData} end={archive?.report.date} battery={history === "battery"} />
          {detail && (historyData?.rows?.length
            ? <details className="card-detail-more" open={detailExpanded}><summary>Card details</summary>{detail}</details>
            : detail)}
        </div>
      </div>
    </dialog>, document.body)}
  </Tag>;
}

const recorded = value => value != null && value !== "" && value !== false;

export function DetailFacts({ rows = [], empty = "No additional data was recorded for this card." }) {
  const available = rows.filter(([, value]) => recorded(value));
  if (!available.length) return <p>{empty}</p>;
  return <dl className="detail-facts">
    {available.map(([label, value, note], index) => <div key={index}>
      <dt>{label}</dt><dd>{value}{recorded(note) && <small>{note}</small>}</dd>
    </div>)}
  </dl>;
}

export function DetailTable({ columns, rows, empty = "No detailed readings were recorded.", caption }) {
  if (!rows.length) return <p>{empty}</p>;
  return <div className="table-scroll"><table className="detail-table">
    {caption && <caption>{caption}</caption>}
    <thead><tr>{columns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map(([first, ...values], row) => <tr key={row}><th scope="row">{first}</th>
      {values.map((value, column) => <td key={column}>{recorded(value) ? value : "—"}</td>)}
    </tr>)}</tbody>
  </table></div>;
}
