'use strict';

/* Recebimento de arquivos. Vão direto para DATA_DIR/incoming com nome aleatório gerado
   pelo multer (nunca o nome enviado pelo usuário) e saem dali ou para o diretório do
   trabalho, ou para o lixo — inclusive em erro (ver discardUploads). */

const fs = require('fs/promises');
const multer = require('multer');

function createUpload(cfg, incomingDir) {
  return multer({
    dest: incomingDir,
    // Navegadores mandam o nome do arquivo em UTF-8 cru; o default (latin1) estragaria
    // acentos ("Relatório" -> "RelatÃ³rio").
    defParamCharset: 'utf8',
    limits: {
      fileSize: cfg.maxFileSizeBytes,
      files: cfg.maxFiles,
      fields: 20,
      fieldSize: 4 * 1024,
      parts: cfg.maxFiles + 20,
    },
  }).array('files', cfg.maxFiles);
}

async function discardUploads(req) {
  await Promise.all((req.files || []).map((f) => fs.rm(f.path, { force: true }).catch(() => {})));
}

module.exports = { createUpload, discardUploads };
