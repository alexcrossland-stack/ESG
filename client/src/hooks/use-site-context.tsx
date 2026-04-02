import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OrganisationSite } from "@shared/schema";

const STORAGE_KEY = "activeSiteId";

const EMPTY_SITES: OrganisationSite[] = [];

interface SiteContextValue {
  sites: OrganisationSite[];
  activeSites: OrganisationSite[];
  activeSiteId: string | null;
  activeSite: OrganisationSite | null;
  setActiveSiteId: (id: string | null) => void;
  isLoading: boolean;
}

const SiteContext = createContext<SiteContextValue>({
  sites: EMPTY_SITES,
  activeSites: EMPTY_SITES,
  activeSiteId: null,
  activeSite: null,
  setActiveSiteId: () => {},
  isLoading: false,
});

export function SiteProvider({ children }: { children: ReactNode }) {
  const [activeSiteId, setActiveSiteIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });

  const { data: activeSitesData, isLoading: isLoadingActive } = useQuery<OrganisationSite[]>({
    queryKey: ["/api/sites"],
    staleTime: 30000,
  });

  const { data: allSitesData, isLoading: isLoadingAll } = useQuery<OrganisationSite[]>({
    queryKey: ["/api/sites", "includeArchived"],
    queryFn: async () => {
      const res = await fetch("/api/sites?includeArchived=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sites");
      return res.json();
    },
    staleTime: 30000,
  });

  const activeSites = activeSitesData ?? EMPTY_SITES;
  const allSites = allSitesData ?? EMPTY_SITES;
  const isLoading = isLoadingActive || isLoadingAll;

  useEffect(() => {
    if (!isLoading && activeSiteId !== null) {
      const found = activeSites.find(s => s.id === activeSiteId);
      if (!found) {
        setActiveSiteIdState(prev => {
          if (prev === null) return prev;
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
          return null;
        });
      }
    }
  }, [activeSites, isLoading, activeSiteId]);

  const setActiveSiteId = (id: string | null) => {
    setActiveSiteIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const activeSite = activeSiteId ? (activeSites.find(s => s.id === activeSiteId) ?? null) : null;

  return (
    <SiteContext.Provider value={{ sites: allSites, activeSites, activeSiteId, activeSite, setActiveSiteId, isLoading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteContext() {
  return useContext(SiteContext);
}
