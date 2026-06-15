import { useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store";
import { api } from "../api";
import type { NavPage } from "../types";

export default function Layout() {
  const { config, user, competition_state, refresh } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Page-view telemetry: a full reload remounts this component (refresh=true);
  // client-side navigation keeps it mounted (refresh=false).
  const firstView = useRef(true);
  useEffect(() => {
    if (!user) return;
    const isRefresh = firstView.current;
    firstView.current = false;
    api.post("/telemetry/pageview", { path: location.pathname, refresh: isRefresh }).catch(() => {});
  }, [location.pathname, user]);
  const { data: navPages } = useQuery({
    queryKey: ["nav-pages"],
    queryFn: () => api.get<{ nav: NavPage[]; footer: NavPage[] }>("/pages"),
  });

  const logout = async () => {
    await api.post("/auth/logout");
    await refresh();
    navigate("/");
  };

  const link = (to: string, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 text-sm rounded-md transition ${
          isActive ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:text-white hover:bg-slate-800/60"
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4 flex items-center gap-2 font-bold">
            {config.has_logo ? (
              <img src="/api/branding/logo" alt={config.ctf_name} className="h-8 w-auto" />
            ) : (
              <>
                <span className="text-accent mono">{">_"}</span>
                <span className="text-white">{config.ctf_name}</span>
              </>
            )}
          </Link>
          {link("/challenges", "Challenges")}
          {config.scoreboard_visible && link("/scoreboard", "Scoreboard")}
          {config.mode === "teams" && user && link("/team", "Team")}
          {navPages?.nav.map((p) => link(`/p/${p.slug}`, p.title))}
          {user?.role === "admin" && link("/admin", "Admin")}

          <div className="ml-auto flex items-center gap-2">
            {config.paused && (
              <span className="badge border-amber-700 text-amber-400">⏸ Paused</span>
            )}
            {competition_state === "before" && (
              <span className="badge border-amber-700 text-amber-400">Not started</span>
            )}
            {competition_state === "ended" && (
              <span className="badge border-rose-700 text-rose-400">Ended</span>
            )}
            {user ? (
              <>
                {link("/profile", user.name)}
                <button onClick={logout} className="btn-ghost">
                  Logout
                </button>
              </>
            ) : (
              <>
                {link("/login", "Login")}
                {config.registration_open && (
                  <Link to="/register" className="btn-primary">
                    Register
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="mt-10 border-t border-slate-800/70 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-sm text-slate-400">
          <Link to="/docs" className="hover:text-accent">API Docs</Link>
          {navPages?.footer.map((p) => (
            <Link key={p.slug} to={`/p/${p.slug}`} className="hover:text-accent">{p.title}</Link>
          ))}
          {config.scoreboard_visible && <Link to="/scoreboard" className="hover:text-accent">Scoreboard</Link>}
        </div>
        {config.footer_html && (
          <div className="mx-auto mt-4 max-w-7xl px-4 text-center text-xs text-slate-500" dangerouslySetInnerHTML={{ __html: config.footer_html }} />
        )}
        <div className="mt-4 text-center text-xs text-slate-600">{config.ctf_name} · powered by CloudCTF on Cloudflare</div>
      </footer>
    </div>
  );
}
