import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, Plus, Pencil, Archive, MapPin, Globe, AlertCircle } from "lucide-react";
import type { OrganisationSite } from "@shared/schema";

const SITE_TYPES = [
  { value: "operational", label: "Operational" },
  { value: "office", label: "Office" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail", label: "Retail" },
  { value: "data_centre", label: "Data Centre" },
  { value: "other", label: "Other" },
] as const;

function siteTypeLabel(type: string | null) {
  return SITE_TYPES.find(t => t.value === type)?.label ?? type ?? "Other";
}

interface SiteFormData {
  name: string;
  type: string;
  country: string;
  city: string;
  address: string;
}

const EMPTY_FORM: SiteFormData = { name: "", type: "other", country: "", city: "", address: "" };

interface SiteFormDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: OrganisationSite;
}

function SiteFormDialog({ open, onClose, existing }: SiteFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<SiteFormData>(
    existing
      ? { name: existing.name, type: existing.type ?? "other", country: existing.country ?? "", city: existing.city ?? "", address: existing.address ?? "" }
      : EMPTY_FORM,
  );

  const [errors, setErrors] = useState<Partial<SiteFormData>>({});

  const createMutation = useMutation({
    mutationFn: (data: SiteFormData) => apiRequest("POST", "/api/sites", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site created", description: `${form.name} has been added.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: SiteFormData) => apiRequest("PATCH", `/api/sites/${existing!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site updated", description: `${form.name} has been saved.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function validate(): boolean {
    const errs: Partial<SiteFormData> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const payload = {
      name: form.name.trim(),
      type: form.type,
      country: form.country.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
    };
    if (existing) updateMutation.mutate(payload as any);
    else createMutation.mutate(payload as any);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Site" : "Add New Site"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="site-name">Site Name *</Label>
            <Input
              id="site-name"
              data-testid="input-site-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Leeds Manufacturing Plant"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="site-type">Site Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger id="site-type" data-testid="select-site-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="site-country">Country</Label>
              <Input
                id="site-country"
                data-testid="input-site-country"
                value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                placeholder="United Kingdom"
              />
            </div>
            <div>
              <Label htmlFor="site-city">City</Label>
              <Input
                id="site-city"
                data-testid="input-site-city"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder="Leeds"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="site-address">Address</Label>
            <Input
              id="site-address"
              data-testid="input-site-address"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Optional full address"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending} data-testid="button-cancel-site">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-site">
            {isPending ? "Saving…" : existing ? "Save Changes" : "Create Site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ArchiveDialogProps {
  site: OrganisationSite | null;
  onClose: () => void;
}

function ArchiveDialog({ site, onClose }: ArchiveDialogProps) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/sites/${site!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site archived", description: `${site!.name} has been archived.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <AlertDialog open={!!site} onOpenChange={v => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive site?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{site?.name}</strong> will be archived. Historical data remains accessible but no new entries can be linked to this site.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-archive">Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-confirm-archive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? "Archiving…" : "Archive Site"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SiteCard({ site, onEdit, onArchive }: { site: OrganisationSite; onEdit: () => void; onArchive: () => void }) {
  const isArchived = site.status === "archived";
  return (
    <Card data-testid={`card-site-${site.id}`} className={isArchived ? "opacity-60" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base truncate" data-testid={`text-site-name-${site.id}`}>
              {site.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isArchived && <Badge variant="secondary" data-testid={`badge-archived-${site.id}`}>Archived</Badge>}
            <Badge variant="outline" className="text-xs">{siteTypeLabel(site.type)}</Badge>
          </div>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          <MapPin className="w-3 h-3" />
          {[site.city, site.country].filter(Boolean).join(", ") || "No location set"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {site.address && (
          <p className="text-xs text-muted-foreground mb-3">{site.address}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            data-testid={`button-edit-site-${site.id}`}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          {!isArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={onArchive}
              data-testid={`button-archive-site-${site.id}`}
              className="text-destructive hover:text-destructive"
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Archive
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SitesPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<OrganisationSite | null>(null);
  const [archiveSite, setArchiveSite] = useState<OrganisationSite | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: sites = [], isLoading } = useQuery<OrganisationSite[]>({
    queryKey: ["/api/sites", showArchived ? "includeArchived=true" : ""],
    queryFn: async () => {
      const res = await fetch(`/api/sites${showArchived ? "?includeArchived=true" : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sites");
      return res.json();
    },
  });

  const activeSites = sites.filter(s => s.status === "active");
  const archivedSites = sites.filter(s => s.status === "archived");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-sites">Sites</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your organisation's physical sites and locations
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-add-site">
          <Plus className="w-4 h-4 mr-2" />
          Add Site
        </Button>
      </div>

      {/* Toggle archived */}
      <div className="flex items-center gap-2 text-sm">
        <Switch
          id="show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
          data-testid="switch-show-archived"
        />
        <Label htmlFor="show-archived" className="cursor-pointer text-muted-foreground">
          Show archived sites
        </Label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg mb-1">No sites yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Add your organisation's physical sites to track ESG data independently across locations.
          </p>
          <Button onClick={() => setShowForm(true)} data-testid="button-add-site-empty">
            <Plus className="w-4 h-4 mr-2" />
            Add your first site
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeSites.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Active ({activeSites.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeSites.map(site => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    onEdit={() => setEditSite(site)}
                    onArchive={() => setArchiveSite(site)}
                  />
                ))}
              </div>
            </div>
          )}

          {showArchived && archivedSites.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Archived ({archivedSites.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedSites.map(site => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    onEdit={() => setEditSite(site)}
                    onArchive={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {showArchived && archivedSites.length === 0 && activeSites.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <AlertCircle className="w-4 h-4" />
              No archived sites found.
            </div>
          )}
        </div>
      )}

      {(showForm || editSite) && (
        <SiteFormDialog
          open={showForm || !!editSite}
          existing={editSite ?? undefined}
          onClose={() => { setShowForm(false); setEditSite(null); }}
        />
      )}

      <ArchiveDialog
        site={archiveSite}
        onClose={() => setArchiveSite(null)}
      />
    </div>
  );
}
