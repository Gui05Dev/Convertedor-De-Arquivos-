'use strict';

/* Fila de processamento: no máximo MAX_CONCURRENT_JOBS trabalhos rodando, até
   MAX_QUEUED_JOBS esperando. Cada trabalho:
     1. roda o motor da ferramenta com prazo total JOB_TIMEOUT_MS;
     2. ao terminar — sucesso, falha, timeout ou cancelamento — apaga work/ e, se a
        retenção de originais for 0, também input/ (bloco finally);
     3. registra só metadados no log (nunca nome ou conteúdo de arquivo). */

const fs = require('fs/promises');
const path = require('path');
const { TOOLS, MIME, outputName } = require('../tools/catalog');
const { HttpError } = require('../lib/errors');

const MINUTE = 60_000;

class JobQueue {
  constructor({ store, cfg, engines, logger }) {
    this.store = store;
    this.cfg = cfg;
    this.engines = engines;
    this.logger = logger;
    this.waiting = [];
    this.running = new Map(); // id -> AbortController
  }

  get queuedCount() { return this.waiting.length; }

  position(id) {
    const i = this.waiting.indexOf(id);
    return i < 0 ? null : i + 1;
  }

  canAccept() {
    return this.waiting.length < this.cfg.maxQueuedJobs || this.running.size < this.cfg.maxConcurrentJobs;
  }

  enqueue(id) {
    this.waiting.push(id);
    setImmediate(() => this.#pump());
  }

  /** Cancela um trabalho na fila ou em andamento. */
  cancel(id) {
    const i = this.waiting.indexOf(id);
    if (i >= 0) this.waiting.splice(i, 1);
    this.running.get(id)?.abort();
  }

  /** Promise que resolve quando a fila esvazia (usada nos testes e no desligamento). */
  async idle() {
    while (this.waiting.length || this.running.size) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  #pump() {
    while (this.running.size < this.cfg.maxConcurrentJobs && this.waiting.length) {
      const id = this.waiting.shift();
      const job = this.store.get(id);
      if (!job || job.status !== 'queued') continue;
      const controller = new AbortController();
      this.running.set(id, controller);
      this.#run(job, controller)
        .catch((err) => this.logger.error('job.crash', { jobId: id, error: err }))
        .finally(() => {
          this.running.delete(id);
          this.#pump();
        });
    }
  }

  async #run(job, controller) {
    const tool = TOOLS[job.tool];
    const paths = this.store.paths(job.id);
    const started = Date.now();
    const deadline = started + this.cfg.jobTimeoutMs;

    await this.store.update(job.id, { status: 'processing', stage: 'Iniciando', startedAt: new Date(started).toISOString() });
    this.logger.info('job.start', { jobId: job.id, user: job.owner, tool: job.tool, files: job.inputs.length });

    const ctx = {
      job,
      cfg: { ...this.cfg, prlimitPath: this.engines.prlimitPath },
      paths,
      inputs: job.inputs.map((input) => ({ ...input, path: path.join(paths.input, input.file) })),
      signal: controller.signal,
      remainingMs: () => Math.max(1, deadline - Date.now()),
      setStage: (stage) => { this.store.update(job.id, { stage }).catch(() => {}); },
    };

    let patch;
    try {
      const result = await tool.run(ctx);
      if (controller.signal.aborted) throw new HttpError('Processamento cancelado.', 499, 'cancelled');
      const stat = await fs.stat(path.join(paths.output, result.file));
      patch = {
        status: 'done', stage: null,
        result: {
          file: result.file,
          name: outputName(job.originalNames, result),
          mime: MIME[result.ext] || 'application/octet-stream',
          size: stat.size,
          info: result.info || '',
        },
      };
      this.logger.info('job.done', { jobId: job.id, user: job.owner, tool: job.tool, ms: Date.now() - started, outputBytes: stat.size });
    } catch (err) {
      const safe = err instanceof HttpError && err.expose;
      patch = {
        status: 'failed', stage: null,
        error: {
          code: safe ? err.code : 'internal_error',
          message: safe ? err.message : 'Erro inesperado ao processar o arquivo. Tente novamente.',
        },
      };
      // Saída parcial de uma conversão que falhou não fica disponível pra download.
      await fs.rm(paths.output, { recursive: true, force: true }).catch(() => {});
      const level = safe && err.status < 500 ? 'warn' : 'error';
      this.logger[level]('job.failed', {
        jobId: job.id, user: job.owner, tool: job.tool, ms: Date.now() - started,
        code: patch.error.code, error: safe ? undefined : { name: err?.name, code: err?.code },
      });
    } finally {
      await fs.rm(paths.work, { recursive: true, force: true }).catch(() => {});
    }

    const finishedAt = new Date();
    patch.finishedAt = finishedAt.toISOString();
    patch.expiresAt = new Date(finishedAt.getTime() + this.cfg.resultRetentionMinutes * MINUTE).toISOString();

    if (this.cfg.originalRetentionMinutes <= 0) {
      await fs.rm(paths.input, { recursive: true, force: true }).catch(() => {});
      patch.originalsDeleteAt = null;
      patch.inputsDeleted = true;
    } else {
      patch.originalsDeleteAt = new Date(finishedAt.getTime() + this.cfg.originalRetentionMinutes * MINUTE).toISOString();
    }

    // Se o usuário apagou o trabalho durante o processamento, não recria nada.
    if (this.store.get(job.id)) await this.store.update(job.id, patch);
  }
}

module.exports = { JobQueue };
