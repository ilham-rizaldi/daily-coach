import { useEffect, useMemo, useRef, useState } from "react";
import { decimal, formatDate } from "./report.js";
import { activityIdentity, CHECKIN_STORAGE_KEY, completedCheckInActivities, decryptCheckIns, findCheckIn, persistCheckIn, persistCheckInVault, sessionMinutes, updateCheckInEntries } from "./checkin.js";
import "./checkin.css";

const blank = () => ({ rpe: "", legSoreness: "", fatigue: "" });
const fields = [["rpe", "Session RPE"], ["legSoreness", "Leg soreness"], ["fatigue", "Fatigue"]];

export function SessionCheckIn({ report, accessKey, preview = false }) {
  const activities = useMemo(() => completedCheckInActivities(report), [report]);
  const [selected, setSelected] = useState(() => activities[0] ? activityIdentity(activities[0]) : "");
  const [entries, setEntries] = useState([]);
  const [values, setValues] = useState(blank);
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const version = useRef(0);
  const currentKey = useRef(accessKey);
  currentKey.current = accessKey;
  const memoryOnly = preview;
  const activity = activities.find(item => activityIdentity(item) === selected) || activities[0];
  const recorded = activity ? findCheckIn(entries, activity) : null;

  useEffect(() => {
    const epoch = ++version.current;
    setEntries([]); setState("loading"); setStatus(""); setBusy(false);
    if (memoryOnly) { setState("ready"); return () => { version.current++; }; }
    if (!accessKey) { setState("error"); setStatus("Unlock report to save"); return () => { version.current++; }; }
    (async () => {
      try {
        const stored = localStorage.getItem(CHECKIN_STORAGE_KEY);
        const opened = stored ? await decryptCheckIns(JSON.parse(stored), accessKey) : [];
        if (version.current === epoch && currentKey.current === accessKey) { setEntries(opened); setState("ready"); }
      } catch {
        if (version.current === epoch) { setState("error"); setStatus("Check-ins unavailable"); }
      }
    })();
    return () => { version.current++; };
  }, [accessKey, memoryOnly]);

  useEffect(() => {
    setSelected(previous => activities.some(item => activityIdentity(item) === previous) ? previous : activities[0] ? activityIdentity(activities[0]) : "");
  }, [activities]);

  useEffect(() => {
    setValues(recorded ? Object.fromEntries(fields.map(([name]) => [name, String(recorded[name])])) : blank());
  }, [selected, recorded]);

  useEffect(() => { if (state !== "error") setStatus(""); }, [selected]);

  async function save(event) {
    event.preventDefault();
    if (!activity || state !== "ready" || busy) return;
    const epoch = version.current, key = accessKey;
    const isCurrent = () => version.current === epoch && currentKey.current === key;
    setBusy(true); setStatus("");
    try {
      const updated = memoryOnly ? updateCheckInEntries(entries, activity, values) : await persistCheckIn(localStorage, key, entries, activity, values, isCurrent);
      if (isCurrent() && updated) { setEntries(updated); setStatus(memoryOnly ? "Saved · Demo" : "Saved"); }
    } catch (error) {
      if (isCurrent()) setStatus(error.message === "Rate all three: 0–10" ? error.message : "Could not save");
    } finally { if (isCurrent()) setBusy(false); }
  }

  async function remove() {
    if (!recorded || state !== "ready" || busy) return;
    const epoch = version.current, key = accessKey;
    const isCurrent = () => version.current === epoch && currentKey.current === key;
    setBusy(true); setStatus("");
    try {
      const updated = entries.filter(entry => entry !== recorded);
      const saved = memoryOnly || await persistCheckInVault(localStorage, key, updated, isCurrent);
      if (saved && isCurrent()) { setEntries(updated); setValues(blank()); setStatus(memoryOnly ? "Deleted · Demo" : "Deleted"); }
    } catch { if (isCurrent()) setStatus("Could not delete"); }
    finally { if (isCurrent()) setBusy(false); }
  }

  const inputRpe = values.rpe.trim() === "" ? null : Number(values.rpe);
  const minutes = activity ? sessionMinutes(activity) : null;
  const load = Number.isFinite(inputRpe) && inputRpe >= 0 && inputRpe <= 10 && minutes !== null ? minutes * inputRpe : null;
  return <section className="session-checkin" aria-labelledby="checkin-title">
    <div className="checkin-heading"><h2 className="sr-only" id="checkin-title">Session check-in</h2><span>{memoryOnly ? "Demo" : recorded ? "Recorded" : ""}</span></div>
    {activities.length ? <form onSubmit={save}>
      <label className="checkin-session">Session<select value={activity ? activityIdentity(activity) : ""} disabled={busy} onChange={event => { setSelected(event.target.value); if (state !== "error") setStatus(""); }}>
        {activities.map(item => <option key={activityIdentity(item)} value={activityIdentity(item)}>{formatDate(item.date)} · {item.sport} · {decimal(sessionMinutes(item), 0)}′{item.startedAt ? ` · ${new Date(item.startedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })}` : ""}</option>)}
      </select></label>
      <div className="checkin-fields">{fields.map(([name, label]) => <label key={name}>{label}<div><input type="number" inputMode="decimal" min="0" max="10" step="0.5" required placeholder="—" value={values[name]} disabled={busy || state !== "ready"} onChange={event => { setValues({ ...values, [name]: event.target.value }); setStatus(""); }} /><span>/10</span></div></label>)}
        <div className="checkin-load"><span>sRPE load</span><output aria-live="polite">{Number.isFinite(load) ? decimal(load, 0) : "—"}<small>AU</small></output></div>
      </div>
      <div className="checkin-actions"><button type="submit" disabled={busy || state !== "ready"}>{busy ? "Saving…" : recorded ? "Update" : "Save"}</button>{recorded && <button type="button" className="checkin-delete" disabled={busy || state !== "ready"} onClick={remove}>Delete</button>}<span role="status">{state === "loading" ? "Loading…" : status}</span></div>
    </form> : <p className="quiet">No recorded sessions</p>}
  </section>;
}
