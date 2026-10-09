import { deleteJob, downloadUrl } from '../api/client.js';
import { formatBytes, formatTime } from '../utils/format.js';

const STATUS_LABEL = { queued: 'Na fila', processing: 'Processando', done: 'Pronto', failed: 'Falhou' };

/* Trabalhos do próprio usuário ainda dentro do prazo de retenção. A API só devolve os
   trabalhos de quem está logado — esta lista nunca mostra arquivos de outra pessoa. */
export function RecentJobs({ jobs, titles, onChanged, retentionMinutes }) {
  if (!jobs.length) return null;

  async function remove(id) {
    try { await deleteJob(id); } finally { onChanged(); }
  }

  return (
    <section className="recent" aria-labelledby="recent-title">
      <div className="section-heading"><h2 id="recent-title">Seus arquivos recentes</h2></div>
      <p className="recent-note">
        Ficam disponíveis por {retentionMinutes} minutos depois de prontos e são apagados automaticamente.
        Só você vê esta lista.
      </p>
      <ul className="recent-list">
        {jobs.map((job) => (
          <li key={job.id} className={`recent-item status-${job.status}`}>
            <div className="recent-main">
              <span className="recent-tool">{titles[job.tool] || job.tool}</span>
              <span className="recent-name">
                {job.result ? `${job.result.name} · ${formatBytes(job.result.size)}` : job.error?.message || job.stage}
              </span>
            </div>
            <span className="recent-status">{STATUS_LABEL[job.status]}</span>
            <span className="recent-time">
              {job.status === 'done' ? `até ${formatTime(job.expiresAt)}` : formatTime(job.createdAt)}
            </span>
            <div className="recent-actions">
              {job.status === 'done' && (
                <a className="recent-btn" href={downloadUrl(job.id)} download={job.result.name}
                  aria-label={`Baixar ${job.result.name}`}>Baixar</a>
              )}
              <button type="button" className="recent-btn recent-btn-secondary" onClick={() => remove(job.id)}
                aria-label={`Apagar ${job.result?.name || 'trabalho'} do servidor`}>Apagar</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
