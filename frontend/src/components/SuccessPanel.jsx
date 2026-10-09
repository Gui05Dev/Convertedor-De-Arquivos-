import { SuccessCheckIcon } from './icons.jsx';
import { formatBytes, formatTime } from '../utils/format.js';

export function SuccessPanel({ job }) {
  return (
    <div className="success-state visible" role="status">
      <div className="success-check" aria-hidden="true"><SuccessCheckIcon /></div>
      <div className="success-title">Pronto!</div>
      <div className="success-sub">
        <strong>{job.result.name}</strong> ({formatBytes(job.result.size)})
      </div>
      {job.result.info && <div className="success-sub">{job.result.info}</div>}
      <div className="success-note">
        Disponível para download até {formatTime(job.expiresAt)}; depois é apagado automaticamente do servidor.
      </div>
    </div>
  );
}
