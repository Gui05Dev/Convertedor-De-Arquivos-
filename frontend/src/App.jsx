import { useCallback, useEffect, useState } from 'react';
import { TOOLS } from './data/tools.js';
import { useTheme } from './hooks/useTheme.js';
import { useServerLimits } from './hooks/useServerLimits.js';
import { SiteHeader } from './components/SiteHeader.jsx';
import { SiteFooter } from './components/SiteFooter.jsx';
import { ToolsGrid } from './components/ToolsGrid.jsx';
import { ToolModal } from './components/ToolModal.jsx';

/* Duração do fade do overlay em style.css (.modal-overlay / .modal-box). Se mudar lá,
   mude aqui: é o tempo que esperamos antes de desmontar, pra animação de saída rodar. */
const CLOSE_ANIMATION_MS = 280;

export default function App() {
  const { toggleTheme } = useTheme();
  const limits = useServerLimits();

  const [activeKey, setActiveKey] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  /* A transição do overlay é CSS puro e só dispara se o elemento nascer sem a classe
     `open` e recebê-la depois. Por isso montamos primeiro e marcamos como aberto no
     frame seguinte, em vez de montar já com a classe. */
  useEffect(() => {
    if (!activeKey) return undefined;
    const frame = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [activeKey]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    const timer = setTimeout(() => setActiveKey(null), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <SiteHeader onToggleTheme={toggleTheme} />

      <main className="main">
        <div className="section-heading"><h2>Ferramentas disponíveis</h2></div>
        <ToolsGrid onOpen={setActiveKey} />
      </main>

      <SiteFooter />

      {/* `key` remonta o modal a cada ferramenta: estado sempre limpo, sem rotina de reset. */}
      {activeKey && (
        <ToolModal
          key={activeKey}
          tool={TOOLS[activeKey]}
          limits={limits}
          isOpen={isOpen}
          onClose={closeModal}
        />
      )}
    </>
  );
}
