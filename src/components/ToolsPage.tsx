import { useState } from "react";
import { TOOLS } from "./tools/registry";

export function ToolsPage() {
  const [activeId, setActiveId] = useState(TOOLS[0]?.id ?? "");
  const active = TOOLS.find((t) => t.id === activeId) ?? TOOLS[0];
  const ActiveComponent = active?.component;

  return (
    <section className="tools-page" aria-label="工具箱">
      <aside className="tools-sidebar" aria-label="工具列表">
        <div className="tools-sidebar-title">工具箱</div>
        <ul className="tools-nav">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = tool.id === active?.id;
            return (
              <li key={tool.id}>
                <button
                  className={`tools-nav-item${isActive ? " active" : ""}`}
                  onClick={() => setActiveId(tool.id)}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={17} />
                  <div className="tools-nav-text">
                    <span className="tools-nav-label">{tool.label}</span>
                    <span className="tools-nav-desc">{tool.description}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="tools-main">{ActiveComponent ? <ActiveComponent /> : null}</main>
    </section>
  );
}
