import assert from "node:assert/strict";
import JSZip from "jszip";
import { exportPolicyDocx } from "../../client/src/lib/policy-docx-export";

const blob = await exportPolicyDocx("# Test policy\n\nOwner: **Audit Team**\n\n- Review every year\n\n| Item | Status |\n| --- | --- |\n| Evidence | Ready |\n\nSafe & clear `<text>`\u0001\uD800");
const bytes = new Uint8Array(await blob.arrayBuffer());
assert.equal(Buffer.from(bytes.slice(0, 2)).toString(), "PK");
const archive = await JSZip.loadAsync(bytes);
assert.ok(archive.file("[Content_Types].xml"));
const xml = await archive.file("word/document.xml")!.async("string");
for (const text of ["Test policy", "Audit Team", "Review every year", "Evidence", "Ready"]) assert.ok(xml.includes(text));
assert.match(xml, /w:tbl/);
assert.match(xml, /w:b/);
assert.match(xml, /Safe &amp; clear/);
assert.match(xml, /&lt;text&gt;/);
assert.ok(!xml.includes("\u0001") && !xml.includes("\uD800"));
console.log("PASS lazy policy Word export: valid OpenXML archive, headings, emphasis, lists, tables, escaped text and invalid-character sanitisation");
