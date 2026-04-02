import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";

export interface PortfolioGroup {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  role: string;
  companyCount: number;
}

export interface PortfolioAccessData {
  defaultLandingContext: "portfolio" | "company";
  portfolioGroups: PortfolioGroup[];
  user: any;
  company: any;
}

const PORTFOLIO_ROLES = ["portfolio_owner", "portfolio_viewer", "super_admin"];

export function usePortfolioAccess() {
  const { data, isLoading } = useQuery<PortfolioAccessData>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const canAccessPortfolio = !isLoading && data?.user && PORTFOLIO_ROLES.includes(data.user.role);

  const groups: PortfolioGroup[] = useMemo(
    () => data?.portfolioGroups ?? [],
    [data?.portfolioGroups],
  );

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      const targetId = groups[0].id;
      setActiveGroupId(prev => (prev === targetId ? prev : targetId));
    }
  }, [groups, activeGroupId]);

  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0] || null;

  return {
    isLoading,
    canAccessPortfolio,
    groups,
    activeGroup,
    activeGroupId: activeGroup?.id || null,
    setActiveGroupId,
    isMultiGroup: groups.length > 1,
    defaultLandingContext: data?.defaultLandingContext || "company",
    needsRedirect: !isLoading && data?.user && !canAccessPortfolio,
  };
}
