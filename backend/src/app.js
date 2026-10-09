'use strict';

const express = require('express');
const { JobStore } = require('./jobs/store');
const { JobQueue } = require('./jobs/queue');
const { createAuth } = require('./auth');
const { createRouter } = require('./http/routes');
const { createErrorHandler } = require('./http/errorHandler');
const { detectEngines } = require('./engines/availability');

/**
 * Monta a aplicação sem abrir porta — usado pelo index.js e pelos testes.
 * @param {object} cfg       saída de config.load()
 * @param {object} deps      { logger, engines?, jwks? } — testes injetam engines/jwks
 */
async function createApp(cfg, { logger, engines, jwks } = {}) {
  const store = new JobStore({ dataDir: cfg.dataDir, logger });
  await store.init();

  const detected = engines || await detectEngines(cfg);
  const queue = new JobQueue({ store, cfg, engines: detected, logger });
  const auth = createAuth(cfg, { logger, jwks });

  const app = express();
  app.disable('x-powered-by');
  // Só o nginx fala com o backend (rede interna); req.ip vem do X-Forwarded-For dele.
  app.set('trust proxy', 'loopback, uniquelocal');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', createRouter({ cfg, store, queue, engines: detected, auth, logger }));
  app.use((req, res) => res.status(404).json({ error: 'Endpoint não encontrado.', code: 'not_found' }));
  app.use(createErrorHandler(cfg, logger));

  return { app, store, queue, engines: detected, auth };
}

module.exports = { createApp };
