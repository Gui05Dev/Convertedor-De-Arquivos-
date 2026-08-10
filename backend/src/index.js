'use strict';

const express = require('express');
const config = require('./config');
const convertRoute = require('./routes/convert');
const pdfRoute = require('./routes/pdf');
const errorHandler = require('./middleware/errorHandler');
const { HttpError } = require('./lib/errors');

/* API pura: este serviço não entrega mais HTML/CSS/JS. O frontend é um projeto
   separado (../frontend), servido pelo nginx, que proxia /api pra cá. Assim o
   backend pode ficar em rede privada e nada de config/credencial chega ao navegador. */

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // fica atrás do nginx do frontend

/* Sem CORS no deploy padrão: nginx proxia /api, então navegador e API compartilham a
   origem. Só habilita se CORS_ORIGIN estiver preenchido no .env (backend exposto direto). */
if (config.corsOrigin) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Result-Info');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

/* Limites que a tela precisa conhecer pra avisar o usuário antes do upload. Só valores
   públicos — a validação de verdade acontece no servidor de qualquer forma. */
app.get('/api/config', (req, res) => {
  res.json({ maxFileSizeMb: config.maxFileSizeMb, maxFiles: config.maxFiles });
});

app.use('/api/pdf', pdfRoute);
app.use('/api/convert', convertRoute);

app.use('/api', (req, res, next) => next(new HttpError('Endpoint não encontrado.', 404)));
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`API do Copacol PDF Tools ouvindo na porta ${config.port} (${config.nodeEnv})`);
});

// Dá tempo de conversões em andamento terminarem antes do processo morrer
// (docker stop manda SIGTERM; sem isso o Node encerra na hora e derruba requisições).
function shutdown(signal) {
  console.log(`${signal} recebido, encerrando graciosamente...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
