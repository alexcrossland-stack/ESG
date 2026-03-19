import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

const ESG_TERMS: Record<string, { title: string; body: string }> = {
  scope1: {
    title: "Scope 1 — Direct emissions",
    body: "Carbon from sources you own or control directly: gas boilers, company vehicles, on-site generators. You measure this from your gas and fuel bills.",
  },
  scope2: {
    title: "Scope 2 — Purchased electricity",
    body: "Carbon from the grid electricity you buy. It is automatically calculated from your kWh usage using the UK government's grid emission factor.",
  },
  scope3: {
    title: "Scope 3 — Indirect emissions",
    body: "Carbon from your supply chain, business travel, and waste. These are usually estimated and are optional for SMEs unless a customer asks for them.",
  },
  evidence: {
    title: "Evidence",
    body: "A file (invoice, certificate, or report) that proves a data point is accurate. Uploading evidence improves your data quality score and builds trust with customers and lenders.",
  },
  maturity: {
    title: "ESG Maturity",
    body: "A simple measure of how far along your ESG journey you are — Starter (just beginning), Developing (some practices in place), or Established (formal programme). It adapts your action plan.",
  },
  framework: {
    title: "ESG Framework",
    body: "A standardised structure for reporting ESG data — for example GRI, TCFD, or CDP. Most SMEs start with a simple summary report rather than a full framework.",
  },
  esg: {
    title: "ESG",
    body: "Environmental, Social, and Governance — three areas used to measure a business's impact and responsibility. Customers, banks, and investors increasingly ask for ESG data.",
  },
  dataQuality: {
    title: "Data Quality Score",
    body: "A score (0–100%) showing how complete and reliable your data is. It improves when you add evidence files, get data approved, and enter actual rather than estimated values.",
  },
  reporting_period: {
    title: "Reporting Period",
    body: "The month you are recording data for. Enter data for each month using your utility bills and other records. Monthly data gives the most accurate annual totals.",
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
