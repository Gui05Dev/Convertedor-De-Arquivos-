'use strict';

const path = require('path');
const express = require('express');
const convertRoute = require('./routes/convert');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;

// Raiz do site estático (Index.html, script.js, style.css, img/) fica dois níveis acima deste
// arquivo, no mesmo diretório que server/ — por isso NÃO servimos STATIC_ROOT inteiro: isso
// exporia o código-fonte do backend via HTTP. Liberamos só os arquivos do site, um por um.
const STATIC_ROOT = path.join(__dirname, '..', '..');
const INDEX_FILE = path.join(STATIC_ROOT, 'Index.html'); // I maiúsculo: filesystem do Docker é case-sensitive

app.use('/img', express.static(path.join(STATIC_ROOT, 'img')));
app.get(['/', '/Index.html'], (req, res) => res.sendFile(INDEX_FILE));
app.get('/style.css', (req, res) => res.sendFile(path.join(STATIC_ROOT, 'style.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(STATIC_ROOT, 'script.js')));

app.use('/api', convertRoute);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Copacol PDF Tools rodando na porta ${PORT}`);
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
