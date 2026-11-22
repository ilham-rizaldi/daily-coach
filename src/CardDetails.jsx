import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const interactive = "a, button, select, input, textarea, label, summary, [role='button'], [role='link'], [contenteditable], dialog";

export function DataCard({ as: Tag = "article", title, detail, className = "", definition = false, children, ...attributes }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const dialog = useRef(null);
  const heading = useId();
  const Access = definition ? "dd" : "div";

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
        <div className="card-details-data">{detail || <p>No additional data was recorded for this card.</p>}</div>
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
