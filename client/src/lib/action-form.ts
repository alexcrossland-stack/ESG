import { z } from "zod";

export const actionFormSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(300),
  description: z.string().max(4_000).optional(),
  owner: z.string().max(300).optional(),
  dueDate: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "complete", "overdue"]),
  notes: z.string().max(4_000).optional(),
});

export type ActionFormValues = z.infer<typeof actionFormSchema>;
export type ActionPlan = {
  id: string;
  title: string;
  description: string | null;
  owner: string | null;
  assignedUserId?: string | null;
  dueDate: string | null;
  status: ActionFormValues["status"];
  notes: string | null;
  createdAt: string;
};

export function getActionFormValues(action?: ActionPlan): ActionFormValues {
  return {
    title: action?.title ?? "",
    description: action?.description ?? "",
    owner: action?.owner ?? "",
    // Date inputs are saved as UTC midnight; keep the calendar date stable in
    // every browser time zone rather than formatting it as a local instant.
    dueDate: action?.dueDate?.slice(0, 10) ?? "",
    status: action?.status ?? "not_started",
    notes: action?.notes ?? "",
  };
}

export function buildActionPayload(
  values: ActionFormValues,
  dirtyFields?: Partial<Record<keyof ActionFormValues, boolean>>,
) {
  const payload = {
    ...values,
    dueDate: values.dueDate ? new Date(`${values.dueDate}T00:00:00.000Z`).toISOString() : null,
  };
  // Updates are partial: untouched nulls, original timestamps, assignment and
  // other fields must survive a single-field edit without normalization.
  if (dirtyFields) {
    return Object.fromEntries(Object.entries(payload).filter(([key]) => dirtyFields[key as keyof ActionFormValues]));
  }
  return payload;
}

export const ACTION_INVALIDATION_KEYS = [
  ["/api/actions"],
  ["/api/my-tasks"],
  ["/api/dashboard"],
  ["/api/dashboard/enhanced"],
  ["/api/dashboard/readiness"],
  ["/api/control-centre"],
];
