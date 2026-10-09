/* Formulários extras de cada ferramenta. Componente controlado: o estado mora no
   ToolModal, que monta o multipart. Toda opção é validada de novo no servidor. */
export function ToolOptions({ kind, options, onChange, targets, disabled }) {
  if (kind === 'split') {
    const mode = options.mode || 'range';
    return (
      <div className="extra-options">
        <fieldset className="option-group" disabled={disabled}>
          <legend>Como dividir</legend>
          <label className="radio">
            <input type="radio" name="splitMode" value="range" checked={mode === 'range'}
              onChange={() => onChange({ mode: 'range' })} />
            Extrair páginas para um PDF
          </label>
          <label className="radio">
            <input type="radio" name="splitMode" value="pages" checked={mode === 'pages'}
              onChange={() => onChange({ mode: 'pages' })} />
            Um PDF por página (arquivo ZIP)
          </label>
        </fieldset>
        <label htmlFor="optPageRange">
          {mode === 'range' ? 'Páginas (ex.: 1-3 ou 2,4,6)' : 'Páginas (opcional — vazio = todas)'}
        </label>
        <input
          id="optPageRange" type="text" inputMode="numeric" autoComplete="off" placeholder="ex.: 1-5"
          disabled={disabled} value={options.range || ''}
          onChange={(event) => onChange({ range: event.target.value })}
        />
      </div>
    );
  }

  if (kind === 'rotate') {
    return (
      <div className="extra-options">
        <label htmlFor="optRotation">Ângulo de rotação</label>
        <select id="optRotation" disabled={disabled} value={options.angle || '90'}
          onChange={(event) => onChange({ angle: event.target.value })}>
          <option value="90">90° (sentido horário)</option>
          <option value="180">180°</option>
          <option value="270">270° (sentido anti-horário)</option>
        </select>
      </div>
    );
  }

  if (kind === 'remove-pages') {
    return (
      <div className="extra-options">
        <label htmlFor="optRemovePages">Páginas a remover (ex.: 1,3,5 ou 2-4)</label>
        <input id="optRemovePages" type="text" inputMode="numeric" autoComplete="off" placeholder="ex.: 1,3,5-7"
          disabled={disabled} value={options.pages || ''}
          onChange={(event) => onChange({ pages: event.target.value })} />
      </div>
    );
  }

  if (kind === 'compress') {
    return (
      <div className="extra-options">
        <label htmlFor="optLevel">Nível de compressão</label>
        <select id="optLevel" disabled={disabled} value={options.level || 'recomendada'}
          onChange={(event) => onChange({ level: event.target.value })}>
          <option value="leve">Leve — imagens a 300 dpi (boa para impressão)</option>
          <option value="recomendada">Recomendada — imagens a 150 dpi</option>
          <option value="forte">Forte — imagens a 96 dpi (só para tela)</option>
        </select>
      </div>
    );
  }

  if (kind === 'convert-image') {
    const lossy = options.target === 'jpg' || options.target === 'webp';
    return (
      <div className="extra-options">
        <label htmlFor="optTarget">Converter para</label>
        <select id="optTarget" disabled={disabled} value={options.target || ''}
          onChange={(event) => onChange({ target: event.target.value })}>
          <option value="" disabled>Escolha o formato</option>
          {(targets || []).map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        {lossy && (
          <>
            <label htmlFor="optQuality">Qualidade ({options.quality || 85})</label>
            <input id="optQuality" type="range" min="40" max="100" step="5" disabled={disabled}
              value={options.quality || 85} onChange={(event) => onChange({ quality: event.target.value })} />
          </>
        )}
      </div>
    );
  }

  return null;
}
