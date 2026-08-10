/* Todos os ícones da interface, como componentes.
 *
 * São SVGs inline em vez de arquivos ou de uma biblioteca por dois motivos: herdam
 * `currentColor` (o mesmo ícone serve tema claro e escuro sem duplicata) e não custam
 * nenhuma requisição — o que mantém a promessa de a página não buscar nada fora daqui.
 *
 * Convenção herdada do design: traço 2 para ícones de ferramenta, 2.5 para os de
 * interface e badges, o que dá o contraste de peso entre os dois grupos.
 */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' };
const strokeBold = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5 };

/* ── Ferramentas ── */

export const MergeIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="2" y="3" width="9" height="18" rx="1.5" />
    <rect x="13" y="3" width="9" height="18" rx="1.5" />
  </svg>
);

export const SplitIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

export const RotateIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.5 7A9 9 0 0 0 6.5 5L1 10M23 14l-5.5 5a9 9 0 0 1-14-2" />
  </svg>
);

export const RemovePagesIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

export const BoltIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  </svg>
);

export const DocLinesIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

export const DocFoldIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export const SheetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

export const TableIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

export const ImageIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const SlideIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
  </svg>
);

export const SlideStandIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

/* ── Badges de categoria ── */

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const BoltBadgeIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const ConvertBadgeIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold}>
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.5 7A9 9 0 0 0 6.5 5L1 10M23 14l-5.5 5a9 9 0 0 1-14-2" />
  </svg>
);

/* ── Interface ── */

export const SunIcon = () => (
  <svg className="theme-icon theme-icon-sun" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const MoonIcon = () => (
  <svg className="theme-icon theme-icon-moon" viewBox="0 0 24 24" {...stroke} strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const AlertIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const UploadIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const SuccessCheckIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold} strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const SpinnerIcon = () => (
  <svg viewBox="0 0 24 24" {...strokeBold} style={{ animation: 'spin .8s linear infinite' }}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.5 17A9 9 0 1 1 20.5 7" />
  </svg>
);
