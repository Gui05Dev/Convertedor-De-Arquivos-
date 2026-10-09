import { CATEGORIES } from '../data/tools.js';

function ToolCard({ tool, onOpen }) {
  const category = CATEGORIES[tool.cat];
  const BadgeIcon = category.Icon;
  const CardIcon = tool.CardIcon || tool.Icon;
  const badgeClass = `badge-${tool.iconColor.replace('ic-', '')}`;

  /* <button> de verdade: foco, Enter e Espaço funcionam sem código extra e o leitor de
     tela anuncia como botão, com título e descrição. */
  return (
    <button
      type="button"
      className="tool-card"
      data-cat={tool.cat}
      data-tool={tool.id}
      onClick={() => onOpen(tool.id)}
      aria-describedby={`desc-${tool.id}`}
    >
      <span className={`card-icon-box ${tool.iconColor}`} aria-hidden="true"><CardIcon /></span>
      <span className="card-body">
        <span className="card-title">{tool.title}</span>
        <span className="card-desc" id={`desc-${tool.id}`}>{tool.desc}</span>
      </span>
      <span className={`card-badge ${badgeClass}`}>
        <BadgeIcon />
        {category.label}
      </span>
    </button>
  );
}

export function ToolsGrid({ tools, onOpen }) {
  return (
    <div className="tools-grid">
      {tools.map((tool) => <ToolCard key={tool.id} tool={tool} onOpen={onOpen} />)}
    </div>
  );
}
