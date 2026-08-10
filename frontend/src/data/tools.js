import {
  MergeIcon, SplitIcon, RotateIcon, RemovePagesIcon, BoltIcon,
  DocIcon, DocLinesIcon, DocFoldIcon, SheetIcon, TableIcon,
  ImageIcon, SlideIcon, SlideStandIcon,
  CheckIcon, BoltBadgeIcon, ConvertBadgeIcon,
} from '../components/icons.jsx';

/* Catálogo das ferramentas: fonte única da verdade dos cards, do modal e da chamada de
 * API de cada uma. Acrescentar uma ferramenta é acrescentar uma entrada aqui.
 *
 * Campos:
 *   accept/multiple/minFiles  o que o seletor de arquivos aceita
 *   options                   qual formulário extra o modal mostra (null = nenhum)
 *   endpoint                  rota da API; null marca a ferramenta como "em breve"
 *   fileField                 'file' (um) ou 'files' (vários), conforme a rota espera
 *   extraFields               valores do formulário que viram campos do multipart
 *   requiredOption            campo que precisa estar preenchido antes de enviar
 */

export const CATEGORIES = {
  organizar: { label: 'Organizar', Icon: CheckIcon },
  otimizar:  { label: 'Otimizar',  Icon: BoltBadgeIcon },
  converter: { label: 'Converter', Icon: ConvertBadgeIcon },
};

export const TOOLS = {
  juntar: {
    title: 'Juntar PDF',
    desc: 'Mescle múltiplos PDFs em qualquer ordem.',
    subtitle: 'Combine múltiplos PDFs em um único documento.',
    cat: 'organizar', iconColor: 'ic-green', Icon: MergeIcon,
    accept: '.pdf', multiple: true, minFiles: 2, options: null,
    endpoint: '/api/pdf/merge', fileField: 'files', outputName: 'copacol-unido.pdf',
  },

  dividir: {
    title: 'Dividir PDF',
    desc: 'Selecione páginas ou intervalos para separar.',
    subtitle: 'Extraia um intervalo de páginas do seu PDF.',
    cat: 'organizar', iconColor: 'ic-red', Icon: SplitIcon,
    accept: '.pdf', multiple: false, minFiles: 1, options: 'dividir',
    endpoint: '/api/pdf/split', fileField: 'file', outputName: 'copacol-paginas.pdf',
    extraFields: (opts) => ({ range: opts.range }),
    requiredOption: { field: 'range', message: 'Informe o intervalo de páginas antes de processar.' },
  },

  girar: {
    title: 'Girar PDF',
    desc: 'Rotacione páginas individualmente ou o documento todo.',
    subtitle: 'Rotacione todas as páginas em 90°.',
    cat: 'organizar', iconColor: 'ic-orange', Icon: RotateIcon,
    accept: '.pdf', multiple: false, minFiles: 1, options: 'girar',
    endpoint: '/api/pdf/rotate', fileField: 'file', outputName: 'copacol-girado.pdf',
    extraFields: (opts) => ({ angle: opts.angle || '90' }),
  },

  'remover-paginas': {
    title: 'Remover Páginas',
    desc: 'Exclua páginas específicas de qualquer PDF.',
    subtitle: 'Informe os números das páginas a remover.',
    cat: 'organizar', iconColor: 'ic-green', Icon: RemovePagesIcon,
    accept: '.pdf', multiple: false, minFiles: 1, options: 'remover-paginas',
    endpoint: '/api/pdf/remove-pages', fileField: 'file', outputName: 'copacol-paginas-removidas.pdf',
    extraFields: (opts) => ({ pages: opts.pages }),
    requiredOption: { field: 'pages', message: 'Informe as páginas a remover antes de processar.' },
  },

  comprimir: {
    title: 'Comprimir PDF',
    desc: 'Remove metadados para reduzir levemente o tamanho.',
    subtitle: 'Reduz o tamanho removendo metadados e otimizando os objetos.',
    cat: 'otimizar', iconColor: 'ic-teal', Icon: BoltIcon,
    accept: '.pdf', multiple: false, minFiles: 1, options: null,
    endpoint: '/api/pdf/compress', fileField: 'file', outputName: 'copacol-comprimido.pdf',
  },

  'pdf-word': {
    title: 'PDF para Word',
    desc: 'Converta PDFs para DOCX editáveis.',
    subtitle: 'Converte seu PDF em um documento Word (DOCX) editável.',
    cat: 'converter', iconColor: 'ic-blue', Icon: DocIcon, CardIcon: DocLinesIcon,
    accept: '.pdf', multiple: false, minFiles: 1, options: null,
    endpoint: '/api/convert', fileField: 'file', outputName: 'copacol-convertido.docx',
    extraFields: () => ({ target: 'docx' }),
  },

  'pdf-excel': {
    title: 'PDF para Excel',
    desc: 'Extraia tabelas de PDFs para planilhas XLSX.',
    subtitle: 'Em breve.',
    cat: 'converter', iconColor: 'ic-teal', Icon: SheetIcon, CardIcon: TableIcon,
    accept: '.pdf', multiple: false, minFiles: 1, options: null,
    // Sem endpoint: o backend não expõe pdf->xlsx porque não há conversor open-source
    // confiável pra essa direção (ver ALLOWED_CONVERSIONS em backend/src/routes/convert.js).
    endpoint: null,
  },

  'jpg-pdf': {
    title: 'JPG para PDF',
    desc: 'Converta imagens JPG/PNG para PDF.',
    subtitle: 'Combine imagens JPG/PNG em um único PDF.',
    cat: 'converter', iconColor: 'ic-amber', Icon: ImageIcon,
    accept: 'image/jpeg,image/png,.jpg,.jpeg,.png', multiple: true, minFiles: 1, options: null,
    endpoint: '/api/pdf/images-to-pdf', fileField: 'files', outputName: 'copacol-imagens.pdf',
  },

  'word-pdf': {
    title: 'Word para PDF',
    desc: 'Converta DOCX para PDF com qualidade profissional.',
    subtitle: 'Converte seu documento Word (DOCX) em um PDF.',
    cat: 'converter', iconColor: 'ic-blue', Icon: DocIcon, CardIcon: DocFoldIcon,
    accept: '.docx', multiple: false, minFiles: 1, options: null,
    endpoint: '/api/convert', fileField: 'file', outputName: 'copacol-convertido.pdf',
    extraFields: () => ({ target: 'pdf' }),
  },

  'pptx-pdf': {
    title: 'PowerPoint para PDF',
    desc: 'Transforme PPT/PPTX para PDF com layout preservado.',
    subtitle: 'Converte sua apresentação PowerPoint (PPTX) em um PDF.',
    cat: 'converter', iconColor: 'ic-purple', Icon: SlideIcon, CardIcon: SlideStandIcon,
    accept: '.pptx', multiple: false, minFiles: 1, options: null,
    endpoint: '/api/convert', fileField: 'file', outputName: 'copacol-convertido.pdf',
    extraFields: () => ({ target: 'pdf' }),
  },
};

/** Monta o corpo multipart que a rota da ferramenta espera. */
export function buildForm(tool, files, options) {
  const form = new FormData();

  const chosen = tool.fileField === 'files' ? files : files.slice(0, 1);
  for (const file of chosen) form.append(tool.fileField, file, file.name);

  for (const [key, value] of Object.entries(tool.extraFields?.(options) ?? {})) {
    form.append(key, value);
  }
  return form;
}
