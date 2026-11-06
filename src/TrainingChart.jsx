import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dailySeries, decimal, formatDate } from "./report.js";

export default function TrainingChart({ report, days = 28, sport = "All" }) {
  const data = dailySeries(report, days, sport);
  return (
    <div className="training-chart">
      <div className="chart-heading">
        <div>
          <h2>Duration · min · {days}d</h2>
          {sport !== "All" && <p>{sport}</p>}
        </div>
        <div className="legend"><span className="bar-key">Duration</span><span className="line-key">7d mean</span></div>
      </div>
      <div className="chart-canvas" role="group" aria-label={`Training minutes and seven-day mean for ${days} days ending ${formatDate(report.date)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#414448" />
            <XAxis dataKey="label" tick={{ fill: "#d9dadd", fontSize: 13 }} axisLine={{ stroke: "#8a8d91" }} tickLine={false} interval={days === 7 ? 0 : "preserveStartEnd"} minTickGap={20} />
            <YAxis tick={{ fill: "#d9dadd", fontSize: 13 }} axisLine={false} tickLine={false} width={42} />
            <Tooltip contentStyle={{ background: "#24272a", border: "1px solid #65696f", borderRadius: 6, color: "#f5f5f5" }} formatter={(value, name) => [`${decimal(value)} min`, name === "minutes" ? "Training" : "7-day mean"]} />
            <Bar dataKey="minutes" fill="#36a8ff" maxBarSize={24} isAnimationActive={false} />
            <Line dataKey="mean" stroke="#c4cbd1" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Data</summary>
        <div className="table-scroll"><table>
          <caption className="sr-only">Daily training duration</caption>
          <thead><tr><th>Date</th><th>Duration · min</th><th>7d mean</th></tr></thead>
          <tbody>{data.map(row => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{decimal(row.minutes)} min</td><td>{decimal(row.mean)} min</td></tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}

