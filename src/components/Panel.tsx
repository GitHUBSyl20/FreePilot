import type { ReactNode } from 'react';

export function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {children}
    </article>
  );
}

export function InfoRow({ helper, label, value }: { helper?: string | null; label: string; value: string }) {
  return (
    <div className="info-row">
      <div>
        <span>{label}</span>
        {helper ? <p>{helper}</p> : null}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="muted-note">{children}</p>;
}
