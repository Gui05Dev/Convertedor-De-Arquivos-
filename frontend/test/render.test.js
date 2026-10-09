/* Teste de interface: abre a SPA num Chromium de verdade, faz login no Keycloak e usa
 * a tela como um usuário — teclado, arquivo, etapa de processamento, download.
 *
 * Cobre o que nenhum outro teste cobre:
 *   1. os componentes renderizam e o fluxo inteiro funciona no navegador;
 *   2. depois do login, NENHUMA requisição da página sai para outro host;
 *   3. navegação por teclado e rótulos acessíveis;
 *   4. layout em tela de celular (sem rolagem horizontal).
 *
 * Exige a stack de pé (docker compose, perfil keycloak-local) e um Chrome/Chromium:
 *   UI_PASSWORD=<senha da alice> [CHROME_PATH=/caminho/do/chrome] npm run test:ui
 * Capturas de tela vão para test/screenshots/ (ignorado pelo git).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = (process.env.SITE || 'http://localhost:8080').replace(/\/$/, '');
const USER = process.env.UI_USER || 'alice';
const PASSWORD = process.env.UI_PASSWORD;
const FIXTURES = path.join(HERE, '..', '..', 'backend', 'test', 'fixtures');
const SHOTS = path.join(HERE, 'screenshots');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

async function launch() {
  if (process.env.CHROME_PATH) {
    return chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  }
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel, headless: true }); } catch { /* próximo */ }
  }
  throw new Error('Nenhum Chrome/Edge encontrado. Defina CHROME_PATH.');
}

async function openTool(page, id) {
  await page.click(`[data-tool="${id}"]`);
  await page.waitForSelector('.modal-overlay.open', { timeout: 3000 });
}

async function closeModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 3000 });
}

(async () => {
  if (!PASSWORD) {
    console.log('Defina UI_PASSWORD (senha do usuário de teste do realm de homologação).');
    process.exit(2);
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launch();
  const context = await browser.newContext({ acceptDownloads: true, locale: 'pt-BR' });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  let loggedIn = false;
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (loggedIn && !['blob:', 'data:'].includes(url.protocol) && url.origin !== new URL(SITE).origin) {
      externalRequests.push(r.url());
    }
  });

  console.log('\n-- login --');
  await page.goto(SITE);
  check('sem sessão vai para o Keycloak', !page.url().startsWith(SITE), page.url());
  await page.fill('#username', USER);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login, [type=submit]');
  await page.waitForURL(`${SITE}/**`, { timeout: 15000 });
  loggedIn = true;
  await page.waitForSelector('.tool-card', { timeout: 10000 });
  await page.waitForTimeout(800); // animação de entrada dos cards
  check('voltou logado para a aplicação', page.url().startsWith(SITE));
  check('nome do usuário no topo', (await page.locator('.header-user').textContent()).length > 0);
  check('link Sair presente', await page.locator('a.header-logout').count() === 1);

  console.log('\n-- ferramentas --');
  const cards = await page.locator('.tool-card').evaluateAll((els) => els.map((e) => e.dataset.tool));
  console.log(`  cards: ${cards.join(', ')}`);
  for (const id of ['merge', 'split', 'compress', 'word-to-pdf', 'images-to-pdf', 'convert-image']) {
    check(`card ${id} disponível`, cards.includes(id));
  }
  check('nenhum card "em breve" (PDF->Excel)', !cards.includes('pdf-excel'));
  await page.screenshot({ path: path.join(SHOTS, 'inicio-desktop.png'), fullPage: true });

  console.log('\n-- teclado e acessibilidade --');
  await page.focus('[data-tool="word-to-pdf"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.modal-overlay.open');
  check('Enter abre o card focado', (await page.locator('.modal-title').textContent()) === 'Word para PDF');
  const focusedClose = await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Fechar', null, { timeout: 1500 })
    .then(() => true, () => false);
  check('foco vai para o botão Fechar', focusedClose);
  check('diálogo rotulado pelo título', await page.locator('[role=dialog][aria-labelledby]').count() === 1);
  check('seletor de arquivo tem rótulo', (await page.getAttribute('.dropzone input[type=file]', 'aria-label')) === 'Selecionar arquivo');
  check('accept vem do servidor (DOCX)', (await page.getAttribute('.dropzone input[type=file]', 'accept')).includes('.docx'));
  await page.keyboard.press('Tab');
  const focusedInside = await page.evaluate(() => Boolean(document.activeElement?.closest('.modal-box')));
  check('Tab fica dentro do modal', focusedInside);
  check('Processar desabilitado sem arquivo', await page.locator('.btn-process').isDisabled());

  console.log('\n-- arquivo errado: mensagem compreensível --');
  await page.setInputFiles('.dropzone input[type=file]', path.join(FIXTURES, 'transparente.png'));
  const wrongType = await page.locator('.error-banner').textContent();
  check('extensão errada avisada antes do envio', /não é um formato aceito/.test(wrongType), wrongType);
  await page.setInputFiles('.dropzone input[type=file]', { name: 'falso.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('isto não é um docx') });
  await page.click('.btn-process');
  await page.waitForSelector('.error-banner', { timeout: 10000 });
  const serverError = await page.locator('.error-banner').textContent();
  check('servidor recusa conteúdo falso com mensagem clara', /não é um formato aceito/.test(serverError), serverError);
  await page.click('.file-item-remove');

  console.log('\n-- Word -> PDF: etapa real, sem % inventada --');
  await page.setInputFiles('.dropzone input[type=file]', path.join(FIXTURES, 'relatorio.docx'));
  check('arquivo listado', (await page.locator('.file-item-name').textContent()).includes('relatorio.docx'));
  await page.click('.btn-process');
  await page.waitForSelector('.progress-wrap', { timeout: 5000 });
  await page.waitForSelector('.progress-bar-indeterminate', { timeout: 10000 });
  const stage = await page.locator('.progress-label span').first().textContent();
  check('mostra etapa do processamento', /Na fila|LibreOffice|Iniciando/.test(stage), stage);
  check('sem porcentagem durante o processamento', await page.locator('.progress-label span').count() === 1);
  await page.screenshot({ path: path.join(SHOTS, 'processando.png') });
  await page.waitForSelector('.success-state', { timeout: 60000 });
  check('conclusão anunciada (role=status)', await page.locator('.success-state[role=status]').count() === 1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.btn-download')]);
  const file = await download.path();
  check('download do PDF', download.suggestedFilename() === 'relatorio.pdf' && fs.readFileSync(file).subarray(0, 5).toString() === '%PDF-',
    download.suggestedFilename());
  await page.screenshot({ path: path.join(SHOTS, 'concluido.png') });
  await closeModal(page);

  console.log('\n-- arquivos recentes --');
  await page.waitForSelector('.recent-item', { timeout: 5000 });
  check('trabalho aparece em "Seus arquivos recentes"', await page.locator('.recent-item.status-done').count() >= 1);

  console.log('\n-- juntar PDFs com reordenação por teclado --');
  await openTool(page, 'merge');
  await page.setInputFiles('.dropzone input[type=file]', [path.join(FIXTURES, 'texto.pdf'), path.join(FIXTURES, 'digitalizado.pdf')]);
  await page.click('[aria-label="Mover digitalizado.pdf para cima"]');
  const order = await page.locator('.file-item-name').allTextContents();
  check('ordem alterada pelos botões', order[0].includes('digitalizado.pdf'), order.join(' | '));
  await page.click('.btn-process');
  await page.waitForSelector('.success-state', { timeout: 30000 });
  check('juntou', (await page.locator('.success-sub').allTextContents()).join(' ').includes('3 página'));
  await closeModal(page);

  console.log('\n-- tela de celular --');
  await page.setViewportSize({ width: 375, height: 740 });
  await page.reload({ waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('sem rolagem horizontal em 375 px', overflow <= 0, `${overflow}px`);
  await page.screenshot({ path: path.join(SHOTS, 'inicio-celular.png'), fullPage: true });
  await openTool(page, 'convert-image');
  await page.waitForTimeout(400); // fim da animação de abertura
  await page.screenshot({ path: path.join(SHOTS, 'modal-celular.png') });
  const box = await page.locator('.modal-box').boundingBox();
  check('modal cabe na largura do celular', box.width <= 375, `${box.width}`);
  await closeModal(page);

  console.log('\n-- higiene --');
  check('nenhuma requisição a terceiros após o login', externalRequests.length === 0, externalRequests.join(' | '));
  check('sem erro de JS', pageErrors.length === 0, pageErrors.join(' | '));
  check('sem erro no console (exceto respostas 4xx esperadas)', consoleErrors.every((e) => /status of 4\d\d/.test(e)), consoleErrors.join(' | '));

  await browser.close();
  console.log(`\n=== ${pass} passaram, ${fail} falharam ===`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
