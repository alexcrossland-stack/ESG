import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, CheckCircle, Clock, History, Download, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

const SECTIONS = [
  { key: "purpose", label: "Purpose & Scope", placeholder: "Describe the purpose and scope of your ESG policy..." },
  { key: "environmental", label: "Environmental Commitments", placeholder: "Describe your commitments to reducing environmental impact..." },
  { key: "social", label: "Social Commitments", placeholder: "Describe your commitments to your people and communities..." },
  { key: "governance", label: "Governance Commitments", placeholder: "Describe your governance standards and ethics commitments..." },
  { key: "roles", label: "Roles & Responsibilities", placeholder: "Who is responsible for ESG in your organisation?" },
  { key: "dataCollection", label: "Data Collection Approach", placeholder: "How do you collect and verify ESG data?" },
  { key: "reviewCycle", label: "Review Cycle", placeholder: "When and how often will this policy be reviewed?" },
];

export default function Policy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["purpose"]));
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/policy"],
    onSuccess: (d) => {
      if (d.latestVersion?.content && Object.keys(editContent).length === 0) {
        setEditContent(d.latestVersion.content as any);
      }
    },
  } as any);

  const saveMutation = useMutation({
    mutationFn: (params: { content: any; status?: string; action?: string }) =>
      apiRequest("PUT", "/api/policy", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy"] });
      setIsDirty(false);
      toast({ title: "Policy saved", description: "Your changes have been saved as a new version." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/policy", {
      content: editContent,
      status: "published",
      action: "Policy published",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy"] });
      toast({ title: "Policy published", description: "Your ESG policy is now published." });
    },
  });

  const policy = data?.policy;
  const versions = data?.versions || [];

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleChange = (key: string, value: string) => {
    setEditContent(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ content: editContent, action: "Policy saved" });
  };

  const handleExport = () => {
    const content = SECTIONS.map(s =>
      `## ${s.label}\n\n${editContent[s.key] || "(Not completed)"}\n`
    ).join("\n---\n\n");
    const blob = new Blob([`# ESG Policy\n\n${content}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "esg-policy.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Policy exported" });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const completedSections = SECTIONS.filter(s => editContent[s.key]?.trim()).length;
  const progress = Math.round((completedSections / SECTIONS.length) * 100);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            ESG Policy
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build and maintain your company's ESG policy
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={policy?.status === "published" ? "default" : "secondary"} data-testid="badge-policy-status">
            {policy?.status === "published" ? (
              <><CheckCircle className="w-3 h-3 mr-1" />Published</>
            ) : (
              <><Clock className="w-3 h-3 mr-1" />Draft</>
            )}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-policy">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-policy">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
          {policy?.status !== "published" && (
            <Button size="sm" variant="default" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} data-testid="button-publish-policy">
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              {publishMutation.isPending ? "Publishing..." : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{progress}%</div>
            <div className="text-xs text-muted-foreground mt-1">Complete</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{completedSections}/{SECTIONS.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Sections done</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{versions.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Versions saved</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit" data-testid="tab-policy-edit">Edit Policy</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-policy-history">
            <History className="w-3.5 h-3.5 mr-1.5" />
            Version History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-3 mt-4">
          {SECTIONS.map((section) => {
            const isExpanded = expandedSections.has(section.key);
            const hasContent = !!editContent[section.key]?.trim();
            return (
              <Card key={section.key} data-testid={`section-${section.key}`}>
                <button
                  className="w-full text-left"
                  onClick={() => toggleSection(section.key)}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${hasContent ? "bg-primary" : "bg-muted"}`} />
                      <span className="text-sm font-medium flex-1">{section.label}</span>
                      {hasContent && <Badge variant="secondary" className="text-xs">Done</Badge>}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                </button>
                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <Textarea
                      value={editContent[section.key] || ""}
                      onChange={e => handleChange(section.key, e.target.value)}
                      placeholder={section.placeholder}
                      className="min-h-28 text-sm resize-none"
                      data-testid={`textarea-${section.key}`}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} data-testid="button-save-policy-bottom">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving..." : "Save Policy"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {versions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No versions saved yet. Save your policy to create the first version.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {versions.map((v: any, i: number) => (
                    <div key={v.id} className="flex items-center gap-3 p-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-bold">
                        v{v.versionNumber}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Version {v.versionNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.createdAt ? format(new Date(v.createdAt), "dd MMM yyyy 'at' HH:mm") : "Unknown date"}
                        </p>
                      </div>
                      {i === 0 && <Badge variant="default" className="text-xs">Latest</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
