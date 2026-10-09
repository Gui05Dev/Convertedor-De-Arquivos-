import { SunIcon, MoonIcon } from './icons.jsx';

/* O link "Sair" vai pro oauth2-proxy, que apaga o cookie de sessão e encerra a sessão
   no Keycloak (backend logout). Os dois ícones de tema ficam no DOM; qual aparece é
   decisão do CSS a partir do data-theme do <html>. */
export function SiteHeader({ onToggleTheme, user }) {
  return (
    <header className="site-header">
      <div className="header-bar">
        <a href="/" className="header-logo">
          <img src="/img/Copacol_BRANCO_PANTONE.png" alt="Copacol — página inicial" />
        </a>
        <div className="header-actions">
          {user && (
            <span className="header-user" title={user.username}>
              {user.name || user.username}
            </span>
          )}
          {user && (
            <a className="header-logout" href="/oauth2/sign_out?rd=%2F">Sair</a>
          )}
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
      </div>
    </header>
  );
}
