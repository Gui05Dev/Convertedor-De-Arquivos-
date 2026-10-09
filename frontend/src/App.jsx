import { useCallback, useEffect, useMemo, useState } from 'react';
import { listJobs } from './api/client.js';
import { useTheme } from './hooks/useTheme.js';
import { useAppData } from './hooks/useAppData.js';
import { SiteHeader } from './components/SiteHeader.jsx';
import { SiteFooter } from './components/SiteFooter.jsx';
import { ToolsGrid } from './components/ToolsGrid.jsx';
import { ToolModal } from './components/ToolModal.jsx';
import { RecentJobs } from './components/RecentJobs.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';

/* Duração do fade do overlay em style.css (.modal-overlay / .modal-box). */
const CLOSE_ANIMATION_MS = 280;

export default function App() {
  const { toggleTheme } = useTheme();
  const data = useAppData();

  const [activeId, setActiveId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [jobs, setJobs] = useState([]);

  const refreshJobs = useCallback(() => {
    listJobs().then(setJobs).catch(() => {});
  }, []);

  useEffect(() => { if (data.status === 'ready') refreshJobs(); }, [data.status, refreshJobs]);

  // Enquanto houver trabalho em andamento (ex.: modal fechado no meio), atualiza a lista.
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'queued' || j.status === 'processing')) return undefined;
    const timer = setInterval(refreshJobs, 2000);
    return () => clearInterval(timer);
  }, [jobs, refreshJobs]);

  useEffect(() => {
    if (!activeId) return undefined;
    const frame = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [activeId]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setActiveId(null), CLOSE_ANIMATION_MS);
  }, []);

  const tools = data.status === 'ready' ? data.tools : [];
  const activeTool = tools.find((t) => t.id === activeId);
  const titles = useMemo(() => Object.fromEntries(tools.map((t) => [t.id, t.title])), [tools]);

  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para as ferramentas</a>
      <SiteHeader onToggleTheme={toggleTheme} user={data.me} />

      <main className="main" id="conteudo">
        <div className="section-heading"><h1>Ferramentas disponíveis</h1></div>

        {data.status === 'loading' && <p className="loading-note" role="status">Carregando ferramentas...</p>}
        {data.status === 'error' && (
          <div className="load-error">
            <ErrorBanner message={data.message} />
            <button type="button" className="btn-action btn-secondary" onClick={data.reload}>Tentar de novo</button>
          </div>
        )}
        {data.status === 'ready' && <ToolsGrid tools={tools} onOpen={setActiveId} />}
        {data.status === 'ready' && (
          <RecentJobs jobs={jobs} titles={titles} onChanged={refreshJobs}
            retentionMinutes={data.limits.resultRetentionMinutes} />
        )}
        <p className="privacy-note">
          Os arquivos são processados nos servidores da Copacol e não são enviados a serviços externos.
        </p>
      </main>

      <SiteFooter />

      {activeTool && (
        <ToolModal
          key={activeTool.id}
          tool={activeTool}
          limits={data.limits}
          isOpen={isOpen}
          onClose={closeModal}
          onJobsChanged={refreshJobs}
        />
      )}
    </>
  );
}
