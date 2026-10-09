'use strict';

/* Limpeza periódica (CLEANUP_INTERVAL_SECONDS):
   - trabalho cujo prazo (expiresAt) passou: apaga o diretório inteiro;
   - originais com prazo próprio (ORIGINAL_RETENTION_MINUTES > 0): apaga input/;
   - diretório em jobs/ que não está no índice (sobra de falha): apaga;
   - upload parado em incoming/ há mais de 1 hora: apaga. */

const fs = require('fs/promises');
const path = require('path');
const { ACTIVE } = require('./store');

const STALE_UPLOAD_MS = 60 * 60 * 1000;

async function sweep({ store, queue, logger, now = Date.now() }) {
  let removed = 0;
  for (const job of [...store.jobs.values()]) {
    if (ACTIVE.has(job.status)) continue;
    if (Date.parse(job.expiresAt) <= now) {
      queue?.cancel(job.id);
      await store.remove(job.id);
      removed++;
      continue;
    }
    if (job.originalsDeleteAt && !job.inputsDeleted && Date.parse(job.originalsDeleteAt) <= now) {
      await fs.rm(store.paths(job.id).input, { recursive: true, force: true });
      await store.update(job.id, { inputsDeleted: true });
    }
  }

  for (const name of await fs.readdir(store.jobsDir).catch(() => [])) {
    if (!store.jobs.has(name)) {
      await fs.rm(path.join(store.jobsDir, name), { recursive: true, force: true });
      removed++;
    }
  }

  for (const name of await fs.readdir(store.incomingDir).catch(() => [])) {
    const full = path.join(store.incomingDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat && now - stat.mtimeMs > STALE_UPLOAD_MS) await fs.rm(full, { force: true, recursive: true });
  }

  if (removed) logger.info('cleanup.sweep', { removed });
  return removed;
}

function startJanitor({ store, queue, logger, intervalSeconds }) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await sweep({ store, queue, logger }); }
    catch (err) { logger.error('cleanup.failed', { error: { name: err?.name, code: err?.code } }); }
    finally { running = false; }
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { sweep, startJanitor };
