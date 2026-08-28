import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calculator,
  CheckSquare,
  ClipboardCheck,
  FileText,
  Globe2,
  Library,
  ListChecks,
  Settings,
  ShieldCheck,
  Star,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { MORE_TOOLS_SECTIONS, type NavItem } from "@/lib/navigation";
import { usePermissions } from "@/lib/permissions";

const ICONS: Record<string, LucideIcon> = {
  "/framework-readiness": Globe2,
  "/framework-settings": Settings,
  "/compliance": ShieldCheck,
  "/esg-profile": FileText,
  "/topics": Target,
  "/materiality": Star,
  "/policy-templates": Library,
  "/esg-policy-register": BookOpen,
  "/carbon-calculator": Calculator,
  "/benchmarks": BarChart3,
  "/metrics-library": ListChecks,
  "/my-tasks": CheckSquare,
  "/my-approvals": ClipboardCheck,
  "/team": Users,
};

function toolTestId(item: NavItem) {
  return `more-tools-${item.href.slice(1).replaceAll("/", "-")}`;
}

export default function MoreToolsPage() {
  const { can } = usePermissions();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8" data-testid="page-more-tools">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">More tools</h1>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Specialist tools for deeper ESG work. Your everyday work stays in the main navigation.
        </p>
      </div>

      {MORE_TOOLS_SECTIONS.map(section => {
        const items = section.items.filter(item => !item.permission || can(item.permission));
        if (items.length === 0) return null;

        return (
          <section key={section.label} className="space-y-3" aria-labelledby={`tools-${section.label.replaceAll(" ", "-")}`}>
            <h2 id={`tools-${section.label.replaceAll(" ", "-")}`} className="text-sm font-semibold text-foreground">
              {section.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => {
                const Icon = ICONS[item.href] ?? FileText;
                return (
                  <Link key={item.href} href={item.href} className="group block h-full" data-testid={toolTestId(item)}>
                    <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/25">
                      <CardContent className="flex h-full items-start gap-3 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium">{item.label}</h3>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
