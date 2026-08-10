'use strict';

const multer = require('multer');
const config = require('../config');
const { HttpError } = require('../lib/errors');

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Arquivo excede o limite de ${config.maxFileSizeMb} MB permitido pelo servidor.`,
  LIMIT_FILE_COUNT: `Envie no máximo ${config.maxFiles} arquivos por vez.`,
  LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado na requisição.',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message = MULTER_MESSAGES[err.code] || 'Não foi possível receber o arquivo enviado.';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message });
  }

  if (err instanceof HttpError && err.expose) {
    return res.status(err.status).json({ error: err.message });
  }

  // Só o que chega aqui é inesperado — registra o detalhe e devolve mensagem genérica,
  // pra não vazar caminho de arquivo ou stack pro cliente.
  console.error('[erro nao tratado]', err);
  res.status(500).json({ error: 'Erro inesperado no servidor. Tente novamente.' });
}

module.exports = errorHandler;
