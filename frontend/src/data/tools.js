import {
  MergeIcon, SplitIcon, RotateIcon, RemovePagesIcon, BoltIcon,
  DocIcon, DocLinesIcon, DocFoldIcon, ImageIcon, SlideIcon, SlideStandIcon,
  CheckIcon, BoltBadgeIcon, ConvertBadgeIcon,
} from '../components/icons.jsx';

/* Textos e aparência de cada ferramenta. O que REALMENTE está disponível vem do
 * backend (GET /api/tools): uma ferramenta daqui só aparece na tela se o servidor a
 * listar — se o motor não estiver instalado, o card não aparece.
 *
 * Campos:
 *   id        id da ferramenta no backend (campo `tool` do envio)
 *   options   formulário extra no modal (ver ToolOptions)
 *   required  opção que precisa estar preenchida antes de enviar
 */

export const CATEGORIES = {
  organizar: { label: 'Organizar', Icon: CheckIcon },
  otimizar:  { label: 'Otimizar',  Icon: BoltBadgeIcon },
  converter: { label: 'Converter', Icon: ConvertBadgeIcon },
};

/* Tipo real (detectado pelo backend) -> extensões/MIME pro seletor de arquivos. */
export const TYPE_ACCEPT = {
  pdf: ['.pdf', 'application/pdf'],
  jpeg: ['.jpg', '.jpeg', 'image/jpeg'],
  png: ['.png', 'image/png'],
  webp: ['.webp', 'image/webp'],
  docx: ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};

export const TYPE_LABEL = { pdf: 'PDF', jpeg: 'JPG', png: 'PNG', webp: 'WebP', docx: 'DOCX', pptx: 'PPTX' };

export const TOOLS = [
  {
    id: 'merge', title: 'Juntar PDF',
    desc: 'Mescle vários PDFs na ordem que você escolher.',
    subtitle: 'Combine vários PDFs em um único documento. Use as setas para definir a ordem.',
    cat: 'organizar', iconColor: 'ic-green', Icon: MergeIcon, options: null, reorder: true,
  },
  {
    id: 'split', title: 'Dividir PDF',
    desc: 'Extraia páginas ou separe uma por arquivo.',
    subtitle: 'Extraia um intervalo de páginas ou gere um PDF por página.',
    cat: 'organizar', iconColor: 'ic-red', Icon: SplitIcon, options: 'split',
    required: (o) => ((o.mode || 'range') === 'range' && !o.range?.trim()
      ? 'Informe o intervalo de páginas antes de processar.' : null),
  },
  {
    id: 'rotate', title: 'Girar PDF',
    desc: 'Gire todas as páginas do documento.',
    subtitle: 'Gire todas as páginas em 90°, 180° ou 270°.',
    cat: 'organizar', iconColor: 'ic-orange', Icon: RotateIcon, options: 'rotate',
  },
  {
    id: 'remove-pages', title: 'Remover páginas',
    desc: 'Exclua páginas específicas de um PDF.',
    subtitle: 'Informe os números das páginas a remover.',
    cat: 'organizar', iconColor: 'ic-green', Icon: RemovePagesIcon, options: 'remove-pages',
    required: (o) => (!o.pages?.trim() ? 'Informe as páginas a remover antes de processar.' : null),
  },
  {
    id: 'compress', title: 'Comprimir PDF',
    desc: 'Reduza o tamanho recomprimindo imagens e fontes.',
    subtitle: 'Recomprime imagens e fontes. O ganho depende do conteúdo do PDF.',
    cat: 'otimizar', iconColor: 'ic-teal', Icon: BoltIcon, options: 'compress',
  },
  {
    id: 'word-to-pdf', title: 'Word para PDF',
    desc: 'Converta documentos DOCX em PDF.',
    subtitle: 'Converte um documento Word (DOCX) em PDF.',
    cat: 'converter', iconColor: 'ic-blue', Icon: DocIcon, CardIcon: DocFoldIcon, options: null,
  },
  {
    id: 'pptx-to-pdf', title: 'PowerPoint para PDF',
    desc: 'Converta apresentações PPTX em PDF.',
    subtitle: 'Converte uma apresentação PowerPoint (PPTX) em PDF.',
    cat: 'converter', iconColor: 'ic-purple', Icon: SlideIcon, CardIcon: SlideStandIcon, options: null,
  },
  {
    id: 'images-to-pdf', title: 'Imagens para PDF',
    desc: 'Junte fotos JPG, PNG ou WebP em um PDF.',
    subtitle: 'Uma página por imagem, na ordem da lista.',
    cat: 'converter', iconColor: 'ic-amber', Icon: ImageIcon, options: null, reorder: true,
  },
  {
    id: 'convert-image', title: 'Converter imagem',
    desc: 'Converta entre JPG, PNG e WebP.',
    subtitle: 'Escolha o formato de destino. Várias imagens saem num arquivo ZIP.',
    cat: 'converter', iconColor: 'ic-amber', Icon: ImageIcon, options: 'convert-image',
    required: (o) => (!o.target ? 'Escolha o formato de destino.' : null),
  },
  {
    id: 'pdf-to-docx', title: 'PDF para Word',
    desc: 'Converta PDF com texto em DOCX editável.',
    subtitle: 'Funciona com PDF de texto selecionável. PDF digitalizado (imagem) não é convertido.',
    cat: 'converter', iconColor: 'ic-blue', Icon: DocIcon, CardIcon: DocLinesIcon, options: null,
  },
];

/** Junta o catálogo visual com o que o servidor informou estar disponível. */
export function availableTools(serverTools) {
  const byId = new Map(serverTools.map((t) => [t.id, t]));
  return TOOLS.filter((tool) => byId.has(tool.id)).map((tool) => {
    const server = byId.get(tool.id);
    const accept = server.accepts.flatMap((type) => TYPE_ACCEPT[type] || []);
    return {
      ...tool,
      ...server,
      acceptAttr: accept.join(','),
      acceptExtensions: accept.filter((a) => a.startsWith('.')),
      acceptLabel: server.accepts.map((type) => TYPE_LABEL[type]).filter(Boolean).join(', '),
      multiple: server.maxFiles > 1,
    };
  });
}

/** Monta o multipart que o backend espera em POST /api/jobs. */
export function buildForm(tool, files, options) {
  const form = new FormData();
  form.append('tool', tool.id);
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, value);
  }
  for (const file of files) form.append('files', file, file.name);
  return form;
}
