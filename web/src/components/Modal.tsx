import { useEffect, type ReactNode } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  xl,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  const width = xl ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/70 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[calc(100vh-1.5rem)] w-full ${width} flex-col overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl sm:max-h-[calc(100vh-3rem)]`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          <h3 id="modal-title" className="min-w-0 truncate text-base">{title}</h3>
          <button onClick={onClose} className="btn-ghost h-8 min-h-0 px-2 text-xs" aria-label="Close modal">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
