export type ColumnMapping = { column: string; inputKey: string | null };
type MappingStore = Pick<Storage, "getItem" | "setItem">;
const storageKey = (companyId: string) => `simplyesg-import-mappings:v1:${companyId}`;

export function saveColumnMappings(store: MappingStore, companyId: string, mappings: ColumnMapping[]) {
  if (!companyId || !mappings.length) return;
  try { store.setItem(storageKey(companyId), JSON.stringify(mappings)); } catch { /* Import success is independent of local storage. */ }
}

export function loadColumnMappings(store: MappingStore, companyId: string, columns: string[], allowedKeys: string[]): ColumnMapping[] | null {
  if (!companyId) return null;
  try {
    const saved: unknown = JSON.parse(store.getItem(storageKey(companyId)) || "null");
    if (!Array.isArray(saved) || saved.length !== columns.length || new Set(columns).size !== columns.length) return null;
    const allowed = new Set(allowedKeys);
    if (saved.some(row => !row || typeof row.column !== "string" || (row.inputKey !== null && !allowed.has(row.inputKey)))) return null;
    if (new Set(saved.map(row => row.column)).size !== columns.length) return null;
    const result = columns.map(column => saved.find(row => row.column === column));
    if (result.some(row => !row)) return null;
    return result as ColumnMapping[];
  } catch { return null; }
}
