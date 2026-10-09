'use strict';

/* Armazenamento dos trabalhos em disco, sem banco de dados.

   DATA_DIR/
     incoming/            uploads em andamento (nomes aleatórios do multer)
     jobs/<uuid>/
       meta.json          estado do trabalho (dono, ferramenta, status, prazos)
       input/             originais, com nomes internos (input-1.pdf, ...)
       work/              temporários do motor (perfil do LibreOffice etc.)
       output/            resultado

   O id é um UUID v4 aleatório (122 bits): não dá pra adivinhar o de outra pessoa.
   Mesmo assim, TODO acesso passa por getOwned(), que compara o dono — trabalho de
   outro usuário responde exatamente como trabalho inexistente (404).

   O índice em memória é a fonte de verdade enquanto o processo vive; meta.json existe
   pra que um resultado pronto sobreviva a um reinício até o fim da retenção. */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIVE = new Set(['queued', 'processing']);

class JobStore {
  constructor({ dataDir, logger }) {
    this.dataDir = dataDir;
    this.jobsDir = path.join(dataDir, 'jobs');
    this.incomingDir = path.join(dataDir, 'incoming');
    this.logger = logger;
    this.jobs = new Map();
  }

  async init() {
    await fs.mkdir(this.jobsDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.incomingDir, { recursive: true, mode: 0o700 });

    // Uploads pela metade de uma execução anterior não pertencem a ninguém.
    for (const name of await fs.readdir(this.incomingDir)) {
      await fs.rm(path.join(this.incomingDir, name), { recursive: true, force: true });
    }

    for (const id of await fs.readdir(this.jobsDir)) {
      const dir = path.join(this.jobsDir, id);
      if (!ID_PATTERN.test(id)) {
        await fs.rm(dir, { recursive: true, force: true });
        continue;
      }
      let meta;
      try {
        meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
      } catch {
        await fs.rm(dir, { recursive: true, force: true });
        continue;
      }
      if (ACTIVE.has(meta.status)) {
        // O processo morreu no meio: o trabalho não vai terminar sozinho.
        meta.status = 'failed';
        meta.stage = null;
        meta.finishedAt = new Date().toISOString();
        meta.error = { code: 'interrupted', message: 'O processamento foi interrompido por uma reinicialização do servidor. Envie o arquivo novamente.' };
        await fs.rm(path.join(dir, 'input'), { recursive: true, force: true });
        await fs.rm(path.join(dir, 'work'), { recursive: true, force: true });
        await fs.rm(path.join(dir, 'output'), { recursive: true, force: true });
        await this.#writeMeta(meta);
      }
      this.jobs.set(id, meta);
    }
  }

  static isValidId(id) {
    return typeof id === 'string' && ID_PATTERN.test(id);
  }

  dirOf(id) {
    if (!JobStore.isValidId(id)) throw new Error('id inválido');
    return path.join(this.jobsDir, id);
  }

  paths(id) {
    const dir = this.dirOf(id);
    return { dir, input: path.join(dir, 'input'), work: path.join(dir, 'work'), output: path.join(dir, 'output') };
  }

  async create({ owner, tool, options, inputs, originalNames, retention }) {
    const id = crypto.randomUUID();
    const p = this.paths(id);
    const now = new Date();
    const meta = {
      id, owner, tool, options,
      status: 'queued', stage: 'Na fila',
      createdAt: now.toISOString(), startedAt: null, finishedAt: null,
      // Até terminar, o prazo é o do resultado contado a partir do envio; ao terminar,
      // é recalculado a partir do fim do processamento.
      expiresAt: new Date(now.getTime() + retention.resultMs + retention.maxRunMs).toISOString(),
      originalsDeleteAt: null,
      inputs, originalNames,
      result: null, error: null,
    };
    // Entra no índice ANTES de existir em disco: a limpeza apaga diretórios fora do
    // índice, e não pode pegar um trabalho no meio da criação.
    this.jobs.set(id, meta);
    try {
      await fs.mkdir(p.dir, { mode: 0o700 });
      await Promise.all([p.input, p.work, p.output].map((d) => fs.mkdir(d, { mode: 0o700 })));
      await this.#writeMeta(meta);
    } catch (err) {
      await this.remove(id);
      throw err;
    }
    return meta;
  }

  get(id) {
    return JobStore.isValidId(id) ? this.jobs.get(id) || null : null;
  }

  /** Única forma de a API ler um trabalho: devolve null se não existe OU não é do usuário. */
  getOwned(id, owner) {
    const job = this.get(id);
    if (!job || !owner || job.owner !== owner) return null;
    return job;
  }

  listOwned(owner) {
    return [...this.jobs.values()]
      .filter((job) => job.owner === owner)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  countActive(owner) {
    let n = 0;
    for (const job of this.jobs.values()) if (job.owner === owner && ACTIVE.has(job.status)) n++;
    return n;
  }

  async update(id, patch) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch);
    await this.#writeMeta(job);
    return job;
  }

  async remove(id) {
    if (!JobStore.isValidId(id)) return;
    this.jobs.delete(id);
    await fs.rm(this.dirOf(id), { recursive: true, force: true });
  }

  /* Gravações do mesmo trabalho em série: sem isso, um rename antigo poderia terminar
     depois de um novo e deixar meta.json desatualizado em disco. */
  #writeMeta(meta) {
    this.writeChains ??= new Map();
    const previous = this.writeChains.get(meta.id) || Promise.resolve();
    const next = previous.then(() => this.#writeMetaNow(meta));
    const tracked = next.catch(() => {});
    this.writeChains.set(meta.id, tracked);
    tracked.then(() => { if (this.writeChains.get(meta.id) === tracked) this.writeChains.delete(meta.id); });
    return next;
  }

  async #writeMetaNow(meta) {
    const dir = this.dirOf(meta.id);
    if (!fsSync.existsSync(dir)) return;
    const tmp = path.join(dir, `meta.json.${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      await fs.writeFile(tmp, JSON.stringify(meta), { mode: 0o600 });
      await fs.rename(tmp, path.join(dir, 'meta.json'));
    } catch (err) {
      // O trabalho pode ter sido apagado (usuário ou limpeza) enquanto gravávamos.
      if (err.code !== 'ENOENT') throw err;
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }
}

module.exports = { JobStore, ACTIVE };
