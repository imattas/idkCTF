import { useEffect, type ReactNode } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[calc(100vh-4rem)] overflow-y-auto rounded-md border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          <h3 id="modal-title" className="min-w-0 truncate text-base">{title}</h3>
          <button onClick={onClose} className="btn-ghost h-8 min-h-0 px-2 text-xs" aria-label="Close modal">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
