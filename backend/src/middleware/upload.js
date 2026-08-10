'use strict';

const multer = require('multer');
const config = require('../config');

/* Arquivos ficam em memória (nunca no disco do servidor) e são descartados junto com a
   requisição — nada do usuário persiste depois da resposta. Os limites vêm do .env;
   estourá-los vira 413 no errorHandler. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: config.maxFiles,
  },
});

/** Um arquivo obrigatório no campo `file`. */
const singleFile = upload.single('file');

/** Um ou mais arquivos no campo `files`. */
const multipleFiles = upload.array('files', config.maxFiles);

module.exports = { singleFile, multipleFiles };
