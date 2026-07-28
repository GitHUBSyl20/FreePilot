/**
 * Confirmation rendue par l'app plutôt que par `window.confirm`.
 *
 * Les boîtes natives sont supprimées par le navigateur dans plusieurs
 * situations courantes (page dans une iframe, application installée, blocage
 * après plusieurs dialogues). `confirm()` renvoie alors `false` sans rien
 * afficher : l'action est annulée en silence et l'utilisateur croit que
 * l'application ne réagit pas. Une confirmation interne est toujours visible.
 */
export type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

type Props = {
  confirmation: Confirmation;
  onCancel: () => void;
};

export function ConfirmDialog({ confirmation, onCancel }: Props) {
  return (
    <div aria-label={confirmation.title} aria-modal="true" className="dialog-backdrop" role="dialog">
      <div className="dialog">
        <h2>{confirmation.title}</h2>
        <p>{confirmation.message}</p>
        <div className="button-row">
          <button
            className="danger-button"
            onClick={() => {
              confirmation.onConfirm();
              onCancel();
            }}
            type="button"
          >
            {confirmation.confirmLabel}
          </button>
          <button className="secondary-button" onClick={onCancel} type="button">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
