export function ProgressPanel({ pct, label, status }) {
  return (
    <div className="progress-wrap visible">
      <div className="progress-label">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-status">{status}</div>
    </div>
  );
}
