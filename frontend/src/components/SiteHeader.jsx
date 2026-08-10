import { SunIcon, MoonIcon } from './icons.jsx';

/* Os dois ícones ficam sempre no DOM; qual aparece é decisão do CSS a partir do
   data-theme do <html> (ver .theme-icon-sun / .theme-icon-moon em style.css). */
export function SiteHeader({ onToggleTheme }) {
  return (
    <header className="site-header">
      <div className="header-bar">
        <a href="#" className="header-logo">
          <img src="/img/Copacol_BRANCO_PANTONE.png" alt="Copacol" />
        </a>
        <button
          className="theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label="Alternar tema claro/escuro"
          title="Alternar tema claro/escuro"
        >
          <SunIcon />
          <MoonIcon />
        </button>
      </div>
    </header>
  );
}
