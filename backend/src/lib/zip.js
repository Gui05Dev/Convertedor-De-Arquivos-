'use strict';

/* ZIP mínimo, sem dependência:
   - listEntries: lê o diretório central de um .zip (DOCX/PPTX são ZIP) só pra saber
     os nomes das entradas — não descompacta nada, então não há risco de "zip bomb".
   - createZip: grava um ZIP sem compressão (STORE) com vários arquivos de resultado.
     Os formatos que entram aqui (PDF, JPG, PNG, WebP) já são comprimidos. */

const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const MAX_ENTRIES = 20_000;

/** @returns {string[]|null} nomes das entradas, ou null se não for um ZIP legível. */
function listEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return null;
  // O End Of Central Directory fica nos últimos 22 bytes + até 64 KB de comentário.
  const start = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRIES || cdOffset + cdSize > buf.length) return null;

  const names = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH_SIG) return null;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    if (p + 46 + nameLen > buf.length) return null;
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** Mesmo que listEntries, lendo do disco só o fim do arquivo e o diretório central. */
async function listEntriesFromFile(handle, size) {
  if (size < 22) return null;
  const tailLen = Math.min(size, 22 + 0xffff);
  const tail = Buffer.alloc(tailLen);
  await handle.read(tail, 0, tailLen, size - tailLen);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize > size || cdSize > 16 * 1024 * 1024) return null;

  // Remonta um "mini zip" (diretório central + EOCD relocado) e reaproveita o parser.
  const cd = Buffer.alloc(cdSize);
  await handle.read(cd, 0, cdSize, cdOffset);
  const eocdCopy = Buffer.from(tail.subarray(eocd, eocd + 22));
  eocdCopy.writeUInt32LE(0, 16);
  return listEntries(Buffer.concat([cd, eocdCopy]));
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * @param {{ name: string, data: Buffer }[]} files  nomes já sanitizados, únicos
 * @returns {Buffer}
 */
function createZip(files, now = new Date()) {
  const { time, day } = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);         // versão necessária
    local.writeUInt16LE(0x0800, 6);     // flag: nome em UTF-8
    local.writeUInt16LE(0, 8);          // STORE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CDH_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

module.exports = { listEntries, listEntriesFromFile, createZip };
