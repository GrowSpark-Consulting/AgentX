"use client";

import { useEffect, useId, type ReactNode } from "react";

// The prototype's dialog (features/settings/pakka-settings.tsx: "Disconnect …?", "Close … account?"):
// .dialog-backdrop over the page, a .dialog in --color-bg, 460px wide, title, text, actions on the
// left. Added here: dialog semantics, Escape to close, and no closing while a save is running.

export function DialogFrame({
  title,
  onClose,
  busy,
  width = 460,
  children,
}: {
  title: string;
  onClose: () => void;
  /** While true, the backdrop and Escape don't close it (a save or delete is in flight). */
  busy: boolean;
  /** Most dialogs are the prototype's 460px; a form with a weekly timetable needs more. */
  width?: number;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="dialog-backdrop" onClick={busy ? undefined : onClose} style={{ position: "fixed", zIndex: 50 }}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--color-bg)", width: `min(${width}px,100%)`, maxHeight: "100%", overflowY: "auto" }}
      >
        <div id={titleId} className="dialog-title">
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}
