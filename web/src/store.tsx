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

  const refresh = async () => {
    const b = await api.get<Bootstrap>("/bootstrap");
    setData(b);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        <div className="animate-pulse mono">loading…</div>
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
