import { useEffect, useState } from 'react';
import { fetchLimits } from '../api/client.js';

/* Os limites de upload são do backend, não do frontend: aqui eles servem só pra avisar
   o usuário antes de gastar um envio que seria recusado. Os valores abaixo são o palpite
   até /api/config responder — quem valida de verdade é sempre o servidor. */
const FALLBACK = { maxFileSizeMb: 100, maxFiles: 20 };

export function useServerLimits() {
  const [limits, setLimits] = useState(FALLBACK);

  useEffect(() => {
    let active = true;
    fetchLimits()
      .then((data) => {
        if (!active) return;
        setLimits({
          maxFileSizeMb: Number.isFinite(data.maxFileSizeMb) ? data.maxFileSizeMb : FALLBACK.maxFileSizeMb,
          maxFiles: Number.isFinite(data.maxFiles) ? data.maxFiles : FALLBACK.maxFiles,
        });
      })
      // Falha em silêncio: os defaults servem, e se o backend estiver fora o erro
      // aparece de forma clara na primeira tentativa de processar.
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return {
    ...limits,
    maxFileSizeBytes: limits.maxFileSizeMb * 1024 * 1024,
    maxFileSizeLabel: `${limits.maxFileSizeMb} MB`,
  };
}
