import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("client/src/pages/carbon-calculator.tsx", "utf8");
const tree = ts.createSourceFile("carbon-calculator.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const labels = new Set<string>();
const controls = new Map<string, Set<string>>();
function visit(node: ts.Node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
    const literal = (name: string) => {
      const value = attrs.find((a) => a.name.getText(tree) === name)?.initializer;
      return value && ts.isStringLiteral(value) ? value.text : undefined;
    };
    if (node.tagName.getText(tree) === "Label" && literal("htmlFor")) labels.add(literal("htmlFor")!);
    if (["Input", "SelectTrigger"].includes(node.tagName.getText(tree))) {
      const id = literal("id");
      if (id) controls.set(id, new Set(attrs.map((a) => a.name.getText(tree))));
    }
  }
  ts.forEachChild(node, visit);
}
visit(tree);
for (const id of ["carbon-employee-count", "vehicleMileage", "floorAreaM2", "carbon-reporting-period", "carbon-period-type", "carbon-scope"]) {
  assert.ok(labels.has(id), `${id} must have a linked visible label`);
  assert.ok(controls.has(id), `${id} label must target an actual form control`);
}
assert.ok(controls.get("floorAreaM2")?.has("aria-describedby"));
assert.ok(controls.get("carbon-scope")?.has("aria-describedby"));
assert.match(source, /aria-label="Vehicle fuel type"/);
assert.match(source, /aria-label=\{`\$\{fieldLabel\} data quality`\}/);
const evidence = readFileSync("client/src/pages/evidence.tsx", "utf8");
assert.ok(evidence.includes('Use the "Create Request" button above'));
assert.ok(!evidence.includes('Use the "Request File" button above'));
console.log("PASS audit accessible labels and evidence request instructions");
