import { DocFoldIcon, CloseIcon } from './icons.jsx';
import { formatBytes } from '../utils/format.js';

/* Lista dos arquivos escolhidos. Em ferramentas onde a ordem importa (juntar PDFs,
   imagens para PDF), cada item ganha botões "subir"/"descer" — reordenar por teclado,
   sem depender de arrastar. */
export function FileList({ files, onRemove, onMove, reorder, disabled }) {
  return (
    <ol className="files-list" aria-label="Arquivos selecionados">
      {files.map((file, index) => (
        <li key={file.key} className="file-item">
          <div className="file-item-icon" aria-hidden="true"><DocFoldIcon /></div>
          <div className="file-item-info">
            <div className="file-item-name">
              {reorder && <span className="file-item-order">{index + 1}. </span>}
              {file.file.name}
            </div>
            <div className="file-item-size">{formatBytes(file.file.size)}</div>
          </div>
          {reorder && files.length > 1 && (
            <div className="file-item-order-buttons">
              <button
                type="button" className="file-item-move" disabled={disabled || index === 0}
                aria-label={`Mover ${file.file.name} para cima`} onClick={() => onMove(index, -1)}
              >↑</button>
              <button
                type="button" className="file-item-move" disabled={disabled || index === files.length - 1}
                aria-label={`Mover ${file.file.name} para baixo`} onClick={() => onMove(index, 1)}
              >↓</button>
            </div>
          )}
          <button
            type="button"
            className="file-item-remove"
            disabled={disabled}
            aria-label={`Remover ${file.file.name}`}
            onClick={() => onRemove(index)}
          >
            <CloseIcon />
          </button>
        </li>
      ))}
    </ol>
  );
}
