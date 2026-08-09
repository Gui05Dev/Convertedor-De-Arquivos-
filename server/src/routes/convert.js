'use strict';

const path = require('path');
const { Router } = require('express');
const multer = require('multer');
const { convertBuffer } = require('../lib/libreoffice');
const { convertPdfToDocx } = require('../lib/pdf2docx');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10) * 1024 * 1024;

// Cada conversão sobe um processo LibreOffice/pdf2docx pesado de CPU/RAM; sem limite,
// poucas conversões grandes simultâneas esgotam os recursos do container (ver docker-compose.yml).
const MAX_CONCURRENT_CONVERSIONS = parseInt(process.env.MAX_CONCURRENT_CONVERSIONS || '2', 10);
let activeConversions = 0;

/* Pares source->target permitidos — único controle de segurança sobre o que pode ser tentado.
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const router = Router();

router.post('/convert', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ error: 'Nenhum arquivo válido foi enviado.' });
    }

    const target = String(req.body.target || '').toLowerCase();
    const sourceExt = path.extname(req.file.originalname || '').replace('.', '').toLowerCase();

    if (!sourceExt || !target) {
      return res.status(400).json({ error: 'Arquivo ou tipo de conversão ausente.' });
    }
    const pairKey = `${sourceExt}->${target}`;
    if (!ALLOWED_CONVERSIONS.has(pairKey)) {
      return res.status(400).json({ error: 'Este tipo de conversão não é suportado.' });
    }

    if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
      return res.status(503).json({ error: 'Servidor ocupado processando outras conversões. Tente novamente em instantes.' });
    }

    activeConversions++;
    let outputBuffer;
    try {
      outputBuffer = pairKey === 'pdf->docx'
        ? await convertPdfToDocx(req.file.buffer)
        : await convertBuffer(req.file.buffer, sourceExt, target);
    } finally {
      activeConversions--;
    }

    res.setHeader('Content-Type', MIME_TYPES[target] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="copacol-convertido.${target}"`);
    res.send(outputBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
