"use client";

import { useEffect, useRef, useState } from "react";

// The services editor's confirmation toast (services-editor.tsx), for the other Knowledge sections:
// shown after the API confirms a write, never before.

const TOAST_MS = 2600;
const visuallyHidden = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" } as const;
const toastStyle = { position: "fixed", left: "16px", bottom: "16px", zIndex: 60, background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px", fontSize: "14px", fontWeight: "600", maxWidth: "calc(100vw - 32px)", overflowWrap: "anywhere" } as const;

export function useFlash(): [string | null, (message: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (message: string) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  };
  return [toast, flash];
}

/** Always in the page: screen readers announce a live region's new text. Empty, it takes no space. */
export function FlashStatus({ toast }: { toast: string | null }) {
  return (
    <div role="status" aria-live="polite" style={toast ? toastStyle : visuallyHidden}>
      {toast}
    </div>
  );
}
