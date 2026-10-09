export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Checagem de conveniência pela extensão — quem valida o formato real é o servidor. */
export function hasAcceptedExtension(file, extensions) {
  if (!extensions?.length) return true;
  const name = file.name.toLowerCase();
  return extensions.some((ext) => name.endsWith(ext));
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
