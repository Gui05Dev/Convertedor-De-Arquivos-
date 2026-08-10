/* Teste de interface: abre a SPA num Chrome de verdade e usa a tela como um usuário —
 * clica no card, escolhe o arquivo, processa, confere o download.
 *
 * Existe por dois motivos que nenhum outro teste cobre:
 *   1. `vite build` passar não prova que os componentes renderizam sem erro;
 *   2. é aqui que a regra "o frontend não fala com ninguém além da própria origem"
 *      vira verificação — o teste observa TODAS as requisições da página e falha se
 *      alguma sair para outro host.
 *
 * Usa playwright-core + um Chrome/Edge já instalado (não baixa navegador).
 * Exige a stack de pé: `docker compose up` na raiz. Rodar com `npm run test:ui`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE || 'http://localhost:8080';
const FIXTURE = path.join(HERE, 'fixtures', 'entrada.pdf');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

/** Usa o Chrome ou o Edge já instalados; sem isso o playwright-core exige um download. */
async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: true }); }
    catch { /* tenta o próximo */ }
  }
  throw new Error('Nenhum Chrome ou Edge encontrado. Instale um dos dois para rodar este teste.');
}

(async () => {
  const browser = await launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  const fontRequests = [];

  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.origin !== new URL(SITE).origin) {
      externalRequests.push(r.url());
    }
    if (r.url().includes('.woff2')) fontRequests.push(r.url());
  });

  console.log('\n-- carregamento --');
  await page.goto(SITE, { waitUntil: 'networkidle' });
  check('React montou (#root preenchido)', (await page.locator('#root').innerHTML()).length > 100);
  check('sem erro de JS', pageErrors.length === 0, pageErrors.join(' | '));
  check('sem erro no console', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('nenhuma requisição a terceiros', externalRequests.length === 0, externalRequests.join(' | '));

  console.log('\n-- grade de ferramentas --');
  check('10 cards renderizados', await page.locator('.tool-card').count() === 10);
  check('ícones SVG renderizados', await page.locator('.card-icon-box svg').count() === 10);
  check('badges de categoria', await page.locator('.card-badge').count() === 10);

  console.log('\n-- fontes auto-hospedadas --');
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() =>
    Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => f.family));
  check('Nunito e Sora carregadas', families.includes('Nunito') && families.includes('Sora'), families.join(','));
  check('woff2 vindos desta origem', fontRequests.length > 0 && fontRequests.every((u) => u.startsWith(SITE)));

  console.log('\n-- tema --');
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('.theme-toggle');
  const after = await page.getAttribute('html', 'data-theme');
  check('toggle troca o tema', before !== after, `${before} -> ${after}`);
  await page.reload({ waitUntil: 'networkidle' });
  check('tema persiste no reload', await page.getAttribute('html', 'data-theme') === after);
  await page.click('.theme-toggle');

  console.log('\n-- modal --');
  await page.click('[data-tool="dividir"]');
  await page.waitForSelector('.modal-overlay.open', { timeout: 3000 });
  check('modal abre', (await page.locator('.modal-title').textContent()) === 'Dividir PDF');
  check('opções da ferramenta aparecem', await page.locator('#optPageRange').count() === 1);
  check('Processar começa desabilitado', await page.locator('.btn-process').isDisabled());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 3000 });
  check('Esc fecha o modal', true);

  console.log('\n-- fluxo completo: dividir PDF --');
  await page.click('[data-tool="dividir"]');
  await page.waitForSelector('.modal-overlay.open');
  await page.setInputFiles('.dropzone input[type=file]', FIXTURE);
  check('arquivo listado', (await page.locator('.file-item-name').textContent()) === 'entrada.pdf');

  // Campo obrigatório vazio tem que barrar ANTES de gastar um upload.
  await page.click('.btn-process');
  await page.waitForSelector('.error-banner.visible', { timeout: 3000 });
  check('valida opção obrigatória antes de enviar',
    (await page.locator('.error-banner span').textContent()).includes('intervalo'));

  await page.fill('#optPageRange', '2-4');
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click('.btn-process');
  const download = await downloadPromise;

  check('nome do arquivo vem do backend', download.suggestedFilename() === 'copacol-pags-2-4.pdf',
    download.suggestedFilename());

  const saved = path.join(HERE, 'fixtures', '.saida.pdf');
  await download.saveAs(saved);
  check('resultado é um PDF', fs.readFileSync(saved).subarray(0, 5).toString() === '%PDF-');
  fs.rmSync(saved, { force: true });

  await page.waitForSelector('.success-state.visible', { timeout: 5000 });
  check('mensagem do backend exibida (X-Result-Info)',
    (await page.locator('.success-sub').textContent()).includes('3 página'));
  check('botão "Baixar novamente" presente', await page.locator('.btn-download').count() === 1);

  console.log('\n-- erro do backend na tela --');
  await page.click('.btn-secondary'); // "Novo arquivo"
  await page.setInputFiles('.dropzone input[type=file]', FIXTURE);
  await page.fill('#optPageRange', '9-1');
  await page.click('.btn-process');
  await page.waitForSelector('.error-banner.visible', { timeout: 15000 });
  check('mensagem de erro do servidor aparece',
    (await page.locator('.error-banner span').textContent()).includes('menor-maior'));

  console.log('\n-- ferramenta "em breve" --');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-overlay', { state: 'detached' });
  await page.click('[data-tool="pdf-excel"]');
  await page.waitForSelector('.modal-overlay.open');
  check('avisa que está indisponível', (await page.locator('.modal-body').textContent()).includes('em breve'));
  check('sem dropzone', await page.locator('.dropzone').count() === 0);
  check('Processar desabilitado', await page.locator('.btn-process').isDisabled());

  console.log('\n-- balanço final --');
  check('nenhum erro de JS em toda a sessão', pageErrors.length === 0, pageErrors.join(' | '));
  check('nenhuma requisição externa em toda a sessão', externalRequests.length === 0, externalRequests.join(' | '));

  await browser.close();
  console.log(`\n=== ${pass} passaram, ${fail} falharam ===`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error('ERRO:', err); process.exit(1); });
