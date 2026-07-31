import { useState, type ReactNode } from 'react';

/**
 * Le repli est une préférence d'affichage de cet appareil, pas une donnée : il
 * reste hors de `FinanceData`, qui part dans les exports et au cloud. Et il
 * passe par localStorage plutôt qu'IndexedDB pour être lu avant le premier
 * rendu — une lecture asynchrone ouvrirait chaque panneau avant de le refermer
 * sous les yeux.
 */
const COLLAPSED_KEY = 'freepilot:collapsedPanels';

const readCollapsedPanels = (): Record<string, boolean> => {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
};

const writeCollapsedPanel = (title: string, collapsed: boolean): void => {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify({ ...readCollapsedPanels(), [title]: collapsed }));
  } catch {
    // Sans persistance, le panneau se rouvrira au prochain lancement : gênant,
    // jamais grave.
  }
};

/**
 * `collapsible` s'ouvre panneau par panneau plutôt que partout : replier un
 * formulaire de saisie ou un bloc de deux lignes coûterait un clic sans rien
 * faire gagner. Seules les longues listes et les blocs de réglages en tirent
 * quelque chose.
 */
export function Panel({
  children,
  collapsible = false,
  title,
}: {
  children: ReactNode;
  collapsible?: boolean;
  title: string;
}) {
  // Le titre sert de clé : il est stable et unique à l'écran, là où un index
  // de rendu changerait au moindre réagencement.
  const [collapsed, setCollapsed] = useState(() => collapsible && readCollapsedPanels()[title] === true);

  if (!collapsible) {
    return (
      <article className="panel">
        <h2>{title}</h2>
        {children}
      </article>
    );
  }

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsedPanel(title, next);
  };

  return (
    <article className={collapsed ? 'panel collapsed' : 'panel'}>
      <h2>
        <button aria-expanded={!collapsed} className="panel-toggle" onClick={toggle} type="button">
          {title}
          <svg aria-hidden="true" className="panel-chevron" viewBox="0 0 24 24">
            <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
          </svg>
        </button>
      </h2>
      {collapsed ? null : children}
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
