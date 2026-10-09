/* Único módulo do frontend que fala com a rede.
 *
 * Caminhos sempre relativos (/api/...): o nginx que serve a SPA proxia /api pro
 * backend, e em dev o proxy do Vite faz o mesmo. Não há URL de API no bundle.
 *
 * Autenticação: a sessão é um cookie HttpOnly do oauth2-proxy, enviado pelo navegador
 * automaticamente. O frontend nunca vê nem guarda token. Se a sessão expirar, a API
 * responde 401 e mandamos o usuário para o login do Keycloak, voltando para a página. */

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SESSION_EXPIRED = 'Sua sessão expirou. Redirecionando para o login...';

function goToLogin() {
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/oauth2/start?rd=${encodeURIComponent(back)}`);
}

function messageForStatus(status) {
  if (status === 413) return 'Arquivo excede o limite permitido pelo servidor.';
  if (status === 429) return 'Você já tem arquivos sendo processados. Aguarde terminarem.';
  if (status === 502 || status === 503) return 'Servidor ocupado ou indisponível no momento. Tente novamente em instantes.';
  if (status === 504) return 'O servidor demorou demais para responder. Tente um arquivo menor.';
  return 'Falha ao falar com o servidor. Tente novamente.';
}

async function parseError(response) {
  let body = null;
  try { body = await response.json(); } catch { /* corpo não-JSON (proxy) */ }
  return new ApiError(body?.error || messageForStatus(response.status), response.status, body?.code);
}

async function request(path, { method = 'GET' } = {}) {
  let response;
  try {
    response = await fetch(path, { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0, 'network');
  }
  if (response.status === 401) {
    goToLogin();
    throw new ApiError(SESSION_EXPIRED, 401, 'unauthenticated');
  }
  if (!response.ok) throw await parseError(response);
  return response.status === 204 ? null : response.json();
}

export const fetchMe = () => request('/api/me');
export const fetchConfig = () => request('/api/config');
export const fetchTools = () => request('/api/tools').then((r) => r.tools);
export const fetchJob = (id) => request(`/api/jobs/${encodeURIComponent(id)}`);
export const listJobs = () => request('/api/jobs').then((r) => r.jobs);
export const deleteJob = (id) => request(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const downloadUrl = (id) => `/api/jobs/${encodeURIComponent(id)}/download`;

/**
 * Envia os arquivos e cria o trabalho. Usa XMLHttpRequest porque é o único jeito,
 * com bom suporte, de acompanhar o progresso REAL do envio (bytes enviados).
 * Depois do envio, o processamento é acompanhado por pollJob — sem porcentagem.
 */
export function createJob({ form, signal, onUploadProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs');
    xhr.responseType = 'json';
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onerror = () => reject(new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0, 'network'));
    xhr.onabort = () => reject(Object.assign(new Error('Cancelado.'), { name: 'AbortError' }));
    xhr.onload = () => {
      if (xhr.status === 202) return resolve(xhr.response);
      if (xhr.status === 401) {
        goToLogin();
        return reject(new ApiError(SESSION_EXPIRED, 401, 'unauthenticated'));
      }
      const body = xhr.response;
      reject(new ApiError(body?.error || messageForStatus(xhr.status), xhr.status, body?.code));
    };

    if (signal) {
      if (signal.aborted) return xhr.abort();
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

/**
 * Consulta o trabalho até terminar. Intervalo curto no início (conversões rápidas
 * terminam em menos de um segundo) e mais espaçado depois, pra não martelar a API.
 */
export async function pollJob(id, { signal, onUpdate }) {
  let delay = 400;
  for (;;) {
    if (signal?.aborted) throw Object.assign(new Error('Cancelado.'), { name: 'AbortError' });
    const job = await fetchJob(id);
    onUpdate?.(job);
    if (job.status === 'done' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 2000);
  }
}
