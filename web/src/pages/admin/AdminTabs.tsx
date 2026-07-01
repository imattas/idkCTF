import { NavLink } from "react-router-dom";

export interface AdminTab {
  id: string;
  label: string;
  to: string;
}

export default function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  return (
    <div className="mb-6 overflow-x-auto border-b border-[var(--border)]">
      <div className="flex min-w-max gap-1 pb-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.to}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
