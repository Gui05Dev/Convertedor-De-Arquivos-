import { DocFoldIcon, CloseIcon } from './icons.jsx';
import { formatBytes } from '../utils/format.js';

export function FileList({ files, onRemove }) {
  return (
    <div className="files-list">
      {files.map((file, index) => (
        <div
          /* Nome + tamanho + posição: dois arquivos homônimos ainda recebem chaves
             distintas, e a animação de entrada não se repete ao remover um vizinho. */
          key={`${file.name}-${file.size}-${index}`}
          className="file-item"
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <div className="file-item-icon"><DocFoldIcon /></div>
          <div className="file-item-info">
            <div className="file-item-name">{file.name}</div>
            <div className="file-item-size">{formatBytes(file.size)}</div>
          </div>
          <button
            type="button"
            className="file-item-remove"
            aria-label={`Remover ${file.name}`}
            onClick={() => onRemove(index)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
