/* Formulários extras de cada ferramenta. Componente controlado: o estado mora no
   ToolModal, que é quem monta o multipart na hora de enviar. */
export function ToolOptions({ kind, options, onChange }) {
  if (kind === 'dividir') {
    return (
      <div className="extra-options">
        <label htmlFor="optPageRange">Intervalo de páginas (ex: 1-3 ou 2,4,6)</label>
        <input
          id="optPageRange"
          type="text"
          placeholder="ex: 1-5"
          value={options.range || ''}
          onChange={(event) => onChange({ range: event.target.value })}
        />
      </div>
    );
  }

  if (kind === 'girar') {
    return (
      <div className="extra-options">
        <label htmlFor="optRotation">Ângulo de rotação</label>
        <select
          id="optRotation"
          value={options.angle || '90'}
          onChange={(event) => onChange({ angle: event.target.value })}
        >
          <option value="90">90° (sentido horário)</option>
          <option value="180">180°</option>
          <option value="270">270° (sentido anti-horário)</option>
        </select>
      </div>
    );
  }

  if (kind === 'remover-paginas') {
    return (
      <div className="extra-options">
        <label htmlFor="optRemovePages">Páginas a remover (ex: 1,3,5 ou 2-4)</label>
        <input
          id="optRemovePages"
          type="text"
          placeholder="ex: 1,3,5-7"
          value={options.pages || ''}
          onChange={(event) => onChange({ pages: event.target.value })}
        />
      </div>
    );
  }

  return null;
}
