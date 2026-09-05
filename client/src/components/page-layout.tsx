import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Working-page rhythm; embedded editors and generated documents keep their own layout. */
export function PageLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8", className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow, titleTestId, children }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  titleTestId?: string;
  children?: ReactNode;
}) {
  return <header className="space-y-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        {eyebrow && <div className="text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">{eyebrow}</div>}
        <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-[1.75rem] [&>svg]:h-6 [&>svg]:w-6 [&>svg]:shrink-0" data-testid={titleTestId}>{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 lg:pt-1">{actions}</div>}
    </div>
    {children}
  </header>;
}
