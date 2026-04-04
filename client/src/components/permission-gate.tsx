import { Lock, Info, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type PermissionModule } from "@shared/schema";
import { whoCanDo, getNextStepForModule, getRoleLabel } from "@/lib/permissions";

/**
 * Inline alert shown at the top of a section when the user can view
 * but cannot edit. Not destructive — informational tone.
 *
 * Usage:
 *   <PermissionBanner module="metrics_data_entry" action="enter data" />
 */
export function PermissionBanner({
  module,
  action,
  customMessage,
  className,
}: {
  module?: PermissionModule;
  action?: string;
  customMessage?: string;
  className?: string;
}) {
  const who = module ? whoCanDo(module) : undefined;
  const nextStep = module ? getNextStepForModule(module) : "Ask your Company Admin if you need access.";
  const label = action ? `enter ${action}` : "make changes";

  const message = customMessage ??
    (who
      ? `Only ${who} can ${label} here.`
      : `You don't have permission to ${label} here.`);

  return (
    <Alert className={cn("border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700", className)} data-testid="permission-banner">
      <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="text-sm">
        <span className="font-medium text-amber-800 dark:text-amber-300">{message}</span>
        {" "}<span className="text-amber-700 dark:text-amber-400">{nextStep}</span>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Wraps a disabled button (or any element) with a tooltip explaining
 * why the action is not available and who can perform it.
 *
 * The child element must accept `disabled` and work as a tooltip trigger.
 *
 * Usage:
 *   <PermissionTooltip module="settings_admin">
 *     <Button disabled>Edit Settings</Button>
 *   </PermissionTooltip>
 */
export function PermissionTooltip({
  module,
  action,
  customMessage,
  children,
  disabled = true,
}: {
  module?: PermissionModule;
  action?: string;
  customMessage?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (!disabled) return <>{children}</>;

  const who = module ? whoCanDo(module) : undefined;
  const label = action ?? "do this";
  const message = customMessage ??
    (who ? `Only ${who} can ${label}.` : `You don't have permission to ${label}.`);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" tabIndex={0} data-testid="permission-tooltip-trigger">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
          <p>{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Full card shown when a user navigates to a page or section they
 * cannot access at all — replaces an empty-screen dead end.
 *
 * Usage:
 *   <PermissionBlockedCard module="user_management" pageName="Team" />
 */
export function PermissionBlockedCard({
  module,
  pageName,
  customTitle,
  customDescription,
  className,
}: {
  module?: PermissionModule;
  pageName?: string;
  customTitle?: string;
  customDescription?: string;
  className?: string;
}) {
  const who = module ? whoCanDo(module) : undefined;
  const nextStep = module ? getNextStepForModule(module) : "Ask your Company Admin if you need access.";

  const title = customTitle ?? (pageName ? `${pageName} access restricted` : "Access restricted");
  const description = customDescription ??
    (who
      ? `${who} can access this area. Your current role is view-only for this section.`
      : "You don't have permission to access this area.");

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center space-y-4", className)} data-testid="permission-blocked-card">
      <div className="p-3 rounded-full bg-muted">
        <ShieldAlert className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-start gap-2 bg-muted/50 rounded-md px-4 py-3 text-sm text-muted-foreground max-w-xs">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/60" />
        <span>{nextStep}</span>
      </div>
    </div>
  );
}

/**
 * Inline ownership hint — subtle text indicating which role typically
 * performs an action. Non-intrusive; appears below labels or inputs.
 *
 * Usage:
 *   <OwnershipHint owner="Finance or HR" />
 */
export function OwnershipHint({
  owner,
  action,
  className,
}: {
  owner: string;
  action?: string;
  className?: string;
}) {
  return (
    <p className={cn("text-[11px] text-muted-foreground/70 flex items-center gap-1", className)} data-testid="ownership-hint">
      <span className="text-primary/40">›</span>
      {action ? `${action} — ` : ""}<span>Usually handled by {owner}</span>
    </p>
  );
}

/**
 * Role label chip shown in permission contexts.
 */
export function RoleChip({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary">
      {getRoleLabel(role)}
    </span>
  );
}
