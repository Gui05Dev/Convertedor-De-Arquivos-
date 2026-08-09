
'use strict';

/* Ícones dos badges de categoria do card (stroke-width 2.5, distintos dos ícones de ferramenta). */
const CATEGORY_BADGES = {
  organizar: { label: 'Organizar', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` },
  otimizar:  { label: 'Otimizar',  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>` },
  converter: { label: 'Converter', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.5 7A9 9 0 0 0 6.5 5L1 10M23 14l-5.5 5a9 9 0 0 1-14-2"/></svg>` },
};

const PROCESS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

/* Backend de conversão (LibreOffice headless). Vazio = mesma origem, já que o
   Express serve tanto o site estático quanto /api/convert. */
const API_BASE = '';

const TOOLS = {
  'juntar': {
    title: 'Juntar PDF', desc: 'Mescle múltiplos PDFs em qualquer ordem.',
    subtitle: 'Combine múltiplos PDFs em um único documento.',
    cat: 'organizar', iconColor: 'ic-green',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/></svg>`,
    accept: '.pdf', multiple: true, minFiles: 2, extraOptions: null, process: mergePDFs,
  },
  'dividir': {
    title: 'Dividir PDF', desc: 'Selecione páginas ou intervalos para separar.',
    subtitle: 'Extraia um intervalo de páginas do seu PDF.',
    cat: 'organizar', iconColor: 'ic-red',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
    accept: '.pdf', multiple: false, minFiles: 1, extraOptions: 'dividir', process: splitPDF,
  },
  'girar': {
    title: 'Girar PDF', desc: 'Rotacione páginas individualmente ou o documento todo.',
    subtitle: 'Rotacione todas as páginas em 90°.',
    cat: 'organizar', iconColor: 'ic-orange',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.5 7A9 9 0 0 0 6.5 5L1 10M23 14l-5.5 5a9 9 0 0 1-14-2"/></svg>`,
    accept: '.pdf', multiple: false, minFiles: 1, extraOptions: 'girar', process: rotatePDF,
  },
  'remover-paginas': {
    title: 'Remover Páginas', desc: 'Exclua páginas específicas de qualquer PDF.',
    subtitle: 'Informe os números das páginas a remover.',
    cat: 'organizar', iconColor: 'ic-green',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
    accept: '.pdf', multiple: false, minFiles: 1, extraOptions: 'remover-paginas', process: removePagesPDF,
  },

  'comprimir': {
    title: 'Comprimir PDF', desc: 'Remove metadados para reduzir levemente o tamanho.',
    subtitle: 'Reduz o tamanho removendo metadados e otimizando os objetos.',
    cat: 'otimizar', iconColor: 'ic-teal',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    accept: '.pdf', multiple: false, minFiles: 1, extraOptions: null, process: compressPDF,
  },

  'pdf-word': {
    title: 'PDF para Word', desc: 'Converta PDFs para DOCX editáveis.',
    subtitle: 'Converte seu PDF em um documento Word (DOCX) editável.',
    cat: 'converter', iconColor: 'ic-blue',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
    cardIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    accept: '.pdf', multiple: false, minFiles: 1, extraOptions: null, process: pdfToWord,
  },
  'pdf-excel': {
    title: 'PDF para Excel', desc: 'Extraia tabelas de PDFs para planilhas XLSX.', subtitle: 'Em breve.',
    cat: 'converter', iconColor: 'ic-teal',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
    cardIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
    accept: '.pdf', multiple: false, minFiles: 1, extraOptions: null, process: null,
  },
  'jpg-pdf': {
    title: 'JPG para PDF', desc: 'Converta imagens JPG/PNG para PDF.',
    subtitle: 'Combine imagens JPG/PNG em um único PDF.',
    cat: 'converter', iconColor: 'ic-amber',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    accept: 'image/jpeg,image/png,.jpg,.jpeg,.png', multiple: true, minFiles: 1, extraOptions: null, process: imagesToPDF,
  },
  'word-pdf': {
    title: 'Word para PDF', desc: 'Converta DOCX para PDF com qualidade profissional.',
    subtitle: 'Converte seu documento Word (DOCX) em um PDF.',
    cat: 'converter', iconColor: 'ic-blue',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
    cardIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    accept: '.docx', multiple: false, minFiles: 1, extraOptions: null, process: wordToPdf,
  },
  'pptx-pdf': {
    title: 'PowerPoint para PDF', desc: 'Transforme PPT/PPTX para PDF com layout preservado.',
    subtitle: 'Converte sua apresentação PowerPoint (PPTX) em um PDF.',
    cat: 'converter', iconColor: 'ic-purple',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>`,
    cardIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    accept: '.pptx', multiple: false, minFiles: 1, extraOptions: null, process: pptxToPdf,
  },
};


let currentTool = null;
let selectedFiles = [];
let lastObjectURL = null;
let lastFocused = null;
/* Muda toda vez que o modal abre/fecha — usado por handleProcess() pra saber se o
   processamento que acabou de terminar ainda pertence ao modal que está aberto agora. */
let modalSession = 0;
let currentAbortController = null;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/* Escapa texto para impedir injeção de HTML ao exibir nomes de arquivo. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Verifica se o arquivo bate com o filtro `accept` da ferramenta atual. */
function isFileAccepted(file, accept) {
  if (!accept) return true;
  const tokens = accept.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some(tok => {
    if (tok.startsWith('.'))  return name.endsWith(tok);              // extensão (.pdf)
    if (tok.endsWith('/*'))   return type.startsWith(tok.slice(0, -1)); // image/*
    return type === tok;                                             // mime exato
  });
}
 
const overlay      = document.getElementById('modalOverlay');
const modalIcon    = document.getElementById('modalIcon');
const modalTitle   = document.getElementById('modalTitle');
const modalSub     = document.getElementById('modalSubtitle');
const modalClose   = document.getElementById('modalClose');
const dropzone     = document.getElementById('dropzone');
const fileInput    = document.getElementById('fileInput');
const filesList    = document.getElementById('filesList');
const extraOpts    = document.getElementById('extraOptions');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressPct  = document.getElementById('progressPct');
const progressTxt  = document.getElementById('progressText');
const progressSts  = document.getElementById('progressStatus');
const successState = document.getElementById('successState');
const successSub   = document.getElementById('successSub');
const errorBanner  = document.getElementById('errorBanner');
const errorMsg     = document.getElementById('errorMessage');
const modalFooter  = document.getElementById('modalFooter');

/* Alternância de tema claro/escuro (o tema inicial já é aplicado por um script
   inline no <head>, aqui só cuidamos do clique e de persistir a escolha). */
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});

function openTool(key) {
  const tool = TOOLS[key];
  if (!tool) return;
  modalSession++;
  currentAbortController?.abort();
  currentAbortController = null;
  currentTool = tool;
  selectedFiles = [];
 
  modalIcon.className = `modal-icon ${tool.iconColor}`;
  modalIcon.innerHTML = tool.iconSvg;
  modalTitle.textContent = tool.title;
  modalSub.textContent   = tool.subtitle;
 
  filesList.innerHTML  = '';
  extraOpts.innerHTML  = '';
  hideProgress(); hideSuccess(); hideError();
 
  restoreFooter();
  dropzone.style.display = '';
  dropzone.style.pointerEvents = '';
  fileInput.accept   = tool.accept;
  fileInput.multiple = !!tool.multiple;
 
  if (tool.extraOptions) renderExtraOptions(tool.extraOptions);
 
  if (!tool.process) {
    dropzone.style.display = 'none';
    extraOpts.innerHTML = `
      <div style="text-align:center;padding:1.75rem 0;color:var(--gray-500);">
        <div style="font-size:2.5rem;margin-bottom:.75rem;">🚧</div>
        <div style="font-weight:800;font-size:15px;color:var(--gray-700);margin-bottom:.35rem;">${tool.title}</div>
        <div style="font-size:13px;">Esta ferramenta estará disponível em breve.</div>
      </div>`;
    document.getElementById('btnProcess').disabled = true;
  }
 
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  lastFocused = document.activeElement;
  modalClose.focus();
}
 
function closeModal() {
  modalSession++;
  currentAbortController?.abort();
  currentAbortController = null;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  currentTool = null;
  selectedFiles = [];
  if (lastObjectURL) { URL.revokeObjectURL(lastObjectURL); lastObjectURL = null; }
  if (lastFocused) { lastFocused.focus(); lastFocused = null; }
}
 
function restoreFooter() {
  modalFooter.innerHTML = `
    <button class="btn-action btn-secondary" id="btnCancel">Cancelar</button>
    <button class="btn-action btn-process" id="btnProcess" disabled>${PROCESS_ICON} Processar</button>`;
  document.getElementById('btnCancel').addEventListener('click', closeModal);
  document.getElementById('btnProcess').addEventListener('click', handleProcess);
}
 
modalClose.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(); });

/* Mantém o foco dentro do modal enquanto ele está aberto (acessibilidade). */
overlay.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !overlay.classList.contains('open')) return;
  const focusable = Array.from(
    overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter(el => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
 
const toolsGrid = document.getElementById('toolsGrid');

/* Gera os cards da grade a partir de TOOLS — única fonte de verdade para título, ícone e descrição. */
function renderToolsGrid() {
  toolsGrid.innerHTML = Object.entries(TOOLS).map(([key, tool]) => {
    const badge = CATEGORY_BADGES[tool.cat];
    const badgeClass = `badge-${tool.iconColor.replace('ic-', '')}`;
    return `
    <div class="tool-card" data-cat="${tool.cat}" data-tool="${key}" role="button" tabindex="0">
      <div class="card-icon-box ${tool.iconColor}">${tool.cardIcon || tool.iconSvg}</div>
      <div class="card-body"><div class="card-title">${escapeHtml(tool.title)}</div><div class="card-desc">${escapeHtml(tool.desc)}</div></div>
      <span class="card-badge ${badgeClass}">${badge.icon}${badge.label}</span>
    </div>`;
  }).join('');
}
renderToolsGrid();

toolsGrid.addEventListener('click', e => {
  const card = e.target.closest('.tool-card');
  if (card) openTool(card.dataset.tool);
});
toolsGrid.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.tool-card');
  if (card) { e.preventDefault(); openTool(card.dataset.tool); }
});
 

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', () => { addFiles(Array.from(fileInput.files)); fileInput.value = ''; });
 
function addFiles(files) {
  if (!currentTool) return;
  hideError();

  const valid = [];
  for (const file of files) {
    if (!isFileAccepted(file, currentTool.accept)) {
      showError(`Tipo de arquivo não suportado: ${file.name}`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      showError(`"${file.name}" excede o limite de 100 MB.`);
      continue;
    }
    valid.push(file);
  }
  if (!valid.length) return;

  if (!currentTool.multiple) {
    selectedFiles = [];
    valid.length = 1;
  }
  selectedFiles.push(...valid);
  renderFilesList();
  updateProcessBtn();
}
function removeFile(i) { selectedFiles.splice(i, 1); renderFilesList(); updateProcessBtn(); }
function renderFilesList() {
  filesList.innerHTML = '';
  selectedFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.style.animationDelay = `${i * .05}s`;
    item.innerHTML = `
      <div class="file-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="file-item-info">
        <div class="file-item-name">${escapeHtml(file.name)}</div>
        <div class="file-item-size">${formatBytes(file.size)}</div>
      </div>
      <button class="file-item-remove" data-index="${i}" aria-label="Remover">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    filesList.appendChild(item);
  });
  filesList.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.index, 10)));
  });
}
function updateProcessBtn() {
  const btn = document.getElementById('btnProcess');
  if (!btn) return;
  btn.disabled = selectedFiles.length < (currentTool?.minFiles || 1) || !currentTool?.process;
}
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
 
function renderExtraOptions(type) {
  if (type === 'dividir') {
    extraOpts.innerHTML = `<div class="extra-options"><label>Intervalo de páginas (ex: 1-3 ou 2,4,6)</label><input type="text" id="optPageRange" placeholder="ex: 1-5" /></div>`;
  } else if (type === 'girar') {
    extraOpts.innerHTML = `<div class="extra-options"><label>Ângulo de rotação</label><select id="optRotation"><option value="90">90° (sentido horário)</option><option value="180">180°</option><option value="270">270° (sentido anti-horário)</option></select></div>`;
  } else if (type === 'remover-paginas') {
    extraOpts.innerHTML = `<div class="extra-options"><label>Páginas a remover (ex: 1,3,5 ou 2-4)</label><input type="text" id="optRemovePages" placeholder="ex: 1,3,5-7" /></div>`;
  }
}
 
function showProgress(text='Processando...', status='') {
  progressWrap.classList.add('visible');
  progressTxt.textContent = text;
  progressSts.textContent = status;
  setProgress(0);
}
function hideProgress() { progressWrap.classList.remove('visible'); }
function setProgress(pct, status) {
  progressFill.style.width = pct + '%';
  progressPct.textContent  = Math.round(pct) + '%';
  if (status !== undefined) progressSts.textContent = status;
}
function showSuccess(msg='Arquivo processado com sucesso!') { successState.classList.add('visible'); successSub.textContent = msg; }
function hideSuccess() { successState.classList.remove('visible'); }
function showError(msg) { errorBanner.classList.add('visible'); errorMsg.textContent = msg; }
function hideError() { errorBanner.classList.remove('visible'); }
 
/* ── PROCESS DISPATCHER ── */
async function handleProcess() {
  if (!currentTool?.process) return;
  hideError(); hideSuccess();

  // Identifica essa chamada com a sessão atual do modal: se o usuário fechar o modal ou
  // trocar de ferramenta antes do processamento terminar, `session` fica desatualizado e
  // paramos de mexer na tela (que já pertence a outra ferramenta a essa altura).
  const session = modalSession;
  currentAbortController = new AbortController();

  const btn = document.getElementById('btnProcess');
  btn.disabled = true;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .8s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.5 17A9 9 0 1 1 20.5 7"/></svg> Processando...`;
  dropzone.style.pointerEvents = 'none';
  showProgress('Lendo arquivos...', 'Aguarde o processamento.');

  try {
    const result = await currentTool.process(selectedFiles);
    if (session !== modalSession) return; // modal fechou ou trocou de ferramenta nesse meio-tempo
    setProgress(100, 'Concluído!');
    await new Promise(r => setTimeout(r, 300));
    if (session !== modalSession) return;
    hideProgress();

    if (result?.blob) {
      if (lastObjectURL) URL.revokeObjectURL(lastObjectURL);
      lastObjectURL = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = lastObjectURL;
      a.download = result.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      showSuccess(`Download iniciado: ${result.name}`);
      modalFooter.innerHTML = `
        <button class="btn-action btn-secondary" onclick="resetModal()">Novo arquivo</button>
        <a class="btn-download" href="${lastObjectURL}" download="${result.name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Baixar novamente
        </a>`;
    } else if (result?.info) {
      showSuccess(result.info);
      modalFooter.innerHTML = `<button class="btn-action btn-secondary" onclick="closeModal()">Fechar</button>`;
    }
  } catch (err) {
    if (session !== modalSession) return; // cancelado pelo usuário (modal fechado/trocado) — ignora o erro
    hideProgress();
    showError(err.message || 'Erro desconhecido ao processar o arquivo.');
    btn.disabled = false;
    btn.innerHTML = `${PROCESS_ICON} Tentar novamente`;
  }
  dropzone.style.pointerEvents = '';
}
 
function resetModal() {
  selectedFiles = [];
  filesList.innerHTML = '';
  hideProgress(); hideSuccess(); hideError();
  if (lastObjectURL) { URL.revokeObjectURL(lastObjectURL); lastObjectURL = null; }
  restoreFooter();
  dropzone.style.display = '';
}
 
/* ── HELPERS ── */
function readFileBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = () => rej(new Error(`Falha ao ler: ${file.name}`));
    r.readAsArrayBuffer(file);
  });
}
function parsePageRanges(str, total) {
  const pages = new Set();
  str.split(',').forEach(part => {
    const t = part.trim();
    if (t.includes('-')) {
      const [s, e] = t.split('-').map(n => parseInt(n.trim(), 10));
      if (!Number.isInteger(s) || !Number.isInteger(e) || s > e) {
        throw new Error(`Intervalo inválido: "${t}". Use o formato menor-maior, ex.: 2-5.`);
      }
      for (let i = s; i <= e; i++) if (i >= 1 && i <= total) pages.add(i-1);
    } else {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= total) pages.add(n-1);
    }
  });
  return Array.from(pages).sort((a,b) => a-b);
}
/* Copia as páginas indicadas de `srcDoc` para um PDFDocument novo (usado por dividir e remover-páginas). */
async function extractPagesToNewDoc(srcDoc, indices) {
  const { PDFDocument } = PDFLib;
  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, indices);
  copied.forEach(p => newDoc.addPage(p));
  return newDoc;
}


async function mergePDFs(files) {
  const { PDFDocument } = PDFLib;
  setProgress(5, 'Inicializando...');
  const merged = await PDFDocument.create();
  const step = 85 / files.length;
  for (let i = 0; i < files.length; i++) {
    setProgress(10 + i * step, `Lendo ${files[i].name}…`);
    const buf = await readFileBuffer(files[i]);
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
    setProgress(10 + (i+1) * step, `Adicionado: ${files[i].name}`);
  }
  setProgress(95, 'Salvando...');
  const bytes = await merged.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: 'copacol-unido.pdf' };
}
 
async function splitPDF(files) {
  const { PDFDocument } = PDFLib;
  const rangeStr = document.getElementById('optPageRange')?.value?.trim();
  if (!rangeStr) throw new Error('Informe o intervalo de páginas antes de processar.');
  setProgress(10, 'Lendo arquivo...');
  const buf = await readFileBuffer(files[0]);
  setProgress(30, 'Carregando PDF...');
  const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const indices = parsePageRanges(rangeStr, total);
  if (!indices.length) throw new Error(`Nenhuma página válida. O PDF tem ${total} página(s).`);
  setProgress(60, `Copiando ${indices.length} página(s)...`);
  const newDoc = await extractPagesToNewDoc(srcDoc, indices);
  setProgress(90, 'Salvando...');
  const bytes = await newDoc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: `copacol-pags-${rangeStr.replace(/[^0-9,-]/g,'')}.pdf` };
}
 
async function rotatePDF(files) {
  const { PDFDocument, degrees } = PDFLib;
  const angle = parseInt(document.getElementById('optRotation')?.value || '90', 10);
  setProgress(10, 'Lendo arquivo...');
  const buf = await readFileBuffer(files[0]);
  setProgress(30, 'Carregando PDF...');
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    setProgress(30 + (i / pages.length) * 55, `Girando página ${i+1} de ${pages.length}...`);
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  });
  setProgress(90, 'Salvando...');
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: 'copacol-girado.pdf' };
}
 
async function removePagesPDF(files) {
  const { PDFDocument } = PDFLib;
  const pageStr = document.getElementById('optRemovePages')?.value?.trim();
  if (!pageStr) throw new Error('Informe as páginas a remover antes de processar.');
  setProgress(10, 'Lendo arquivo...');
  const buf = await readFileBuffer(files[0]);
  setProgress(30, 'Carregando PDF...');
  const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const toRemove = new Set(parsePageRanges(pageStr, total));
  if (toRemove.size === 0) throw new Error(`Nenhuma página válida para remover. O PDF tem ${total} página(s).`);
  if (toRemove.size >= total) throw new Error('Não é possível remover todas as páginas.');
  const keepIndices = Array.from({ length: total }, (_, i) => i).filter(i => !toRemove.has(i));
  setProgress(55, 'Copiando páginas...');
  const newDoc = await extractPagesToNewDoc(srcDoc, keepIndices);
  setProgress(90, 'Salvando...');
  const bytes = await newDoc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: 'copacol-paginas-removidas.pdf' };
}
 
async function compressPDF(files) {
  const { PDFDocument } = PDFLib;
  setProgress(10, 'Lendo arquivo...');
  const buf = await readFileBuffer(files[0]);
  const originalSize = files[0].size;
  setProgress(30, 'Carregando PDF...');
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  setProgress(50, 'Removendo metadados...');
  doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
  doc.setKeywords([]); doc.setProducer('Copacol PDF Tools'); doc.setCreator('Copacol');
  setProgress(75, 'Salvando com compressão...');
  const bytes = await doc.save({ useObjectStreams: true });
  const saved = originalSize - bytes.length;
  const pct = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;
  const info = saved > 0
    ? `Comprimido! Redução de ${formatBytes(saved)} (${pct}% menor).`
    : 'O arquivo já estava otimizado — não foi possível reduzir mais o tamanho.';
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: 'copacol-comprimido.pdf', info };
}
 
async function imagesToPDF(files) {
  const { PDFDocument } = PDFLib;
  setProgress(5, 'Criando documento...');
  const doc = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    setProgress(10 + (i / files.length) * 80, `Adicionando imagem ${i+1} de ${files.length}...`);
    const buf = await readFileBuffer(files[i]);
    const mime = files[i].type;
    let img;
    try {
      if (mime === 'image/jpeg' || files[i].name.match(/\.jpe?g$/i)) img = await doc.embedJpg(buf);
      else if (mime === 'image/png' || files[i].name.match(/\.png$/i)) img = await doc.embedPng(buf);
      else throw new Error(`Formato não suportado: ${files[i].name}. Use JPG ou PNG.`);
    } catch(e) { throw new Error(`Erro ao processar ${files[i].name}: ${e.message}`); }
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  setProgress(92, 'Salvando PDF...');
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: 'copacol-imagens.pdf' };
}

/* ── CONVERSÕES VIA BACKEND (LibreOffice headless) ── */
/* Usa XMLHttpRequest (não fetch) porque é o único jeito com bom suporte em todo
   navegador de acompanhar o progresso real do envio — o `fetch` não tem isso.
   0-60%: envio real do arquivo. 60%: sem como medir o tempo de conversão no
   servidor, fica parado nesse ponto. 60-95%: download real da resposta. */
function convertViaBackend(file, target, outputName) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('target', target);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/convert`);
    xhr.responseType = 'blob';

    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      setProgress(Math.max(1, Math.round((e.loaded / e.total) * 60)), 'Enviando arquivo...');
    };
    xhr.upload.onload = () => setProgress(60, 'Convertendo no servidor...');
    xhr.onprogress = e => {
      if (!e.lengthComputable) return;
      setProgress(60 + Math.round((e.loaded / e.total) * 35), 'Baixando resultado...');
    };

    xhr.onerror = () => reject(new Error('Não foi possível conectar ao servidor de conversão. Verifique sua conexão.'));
    xhr.onabort = () => reject(Object.assign(new Error('Cancelado.'), { name: 'AbortError' }));

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(95, 'Finalizando...');
        resolve({ blob: xhr.response, name: outputName });
        return;
      }
      let msg = 'Falha ao converter o arquivo.';
      if (xhr.status === 413) msg = 'Arquivo excede o limite permitido pelo servidor.';
      else if (xhr.status === 504) msg = 'A conversão demorou demais e foi cancelada. Tente um arquivo menor.';
      else {
        try { const body = JSON.parse(await xhr.response.text()); if (body?.error) msg = body.error; }
        catch { /* resposta sem JSON */ }
      }
      reject(new Error(msg));
    };

    const signal = currentAbortController?.signal;
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort());
    }

    setProgress(1, 'Enviando arquivo...');
    xhr.send(form);
  });
}

async function pdfToWord(files) { return convertViaBackend(files[0], 'docx', 'copacol-convertido.docx'); }
async function wordToPdf(files) { return convertViaBackend(files[0], 'pdf', 'copacol-convertido.pdf'); }
async function pptxToPdf(files) { return convertViaBackend(files[0], 'pdf', 'copacol-convertido.pdf'); }
