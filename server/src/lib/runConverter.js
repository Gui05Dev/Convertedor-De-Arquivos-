'use strict';

const { execFile } = require('child_process');
const fs = require('fs/promises');
const { ConversionError } = require('./errors');

const CONVERT_TIMEOUT_MS = parseInt(process.env.CONVERT_TIMEOUT_MS || '90000', 10);

/**
 * Roda um binário de conversão (soffice, python3) e lê o arquivo de saída resultante.
 * Padrão comum aos motores de conversão: timeout mata o processo e vira 504,
 * qualquer outra falha vira 422, e saída ausente/vazia também vira 422 — o motor
 * às vezes sai com código 0 sem ter produzido nada de fato.
 */
async function runConverterAndReadOutput(bin, args, outputPath, { failMessage } = {}) {
  await new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: CONVERT_TIMEOUT_MS, killSignal: 'SIGKILL' }, (err) => {
      if (err) {
        if (err.killed || err.signal === 'SIGKILL') {
          return reject(new ConversionError('A conversão demorou demais e foi cancelada. Tente um arquivo menor.', 504));
        }
        return reject(new ConversionError(
          failMessage || 'Não foi possível converter este arquivo. Verifique se ele não está corrompido.',
          422
        ));
      }
      resolve();
    });
  });

  let outputBuffer;
  try {
    outputBuffer = await fs.readFile(outputPath);
  } catch {
    throw new ConversionError('Não foi possível converter este arquivo. Verifique se ele não está corrompido ou tente outro arquivo.', 422);
  }
  if (!outputBuffer.length) {
    throw new ConversionError('A conversão gerou um arquivo vazio. Verifique se o arquivo de origem é válido.', 422);
  }
  return outputBuffer;
}

module.exports = { runConverterAndReadOutput };
