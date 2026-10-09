/* Andamento sem números inventados:
 *  - envio: porcentagem REAL (bytes enviados / total), informada pelo navegador;
 *  - processamento: o servidor não sabe quanto falta, então mostramos a etapa atual
 *    (ex.: "Convertendo com LibreOffice") e uma barra indeterminada.
 * A região é aria-live: leitores de tela anunciam as mudanças de etapa. */
export function ProgressPanel({ phase, uploadPct, stage }) {
  const uploading = phase === 'uploading';
  return (
    <div className="progress-wrap visible">
      <div className="progress-label" aria-live="polite">
        <span>{uploading ? 'Enviando arquivo...' : stage || 'Processando...'}</span>
        {uploading && <span>{uploadPct}%</span>}
      </div>
      {uploading ? (
        <div className="progress-bar-track" role="progressbar" aria-label="Envio do arquivo"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPct}>
          <div className="progress-bar-fill" style={{ width: `${uploadPct}%` }} />
        </div>
      ) : (
        <div className="progress-bar-track" role="progressbar" aria-label="Processando no servidor" aria-busy="true">
          <div className="progress-bar-indeterminate" />
        </div>
      )}
      <div className="progress-status">
        {uploading
          ? 'Não feche esta janela durante o envio.'
          : 'O arquivo está no servidor da Copacol. Você pode aguardar aqui.'}
      </div>
    </div>
  );
}
