import { Button } from "@/components/ui/button";

export function QueryFailure({ label, retry, stale = false }: { label: string; retry: () => void; stale?: boolean }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
    <p>{stale ? `Showing previously loaded ${label}. Updates could not be loaded.` : `Could not load ${label}. This does not mean there are no items.`}</p>
    <p className="mt-1 text-muted-foreground">Check your connection and try again.</p>
    <Button variant="outline" size="sm" className="mt-3" onClick={retry}>Try again</Button>
  </div>;
}

export function QueryFreshness({ updatedAt, refreshing, refresh }: { updatedAt: number; refreshing: boolean; refresh: () => void }) {
  return <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-live="polite">
    <span>{refreshing ? "Refreshing…" : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not loaded yet"}</span>
    <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>Refresh</Button>
  </div>;
}
