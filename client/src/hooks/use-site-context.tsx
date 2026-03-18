import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OrganisationSite } from "@shared/schema";

const STORAGE_KEY = "activeSiteId";

interface SiteContextValue {
  sites: OrganisationSite[];
  activeSiteId: string | null;
  activeSite: OrganisationSite | null;
  setActiveSiteId: (id: string | null) => void;
  isLoading: boolean;
}

const SiteContext = createContext<SiteContextValue>({
  sites: [],
  activeSiteId: null,
  activeSite: null,
  setActiveSiteId: () => {},
  isLoading: false,
});

export function SiteProvider({ children }: { children: ReactNode }) {
  const [activeSiteId, setActiveSiteIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });

  const { data: sites = [], isLoading } = useQuery<OrganisationSite[]>({
    queryKey: ["/api/sites"],
    staleTime: 30000,
  });

  useEffect(() => {
    if (!isLoading && activeSiteId) {
      const found = sites.find(s => s.id === activeSiteId && s.status === "active");
      if (!found) {
        setActiveSiteIdState(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }
    }
  }, [sites, isLoading, activeSiteId]);

  const setActiveSiteId = (id: string | null) => {
    setActiveSiteIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const activeSite = activeSiteId ? (sites.find(s => s.id === activeSiteId) ?? null) : null;

  return (
    <SiteContext.Provider value={{ sites, activeSiteId, activeSite, setActiveSiteId, isLoading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteContext() {
  return useContext(SiteContext);
}
