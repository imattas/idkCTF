import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Bootstrap } from "./types";

interface Store extends Bootstrap {
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const b = await api.get<Bootstrap>("/bootstrap");
      setData(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load the CTF");
      throw e;
    }
  };

  useEffect(() => {
    refresh().catch(() => undefined).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        <div className="animate-pulse mono">loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md text-center">
          <h1 className="text-xl">Unable to load the CTF</h1>
          <p className="mt-2 text-sm">{error || "The API did not return bootstrap data."}</p>
          <button className="btn-primary mt-5" onClick={() => { setLoading(true); refresh().catch(() => undefined).finally(() => setLoading(false)); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <Ctx.Provider value={{ ...data, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
