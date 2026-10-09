'use strict';

/* Entrada do worker thread que roda pdf-lib e sharp.

   Cada trabalho sobe um worker novo e descartável: um PDF malformado que estoure
   memória ou entre em laço mata só o worker (resourceLimits / terminate), não a API.
   O worker só lê os arquivos de entrada e grava em outputDir — caminhos internos
   decididos pela aplicação. */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs/promises');
const path = require('path');
const pdfTools = require('./pdfTools');
const imageTools = require('./imageTools');
const { createZip } = require('../lib/zip');

async function readAll(inputs) {
  return Promise.all(inputs.map((input) => fs.readFile(input.path)));
}

async function writeOutput(outputDir, name, buffer) {
  const target = path.join(outputDir, name);
  await fs.writeFile(target, buffer, { flag: 'wx' });
  return { file: name, size: buffer.length };
}

const OPS = {
  async merge({ inputs, outputDir, limits }) {
    const result = await pdfTools.mergePdfs(await readAll(inputs), { maxPages: limits.maxPdfPages });
    return { output: await writeOutput(outputDir, 'result.pdf', result.buffer), pageCount: result.pageCount };
  },

  async split({ inputs, outputDir, options, limits }) {
    const [buffer] = await readAll(inputs);
    const result = await pdfTools.splitPdf(buffer, { ...options, maxPages: limits.maxPdfPages });
    if (result.parts) {
      const width = String(result.total).length;
      const zip = createZip(result.parts.map((part) => ({
        name: `pagina-${String(part.page).padStart(width, '0')}.pdf`,
        data: part.buffer,
      })));
      return { output: await writeOutput(outputDir, 'result.zip', zip), fileCount: result.parts.length };
    }
    return { output: await writeOutput(outputDir, 'result.pdf', result.buffer), pageCount: result.pageCount };
  },

  async rotate({ inputs, outputDir, options, limits }) {
    const [buffer] = await readAll(inputs);
    const result = await pdfTools.rotatePdf(buffer, { ...options, maxPages: limits.maxPdfPages });
    return { output: await writeOutput(outputDir, 'result.pdf', result.buffer) };
  },

  async removePages({ inputs, outputDir, options, limits }) {
    const [buffer] = await readAll(inputs);
    const result = await pdfTools.removePages(buffer, { ...options, maxPages: limits.maxPdfPages });
    return { output: await writeOutput(outputDir, 'result.pdf', result.buffer), removed: result.removed };
  },

  async inspectPdf({ inputs, limits }) {
    const [buffer] = await readAll(inputs);
    return pdfTools.inspectPdf(buffer, { maxPages: limits.maxPdfPages });
  },

  async stripMetadata({ inputs, outputDir, limits }) {
    const [buffer] = await readAll(inputs);
    const result = await pdfTools.stripMetadata(buffer, { maxPages: limits.maxPdfPages });
    return { output: await writeOutput(outputDir, 'result.pdf', result.buffer) };
  },

  async imagesToPdf({ inputs, outputDir, limits }) {
    const images = [];
    for (let i = 0; i < inputs.length; i++) {
      const buffer = await fs.readFile(inputs[i].path);
      images.push(await imageTools.normalizeForPdf(buffer, {
        sourceType: inputs[i].type, maxPixels: limits.maxImagePixels, label: `a imagem ${i + 1}`,
      }));
    }
    const result = await pdfTools.imagesToPdf(images);
    return { output: await writeOutput(outputDir, 'result.pdf', result.buffer), pageCount: result.pageCount };
  },

  async convertImages({ inputs, outputDir, options, limits }) {
    const converted = [];
    for (let i = 0; i < inputs.length; i++) {
      const buffer = await fs.readFile(inputs[i].path);
      converted.push(await imageTools.convertImage(buffer, {
        target: options.target, quality: options.quality,
        maxPixels: limits.maxImagePixels, label: inputs.length > 1 ? `a imagem ${i + 1}` : 'a imagem',
      }));
    }
    if (converted.length === 1) {
      return { output: await writeOutput(outputDir, `result.${converted[0].ext}`, converted[0].buffer) };
    }
    // Vários arquivos: os nomes dentro do ZIP vêm do nome original já sanitizado.
    const zip = createZip(converted.map((item, i) => ({
      name: `${options.names?.[i] || `imagem-${i + 1}`}.${item.ext}`,
      data: item.buffer,
    })));
    return { output: await writeOutput(outputDir, 'result.zip', zip), fileCount: converted.length };
  },
};

(async () => {
  const { op } = workerData;
  try {
    if (!OPS[op]) throw new Error(`operação desconhecida: ${op}`);
    const result = await OPS[op](workerData);
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    parentPort.postMessage({
      ok: false,
      error: {
        name: err?.name, message: err?.message, code: err?.code,
        status: err?.status, expose: Boolean(err?.expose),
      },
    });
  }
})();
