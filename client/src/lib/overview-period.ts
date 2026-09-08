/** Keep a chosen working month explicit; never silently replace historical work. */
export function overviewPeriodContext(month: string, now = new Date()) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const valid = /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
  const label = valid
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1))
    : "Selected month";
  return { currentMonth, label, position: !valid || month === currentMonth ? "current" : month < currentMonth ? "past" : "future" } as const;
}

/** Readiness accepts the saved period identity, not its first calendar month. */
export function overviewReadinessUrl(month: string, savedPeriodId = "__latest__") {
  return `/api/dashboard/readiness?${new URLSearchParams({ period: savedPeriodId === "__latest__" ? month : savedPeriodId })}`;
}
