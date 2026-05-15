import { Newspaper } from "lucide-react";
import type { HotSource } from "../lib/hot";

export function HotSourceCard({ source }: { source: HotSource }) {
  return (
    <article className="hot-card">
      <header className="hot-card-head">
        {source.iconUrl ? <img alt="" src={source.iconUrl} /> : <Newspaper size={16} />}
        <span className="hot-card-name">{source.name}</span>
      </header>
      <ol className="hot-card-list">
        {source.items.slice(0, 10).map((item) => (
          <li key={`${source.id}-${item.rank}-${item.title}`}>
            <a href={item.url} rel="noreferrer" target="_blank" title={item.title}>
              <strong>{item.rank}</strong>
              <span>{item.title}</span>
            </a>
          </li>
        ))}
      </ol>
      <footer className="hot-card-footer">
        <span>{source.category}</span>
        <span>{source.updatedAt}</span>
      </footer>
    </article>
  );
}
