import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/permissions";
import { PermissionBanner } from "@/components/permission-gate";
import { Shield, Globe, BookOpen, Leaf, Building2, Flag, Info, CheckCircle } from "lucide-react";

const FRAMEWORK_META: Record<string, { icon: any; color: string; tagline: string }> = {
  GRI: {
    icon: Globe,
    color: "text-green-600 dark:text-green-400",
    tagline: "World's most widely used sustainability reporting standard",
  },
  ISSB: {
    icon: Building2,
    color: "text-blue-600 dark:text-blue-400",
    tagline: "IFRS climate & sustainability financial disclosures",
  },
  TCFD: {
    icon: Shield,
    color: "text-amber-600 dark:text-amber-400",
    tagline: "Climate-related financial risk disclosure framework",
  },
  ESRS: {
    icon: Flag,
    color: "text-purple-600 dark:text-purple-400",
    tagline: "EU mandatory reporting standards under CSRD",
  },
  CDP: {
    icon: Leaf,
    color: "text-emerald-600 dark:text-emerald-400",
    tagline: "Global disclosure system for environmental impacts",
  },
  UNGC: {
    icon: BookOpen,
    color: "text-rose-600 dark:text-rose-400",
    tagline: "UN principles: human rights, labour, environment, anti-corruption",
  },
};

type FrameworkWithSelection = {
  id: string;
  code: string;
  name: string;
  fullName: string | null;
  description: string | null;
  version: string | null;
  isActive: boolean | null;
  isEnabled: boolean;
  selectionId: string | null;
};

export default function FrameworkSettingsPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canEdit = can("settings_admin");

  const { data: frameworks, isLoading } = useQuery<FrameworkWithSelection[]>({
    queryKey: ["/api/framework-selections"],
  });

  const [localState, setLocalState] = useState<Record<string, boolean>>({});

  const bulkMutation = useMutation({
    mutationFn: async (selections: { frameworkId: string; isEnabled: boolean }[]) => {
      return apiRequest("PUT", "/api/framework-selections", { selections });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/framework-selections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/framework-readiness"] });
      setLocalState({});
      toast({ title: "Framework settings saved", description: "Your framework selections have been updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save framework settings.", variant: "destructive" });
    },
  });

  const getEnabled = (fw: FrameworkWithSelection) => {
    if (localState[fw.id] !== undefined) return localState[fw.id];
    return fw.isEnabled;
  };

  const handleToggle = (fwId: string, value: boolean) => {
    setLocalState(prev => ({ ...prev, [fwId]: value }));
  };

  const hasChanges = Object.keys(localState).length > 0;

  const handleSave = () => {
    if (!frameworks) return;
    const selections = frameworks.map(fw => ({
      frameworkId: fw.id,
      isEnabled: getEnabled(fw),
    }));
    bulkMutation.mutate(selections);
  };

  const handleCancel = () => setLocalState({});

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="heading-framework-settings">
          Framework Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose which reporting frameworks you want to track readiness against. Enabling a framework adds it to your Readiness view.
        </p>
      </div>

      {!canEdit && (
        <PermissionBanner module="settings_admin" action="change framework selections" data-testid="banner-framework-settings-permission" />
      )}

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Selecting a framework shows your <strong>readiness alignment</strong> — what is covered, partially covered, and what is missing. This is not a compliance certification or formal audit.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(frameworks ?? []).map(fw => {
          const meta = FRAMEWORK_META[fw.code] ?? { icon: Shield, color: "text-muted-foreground", tagline: "" };
          const Icon = meta.icon;
          const enabled = getEnabled(fw);
          const changed = localState[fw.id] !== undefined;

          return (
            <Card
              key={fw.id}
              className={`transition-all ${enabled ? "border-primary/30 bg-primary/3" : ""} ${changed ? "ring-2 ring-primary/20" : ""}`}
              data-testid={`card-framework-${fw.code}`}
            >
              <CardContent className="flex items-start justify-between gap-4 py-4 px-5">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground" data-testid={`text-framework-name-${fw.code}`}>{fw.name}</span>
                      {fw.fullName && <span className="text-xs text-muted-foreground">— {fw.fullName}</span>}
                      {fw.version && <Badge variant="outline" className="text-[10px] h-4">{fw.version}</Badge>}
                      {changed && (
                        <Badge variant="secondary" className="text-[10px] h-4">Unsaved</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{meta.tagline}</p>
                    {fw.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{fw.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {enabled && (
                    <CheckCircle className="w-4 h-4 text-green-500" data-testid={`icon-enabled-${fw.code}`} />
                  )}
                  <Switch
                    checked={enabled}
                    onCheckedChange={val => handleToggle(fw.id, val)}
                    disabled={!canEdit || bulkMutation.isPending}
                    data-testid={`switch-framework-${fw.code}`}
                    aria-label={`Toggle ${fw.name} framework`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex items-center justify-end gap-3 pt-2">
          {hasChanges && (
            <Button variant="ghost" onClick={handleCancel} disabled={bulkMutation.isPending} data-testid="button-cancel-framework-settings">
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || bulkMutation.isPending}
            data-testid="button-save-framework-settings"
          >
            {bulkMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
