import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  helpText?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  helpText,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 space-y-4 max-w-sm mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-base" data-testid="empty-state-title">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="empty-state-description">{description}</p>
      </div>
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-wrap gap-2 justify-center pt-1">
          {actionLabel && actionHref && (
            <Link href={actionHref}>
              <Button size="sm" data-testid="empty-state-primary-action">{actionLabel}</Button>
            </Link>
          )}
          {actionLabel && onAction && !actionHref && (
            <Button size="sm" onClick={onAction} data-testid="empty-state-primary-action">{actionLabel}</Button>
          )}
          {secondaryLabel && secondaryHref && (
            <Link href={secondaryHref}>
              <Button size="sm" variant="outline" data-testid="empty-state-secondary-action">{secondaryLabel}</Button>
            </Link>
          )}
        </div>
      )}
      {helpText && (
        <p className="text-xs text-muted-foreground pt-1">{helpText}</p>
      )}
    </div>
  );
}
