'use strict';

/* Imagens com sharp (Apache-2.0, sobre libvips LGPL-3.0-or-later). Roda no worker.

   - limitInputPixels barra "bombas de descompressão" (PNG pequeno que expande para
     gigapixels) antes de alocar memória.
   - .rotate() sem argumento aplica a orientação EXIF (foto de celular deitada).
   - Metadados (EXIF com GPS, modelo do aparelho, etc.) são descartados por padrão no
     sharp; não chamamos withMetadata() de propósito. */

const sharp = require('sharp');
const { ValidationError, ConversionError } = require('../lib/errors');

// Cache e concorrência do libvips contidos: o paralelismo vem da fila de trabalhos.
sharp.cache(false);
sharp.concurrency(1);

const OUTPUT_FORMATS = {
  jpg: { sharpFormat: 'jpeg', ext: 'jpg', mime: 'image/jpeg' },
  png: { sharpFormat: 'png', ext: 'png', mime: 'image/png' },
  webp: { sharpFormat: 'webp', ext: 'webp', mime: 'image/webp' },
};

function translate(err, label) {
  const message = String(err?.message || '');
  if (/pixel limit/i.test(message)) {
    return new ValidationError(`${label} tem resolução grande demais para ser processada.`, 'image_too_large');
  }
  return new ConversionError(`Não foi possível ler ${label}. Verifique se o arquivo não está corrompido.`, 'image_unreadable');
}

/**
 * Converte uma imagem para jpg/png/webp.
 * @param {Buffer} buffer
 * @param {{ target: 'jpg'|'png'|'webp', quality?: number, maxPixels: number, label: string }} opts
 */
async function convertImage(buffer, { target, quality = 85, maxPixels, label = 'a imagem' }) {
  const out = OUTPUT_FORMATS[target];
  if (!out) throw new ValidationError('Formato de destino não suportado.');
  const q = Math.min(100, Math.max(1, parseInt(quality, 10) || 85));
  try {
    let pipeline = sharp(buffer, { limitInputPixels: maxPixels, failOn: 'error', animated: false }).rotate();
    if (out.sharpFormat === 'jpeg') {
      // JPEG não tem transparência: fundo branco em vez de preto.
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true });
    } else if (out.sharpFormat === 'webp') {
      pipeline = pipeline.webp({ quality: q });
    } else {
      pipeline = pipeline.png({ compressionLevel: 9 });
    }
    return { buffer: await pipeline.toBuffer(), ext: out.ext, mime: out.mime };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw translate(err, label);
  }
}

/**
 * Prepara uma imagem pra entrar no PDF: JPEG continua JPEG (sem recomprimir, só
 * corrigindo orientação quando preciso); o resto vira PNG sem perda.
 */
async function normalizeForPdf(buffer, { sourceType, maxPixels, label = 'a imagem' }) {
  try {
    const image = sharp(buffer, { limitInputPixels: maxPixels, failOn: 'error', animated: false });
    const meta = await image.metadata();
    const needsRotation = meta.orientation && meta.orientation !== 1;
    if (sourceType === 'jpeg' && !needsRotation && meta.space !== 'cmyk') {
      return { buffer, format: 'jpeg' };
    }
    if (sourceType === 'jpeg') {
      return { buffer: await image.rotate().toColourspace('srgb').jpeg({ quality: 92 }).toBuffer(), format: 'jpeg' };
    }
    return { buffer: await image.rotate().png().toBuffer(), format: 'png' };
  } catch (err) {
    throw translate(err, label);
  }
}

module.exports = { convertImage, normalizeForPdf, OUTPUT_FORMATS };
