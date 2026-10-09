"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal semantics keep focus and pointer input inside the active sheet. */
export default function AppDialog({ open, label, onClose, children }: {
  open: boolean; label: string; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousLabel = useRef("");

  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opening = open && !element.open;
    if (opening) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    }
    else if (!open && element.open) element.close();
    if (open && (opening || previousLabel.current !== label)) {
      const focusTarget = element.querySelector<HTMLElement>("[data-dialog-focus]")
        ?? element.querySelector<HTMLElement>("h2")
        ?? Array.from(element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).find(button => button.getClientRects().length > 0);
      if (focusTarget?.matches("h2")) focusTarget.tabIndex = -1;
      focusTarget?.focus();
    }
    previousLabel.current = label;
  }, [open, label]);

  return <dialog ref={dialog} className="scrim" aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}
