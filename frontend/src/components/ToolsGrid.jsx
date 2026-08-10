import { TOOLS, CATEGORIES } from '../data/tools.js';

function ToolCard({ toolKey, tool, onOpen }) {
  const category = CATEGORIES[tool.cat];
  const BadgeIcon = category.Icon;
  const CardIcon = tool.CardIcon || tool.Icon;
  const badgeClass = `badge-${tool.iconColor.replace('ic-', '')}`;

  return (
    <div
      className="tool-card"
      data-cat={tool.cat}
      data-tool={toolKey}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(toolKey)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(toolKey);
      }}
    >
      <div className={`card-icon-box ${tool.iconColor}`}><CardIcon /></div>
      <div className="card-body">
        <div className="card-title">{tool.title}</div>
        <div className="card-desc">{tool.desc}</div>
      </div>
      <span className={`card-badge ${badgeClass}`}>
        <BadgeIcon />
        {category.label}
      </span>
    </div>
  );
}

export function ToolsGrid({ onOpen }) {
  return (
    <div className="tools-grid">
      {Object.entries(TOOLS).map(([key, tool]) => (
        <ToolCard key={key} toolKey={key} tool={tool} onOpen={onOpen} />
      ))}
    </div>
  );
}
