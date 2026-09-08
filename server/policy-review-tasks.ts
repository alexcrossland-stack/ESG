type ReviewPolicy = {
  id: string;
  title?: string | null;
  templateId?: string | null;
  templateSlug?: string | null;
  workflowStatus?: string | null;
};

type ReviewPolicyTemplate = { id?: string; slug?: string; name?: string | null };

function displayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  // Older records can contain an identifier in place of a display label.
  if (!name || /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(name)) return undefined;
  return name;
}

export function buildPolicyReviewTasks(policies: ReviewPolicy[], templates: ReviewPolicyTemplate[]) {
  const templatesById = new Map(templates.filter((template) => template.id).map((template) => [template.id, template]));
  const templatesBySlug = new Map(templates.filter((template) => template.slug).map((template) => [template.slug, template]));
  return policies.filter((policy) => policy.workflowStatus !== "approved").map((policy) => {
    const template = (policy.templateId ? templatesById.get(policy.templateId) : undefined)
      ?? (policy.templateSlug ? templatesBySlug.get(policy.templateSlug) : undefined);
    return {
      id: policy.id,
      name: displayName(policy.title) ?? displayName(template?.name) ?? "Policy",
      status: policy.workflowStatus,
      linkUrl: `/policies?tab=register&policy=${encodeURIComponent(policy.id)}`,
    };
  });
}
