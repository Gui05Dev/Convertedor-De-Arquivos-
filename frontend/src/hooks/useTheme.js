import { useCallback, useState } from 'react';

/* O tema já foi aplicado ao <html> pelo script inline do index.html, antes do React
   existir — é o que evita o flash de tema errado no primeiro paint. Este hook só assume
   dali em diante: lê o estado atual do DOM e cuida da troca. */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
