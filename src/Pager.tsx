// Paging for any long list (Bill, 2026-10-10): how many there are, which ones are shown, the page links
// around this one (up to ten), and first, previous, next and last. The page is `start` (a row offset) in
// the address, so a page can be linked; a screen's list reads it and passes the change back.

export const PAGE_SIZE = 50;
const LINKS = 10;

function count(n: number): string {
  return n.toLocaleString("en-US");
}

export default function Pager({
  start,
  total,
  shown,
  noun,
  onGo,
  size = PAGE_SIZE,
}: {
  start: number; // the first row shown, from 0
  total: number;
  shown: number; // rows on this page
  noun: string; // "instruments", "securities"
  onGo: (start: number) => void;
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages - 1, Math.floor(start / size)); // from 0
  // Ten page links with this one in them: a few before, the rest after, kept inside 1..pages.
  const first = Math.max(0, Math.min(page - 3, pages - LINKS));
  const links = Array.from({ length: Math.min(LINKS, pages) }, (_, i) => first + i);
  const go = (p: number) => onGo(Math.max(0, Math.min(pages - 1, p)) * size);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="muted pager-count">
        {total === 0 ? `No ${noun}` : shown >= total ? `${count(total)} ${noun}` : `${count(start + 1)}–${count(start + shown)} of ${count(total)} ${noun}`}
      </span>
      {pages > 1 && (
        <span className="pager-links">
          <button type="button" className="tool" disabled={page === 0} onClick={() => go(0)} aria-label="First page" title="First page">
            «
          </button>
          <button type="button" className="tool" disabled={page === 0} onClick={() => go(page - 1)} aria-label="Previous page" title="Previous page">
            ‹
          </button>
          {links.map((p) => (
            <button
              key={p}
              type="button"
              className="tool"
              aria-current={p === page ? "page" : undefined}
              aria-pressed={p === page}
              onClick={() => go(p)}
              title={`Page ${p + 1}`}
            >
              {p + 1}
            </button>
          ))}
          <button type="button" className="tool" disabled={page === pages - 1} onClick={() => go(page + 1)} aria-label="Next page" title="Next page">
            ›
          </button>
          <button type="button" className="tool" disabled={page === pages - 1} onClick={() => go(pages - 1)} aria-label={`Last page (${pages})`} title={`Last page (${pages})`}>
            »
          </button>
        </span>
      )}
    </nav>
  );
}
