'use strict';

const { ValidationError } = require('./errors');

/* Express 4 não captura rejeições de handler async — sem este wrapper, um erro dentro
   de `async (req, res) => ...` vira requisição pendurada em vez de resposta de erro. */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Devolve o arquivo processado como download.
 * `info` é uma mensagem opcional pra tela (ex.: quanto a compressão economizou):
 * vai num header porque o corpo já é o binário. Header HTTP só aceita ASCII, então
 * codificamos — o frontend faz decodeURIComponent.
 */
function sendFile(res, { buffer, filename, contentType, info }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  if (info) res.setHeader('X-Result-Info', encodeURIComponent(info));
  res.send(buffer);
}

/** Extensão do arquivo enviado, minúscula e sem ponto ('' se não tiver). */
function extensionOf(originalname) {
  const match = /\.([A-Za-z0-9]+)$/.exec(originalname || '');
  return match ? match[1].toLowerCase() : '';
}

/** Garante que veio exatamente um arquivo em `file`, com uma das extensões aceitas. */
function requireFile(req, allowedExtensions) {
  const file = req.file;
  if (!file || !file.buffer?.length) {
    throw new ValidationError('Nenhum arquivo válido foi enviado.');
  }
  if (allowedExtensions && !allowedExtensions.includes(extensionOf(file.originalname))) {
    throw new ValidationError(`Tipo de arquivo não suportado. Envie um arquivo ${allowedExtensions.join(' ou ')}.`);
  }
  return file;
}

/** Garante que veio pelo menos `min` arquivos em `files`, todos com extensão aceita. */
function requireFiles(req, allowedExtensions, min = 1) {
  const files = (req.files || []).filter((file) => file.buffer?.length);
  if (files.length < min) {
    throw new ValidationError(`Envie pelo menos ${min} arquivo(s) válido(s).`);
  }
  if (allowedExtensions) {
    for (const file of files) {
      if (!allowedExtensions.includes(extensionOf(file.originalname))) {
        throw new ValidationError(`Tipo de arquivo não suportado: ${file.originalname}.`);
      }
    }
  }
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = { asyncHandler, sendFile, extensionOf, requireFile, requireFiles, formatBytes };
