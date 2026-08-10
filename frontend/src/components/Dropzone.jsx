import { useRef, useState } from 'react';
import { UploadIcon } from './icons.jsx';

export function Dropzone({ accept, multiple, sizeLabel, disabled, onFiles }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={`dropzone${dragOver ? ' drag-over' : ''}`}
      style={disabled ? { pointerEvents: 'none' } : undefined}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={inputRef}
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          onFiles(Array.from(event.target.files));
          // Zera o input pra que escolher o MESMO arquivo de novo ainda dispare onChange.
          event.target.value = '';
        }}
      />
      <div className="dz-icon"><UploadIcon /></div>
      <div className="dz-title">Arraste e solte aqui</div>
      <div className="dz-sub">
        ou <strong>clique para selecionar</strong> — máx. {sizeLabel}
      </div>
    </div>
  );
}
