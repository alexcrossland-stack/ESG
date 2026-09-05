import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export function isReportingMonth(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

export function rememberReportingMonth(companyId: string, month: string) {
  if (!companyId || !isReportingMonth(month)) return;
  try { localStorage.setItem(`simplyesg.reporting-month.${companyId}`, month); } catch {}
  window.dispatchEvent(new Event("simplyesg-reporting-month"));
}

/** A company-scoped working month, shared by data, reporting and the overview. */
export function useReportingMonth() {
  const { data: auth, isLoading } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    window.addEventListener("simplyesg-reporting-month", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("simplyesg-reporting-month", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const company = auth?.company;
  const now = new Date();
  const year = String(company?.reportingYearStart || "");
  const fallback = /^20\d{2}$/.test(year) && Number(year) < now.getFullYear()
    ? `${year}-12`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let month = fallback;
  try {
    const stored = localStorage.getItem(`simplyesg.reporting-month.${company?.id}`);
    if (isReportingMonth(stored)) month = stored;
  } catch {}
  return { month, isLoading, setMonth: (value: string) => rememberReportingMonth(company?.id, value) };
}
