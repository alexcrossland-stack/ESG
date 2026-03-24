import { Info, Lightbulb, AlertTriangle, ExternalLink, BookOpen } from "lucide-react";
import { Link } from "wouter";
import { HelpSection, HelpArticle } from "@/lib/help-content";
import { cn } from "@/lib/utils";

export function HelpCalloutBox({ section }: { section: Extract<HelpSection, { type: "callout" }> }) {
  const tone = section.tone ?? "info";
  const styles = {
    info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100",
    tip: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100",
  };
  const Icon = tone === "tip" ? Lightbulb : tone === "warning" ? AlertTriangle : Info;
  const iconStyles = {
    info: "text-blue-500",
    tip: "text-green-600",
    warning: "text-amber-500",
  };

  return (
    <div className={cn("flex gap-3 p-4 rounded-lg border", styles[tone])}>
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", iconStyles[tone])} />
      <div className="text-sm leading-relaxed">
        {section.heading && <p className="font-semibold mb-1">{section.heading}</p>}
        <p>{section.content}</p>
      </div>
    </div>
  );
}

export function HelpSteps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm text-foreground leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function HelpSectionRenderer({ section }: { section: HelpSection }) {
  switch (section.type) {
    case "intro":
      return (
        <p className="text-base text-foreground leading-relaxed font-medium border-l-4 border-primary/30 pl-4 py-1">
          {section.content}
        </p>
      );
    case "text":
      return (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">{section.heading}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
        </div>
      );
    case "list":
      return (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{section.heading}</h3>
          <ul className="space-y-2">
            {section.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "steps":
      return (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{section.heading}</h3>
          <HelpSteps items={section.items} />
        </div>
      );
    case "callout":
      return <HelpCalloutBox section={section} />;
    default:
      return null;
  }
}

export function RelatedGuides({ articles }: { articles: HelpArticle[] }) {
  if (articles.length === 0) return null;
  return (
    <div className="mt-8 pt-6 border-t">
      <h3 className="text-sm font-semibold text-foreground mb-3">Related guides</h3>
      <div className="space-y-2">
        {articles.map(article => (
          <Link
            key={article.slug}
            href={`/help/${article.slug}`}
            data-testid={`link-related-${article.slug}`}
          >
            <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">{article.title}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto shrink-0opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface ContextualHelpLinkProps {
  slug: string;
  label?: string;
  className?: string;
}

export function ContextualHelpLink({ slug, label = "Help", className }: ContextualHelpLinkProps) {
  return (
    <Link
      href={`/help/${slug}`}
      data-testid={`link-contextual-help-${slug}`}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors",
        className
      )}
    >
      <BookOpen className="w-3 h-3" />
      {label}
    </Link>
  );
}
