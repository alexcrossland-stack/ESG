import {
  buildGeneratedDocumentHtmlPage,
  parseGeneratedMarkdownBlocks,
  renderGeneratedMarkdownToHtml,
} from "../../shared/generated-document-markdown.js";

type Result = { name: string; passed: boolean; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function expectContains(name: string, actual: string, expected: string) {
  if (!actual.includes(expected)) fail(name, `missing ${expected}`);
  else pass(name);
}

function expectNotContains(name: string, actual: string, unexpected: string) {
  if (actual.includes(unexpected)) fail(name, `found unexpected ${unexpected}`);
  else pass(name);
}

(() => {
  console.log("\n=== Unit Tests: Generated Document Markdown ===\n");

  const mixedMarkdown = [
    "# Policy Title",
    "",
    "## Responsibilities",
    "",
    "- First bullet",
    "- Second bullet",
    "",
    "1. Ordered item",
    "2. Next item",
    "",
    "This contains **bold** and *italic* emphasis.",
    "",
    "| Control | Status |",
    "| --- | --- |",
    "| Review | Complete |",
    "",
    "> **Disclaimer:** Example disclaimer text.",
    "",
    "<script>alert('xss')</script>",
  ].join("\n");

  const renderedHtml = renderGeneratedMarkdownToHtml(mixedMarkdown);

  expectContains("renders h1 headings", renderedHtml, "<h1>Policy Title</h1>");
  expectContains("renders h2 headings", renderedHtml, "<h2>Responsibilities</h2>");
  expectContains("renders unordered lists", renderedHtml, "<ul>");
  expectContains("renders ordered lists", renderedHtml, "<ol>");
  expectContains("renders bold text", renderedHtml, "<strong>bold</strong>");
  expectContains("renders italic text", renderedHtml, "<em>italic</em>");
  expectContains("renders tables", renderedHtml, "<table>");
  expectContains("renders disclaimer callout styling", renderedHtml, "generated-callout-disclaimer");
  expectNotContains("strips script tags", renderedHtml, "<script>");
  expectNotContains("no raw h2 markdown markers remain", renderedHtml, "## Responsibilities");
  expectNotContains("no raw bold markdown markers remain", renderedHtml, "**bold**");
  expectNotContains("no raw table pipes remain", renderedHtml, "| Control | Status |");

  const parsedBlocks = parseGeneratedMarkdownBlocks(mixedMarkdown);
  const blockTypes = parsedBlocks.map((block) => block.type);
  if (blockTypes.includes("heading") && blockTypes.includes("list") && blockTypes.includes("table") && blockTypes.includes("paragraph")) {
    pass("parses markdown blocks for non-HTML export paths", blockTypes.join(", "));
  } else {
    fail("parses markdown blocks for non-HTML export paths", blockTypes.join(", "));
  }

  const policyExportHtml = buildGeneratedDocumentHtmlPage({
    title: "Environmental Policy",
    bodyHtml: renderedHtml,
  });

  expectContains("policy export snapshot includes rendered table markup", policyExportHtml, "<table>");
  expectContains("policy export snapshot includes document shell", policyExportHtml, "generated-document-shell");
  expectNotContains("policy export snapshot has no raw markdown heading markers", policyExportHtml, "##");
  expectNotContains("policy export snapshot has no raw markdown emphasis markers", policyExportHtml, "**");
  expectNotContains("policy export snapshot has no raw markdown table pipes", policyExportHtml, "| --- |");

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Generated Document Markdown: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
