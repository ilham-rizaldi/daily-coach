export function MetricValue({ value, unit, prefix = "", as: Tag = "span", className = "", style }) {
  const tight = unit === "%" || String(unit || "").startsWith("/");
  return <Tag className={`metric-value ${className}`} style={style}><span className="metric-number">{prefix}{value}</span>{unit && <small className={`metric-unit${tight ? " metric-unit-tight" : ""}`}>{unit}</small>}</Tag>;
}

export function DurationValue({ seconds, as: Tag = "span", className = "" }) {
  if (!Number.isFinite(seconds) || seconds < 0) return <Tag className={`metric-value ${className}`}>—</Tag>;
  const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60), rest = minutes % 60;
  return <Tag className={`metric-value metric-duration ${className}`}>
    {hours > 0 && <span className="metric-part"><span className="metric-number">{hours}</span><small className="metric-unit metric-unit-tight">h</small></span>}
    {(hours === 0 || rest > 0) && <span className="metric-part"><span className="metric-number">{hours > 0 ? rest : minutes}</span><small className="metric-unit metric-unit-tight">m</small></span>}
  </Tag>;
}
