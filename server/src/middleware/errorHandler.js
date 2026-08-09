'use strict';

const multer = require('multer');
const { ConversionError } = require('../lib/errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo excede o limite permitido pelo servidor.' });
  }
  if (err instanceof ConversionError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro inesperado no servidor. Tente novamente.' });
}

module.exports = errorHandler;
