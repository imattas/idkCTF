import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { useStore } from "./store";
import Layout from "./components/Layout";
import Setup from "./pages/Setup";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Challenges from "./pages/Challenges";
import Scoreboard from "./pages/Scoreboard";
import Team from "./pages/Team";
import Profile from "./pages/Profile";
import CustomPage from "./pages/CustomPage";
import PublicProfile from "./pages/PublicProfile";
import Admin from "./pages/admin/Admin";

const HEAD_TAGS = ["meta", "link"];
const HEAD_ATTRS = ["name", "content", "property", "charset", "http-equiv", "rel", "href", "crossorigin", "integrity", "referrerpolicy", "as", "type", "sizes", "media", "color"];
const HEAD_LINK_RELS = new Set(["apple-touch-icon", "dns-prefetch", "icon", "manifest", "modulepreload", "preconnect", "preload", "stylesheet"]);

function applyCustomHead(markup: string) {
  document.querySelectorAll("[data-ctf-custom-head]").forEach((el) => el.remove());
  if (!markup.trim()) return;

  const clean = DOMPurify.sanitize(markup, {
    ALLOWED_TAGS: HEAD_TAGS,
    ALLOWED_ATTR: HEAD_ATTRS,
  });
  const template = document.createElement("template");
  template.innerHTML = clean;

  for (const node of Array.from(template.content.children)) {
    if (node.tagName.toLowerCase() === "link") {
      const rel = (node.getAttribute("rel") || "").toLowerCase();
      const href = node.getAttribute("href") || "";
      const safeHref = href.startsWith("/") || /^https?:\/\//i.test(href);
      if (!HEAD_LINK_RELS.has(rel) || !safeHref) continue;
    }
    node.setAttribute("data-ctf-custom-head", "true");
    document.head.appendChild(node);
  }
}

export default function App() {
  const { config, user } = useStore();

  // Apply theme, accent, custom CSS, title and favicon from config.
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", config.theme || "idktheflag");
    if (config.accent) html.style.setProperty("--accent", config.accent);
    document.title = config.ctf_name || "idkCTF";

    let style = document.getElementById("ctf-custom-css") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "ctf-custom-css";
      document.head.appendChild(style);
    }
    style.textContent = config.custom_css || "";

    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = config.has_logo ? "/api/branding/favicon?" + Date.now() : "/branding/favicon.svg";

    applyCustomHead(config.custom_head || "");
  }, [config.theme, config.accent, config.custom_css, config.custom_head, config.ctf_name, config.has_logo]);

  if (!config.setup_complete) {
    return (
      <Routes>
        <Route path="*" element={<Setup />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/challenges" element={<Challenges />} />
        <Route path="/scoreboard" element={<Scoreboard />} />
        <Route path="/team" element={config.mode === "teams" && user ? <Team /> : <Navigate to="/" />} />
        <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />
        <Route path="/users/:id" element={<PublicProfile kind="user" />} />
        <Route path="/teams/:id" element={<PublicProfile kind="team" />} />
        <Route path="/p/:slug" element={<CustomPage />} />
        <Route path="/login" element={user ? <Navigate to="/challenges" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/challenges" /> : (config.registration_open && !config.site_lockdown ? <Register /> : <Navigate to="/login" />)} />
        <Route
          path="/admin/*"
          element={user?.role === "admin" ? <Admin /> : <Navigate to="/" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
