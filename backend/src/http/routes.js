'use strict';

/* Rotas da API. Todas exigem usuário autenticado, exceto /api/health.

   GET    /api/health              liveness (sem autenticação, sem dados)
   GET    /api/me                  nome do usuário logado
   GET    /api/config              limites de upload e retenção
   GET    /api/tools               ferramentas disponíveis NESTE servidor
   POST   /api/jobs                cria um trabalho (multipart: tool, files[], opções)
   GET    /api/jobs                trabalhos do usuário (dentro da retenção)
   GET    /api/jobs/:id            estado de um trabalho do usuário
   GET    /api/jobs/:id/download   resultado (só o dono)
   DELETE /api/jobs/:id            cancela/apaga agora (só o dono) */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Router } = require('express');
const { TOOLS } = require('../tools/catalog');
const { sniffFile, TYPE_LABELS } = require('../lib/sniff');
const { ValidationError, HttpError, NotFoundError } = require('../lib/errors');
const { createUpload, discardUploads } = require('./upload');

const EXT_BY_TYPE = { pdf: 'pdf', jpeg: 'jpg', png: 'png', webp: 'webp', docx: 'docx', pptx: 'pptx' };

function publicJob(job, queue) {
  return {
    id: job.id,
    tool: job.tool,
    status: job.status,
    stage: job.status === 'queued' ? queueStage(job, queue) : job.stage,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    expiresAt: job.expiresAt,
    fileCount: job.inputs.length,
    result: job.result && { name: job.result.name, size: job.result.size, mime: job.result.mime, info: job.result.info },
    error: job.error && { code: job.error.code, message: job.error.message },
  };
}

function queueStage(job, queue) {
  const pos = queue.position(job.id);
  return pos && pos > 1 ? `Na fila (posição ${pos})` : 'Na fila';
}

function asciiFallback(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

function contentDisposition(name) {
  return `attachment; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/* O nome enviado pelo navegador chega em latin1 pelo busboy em alguns clientes;
   o multer 2 já decodifica UTF-8. Só garantimos string e tamanho. */
function originalNameOf(file) {
  return String(file.originalname || '').slice(0, 255);
}

function availableTools(engines, cfg) {
  return Object.entries(TOOLS)
    .filter(([, tool]) => engines[tool.engine])
    .map(([id, tool]) => ({
      id,
      accepts: tool.accepts,
      minFiles: tool.minFiles,
      maxFiles: tool.maxFiles || cfg.maxFiles,
      targets: tool.targets,
      beta: Boolean(tool.beta),
    }));
}

function createRouter({ cfg, store, queue, engines, auth, logger }) {
  const router = Router();
  const upload = createUpload(cfg, store.incomingDir);

  router.get('/health', (req, res) => res.json({ status: 'ok' }));

  router.use(auth.middleware);

  router.get('/me', (req, res) => {
    res.json({ username: req.user.username, name: req.user.name });
  });

  router.get('/config', (req, res) => {
    res.json({
      maxFileSizeMb: cfg.maxFileSizeMb,
      maxFiles: cfg.maxFiles,
      maxTotalUploadMb: cfg.maxTotalUploadMb,
      resultRetentionMinutes: cfg.resultRetentionMinutes,
    });
  });

  router.get('/tools', (req, res) => {
    res.json({ tools: availableTools(engines, cfg) });
  });

  router.post('/jobs', upload, async (req, res, next) => {
    let job = null;
    try {
      const toolId = String(req.body?.tool || '');
      const tool = Object.hasOwn(TOOLS, toolId) ? TOOLS[toolId] : null;
      if (!tool || !engines[tool.engine]) throw new ValidationError('Ferramenta indisponível.', 'unknown_tool');

      const files = (req.files || []);
      const maxFiles = tool.maxFiles || cfg.maxFiles;
      if (files.length < tool.minFiles) {
        throw new ValidationError(tool.minFiles > 1
          ? `Envie pelo menos ${tool.minFiles} arquivos.`
          : 'Nenhum arquivo foi enviado.', 'missing_file');
      }
      if (files.length > maxFiles) throw new ValidationError(`Esta ferramenta aceita no máximo ${maxFiles} arquivo(s).`, 'too_many_files');
      const total = files.reduce((sum, f) => sum + f.size, 0);
      if (total > cfg.maxTotalUploadBytes) {
        throw new HttpError(`O total enviado passa do limite de ${cfg.maxTotalUploadMb} MB por envio.`, 413, 'total_too_large');
      }

      // Formato real de cada arquivo, pelo conteúdo.
      const inputs = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const label = files.length > 1 ? `O arquivo ${i + 1} ("${originalNameOf(file)}")` : 'O arquivo enviado';
        if (file.size === 0) throw new ValidationError(`${label} está vazio.`, 'empty_file');
        const { type } = await sniffFile(file.path);
        if (!type || !tool.accepts.includes(type)) {
          const expected = tool.accepts.map((t) => TYPE_LABELS[t]).join(', ');
          const found = type ? ` Ele é ${TYPE_LABELS[type] || type}.` : '';
          throw new ValidationError(`${label} não é um formato aceito por esta ferramenta (aceita: ${expected}).${found}`, 'unsupported_type');
        }
        inputs.push({ file: `input-${i + 1}.${EXT_BY_TYPE[type]}`, type, size: file.size });
      }

      const options = tool.parseOptions(req.body || {});
      tool.validateInputs?.(inputs, options);

      if (store.countActive(req.user.id) >= cfg.maxActiveJobsPerUser) {
        throw new HttpError('Você já tem arquivos sendo processados. Aguarde terminarem e tente de novo.', 429, 'user_busy');
      }
      if (!queue.canAccept()) {
        throw new HttpError('Servidor ocupado processando outros arquivos. Tente novamente em instantes.', 503, 'queue_full');
      }

      job = await store.create({
        owner: req.user.id,
        tool: toolId,
        options,
        inputs,
        originalNames: files.map(originalNameOf),
        retention: { resultMs: cfg.resultRetentionMinutes * 60_000, maxRunMs: cfg.jobTimeoutMs },
      });
      const { input } = store.paths(job.id);
      for (let i = 0; i < files.length; i++) {
        await fsp.rename(files[i].path, path.join(input, inputs[i].file));
      }
      queue.enqueue(job.id);

      logger.info('job.created', { jobId: job.id, user: req.user.id, tool: toolId, files: files.length, bytes: total });
      res.status(202).location(`/api/jobs/${job.id}`).json(publicJob(job, queue));
    } catch (err) {
      // Limpa ANTES de responder: o cliente nunca vê o erro com sobra em disco.
      if (job) await store.remove(job.id).catch(() => {});
      await discardUploads(req);
      next(err);
    }
  });

  router.get('/jobs', (req, res) => {
    res.json({ jobs: store.listOwned(req.user.id).map((job) => publicJob(job, queue)) });
  });

  function ownedOr404(req) {
    const job = store.getOwned(req.params.id, req.user.id);
    if (!job) {
      // Inexistente e "de outra pessoa" respondem igual: não revela que o id existe.
      if (store.get(req.params.id)) logger.warn('job.access_denied', { jobId: req.params.id, user: req.user.id });
      throw new NotFoundError();
    }
    return job;
  }

  router.get('/jobs/:id', (req, res) => {
    res.json(publicJob(ownedOr404(req), queue));
  });

  router.get('/jobs/:id/download', async (req, res, next) => {
    try {
      const job = ownedOr404(req);
      if (job.status !== 'done' || !job.result) {
        throw new HttpError('O resultado ainda não está pronto.', 409, 'not_ready');
      }
      const filePath = path.join(store.paths(job.id).output, path.basename(job.result.file));
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat) throw new NotFoundError('O resultado expirou ou foi apagado.');

      res.setHeader('Content-Type', job.result.mime);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', contentDisposition(job.result.name));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      logger.info('job.download', { jobId: job.id, user: req.user.id });

      const stream = fs.createReadStream(filePath);
      stream.on('error', next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/jobs/:id', async (req, res) => {
    const job = ownedOr404(req);
    queue.cancel(job.id);
    await store.remove(job.id);
    logger.info('job.deleted', { jobId: job.id, user: req.user.id });
    res.status(204).end();
  });

  router.use((req, res, next) => next(new HttpError('Endpoint não encontrado.', 404, 'not_found')));
  return router;
}

module.exports = { createRouter, availableTools, contentDisposition };
