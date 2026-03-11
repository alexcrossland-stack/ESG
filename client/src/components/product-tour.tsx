import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Gauge, ClipboardList, FileCheck, Shield,
  Download, BookMarked, Settings, X, ArrowRight,
} from "lucide-react";

const TOUR_STEPS = [
  {
    icon: LayoutDashboard,
    title: "Dashboard Overview",
    description: "Your ESG performance at a glance. See your overall ESG score, data completeness, category performance, and quick actions — all in one view.",
    highlight: "text-dashboard-title",
  },
  {
    icon: Gauge,
    title: "Control Centre",
    description: "One place to see everything that needs attention: missing data, low quality scores, expired evidence, overdue actions, and unmet compliance requirements.",
    highlight: "page-control-centre",
  },
  {
    icon: ClipboardList,
    title: "Data Entry & Quality",
    description: "Enter your ESG metrics with built-in quality scoring. Each metric shows its data quality score and suggests evidence you can link to improve it.",
    highlight: "select-reporting-period",
  },
  {
    icon: FileCheck,
    title: "Evidence Management",
    description: "Upload and manage evidence files that support your ESG claims. Evidence is automatically suggested when completing questionnaires or generating reports.",
    highlight: "page-evidence",
  },
  {
    icon: Shield,
    title: "Compliance Tracking",
    description: "Track your alignment with GRI Standards, ISO 14001, and UN SDGs. See which requirements are met based on your actual data and evidence.",
    highlight: "page-compliance",
  },
  {
    icon: Download,
    title: "Reports & Exports",
    description: "Generate presentation-ready board packs, customer response packs, and compliance summaries. Every report clearly labels approved, draft, and missing information.",
    highlight: "button-generate-report",
  },
  {
    icon: BookMarked,
    title: "Answer Library",
    description: "Build a reusable library of approved ESG answers for customer and supplier questionnaires. Answers are automatically flagged for review when linked data changes.",
    highlight: "page-answer-library",
  },
  {
    icon: Settings,
    title: "Settings & Administration",
    description: "Configure metrics, scoring weights, approval workflows, report branding, and user roles. Manage reporting periods and notification preferences.",
    highlight: "settings-admin",
  },
];

export function ProductTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="tour-overlay">
      <Card className="w-full max-w-md mx-4 shadow-xl" data-testid={`tour-step-${step + 1}`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Step {step + 1} of {TOUR_STEPS.length}</p>
                <h3 className="font-semibold">{current.title}</h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onComplete} data-testid="button-tour-skip">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            {current.description}
          </p>

          <div className="flex items-center gap-3 mb-4">
            {TOUR_STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>

          <div className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => step > 0 ? setStep(step - 1) : onComplete()}
              data-testid="button-tour-prev"
            >
              {step > 0 ? "Back" : "Skip Tour"}
            </Button>
            <Button
              size="sm"
              onClick={() => isLast ? onComplete() : setStep(step + 1)}
              data-testid="button-tour-next"
            >
              {isLast ? "Get Started" : "Next"}
              {!isLast && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
