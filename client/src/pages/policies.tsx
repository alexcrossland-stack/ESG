import { Link, useLocation, useSearch } from "wouter";
import { FileText, Library, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PolicyRegisterWorkspace } from "@/pages/esg-policy-register";
import Policy from "@/pages/policy";
import {
  GeneratedPoliciesRegister,
  PolicyTemplatesWorkspace,
  type PolicyTemplateView,
} from "@/pages/policy-templates";
import { usePermissions } from "@/lib/permissions";

type PolicyWorkspaceTab = "register" | "templates";

function tabHref(tab: PolicyWorkspaceTab) {
  return tab === "templates" ? "/policies?tab=templates" : "/policies?tab=register";
}

export default function PoliciesPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { can } = usePermissions();
  const params = new URLSearchParams(search);
  const selectedTemplateSlug = params.get("template");
  const selectedPolicyId = params.get("policy");
  const requestedTab = params.get("tab");
  const activeTab: PolicyWorkspaceTab = selectedPolicyId
    ? "register"
    : selectedTemplateSlug || requestedTab === "templates"
      ? "templates"
      : "register";
  const canManagePolicies = can("policy_editing");
  const canReviewPolicies = can("report_generation");

  const handleTemplateNavigate = (view: PolicyTemplateView) => {
    if (view.mode === "questionnaire") {
      navigate(`/policies?tab=templates&template=${encodeURIComponent(view.slug)}`);
      return;
    }
    if (view.mode === "view-policy") {
      navigate(`/policies?tab=register&policy=${encodeURIComponent(view.id)}`);
      return;
    }
    navigate("/policies?tab=templates");
  };

  const handleGeneratedPolicyNavigate = (view: PolicyTemplateView) => {
    if (view.mode === "view-policy") {
      navigate(`/policies?tab=register&policy=${encodeURIComponent(view.id)}`);
      return;
    }
    navigate("/policies?tab=register");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" data-testid="page-policies">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <FileText className="h-5 w-5 text-primary" />
              Policies
            </h1>
            <Badge variant="outline" className="font-normal">Company-wide</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Create, maintain and review the policies your business relies on, without losing track of ownership or review dates.
          </p>
        </div>
      </div>

      {!canManagePolicies && (
        <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3" data-testid="policy-read-only-notice">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            {canReviewPolicies
              ? "You can view and export policies and review submitted drafts. Company admins maintain the register and create policies."
              : "You have read-only access to policies. Company admins maintain the register and create policies."}
          </p>
        </div>
      )}

      <nav
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-1"
        aria-label="Policies workspace"
        role="tablist"
        data-testid="policies-workspace-tabs"
      >
        <Button asChild variant={activeTab === "register" ? "secondary" : "ghost"} className="w-full">
          <Link
            href={tabHref("register")}
            role="tab"
            aria-selected={activeTab === "register"}
            aria-current={activeTab === "register" ? "page" : undefined}
            data-testid="tab-policy-register"
          >
            <FileText className="mr-2 h-4 w-4" />
            Policy register
          </Link>
        </Button>
        <Button asChild variant={activeTab === "templates" ? "secondary" : "ghost"} className="w-full">
          <Link
            href={tabHref("templates")}
            role="tab"
            aria-selected={activeTab === "templates"}
            aria-current={activeTab === "templates" ? "page" : undefined}
            data-testid="tab-policy-templates"
          >
            <Library className="mr-2 h-4 w-4" />
            Templates
          </Link>
        </Button>
      </nav>

      {activeTab === "register" ? (
        selectedPolicyId ? (
          selectedPolicyId === "company" ? (
            <Policy embedded />
          ) : (
            <PolicyTemplatesWorkspace
              embedded
              selectedPolicyId={selectedPolicyId}
              onNavigate={handleGeneratedPolicyNavigate}
            />
          )
        ) : (
          <PolicyRegisterWorkspace embedded />
        )
      ) : (
        <section className="space-y-5" aria-label="Policy template workspace">
          {!selectedTemplateSlug && (
            <div>
              <h2 id="policy-template-heading" className="text-base font-semibold">Template library</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Start with a guided SME template, answer a few practical questions, then review the draft before adoption.
              </p>
            </div>
          )}
          <PolicyTemplatesWorkspace
            embedded
            selectedTemplateSlug={selectedTemplateSlug}
            onNavigate={handleTemplateNavigate}
          />
        </section>
      )}
    </div>
  );
}
