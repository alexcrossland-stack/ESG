import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

const ESG_TERMS: Record<string, { title: string; body: string }> = {
  scope1: {
    title: "Scope 1 — Direct emissions",
    body: "Carbon from sources you own or control directly, such as gas boilers, company vehicles, and on-site generators.",
  },
  scope2: {
    title: "Scope 2 — Purchased electricity",
    body: "Carbon from the grid electricity you buy, automatically calculated from your kWh usage using the government's emission factor.",
  },
  scope3: {
    title: "Scope 3 — Indirect emissions",
    body: "Carbon from your supply chain, business travel, and waste — typically estimated and optional for SMEs.",
  },
  evidence: {
    title: "Evidence",
    body: "A file (invoice, certificate, or report) that proves a data point is accurate and improves your data quality score.",
  },
  maturity: {
    title: "ESG Maturity",
    body: "A measure of how far along your ESG journey you are — Starter, Developing, or Established — used to tailor your action plan.",
  },
  framework: {
    title: "ESG Framework",
    body: "A standardised structure for reporting ESG data, such as GRI or TCFD — most SMEs start with a simple management report.",
  },
  esg: {
    title: "ESG",
    body: "Environmental, Social, and Governance — three areas used to measure a business's impact, increasingly requested by customers, banks, and investors.",
  },
  dataQuality: {
    title: "Data Quality Score",
    body: "A score (0–100%) showing how complete and reliable your data is, improving as you add evidence files and actual rather than estimated values.",
  },
  reporting_period: {
    title: "Reporting Period",
    body: "The month you are recording data for — enter data monthly using utility bills and other records for the most accurate annual totals.",
  },
  dataType: {
    title: "Type of data",
    body: "Manual means you typed it in; Estimated means it is an approximation; Evidenced means you have a file (e.g. an invoice) to back it up — evidenced data scores highest for quality.",
  },
};

interface EsgTooltipProps {
  term: keyof typeof ESG_TERMS;
  className?: string;
}

export function EsgTooltip({ term, className = "" }: EsgTooltipProps) {
  const [open, setOpen] = useState(false);
  const info = ESG_TERMS[term];
  if (!info) return null;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Explain ${info.title}`}
        data-testid={`tooltip-trigger-${term}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          className="absolute left-5 top-0 z-50 w-64 rounded-lg border border-border bg-popover shadow-md p-3 text-left"
          data-testid={`tooltip-content-${term}`}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">{info.title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Close"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
          <span className="block mt-1.5 text-xs text-muted-foreground leading-relaxed">{info.body}</span>
        </span>
      )}
    </span>
  );
}
