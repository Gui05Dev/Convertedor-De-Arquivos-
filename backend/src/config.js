'use strict';

/* Único ponto do backend que lê process.env. Qualquer parâmetro novo entra aqui (e no
   .env.example) — nenhum outro módulo toca em process.env, pra ficar óbvio o que o
   serviço precisa pra rodar.

   O .env é carregado pelo Docker Compose (env_file) ou, em desenvolvimento, pelo
   `node --env-file-if-exists=.env` do script `npm run dev`. */

const path = require('path');

function int(name, fallback, { min = 0 } = {}) {
  const parsed = parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function bool(name, fallback) {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(raw);
}

function str(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function load() {
  const cfg = {
    nodeEnv: str('NODE_ENV', 'development'),
    port: int('PORT', 3000, { min: 1 }),
    logLevel: str('LOG_LEVEL', 'info'),

    /* ── Armazenamento dos trabalhos ──
       Cada trabalho ganha um diretório próprio em DATA_DIR/jobs/<id>/ com input/, work/
       e output/. O serviço não escreve nada fora de DATA_DIR. */
    dataDir: path.resolve(str('DATA_DIR', path.join(__dirname, '..', 'data'))),

    /* Retenção, em minutos. Originais: 0 = apagados assim que o processamento termina
       (com sucesso ou falha). Resultados: prazo que o usuário tem pra baixar. */
    originalRetentionMinutes: int('ORIGINAL_RETENTION_MINUTES', 0),
    resultRetentionMinutes: int('RESULT_RETENTION_MINUTES', 60, { min: 1 }),
    cleanupIntervalSeconds: int('CLEANUP_INTERVAL_SECONDS', 60, { min: 1 }),

    /* ── Limites de entrada ── */
    maxFileSizeMb: int('MAX_FILE_SIZE_MB', 100, { min: 1 }),
    maxFiles: int('MAX_FILES', 20, { min: 1 }),
    maxTotalUploadMb: int('MAX_TOTAL_UPLOAD_MB', 200, { min: 1 }),
    maxPdfPages: int('MAX_PDF_PAGES', 2000, { min: 1 }),
    maxImagePixels: int('MAX_IMAGE_PIXELS', 80_000_000, { min: 1 }),

    /* ── Limites de execução ──
       Tempo máximo de UM trabalho, qualquer motor. Estourou: o processo/worker é morto,
       os temporários são apagados e o usuário recebe a mensagem de tempo esgotado. */
    jobTimeoutMs: int('JOB_TIMEOUT_MS', int('CONVERT_TIMEOUT_MS', 120_000), { min: 100 }),
    /* Trabalhos processando ao mesmo tempo (cada um pode subir um LibreOffice). */
    maxConcurrentJobs: int('MAX_CONCURRENT_JOBS', int('MAX_CONCURRENT_CONVERSIONS', 2), { min: 1 }),
    /* Trabalhos esperando na fila; acima disso o envio recebe 503. */
    maxQueuedJobs: int('MAX_QUEUED_JOBS', 20),
    /* Trabalhos não concluídos (fila + processando) por usuário; acima disso, 429. */
    maxActiveJobsPerUser: int('MAX_ACTIVE_JOBS_PER_USER', 3, { min: 1 }),
    /* Heap do worker que roda pdf-lib/sharp, em MB. */
    workerMaxHeapMb: int('WORKER_MAX_HEAP_MB', 1024, { min: 64 }),
    /* Maior arquivo que um conversor externo pode gravar (MB) — corta "bombas". */
    maxOutputMb: int('MAX_OUTPUT_MB', 500, { min: 1 }),

    /* ── Motores externos ── */
    libreofficeBin: str('LIBREOFFICE_BIN', 'soffice'),
    ghostscriptBin: str('GHOSTSCRIPT_BIN', 'gs'),
    pythonBin: str('PYTHON_BIN', 'python3'),
    prlimitBin: str('PRLIMIT_BIN', 'prlimit'),
    /* PDF -> Word usa pdf2docx, que depende do PyMuPDF (AGPL-3.0). Ver LICENCAS.md. */
    enablePdfToDocx: bool('ENABLE_PDF_TO_DOCX', true),

    /* ── Autenticação ──
       oidc: exige "Authorization: Bearer <access token>" emitido pelo Keycloak e valida
             assinatura (JWKS), issuer, audience e expiração. O nginx injeta esse header
             a partir da sessão do oauth2-proxy; o backend não confia em nenhum outro
             header de identidade.
       dev:  usuário fixo AUTH_DEV_USER, só pra desenvolvimento local. Proibido com
             NODE_ENV=production (o processo recusa subir). */
    authMode: str('AUTH_MODE', 'oidc'),
    authDevUser: str('AUTH_DEV_USER', ''),
    oidcIssuer: str('OIDC_ISSUER', ''),
    oidcJwksUrl: str('OIDC_JWKS_URL', ''),
    oidcAudience: str('OIDC_AUDIENCE', ''),
    oidcUsernameClaim: str('OIDC_USERNAME_CLAIM', 'preferred_username'),
    /* Papel de realm exigido. Vazio = qualquer usuário autenticado do realm. */
    oidcRequiredRole: str('OIDC_REQUIRED_ROLE', ''),
    oidcClockToleranceSeconds: int('OIDC_CLOCK_TOLERANCE_SECONDS', 30),
  };

  cfg.maxFileSizeBytes = cfg.maxFileSizeMb * 1024 * 1024;
  cfg.maxTotalUploadBytes = cfg.maxTotalUploadMb * 1024 * 1024;
  cfg.maxOutputBytes = cfg.maxOutputMb * 1024 * 1024;
  if (!cfg.oidcJwksUrl && cfg.oidcIssuer) {
    cfg.oidcJwksUrl = `${cfg.oidcIssuer.replace(/\/$/, '')}/protocol/openid-connect/certs`;
  }
  return cfg;
}

/** Lista de problemas de configuração que impedem o serviço de subir com segurança. */
function validate(cfg) {
  const problems = [];
  if (!['oidc', 'dev'].includes(cfg.authMode)) problems.push('AUTH_MODE deve ser "oidc" ou "dev".');
  if (cfg.authMode === 'dev') {
    if (cfg.nodeEnv === 'production') problems.push('AUTH_MODE=dev não é permitido com NODE_ENV=production.');
    if (!cfg.authDevUser) problems.push('AUTH_MODE=dev exige AUTH_DEV_USER.');
  }
  if (cfg.authMode === 'oidc') {
    if (!cfg.oidcIssuer) problems.push('OIDC_ISSUER é obrigatório com AUTH_MODE=oidc.');
    if (!cfg.oidcAudience) problems.push('OIDC_AUDIENCE é obrigatório com AUTH_MODE=oidc.');
  }
  return problems;
}

module.exports = { load, validate };
