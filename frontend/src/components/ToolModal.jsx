import { useCallback, useEffect, useRef, useState } from 'react';
import { buildForm } from '../data/tools.js';
import { uploadToApi } from '../api/client.js';
import { isFileAccepted } from '../utils/format.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { Dropzone } from './Dropzone.jsx';
import { FileList } from './FileList.jsx';
import { ToolOptions } from './ToolOptions.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { SuccessPanel } from './SuccessPanel.jsx';
import { BoltIcon, CloseIcon, DownloadIcon, SpinnerIcon } from './icons.jsx';

/* Modal de uma ferramenta, do zero até o download.
 *
 * O App monta este componente com `key={toolKey}`: trocar de ferramenta desmonta e
 * remonta, o que zera arquivos, opções, erro e progresso sem nenhuma rotina de reset.
 * É o que substitui o contador de sessão que a versão anterior usava pra descartar
 * resultados de um processamento que já não pertencia à tela aberta. */

const PHASE = { IDLE: 'idle', PROCESSING: 'processing', DONE: 'done' };

export function ToolModal({ tool, limits, isOpen, onClose }) {
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState({});
  const [error, setError] = useState('');
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [progress, setProgress] = useState({ pct: 0, label: '', status: '' });
  const [result, setResult] = useState(null);

  const overlayRef = useRef(null);
  const closeButtonRef = useRef(null);
  const abortRef = useRef(null);
  const objectUrlRef = useRef(null);

  const available = Boolean(tool.endpoint);
  const isProcessing = phase === PHASE.PROCESSING;

  useModalA11y(overlayRef, onClose);
  useEffect(() => { closeButtonRef.current?.focus(); }, []);

  /* Ao desmontar (fechar ou trocar de ferramenta): corta um upload em andamento pra não
     ocupar o servidor à toa, e libera o blob do último resultado. */
  useEffect(() => () => {
    abortRef.current?.abort();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const addFiles = useCallback((incoming) => {
    setError('');
    const accepted = [];

    for (const file of incoming) {
      if (!isFileAccepted(file, tool.accept)) {
        setError(`Tipo de arquivo não suportado: ${file.name}`);
        continue;
      }
      if (file.size > limits.maxFileSizeBytes) {
        setError(`"${file.name}" excede o limite de ${limits.maxFileSizeLabel}.`);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;

    setFiles((current) => {
      // Ferramenta de arquivo único sempre substitui a escolha anterior.
      const merged = tool.multiple ? [...current, ...accepted] : accepted.slice(0, 1);
      if (merged.length > limits.maxFiles) {
        setError(`O servidor aceita no máximo ${limits.maxFiles} arquivos por vez.`);
        return merged.slice(0, limits.maxFiles);
      }
      return merged;
    });
  }, [tool, limits]);

  const removeFile = useCallback((index) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  }, []);

  async function handleProcess() {
    const required = tool.requiredOption;
    if (required && !options[required.field]?.trim()) {
      setError(required.message);
      return;
    }

    setError('');
    setPhase(PHASE.PROCESSING);
    setProgress({ pct: 0, label: 'Preparando arquivos...', status: 'Aguarde o processamento.' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const uploaded = await uploadToApi({
        path: tool.endpoint,
        form: buildForm(tool, files, options),
        fallbackName: tool.outputName,
        signal: controller.signal,
        onProgress: ({ pct, label }) => setProgress({ pct, label, status: 'Aguarde o processamento.' }),
      });

      setProgress({ pct: 100, label: 'Concluído!', status: 'Concluído!' });

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(uploaded.blob);

      triggerDownload(objectUrlRef.current, uploaded.name);
      setResult({ url: objectUrlRef.current, name: uploaded.name, info: uploaded.info });
      setPhase(PHASE.DONE);
    } catch (err) {
      // AbortError só acontece quando o próprio usuário fechou o modal: o componente já
      // está desmontando e não há tela pra avisar.
      if (err.name === 'AbortError') return;
      setError(err.message || 'Erro desconhecido ao processar o arquivo.');
      setPhase(PHASE.IDLE);
    } finally {
      abortRef.current = null;
    }
  }

  function handleReset() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFiles([]);
    setResult(null);
    setError('');
    setPhase(PHASE.IDLE);
  }

  const ToolIcon = tool.Icon;
  const canProcess = available && files.length >= (tool.minFiles || 1);

  return (
    <div
      ref={overlayRef}
      className={`modal-overlay${isOpen ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={tool.title}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal-box">

        <div className="modal-header">
          <div className={`modal-icon ${tool.iconColor}`}><ToolIcon /></div>
          <div className="modal-title-group">
            <div className="modal-title">{tool.title}</div>
            <div className="modal-subtitle">{tool.subtitle}</div>
          </div>
          <button ref={closeButtonRef} type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <ErrorBanner message={error} />

          {!available ? (
            <UnavailableNotice title={tool.title} />
          ) : phase !== PHASE.DONE && (
            <>
              <Dropzone
                accept={tool.accept}
                multiple={tool.multiple}
                sizeLabel={limits.maxFileSizeLabel}
                disabled={isProcessing}
                onFiles={addFiles}
              />
              {files.length > 0 && <FileList files={files} onRemove={removeFile} />}
              <ToolOptions
                kind={tool.options}
                options={options}
                onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
              />
            </>
          )}

          {isProcessing && <ProgressPanel {...progress} />}
          {phase === PHASE.DONE && result && (
            <SuccessPanel message={result.info || `Download iniciado: ${result.name}`} />
          )}
        </div>

        <div className="modal-footer">
          {phase === PHASE.DONE && result ? (
            <>
              <button type="button" className="btn-action btn-secondary" onClick={handleReset}>
                Novo arquivo
              </button>
              <a className="btn-download" href={result.url} download={result.name}>
                <DownloadIcon />
                Baixar novamente
              </a>
            </>
          ) : (
            <>
              <button type="button" className="btn-action btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-action btn-process"
                disabled={!canProcess || isProcessing}
                onClick={handleProcess}
              >
                {isProcessing ? <><SpinnerIcon /> Processando...</> : <><BoltIcon /> {error ? 'Tentar novamente' : 'Processar'}</>}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

function UnavailableNotice({ title }) {
  return (
    <div style={{ textAlign: 'center', padding: '1.75rem 0', color: 'var(--gray-500)' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>🚧</div>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--gray-700)', marginBottom: '.35rem' }}>{title}</div>
      <div style={{ fontSize: 13 }}>Esta ferramenta estará disponível em breve.</div>
    </div>
  );
}

/* O download começa sozinho assim que o arquivo chega; o botão "Baixar novamente" do
   rodapé usa o mesmo blob, caso o usuário cancele o download do navegador. */
function triggerDownload(url, name) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
