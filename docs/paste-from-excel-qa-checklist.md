# Paste From Excel QA Checklist

Scope: monthly bulk metric entry in `/data-entry` using the `Paste from Excel` mode.

- Paste with headers
  Expected: header row is detected safely, save is disabled until the review table is checked, and the user sees a notice explaining that header stripping was applied.

- Paste with metric label column
  Expected: label column is only stripped when every pasted row label matches the visible target metric rows; save is disabled until the review table is checked.

- Paste valid block
  Expected: pasted values land from the selected cell, changed cells highlight, validation passes, and review counts show creates/updates/clears correctly.

- Paste mixed valid/invalid block
  Expected: valid cells still preview, invalid cells show red per-cell errors, warnings remain amber, and save is blocked.

- Paste blanks that clear existing values
  Expected: blanks inside the pasted rectangle are classified as `clear`, preview shows `Before` value and `After = Cleared`, and commit removes the stored value.

- Paste into middle of grid
  Expected: rectangular mapping starts from the currently focused cell, not the top-left of the table.

- Paste oversized range
  Expected: cells outside the visible grid are ignored with a warning; if the request exceeds the server batch limit, validation fails and commit is blocked.

- Locked period rejection
  Expected: server-side validation marks the affected cells as errors and commit is blocked even if the client is modified.

- Overwrite existing values
  Expected: review table shows `update` with explicit before/after values and the stored row is updated, not duplicated.

- Warning-only batch that still saves
  Expected: outlier warnings are visible, error count stays zero, and the batch can still be committed successfully.

Developer note:
- Blanks inside the pasted range clear existing values.
- Blanks outside the pasted range are ignored.
- Warnings do not block save.
- Errors block save.
