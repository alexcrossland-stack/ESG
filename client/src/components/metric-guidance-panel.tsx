import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen, Calculator, FileCheck, Lightbulb, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMetricGuidance, getRawFieldGuidance, type MetricGuidance } from "@/lib/metric-guidance";

interface MetricGuidancePanelProps {
  metricKey?: string;
  metricName?: string;
  guidance?: MetricGuidance;
  className?: string;
  defaultOpen?: boolean;
  compact?: boolean;
}

export function MetricGuidancePanel({
  metricKey,
  metricName,
  guidance: guidanceProp,
  className,
  defaultOpen = false,
  compact = false,
}: MetricGuidancePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const guidance =
    guidanceProp ??
    (metricKey ? getRawFieldGuidance(metricKey) : undefined) ??
    (metricName ? getMetricGuidance(metricName)?.guidance : undefined);

  if (!guidance) return null;

  return (
    <div className={cn("rounded-md border border-dashed", open ? "border-primary/30 bg-primary/5" : "border-border/50", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        data-testid={`btn-guidance-${metricKey ?? metricName}`}
        aria-expanded={open}
      >
        <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground font-medium flex-1">How to fill this in</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className={cn("px-3 pb-3 space-y-3 text-xs", compact && "space-y-2")}>
          <div className="h-px bg-border/50" />

          <GuidanceSection icon={Info} label="What this is">
            {guidance.meaning}
          </GuidanceSection>

          {!compact && (
            <GuidanceSection icon={Lightbulb} label="Why it matters">
              {guidance.why}
            </GuidanceSection>
          )}

          <GuidanceSection icon={Calculator} label="How to calculate">
            {guidance.howToCalculate}
          </GuidanceSection>

          {guidance.proofTypes && guidance.proofTypes.length > 0 && (
            <GuidanceSection icon={FileCheck} label="Proof to upload">
              <ul className="space-y-0.5 mt-0.5">
                {guidance.proofTypes.map((pt) => (
                  <li key={pt} className="flex items-start gap-1.5">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </GuidanceSection>
          )}

          {guidance.exampleValue && (
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Example</p>
              <p className="text-foreground">{guidance.exampleValue}</p>
            </div>
          )}

          {(guidance.owner || guidance.frequency) && (
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground pt-0.5">
              {guidance.owner && (
                <span>
                  <span className="font-medium">Owner:</span> {guidance.owner}
                </span>
              )}
              {guidance.frequency && (
                <span>
                  <span className="font-medium">Frequency:</span> {guidance.frequency}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuidanceSection({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-foreground leading-relaxed pl-4">{children}</div>
    </div>
  );
}

export function InlineGuidanceTrigger({
  metricKey,
  metricName,
}: {
  metricKey?: string;
  metricName?: string;
}) {
  const [open, setOpen] = useState(false);
  const guidance =
    (metricKey ? getRawFieldGuidance(metricKey) : undefined) ??
    (metricName ? getMetricGuidance(metricName)?.guidance : undefined);

  if (!guidance) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`btn-inline-guidance-${metricKey ?? metricName}`}
        aria-label="Show guidance"
      >
        <BookOpen className="w-3 h-3" />
        <span>How to fill this in</span>
      </button>
      {open && (
        <MetricGuidancePanel
          metricKey={metricKey}
          metricName={metricName}
          guidance={guidance}
          defaultOpen
          compact
          className="mt-1"
        />
      )}
    </>
  );
}
