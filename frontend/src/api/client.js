/* Único módulo do frontend que fala com a rede.
 *
 * Todos os caminhos são relativos de propósito: em produção o nginx que serve esta SPA
 * proxia /api pro backend, e em dev o proxy do Vite faz o mesmo (ver vite.config.js).
 * O navegador nunca conhece o endereço do backend — não há URL de API embutida no
 * bundle, não há CORS, e o mesmo build sobe em qualquer ambiente sem recompilar. */

/** Limites de upload que a tela usa pra avisar o usuário antes de gastar um envio. */
export async function fetchLimits() {
  const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Não foi possível ler a configuração do servidor.');
  return response.json();
}

/**
 * Envia os arquivos e devolve o resultado pronto pra download.
 *
 * Usa XMLHttpRequest em vez de fetch porque é o único jeito com bom suporte em todo
 * navegador de acompanhar o progresso real do upload — `fetch` não expõe isso. O mapa
 * da barra é: 0-60% envio, 60% processamento no servidor (não há como medir), 60-95%
 * download da resposta.
 *
 * @param {object}          params
 * @param {string}          params.path          rota da API, ex. '/api/pdf/merge'
 * @param {FormData}        params.form          corpo multipart
 * @param {string}          params.fallbackName  nome usado se a resposta não trouxer um
 * @param {AbortSignal}     [params.signal]      cancela o envio (modal fechado)
 * @param {(p) => void}     [params.onProgress]  recebe { pct, label }
 * @returns {Promise<{ blob: Blob, name: string, info: string }>}
 */
export function uploadToApi({ path, form, fallbackName, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const report = (pct, label) => onProgress?.({ pct, label });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.responseType = 'blob';

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      report(Math.max(1, Math.round((e.loaded / e.total) * 60)), 'Enviando arquivo...');
    };
    xhr.upload.onload = () => report(60, 'Processando no servidor...');
    xhr.onprogress = (e) => {
      if (!e.lengthComputable) return;
      report(60 + Math.round((e.loaded / e.total) * 35), 'Baixando resultado...');
    };

    xhr.onerror = () => reject(new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'));
    xhr.onabort = () => reject(Object.assign(new Error('Cancelado.'), { name: 'AbortError' }));

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        report(95, 'Finalizando...');
        resolve({
          blob: xhr.response,
          name: filenameFromResponse(xhr, fallbackName),
          info: decodeHeader(xhr.getResponseHeader('X-Result-Info')),
        });
        return;
      }
      reject(new Error(await errorMessageFrom(xhr)));
    };

    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    report(1, 'Enviando arquivo...');
    xhr.send(form);
  });
}

/* Quem nomeia o arquivo é o backend (Content-Disposition); o nome local é rede de segurança. */
function filenameFromResponse(xhr, fallbackName) {
  const disposition = xhr.getResponseHeader('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (!match) return fallbackName;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

function decodeHeader(value) {
  if (!value) return '';
  try { return decodeURIComponent(value); } catch { return value; }
}

/* Traduz uma resposta de erro em mensagem pro usuário. Os status tratados à parte são
   os que podem vir sem corpo JSON (limite do proxy, timeout de gateway). */
async function errorMessageFrom(xhr) {
  if (xhr.status === 413) return 'Arquivo excede o limite permitido pelo servidor.';
  if (xhr.status === 503) return 'Servidor ocupado processando outras requisições. Tente novamente em instantes.';
  if (xhr.status === 504) return 'O processamento demorou demais e foi cancelado. Tente um arquivo menor.';
  try {
    const body = JSON.parse(await xhr.response.text());
    if (body?.error) return body.error;
  } catch { /* resposta sem JSON */ }
  return 'Falha ao processar o arquivo. Tente novamente.';
}
