import { useCallback, useEffect, useRef, useState } from 'react';
import { buildForm } from '../data/tools.js';
import { createJob, deleteJob, downloadUrl, pollJob } from '../api/client.js';
import { hasAcceptedExtension } from '../utils/format.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { Dropzone } from './Dropzone.jsx';
import { FileList } from './FileList.jsx';
import { ToolOptions } from './ToolOptions.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { SuccessPanel } from './SuccessPanel.jsx';
import { BoltIcon, CloseIcon, DownloadIcon, SpinnerIcon } from './icons.jsx';

/* Modal de uma ferramenta, do arquivo escolhido até o download.
 *
 * Fluxo: envio (progresso real em %) -> trabalho criado no servidor -> consulta do
 * estado até terminar (etapa textual, sem % inventada) -> link de download protegido
 * (/api/jobs/:id/download, só o dono baixa). O App monta com key={tool.id}: trocar de
 * ferramenta remonta o modal com estado limpo. */

const PHASE = { IDLE: 'idle', UPLOADING: 'uploading', PROCESSING: 'processing', DONE: 'done' };
let fileKey = 0;

export function ToolModal({ tool, limits, isOpen, onClose, onJobsChanged }) {
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState({});
  const [error, setError] = useState('');
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [uploadPct, setUploadPct] = useState(0);
  const [stage, setStage] = useState('');
  const [job, setJob] = useState(null);

  const overlayRef = useRef(null);
  const closeButtonRef = useRef(null);
  const abortRef = useRef(null);
  const titleId = `modal-title-${tool.id}`;
  const busy = phase === PHASE.UPLOADING || phase === PHASE.PROCESSING;

  useModalA11y(overlayRef, onClose);
  // O overlay nasce invisível (visibility: hidden) e só fica visível com a classe
  // `open` no frame seguinte; foco em elemento invisível é ignorado pelo navegador,
  // então o foco inicial espera o modal abrir de fato.
  // Elementos com `transition: all` herdam a visibilidade com atraso de um frame,
  // então tentamos por alguns frames até o foco pegar.
  useEffect(() => {
    if (!isOpen) return undefined;
    let tries = 0;
    let frame;
    const attempt = () => {
      const button = closeButtonRef.current;
      button?.focus();
      if (button && document.activeElement !== button && ++tries < 20) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);
  // Fechar o modal cancela o ENVIO; um trabalho já criado continua no servidor e
  // aparece em "Arquivos recentes".
  useEffect(() => () => abortRef.current?.abort(), []);

  const addFiles = useCallback((incoming) => {
    setError('');
    const accepted = [];
    for (const file of incoming) {
      if (!hasAcceptedExtension(file, tool.acceptExtensions)) {
        setError(`"${file.name}" não é um formato aceito aqui (${tool.acceptLabel}).`);
        continue;
      }
      if (file.size === 0) {
        setError(`"${file.name}" está vazio.`);
        continue;
      }
      if (file.size > limits.maxFileSizeBytes) {
        setError(`"${file.name}" excede o limite de ${limits.maxFileSizeLabel}.`);
        continue;
      }
      accepted.push({ key: ++fileKey, file });
    }
    if (!accepted.length) return;
    setFiles((current) => {
      const merged = tool.multiple ? [...current, ...accepted] : accepted.slice(0, 1);
      if (merged.length > tool.maxFiles) {
        setError(`Esta ferramenta aceita no máximo ${tool.maxFiles} arquivos por vez.`);
        return merged.slice(0, tool.maxFiles);
      }
      return merged;
    });
  }, [tool, limits]);

  const removeFile = useCallback((index) => setFiles((c) => c.filter((_, i) => i !== index)), []);
  const moveFile = useCallback((index, delta) => {
    setFiles((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }, []);

  async function handleProcess() {
    const missing = tool.required?.(options);
    if (missing) { setError(missing); return; }
    const total = files.reduce((sum, f) => sum + f.file.size, 0);
    if (total > limits.maxTotalUploadMb * 1024 * 1024) {
      setError(`O total selecionado passa do limite de ${limits.maxTotalUploadMb} MB por envio.`);
      return;
    }

    setError('');
    setPhase(PHASE.UPLOADING);
    setUploadPct(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const created = await createJob({
        form: buildForm(tool, files.map((f) => f.file), options),
        signal: controller.signal,
        onUploadProgress: ({ loaded, total: size }) => setUploadPct(Math.round((loaded / size) * 100)),
      });
      setPhase(PHASE.PROCESSING);
      setStage(created.stage);
      onJobsChanged?.();

      const finished = await pollJob(created.id, {
        signal: controller.signal,
        onUpdate: (update) => setStage(update.stage),
      });
      onJobsChanged?.();
      if (finished.status === 'failed') {
        setError(finished.error?.message || 'Não foi possível processar o arquivo.');
        setPhase(PHASE.IDLE);
        return;
      }
      setJob(finished);
      setPhase(PHASE.DONE);
    } catch (err) {
      if (err.name === 'AbortError') return; // modal fechado
      setError(err.message || 'Erro ao processar o arquivo.');
      setPhase(PHASE.IDLE);
    } finally {
      abortRef.current = null;
    }
  }

  async function handleDeleteNow() {
    try {
      await deleteJob(job.id);
      onJobsChanged?.();
      handleReset();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleReset() {
    setFiles([]);
    setJob(null);
    setError('');
    setPhase(PHASE.IDLE);
  }

  const ToolIcon = tool.Icon;
  const canProcess = files.length >= tool.minFiles && !busy;

  return (
    <div
      ref={overlayRef}
      className={`modal-overlay${isOpen ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal-box">
        <div className="modal-header">
          <div className={`modal-icon ${tool.iconColor}`} aria-hidden="true"><ToolIcon /></div>
          <div className="modal-title-group">
            <h2 className="modal-title" id={titleId}>{tool.title}</h2>
            <div className="modal-subtitle">{tool.subtitle}</div>
          </div>
          <button ref={closeButtonRef} type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <ErrorBanner message={error} />

          {phase !== PHASE.DONE && (
            <>
              <Dropzone
                accept={tool.acceptAttr}
                acceptLabel={tool.acceptLabel}
                multiple={tool.multiple}
                sizeLabel={limits.maxFileSizeLabel}
                disabled={busy}
                onFiles={addFiles}
              />
              {files.length > 0 && (
                <FileList files={files} onRemove={removeFile} onMove={moveFile} reorder={tool.reorder} disabled={busy} />
              )}
              <ToolOptions
                kind={tool.options}
                options={options}
                targets={tool.targets}
                disabled={busy}
                onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
              />
            </>
          )}

          {busy && <ProgressPanel phase={phase} uploadPct={uploadPct} stage={stage} />}
          {phase === PHASE.DONE && job && <SuccessPanel job={job} />}
        </div>

        <div className="modal-footer">
          {phase === PHASE.DONE && job ? (
            <>
              <button type="button" className="btn-action btn-secondary" onClick={handleDeleteNow}>
                Apagar do servidor
              </button>
              <button type="button" className="btn-action btn-secondary" onClick={handleReset}>
                Novo arquivo
              </button>
              <a className="btn-download" href={downloadUrl(job.id)} download={job.result.name}>
                <DownloadIcon />
                Baixar
              </a>
            </>
          ) : (
            <>
              <button type="button" className="btn-action btn-secondary" onClick={onClose}>
                {busy ? 'Fechar' : 'Cancelar'}
              </button>
              <button
                type="button"
                className="btn-action btn-process"
                disabled={!canProcess}
                onClick={handleProcess}
              >
                {busy ? <><SpinnerIcon /> Processando...</> : <><BoltIcon /> {error ? 'Tentar novamente' : 'Processar'}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
