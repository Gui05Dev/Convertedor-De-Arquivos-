export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Aplica o filtro `accept` da ferramenta a um arquivo escolhido pelo usuário. */
export function isFileAccepted(file, accept) {
  if (!accept) return true;
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);              // extensão (.pdf)
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1)); // image/*
    return type === token;                                               // mime exato
  });
}
