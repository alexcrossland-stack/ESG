import { getCategoryKey, getCategoryLabel } from "@shared/categories";

const DEFAULT_CATEGORY_KEYS = [
  "environmental",
  "social",
  "governance",
  "supply_chain",
  "health_safety",
  "data_privacy",
  "general",
] as const;

type CategorisedAnswer = { category: string | null };

export function getAnswerCategoryOptions(
  answers: readonly CategorisedAnswer[],
  ...selectedCategories: Array<string | null | undefined>
) {
  const keys = new Set<string>(DEFAULT_CATEGORY_KEYS);
  const discoveredKeys = answers.map((answer) => getCategoryKey(answer.category));
  for (const category of selectedCategories) {
    if (category !== undefined) discoveredKeys.push(getCategoryKey(category));
  }
  for (const key of discoveredKeys.sort((a, b) => getCategoryLabel(a).localeCompare(getCategoryLabel(b)))) {
    keys.add(key);
  }
  keys.add("uncategorised");
  return Array.from(keys, (key) => ({ key, label: getCategoryLabel(key) }));
}

export function matchesAnswerCategory(category: string | null, filterCategory: string | null) {
  return filterCategory === null || getCategoryKey(category) === getCategoryKey(filterCategory);
}

export function groupAnswersByCategory<T extends CategorisedAnswer>(answers: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const answer of answers) {
    const key = getCategoryKey(answer.category);
    const group = grouped.get(key);
    if (group) group.push(answer);
    else grouped.set(key, [answer]);
  }
  return grouped;
}

export function getAnswerCategoryForSave(selectedCategory: string, originalCategory?: string | null) {
  const key = getCategoryKey(selectedCategory);
  // Editing an answer's text must not silently change its existing category metadata.
  if (originalCategory !== undefined && getCategoryKey(originalCategory) === key) return originalCategory;
  return key;
}
