import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Outlet, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store";
import { api } from "../api";
import type { NavPage } from "../types";

export default function Layout() {
  const { config, user, competition_state, refresh } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const brandRest = config.ctf_name.replace(/^idk/i, "");
  const hasIdkBrand = brandRest !== config.ctf_name;
  const logoSrc = config.has_logo ? "/api/branding/logo" : "/branding/idktheflag-logo.png";

  const firstView = useRef(true);
  useEffect(() => {
    if (!user) return;
    const isRefresh = firstView.current;
    firstView.current = false;
    api.post("/telemetry/pageview", { path: location.pathname, refresh: isRefresh }).catch(() => {});
  }, [location.pathname, user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const { data: navPages } = useQuery({
    queryKey: ["nav-pages"],
    queryFn: () => api.get<{ nav: NavPage[]; footer: NavPage[] }>("/pages"),
  });

  const logout = async () => {
    await api.post("/auth/logout");
    await refresh();
    navigate("/");
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    [
      "relative rounded-md px-3 py-2 font-mono text-sm transition",
      isActive
        ? "text-white after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded after:bg-[var(--accent)]"
        : "text-[var(--fg-faint)] hover:text-white hover:bg-[var(--surface-2)]",
    ].join(" ");

  const links = (
    <>
      <NavLink to="/challenges" className={navClass}>Challenges</NavLink>
      {config.scoreboard_visible && <NavLink to="/scoreboard" className={navClass}>Scoreboard</NavLink>}
      {config.mode === "teams" && user && <NavLink to="/team" className={navClass}>Team</NavLink>}
      {navPages?.nav.map((p) => <NavLink key={p.slug} to={`/p/${p.slug}`} className={navClass}>{p.title}</NavLink>)}
      {user?.role === "admin" && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
    </>
  );

  return (
    <div className="app-shell">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[var(--accent)] bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] backdrop-blur">
        <div className="container-app flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label={`${config.ctf_name} home`}>
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md border border-[var(--border-strong)] bg-white p-1">
              <img src={logoSrc} alt="" className="max-h-full max-w-full object-contain" />
            </span>
            <span className="truncate font-semibold text-white mono">
              {hasIdkBrand ? <><span className="text-accent">idk</span>{brandRest}</> : config.ctf_name}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {links}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {config.paused && <span className="badge border-amber-700 text-amber-300">Paused</span>}
            {competition_state === "before" && <span className="badge border-amber-700 text-amber-300">Not started</span>}
            {competition_state === "ended" && <span className="badge border-rose-700 text-rose-300">Ended</span>}
            {user ? (
              <>
                <NavLink to="/profile" className={navClass}>{user.name}</NavLink>
                <button onClick={logout} className="btn-ghost px-3">Log out</button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>Log in</NavLink>
                {config.registration_open && !config.site_lockdown && <Link to="/register" className="btn-primary px-3">Register</Link>}
              </>
            )}
          </div>

          <button
            type="button"
            className="btn-ghost px-3 md:hidden"
            aria-controls="mobile-nav"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-nav" className="border-t border-[var(--border)] bg-[var(--bg-raised)] md:hidden">
            <div className="container-app grid gap-2 py-4">
              <nav className="grid gap-1" aria-label="Mobile primary">
                {links}
              </nav>
              <div className="mt-2 grid gap-2 border-t border-[var(--border)] pt-3">
                {user ? (
                  <>
                    <Link to="/profile" className="btn-ghost justify-start">{user.name}</Link>
                    <button onClick={logout} className="btn-ghost justify-start">Log out</button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="btn-ghost justify-start">Log in</Link>
                    {config.registration_open && !config.site_lockdown && <Link to="/register" className="btn-primary justify-start">Register</Link>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="main" className="container-app py-8 md:py-10">
        <Outlet />
      </main>

      <footer className="mt-8 border-t border-[var(--border)] py-7">
        <div className="container-app flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--fg-disabled)] mono">
          <span>{config.ctf_name}</span>
          {navPages?.footer.map((p) => (
            <Link key={p.slug} to={`/p/${p.slug}`} className="text-[var(--accent-strong)] hover:text-white">{p.title}</Link>
          ))}
        </div>
        {config.footer_html && (
          <div
            className="container-app mt-4 text-center text-xs text-[var(--fg-faint)]"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.footer_html, { ADD_ATTR: ["target"] }) }}
          />
        )}
      </footer>
    </div>
  );
}
