'use strict';

const { Router } = require('express');
const config = require('../config');
const { singleFile } = require('../middleware/upload');
const { limitConcurrency } = require('../middleware/concurrency');
const { convertBuffer } = require('../lib/libreoffice');
const { convertPdfToDocx } = require('../lib/pdf2docx');
const { asyncHandler, sendFile, extensionOf, requireFile } = require('../lib/http');
const { ValidationError } = require('../lib/errors');

/* Conversões entre formatos de Office, que dependem de processos externos
   (LibreOffice headless e pdf2docx). Separadas de /pdf porque são muito mais caras
   e por isso passam pelo limitador de concorrência. */

/* Pares source->target permitidos — único controle sobre o que pode ser tentado.
   pdf->pptx e pdf->xlsx ficam de fora: o LibreOffice abre PDF como Draw (sem filtro de
   exportação p/ PPTX/XLSX) e não há biblioteca open-source confiável equivalente ao
   pdf2docx para essas duas direções. */
const ALLOWED_CONVERSIONS = new Set([
  'pdf->docx',  // via pdf2docx (Python) — LibreOffice sozinho não converte PDF->DOCX
  'docx->pdf',  // via LibreOffice
  'pptx->pdf',  // via LibreOffice
]);

// Só docx/pdf aparecem como `target` hoje (ver ALLOWED_CONVERSIONS acima).
const MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const gate = limitConcurrency(
  config.maxConcurrentConversions,
  'Servidor ocupado processando outras conversões. Tente novamente em instantes.'
);

const router = Router();

router.post('/', gate, singleFile, asyncHandler(async (req, res) => {
  const file = requireFile(req);

  const target = String(req.body.target || '').toLowerCase();
  const source = extensionOf(file.originalname);
  if (!source || !target) {
    throw new ValidationError('Arquivo ou tipo de conversão ausente.');
  }

  const pair = `${source}->${target}`;
  if (!ALLOWED_CONVERSIONS.has(pair)) {
    throw new ValidationError('Este tipo de conversão não é suportado.');
  }

  const buffer = pair === 'pdf->docx'
    ? await convertPdfToDocx(file.buffer)
    : await convertBuffer(file.buffer, source, target);

  sendFile(res, {
    buffer,
    filename: `copacol-convertido.${target}`,
    contentType: MIME_TYPES[target] || 'application/octet-stream',
  });
}));

module.exports = router;
