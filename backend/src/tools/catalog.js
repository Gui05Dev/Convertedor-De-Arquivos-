'use strict';

/* Catálogo das ferramentas do backend: o que cada uma aceita (tipo REAL do arquivo),
   quais opções valida, qual motor usa e como nomeia o resultado.

   A tela consulta GET /api/tools e só mostra o que está aqui E com o motor
   disponível neste servidor — nada é anunciado sem existir de fato. */

const fs = require('fs/promises');
const path = require('path');
const { ValidationError } = require('../lib/errors');
const { runInWorker } = require('../engines/runInWorker');
const external = require('../engines/external');
const { formatBytes } = require('../lib/format');

const MIME = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const IMAGE_TYPES = ['jpeg', 'png', 'webp'];
const IMAGE_TARGETS = { jpg: 'jpeg', png: 'png', webp: 'webp' };

function workerLimits(cfg) {
  return { maxPdfPages: cfg.maxPdfPages, maxImagePixels: cfg.maxImagePixels };
}

function inWorker(op, ctx, extra = {}) {
  return runInWorker(op, {
    inputs: ctx.inputs, outputDir: ctx.paths.output, options: ctx.job.options,
    limits: workerLimits(ctx.cfg), ...extra,
  }, { timeoutMs: ctx.remainingMs(), maxHeapMb: ctx.cfg.workerMaxHeapMb, signal: ctx.signal });
}

function signatureWarning(signed) {
  return signed ? ' Atenção: o PDF original tinha assinatura digital, que não vale no arquivo gerado.' : '';
}

function choice(value, allowed, fallback, message) {
  const v = String(value ?? '').trim().toLowerCase() || fallback;
  if (!allowed.includes(v)) throw new ValidationError(message);
  return v;
}

function text(value, max = 200) {
  const v = String(value ?? '').trim();
  if (v.length > max) throw new ValidationError('Valor informado longo demais.');
  return v;
}

const TOOLS = {
  merge: {
    accepts: ['pdf'], minFiles: 2, engine: 'worker',
    parseOptions: () => ({}),
    async run(ctx) {
      ctx.setStage('Juntando os PDFs');
      const r = await inWorker('merge', ctx);
      return { file: r.output.file, ext: 'pdf', suffix: 'unido', info: `${r.pageCount} página(s) no documento final.` };
    },
  },

  split: {
    accepts: ['pdf'], minFiles: 1, maxFiles: 1, engine: 'worker',
    parseOptions(body) {
      const mode = choice(body.mode, ['range', 'pages'], 'range', 'Modo de divisão inválido.');
      const range = text(body.range);
      if (mode === 'range' && !range) throw new ValidationError('Informe o intervalo de páginas antes de processar.');
      return { mode, range };
    },
    async run(ctx) {
      ctx.setStage('Separando as páginas');
      const r = await inWorker('split', ctx);
      if (r.fileCount) {
        return { file: r.output.file, ext: 'zip', suffix: 'paginas', info: `${r.fileCount} arquivo(s) PDF, um por página, dentro do ZIP.` };
      }
      return { file: r.output.file, ext: 'pdf', suffix: 'paginas', info: `${r.pageCount} página(s) extraída(s).` };
    },
  },

  rotate: {
    accepts: ['pdf'], minFiles: 1, maxFiles: 1, engine: 'worker',
    parseOptions: (body) => ({ angle: choice(body.angle, ['90', '180', '270'], '90', 'Ângulo inválido. Use 90, 180 ou 270 graus.') }),
    async run(ctx) {
      ctx.setStage('Girando as páginas');
      const r = await inWorker('rotate', ctx);
      return { file: r.output.file, ext: 'pdf', suffix: 'girado' };
    },
  },

  'remove-pages': {
    accepts: ['pdf'], minFiles: 1, maxFiles: 1, engine: 'worker',
    parseOptions(body) {
      const pages = text(body.pages);
      if (!pages) throw new ValidationError('Informe as páginas a remover antes de processar.');
      return { pages };
    },
    async run(ctx) {
      ctx.setStage('Removendo as páginas');
      const r = await inWorker('removePages', ctx);
      return { file: r.output.file, ext: 'pdf', suffix: 'sem-paginas', info: `${r.removed} página(s) removida(s).` };
    },
  },

  compress: {
    accepts: ['pdf'], minFiles: 1, maxFiles: 1, engine: 'ghostscript',
    parseOptions: (body) => ({
      level: choice(body.level, Object.keys(external.COMPRESSION_LEVELS), 'recomendada', 'Nível de compressão inválido.'),
    }),
    async run(ctx) {
      ctx.setStage('Verificando o PDF');
      const inspected = await inWorker('inspectPdf', ctx);

      ctx.setStage('Comprimindo imagens e fontes');
      const original = ctx.inputs[0].size;
      const gsOut = path.join(ctx.paths.output, 'result.pdf');
      const { size, profile } = await external.compressPdf({
        inputPath: ctx.inputs[0].path, workDir: ctx.paths.work, outputPath: gsOut,
        level: ctx.job.options.level, cfg: ctx.cfg, signal: ctx.signal,
      });

      if (size < original) {
        const saved = original - size;
        const pct = Math.round((saved / original) * 100);
        return {
          file: 'result.pdf', ext: 'pdf', suffix: 'comprimido',
          info: `Compressão ${profile.label}: ${formatBytes(original)} → ${formatBytes(size)} (${pct}% menor).${signatureWarning(inspected.signed)}`,
        };
      }

      // O Ghostscript não reduziu (PDF já otimizado, só texto). Não entregamos um
      // arquivo MAIOR dizendo que comprimiu: devolvemos o original sem metadados.
      ctx.setStage('Otimizando a estrutura');
      await fs.rm(gsOut, { force: true });
      const r = await inWorker('stripMetadata', ctx);
      const finalSize = r.output.size;
      const message = finalSize < original
        ? `O PDF já estava bem otimizado. Só foi possível reduzir ${formatBytes(original - finalSize)} removendo metadados.`
        : 'O PDF já estava otimizado — não foi possível reduzir o tamanho.';
      return { file: r.output.file, ext: 'pdf', suffix: 'comprimido', info: message + signatureWarning(inspected.signed) };
    },
  },

  'images-to-pdf': {
    accepts: IMAGE_TYPES, minFiles: 1, engine: 'worker',
    parseOptions: () => ({}),
    async run(ctx) {
      ctx.setStage('Montando o PDF');
      const r = await inWorker('imagesToPdf', ctx);
      return { file: r.output.file, ext: 'pdf', suffix: 'imagens', info: `${r.pageCount} página(s), uma por imagem.` };
    },
  },

  'convert-image': {
    accepts: IMAGE_TYPES, minFiles: 1, engine: 'worker',
    targets: Object.keys(IMAGE_TARGETS),
    parseOptions(body) {
      const target = choice(body.target, Object.keys(IMAGE_TARGETS), '', 'Escolha o formato de destino: JPG, PNG ou WebP.');
      const quality = body.quality === undefined || body.quality === '' ? 85 : parseInt(body.quality, 10);
      if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new ValidationError('Qualidade deve ser um número de 1 a 100.');
      return { target, quality };
    },
    validateInputs(inputs, options) {
      if (inputs.length === 1 && inputs[0].type === IMAGE_TARGETS[options.target]) {
        throw new ValidationError(`A imagem já está em ${options.target.toUpperCase()}. Escolha outro formato de destino.`);
      }
    },
    async run(ctx) {
      ctx.setStage(`Convertendo para ${ctx.job.options.target.toUpperCase()}`);
      const names = uniqueNames(ctx.job.originalNames.map((n) => baseName(n)));
      const r = await inWorker('convertImages', ctx, { options: { ...ctx.job.options, names } });
      if (r.fileCount) {
        return { file: r.output.file, ext: 'zip', suffix: ctx.job.options.target, info: `${r.fileCount} imagens convertidas, dentro do ZIP.` };
      }
      return { file: r.output.file, ext: ctx.job.options.target, suffix: null };
    },
  },

  'word-to-pdf': {
    accepts: ['docx'], minFiles: 1, maxFiles: 1, engine: 'libreoffice',
    parseOptions: () => ({}),
    async run(ctx) {
      ctx.setStage('Convertendo com LibreOffice');
      await external.officeToPdf({
        inputPath: ctx.inputs[0].path, workDir: ctx.paths.work,
        outputPath: path.join(ctx.paths.output, 'result.pdf'), cfg: ctx.cfg, signal: ctx.signal,
      });
      return { file: 'result.pdf', ext: 'pdf', suffix: null };
    },
  },

  'pptx-to-pdf': {
    accepts: ['pptx'], minFiles: 1, maxFiles: 1, engine: 'libreoffice',
    parseOptions: () => ({}),
    async run(ctx) {
      ctx.setStage('Convertendo com LibreOffice');
      await external.officeToPdf({
        inputPath: ctx.inputs[0].path, workDir: ctx.paths.work,
        outputPath: path.join(ctx.paths.output, 'result.pdf'), cfg: ctx.cfg, signal: ctx.signal,
      });
      return { file: 'result.pdf', ext: 'pdf', suffix: null };
    },
  },

  'pdf-to-docx': {
    accepts: ['pdf'], minFiles: 1, maxFiles: 1, engine: 'pdf2docx', beta: true,
    parseOptions: () => ({}),
    async run(ctx) {
      ctx.setStage('Verificando o PDF');
      const inspected = await inWorker('inspectPdf', ctx);
      ctx.setStage('Reconstruindo o texto em Word');
      await external.pdfToDocx({
        inputPath: ctx.inputs[0].path, workDir: ctx.paths.work,
        outputPath: path.join(ctx.paths.output, 'result.docx'), cfg: ctx.cfg, signal: ctx.signal,
      });
      return {
        file: 'result.docx', ext: 'docx', suffix: null,
        info: `${inspected.pageCount} página(s) convertida(s). Confira o layout: tabelas e colunas complexas podem precisar de ajuste.`,
      };
    },
  },
};

/* ── Nomes de arquivo ──
   O nome original só é usado pra montar o nome do download, já sanitizado: sem
   separadores de caminho, caracteres de controle ou reservados, tamanho limitado. */

function baseName(original) {
  const noExt = String(original || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const clean = noExt
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  return clean || 'arquivo';
}

function uniqueNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count ? `${name} (${count + 1})` : name;
  });
}

function outputName(originalNames, { ext, suffix }) {
  const base = baseName(originalNames[0]);
  return `${base}${suffix ? `-${suffix}` : ''}.${ext}`;
}

module.exports = { TOOLS, MIME, IMAGE_TYPES, baseName, uniqueNames, outputName };
