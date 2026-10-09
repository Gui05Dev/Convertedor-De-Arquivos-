'use strict';

const config = require('./config');
const { createLogger } = require('./lib/logger');
const { createApp } = require('./app');
const { startJanitor, sweep } = require('./jobs/janitor');

async function main() {
  const cfg = config.load();
  const logger = createLogger({ level: cfg.logLevel });

  const problems = config.validate(cfg);
  if (problems.length) {
    for (const problem of problems) logger.error('config.invalid', { problem });
    process.exit(78); // EX_CONFIG
  }

  const { app, store, queue, engines } = await createApp(cfg, { logger });
  await sweep({ store, queue, logger });
  const stopJanitor = startJanitor({ store, queue, logger, intervalSeconds: cfg.cleanupIntervalSeconds });

  logger.info('startup', {
    port: cfg.port, env: cfg.nodeEnv, auth: cfg.authMode,
    engines: { libreoffice: engines.libreoffice, ghostscript: engines.ghostscript, pdf2docx: engines.pdf2docx, prlimit: Boolean(engines.prlimitPath) },
    retention: { originalMinutes: cfg.originalRetentionMinutes, resultMinutes: cfg.resultRetentionMinutes },
  });
  if (!engines.prlimitPath) logger.warn('startup.no_prlimit', { detail: 'limite de tamanho de saída dos conversores desativado' });

  const server = app.listen(cfg.port);
  // Uploads grandes em rede lenta: não derrubar antes do limite do nginx.
  server.requestTimeout = cfg.jobTimeoutMs + 60_000;
  server.headersTimeout = 60_000;

  function shutdown(signal) {
    logger.info('shutdown', { signal });
    stopJanitor();
    server.close(() => process.exit(0));
    // Trabalhos em andamento são marcados como interrompidos no próximo boot.
    setTimeout(() => process.exit(0), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  process.stderr.write(`Falha ao iniciar: ${err?.message}\n`);
  process.exit(1);
});
