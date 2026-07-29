import { useEffect } from "react";
import { SHORTCUT_GROUPS, TEMPO_SHORTCUTS } from "./shortcuts";

/**
 * The `?` sheet. Deliberately the same content as the Settings card rather than
 * a shorter "cheat sheet" — two lists that drift are worse than one list twice.
 */
export default function ShortcutsOverlay({
  canEdit,
  showTempo,
  onClose,
}: {
  canEdit: boolean;
  showTempo: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay no-print" onClick={onClose}>
      <div
        className="modal wide keys-modal"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>Keyboard shortcuts</h3>
          <button className="btn ghost sm" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="keys-body">
          <ShortcutTable canEdit={canEdit} showTempo={showTempo} />
        </div>
      </div>
    </div>
  );
}

/** Shared by the overlay and the Settings page. */
export function ShortcutTable({
  canEdit,
  showTempo,
}: {
  canEdit: boolean;
  showTempo: boolean;
}) {
  const groups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canEdit || !item.deskOnly),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="keys-grid">
      {groups.map((group) => (
        <section className="keys-group" key={group.title}>
          <h4>{group.title}</h4>
          <dl>
            {group.items.map((item) => (
              <div className="keys-row" key={item.action}>
                <dt>
                  {item.keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {showTempo ? (
        <section className="keys-group" key="tempo">
          <h4>Tempo</h4>
          <dl>
            {TEMPO_SHORTCUTS.map((item) => (
              <div className="keys-row" key={item.label}>
                <dt>
                  {item.keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
