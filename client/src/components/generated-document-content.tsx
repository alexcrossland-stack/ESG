import { GENERATED_DOCUMENT_STYLES, renderGeneratedMarkdownToHtml } from "@shared/generated-document-markdown";

type GeneratedDocumentContentProps = {
  markdown: string;
  className?: string;
  "data-testid"?: string;
};

export function GeneratedDocumentContent(props: GeneratedDocumentContentProps) {
  const html = renderGeneratedMarkdownToHtml(props.markdown);
  const className = ["generated-document-content", props.className].filter(Boolean).join(" ");

  return (
    <>
      <style>{GENERATED_DOCUMENT_STYLES}</style>
      <div
        className={className}
        data-testid={props["data-testid"]}
        // This HTML is sanitized inside renderGeneratedMarkdownToHtml before rendering.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
