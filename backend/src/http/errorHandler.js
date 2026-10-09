'use strict';

const multer = require('multer');
const { HttpError } = require('../lib/errors');

function createErrorHandler(cfg, logger) {
  const MULTER_MESSAGES = {
    LIMIT_FILE_SIZE: [413, `Arquivo excede o limite de ${cfg.maxFileSizeMb} MB permitido pelo servidor.`],
    LIMIT_FILE_COUNT: [400, `Envie no máximo ${cfg.maxFiles} arquivos por vez.`],
    LIMIT_UNEXPECTED_FILE: [400, 'Campo de arquivo inesperado na requisição. Use o campo "files".'],
    LIMIT_FIELD_VALUE: [400, 'Valor de opção longo demais.'],
    LIMIT_FIELD_COUNT: [400, 'Campos demais na requisição.'],
    LIMIT_PART_COUNT: [400, 'Partes demais na requisição.'],
  };

  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    if (err instanceof multer.MulterError) {
      const [status, message] = MULTER_MESSAGES[err.code] || [400, 'Não foi possível receber o arquivo enviado.'];
      logger.warn('upload.rejected', { code: err.code, user: req.user?.id });
      return res.status(status).json({ error: message, code: err.code.toLowerCase() });
    }
    if (err instanceof HttpError && err.expose) {
      if (err.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    // Corpo malformado (multipart quebrado, JSON inválido).
    if (err?.type === 'entity.parse.failed' || err?.status === 400) {
      return res.status(400).json({ error: 'Requisição malformada.', code: 'bad_request' });
    }
    logger.error('http.unhandled', { method: req.method, route: req.route?.path, error: { name: err?.name, code: err?.code } });
    return res.status(500).json({ error: 'Erro inesperado no servidor. Tente novamente.', code: 'internal_error' });
  };
}

module.exports = { createErrorHandler };
