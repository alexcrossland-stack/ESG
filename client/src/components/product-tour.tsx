import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Gauge, ClipboardList, FileCheck, Shield,
  Download, BookMarked, Settings, X, ArrowRight, Play,
  MessageSquare, FileText, Search, CheckCheck,
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
    title: "ESG Control Centre",
    description: "One place to see everything that needs attention: missing data, low quality scores, expired evidence, overdue actions, and unmet compliance requirements. Filter by issue type and resolve issues with one click.",
    highlight: "page-control-centre",
  },
  {
    icon: ClipboardList,
    title: "Data Entry & Quality",
    description: "Enter your ESG metrics with built-in quality scoring. Each metric shows its data quality score and suggests evidence you can link to improve it. Import energy, travel, and workforce data from CSV templates.",
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
    description: "Generate four types of ready-to-use reports: Board Summary, Customer Response Pack, Compliance Summary, and Full ESG Report. Every report labels approved, draft, and missing information.",
    highlight: "button-generate-report",
  },
  {
    icon: BookMarked,
    title: "Answer Library",
    description: "Build a reusable library of approved ESG answers for customer and supplier questionnaires. Use the AI response generator to draft answers from your actual data.",
    highlight: "page-answer-library",
  },
  {
    icon: Settings,
    title: "Settings & Administration",
    description: "Configure metrics, scoring weights, approval workflows, report branding, and user roles. Manage reporting periods and notification preferences.",
    highlight: "settings-admin",
  },
];

const GUIDED_SCENARIOS = [
  {
    icon: MessageSquare,
    title: "Respond to a Customer ESG Request",
    description: "A customer has sent you an ESG questionnaire. Learn how to use the answer library and AI generator to prepare a response in minutes.",
    steps: [
      "Go to Questionnaires and paste in the customer questions",
      "Use the AI Response Generator to draft answers from your data",
      "Review and approve answers, then export the response",
    ],
    linkPath: "/questionnaire",
    badge: "10 min",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    icon: FileText,
    title: "Generate a Board Report",
    description: "Your board meeting is coming up. Learn how to generate a polished Board Summary report with your latest ESG performance data.",
    steps: [
      "Go to Reports and select Board Summary",
      "Choose your reporting period and review the preview",
      "Generate the PDF and download for your presentation",
    ],
    linkPath: "/reports",
    badge: "5 min",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  {
    icon: Search,
    title: "Review Your ESG Gaps",
    description: "Find out what's holding your ESG score back. Learn how the Control Centre helps you prioritise and resolve outstanding issues.",
    steps: [
      "Open the ESG Control Centre",
      "Filter by issue type to focus on what matters most",
      "Use quick actions to submit data, complete actions, or upload evidence",
    ],
    linkPath: "/control-centre",
    badge: "15 min",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
];

type TourMode = "tour" | "scenarios";

export function ProductTour({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<TourMode>("tour");
  const [step, setStep] = useState(0);
  const [expandedScenario, setExpandedScenario] = useState<number | null>(null);

  if (mode === "scenarios") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="tour-overlay">
        <Card className="w-full max-w-lg shadow-xl" data-testid="tour-scenarios">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold">Guided Scenarios</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Work through a real ESG workflow step by step</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onComplete} data-testid="button-tour-skip">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-3 mb-5">
              {GUIDED_SCENARIOS.map((scenario, i) => {
                const Icon = scenario.icon;
                const isExpanded = expandedScenario === i;
                return (
                  <div key={i} className={`border rounded-lg overflow-hidden transition-all ${isExpanded ? "border-primary" : "border-border"}`}>
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedScenario(isExpanded ? null : i)}
                      data-testid={`scenario-${i}`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${isExpanded ? "bg-primary/10" : "bg-muted"}`}>
                        <Icon className={`w-4 h-4 ${isExpanded ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{scenario.title}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${scenario.badgeColor}`}>{scenario.badge}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{scenario.description}</p>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-muted/20">
                        <ol className="space-y-1.5 mb-3 mt-1">
                          {scenario.steps.map((s, si) => (
                            <li key={si} className="flex items-start gap-2 text-xs">
                              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{si + 1}</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                        <Button size="sm" className="w-full h-8 text-xs" onClick={onComplete} asChild>
                          <a href={scenario.linkPath}>
                            <Play className="w-3 h-3 mr-1.5" />Start this scenario
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setMode("tour")} data-testid="button-tour-prev">
                View Tour
              </Button>
              <Button size="sm" onClick={onComplete} data-testid="button-scenarios-done">
                <CheckCheck className="w-3.5 h-3.5 mr-1" />Done
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="tour-overlay">
      <Card className="w-full max-w-md shadow-xl" data-testid={`tour-step-${step + 1}`}>
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

          <div className="flex items-center gap-1.5 mb-4">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? "flex-[2] bg-primary" : i < step ? "flex-1 bg-primary/40" : "flex-1 bg-muted"}`}
              />
            ))}
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={() => step > 0 ? setStep(step - 1) : onComplete()} data-testid="button-tour-prev">
              {step > 0 ? "Back" : "Skip Tour"}
            </Button>
            <div className="flex items-center gap-2">
              {isLast && (
                <Button variant="outline" size="sm" onClick={() => setMode("scenarios")} data-testid="button-view-scenarios">
                  <Play className="w-3.5 h-3.5 mr-1" />Try Scenarios
                </Button>
              )}
              <Button size="sm" onClick={() => isLast ? onComplete() : setStep(step + 1)} data-testid="button-tour-next">
                {isLast ? "Get Started" : "Next"}
                {!isLast && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
