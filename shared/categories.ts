/**
 * Category identity is independent of the spelling used by older catalogues.
 * Normalise group/filter keys, never metric or answer records. Only explicit
 * synonyms are combined; related topics such as Diversity and Diversity &
 * Inclusion remain separate.
 */
const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  health_and_safety: "health_safety",
  data_and_privacy: "data_privacy",
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  health_safety: "Health & Safety",
  data_privacy: "Data Privacy",
  diversity_and_inclusion: "Diversity & Inclusion",
  ethics_and_compliance: "Ethics & Compliance",
  training_and_development: "Training & Development",
  pay_and_benefits: "Pay & Benefits",
  esg_strategy: "ESG Strategy",
  uncategorised: "Uncategorised",
};

export function getCategoryKey(value: string | null | undefined): string {
  const key = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) return "uncategorised";
  return Object.hasOwn(CATEGORY_ALIASES, key) ? CATEGORY_ALIASES[key] : key;
}

export function getCategoryLabel(value: string | null | undefined): string {
  const key = getCategoryKey(value);
  if (Object.hasOwn(CATEGORY_LABELS, key)) return CATEGORY_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
