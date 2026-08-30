type LegacyPolicyLike = {
  status?: string | null;
  reviewDate?: Date | string | null;
} | null | undefined;

type GeneratedPolicyLike = {
  status?: string | null;
  workflowStatus?: string | null;
  reviewDate?: Date | string | null;
};

type PolicyRecordLike = {
  status?: string | null;
  reviewDate?: Date | string | null;
};

export type PolicyPortfolioInput = {
  legacyPolicy?: LegacyPolicyLike;
  generatedPolicies?: GeneratedPolicyLike[] | null;
  policyRecords?: PolicyRecordLike[] | null;
};

/**
 * The platform has three historical policy stores. This adapter gives daily
 * workflows one truthful definition while those stores remain compatible.
 */
export function getPolicyPortfolioStatus({
  legacyPolicy,
  generatedPolicies = [],
  policyRecords = [],
}: PolicyPortfolioInput) {
  const generated = generatedPolicies ?? [];
  const records = policyRecords ?? [];
  const adoptedGenerated = generated.filter((policy) =>
    policy.workflowStatus === "approved"
    && (policy.status === "approved" || policy.status === "published"),
  );
  const activeRecords = records.filter((policy) => policy.status === "active");
  const legacyPublished = legacyPolicy?.status === "published";
  const published = legacyPolicy?.status === "published"
    || adoptedGenerated.some((policy) => policy.status === "published")
    || activeRecords.length > 0;
  const adoptedCount = (legacyPublished ? 1 : 0)
    + adoptedGenerated.length
    + activeRecords.length;
  const hasAny = Boolean(legacyPolicy) || generated.length > 0 || records.length > 0;
  const reviewDates = [
    legacyPublished ? legacyPolicy?.reviewDate : null,
    ...adoptedGenerated.map((policy) => policy.reviewDate),
    ...activeRecords.map((policy) => policy.reviewDate),
  ]
    .filter((value): value is Date | string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

  return { hasAny, published, adoptedCount, reviewDates };
}
