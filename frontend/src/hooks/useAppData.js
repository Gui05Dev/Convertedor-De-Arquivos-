import { useCallback, useEffect, useState } from 'react';
import { fetchConfig, fetchMe, fetchTools } from '../api/client.js';
import { availableTools } from '../data/tools.js';

/* Carrega, uma vez, o que a tela precisa saber do servidor: quem está logado, os
 * limites de upload e quais ferramentas existem de fato neste servidor. */
export function useAppData() {
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(() => {
    let active = true;
    setState({ status: 'loading' });
    Promise.all([fetchMe(), fetchConfig(), fetchTools()])
      .then(([me, config, tools]) => {
        if (!active) return;
        setState({
          status: 'ready',
          me,
          tools: availableTools(tools),
          limits: {
            ...config,
            maxFileSizeBytes: config.maxFileSizeMb * 1024 * 1024,
            maxFileSizeLabel: `${config.maxFileSizeMb} MB`,
          },
        });
      })
      .catch((error) => {
        if (active && error.status !== 401) setState({ status: 'error', message: error.message });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);
  return { ...state, reload: load };
}
