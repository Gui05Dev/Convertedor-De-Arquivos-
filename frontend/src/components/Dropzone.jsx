import { useId, useState } from 'react';
import { UploadIcon } from './icons.jsx';

/* O <input type="file"> cobre a área inteira (CSS) e é o elemento focável: Tab chega
   nele, Enter/Espaço abrem o seletor nativo e o leitor de tela lê o rótulo abaixo. */
export function Dropzone({ accept, acceptLabel, multiple, sizeLabel, disabled, onFiles }) {
  const [dragOver, setDragOver] = useState(false);
  const hintId = useId();

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={`dropzone${dragOver ? ' drag-over' : ''}${disabled ? ' disabled' : ''}`}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={multiple ? 'Selecionar arquivos' : 'Selecionar arquivo'}
        aria-describedby={hintId}
        onChange={(event) => {
          onFiles(Array.from(event.target.files));
          // Zera o input pra que escolher o MESMO arquivo de novo ainda dispare onChange.
          event.target.value = '';
        }}
      />
      <div className="dz-icon" aria-hidden="true"><UploadIcon /></div>
      <div className="dz-title">Arraste e solte aqui</div>
      <div className="dz-sub" id={hintId}>
        ou <strong>clique para selecionar</strong> — {acceptLabel}, até {sizeLabel}
        {multiple ? ' por arquivo' : ''}
      </div>
    </div>
  );
}
