'use strict';

/* Único ponto do backend que lê process.env. Qualquer credencial ou parâmetro novo
   entra aqui (e no .env.example) — nenhum outro módulo deve tocar em process.env,
   pra ficar óbvio o que o serviço precisa pra rodar. */

require('dotenv').config();

function int(name, fallback) {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: int('PORT', 3000),

  /* Limite por arquivo. O frontend valida o mesmo número antes do upload, mas quem
     manda é este — o front é só conveniência, o servidor é o controle de verdade. */
  maxFileSizeMb: int('MAX_FILE_SIZE_MB', 100),
  maxFiles: int('MAX_FILES', 20),

  convertTimeoutMs: int('CONVERT_TIMEOUT_MS', 90_000),
  maxConcurrentConversions: int('MAX_CONCURRENT_CONVERSIONS', 2),

  libreofficeBin: process.env.LIBREOFFICE_BIN || 'soffice',
  pythonBin: process.env.PYTHON_BIN || 'python3',

  /* Vazio = sem CORS. O deploy padrão põe o nginx do frontend na frente proxiando
     /api, então navegador e API ficam na mesma origem e CORS não é necessário.
     Preencha só se for expor o backend direto pra um frontend em outro domínio. */
  corsOrigin: process.env.CORS_ORIGIN || '',

  nodeEnv: process.env.NODE_ENV || 'development',
};

config.maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;

module.exports = config;
