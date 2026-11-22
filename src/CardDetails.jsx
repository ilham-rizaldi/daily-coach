import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterCardHistory, resolveCardHistory } from "./cardHistory.js";
import { formatDate, shiftDate } from "./report.js";
import { BatteryRangeChart } from "./MetricGraphics.jsx";

const interactive = "a, button, select, input, textarea, label, summary, [role='button'], [role='link'], [contenteditable], dialog";

export const HistoryContext = createContext(null);
const historyPeriods = [["7 days", 7], ["4 weeks", 28], ["3 months", 90], ["All history", null]];
const historyDate = row => formatDate(row.date, row.precision === "month" ?
  { day: undefined, year: "numeric" } : { year: "numeric" });

function HistoryPanel({ history, end, battery }) {
  const [period, setPeriod] = useState(28);
  const [limit, setLimit] = useState(30);
  const all = filterCardHistory(history?.rows, end, null);
  const rows = filterCardHistory(all, end, period);
  const label = history?.caption || "Historical readings";
  const ranges = battery && period != null ? new Map(rows.filter(row =>
    Number.isFinite(row.values[0]) && Number.isFinite(row.values[1])).map(row => [row.date, row.values.slice(0, 2)])) : null;
  const chart = ranges?.size ? Array.from({ length: period }, (_, i) => {
    const date = shiftDate(end, 1 - period + i);
    return { date, bodyBatteryRange: ranges.get(date) };
  }) : [];
  return <div className="card-history" aria-label={label}>
    <div className="card-history-controls" role="group" aria-label="History range">
      {historyPeriods.map(([name, days]) => <button key={name} type="button" className="report-action"
        aria-pressed={period === days} onClick={() => { setPeriod(days); setLimit(30); }}>{name}</button>)}
    </div>
    {all.length > 0 && <p className="card-history-coverage">
      {rows.length} {rows.length === 1 ? "entry" : "entries"} · Available {historyDate(all.at(-1))} – {historyDate(all[0])}
      {battery && all[0].date === end && " · Report day may be partial"}
    </p>}
    {chart.length > 0 && <BatteryRangeChart days={period} rows={chart} />}
    <DetailTable caption={label} columns={["Date", ...(history?.columns || [])]}
      rows={rows.slice(0, limit).map(row => [historyDate(row), ...row.values])}
      empty={all.length ? "No readings in this range. Choose a longer range." : "This card has no dated readings in the available report history."} />
    {rows.length > limit && <button type="button" className="report-action card-history-more"
      onClick={() => setLimit(count => count + 30)}>Show {Math.min(30, rows.length - limit)} more</button>}
  </div>;
}

export function DataCard({ as: Tag = "article", title, detail, history, className = "", definition = false, children, ...attributes }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("Details");
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
      onClose={() => { setOpen(false); setView("Details"); trigger.current?.focus({ preventScroll: true }); }}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="card-details-content">
        <header><h2 id={heading}>{title}</h2><button type="button" className="report-action" onClick={() => dialog.current.close()}>Close</button></header>
        <div className="card-details-data">
          <div className="card-history-controls card-detail-views" role="group" aria-label="Card view">
            {["Details", "History"].map(name => <button type="button" key={name} className="report-action"
              aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>)}
          </div>
          {view === "History" ? <HistoryPanel history={historyData} end={archive?.report.date} battery={history === "battery"} />
            : detail || <p>No additional data was recorded for this card.</p>}
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
