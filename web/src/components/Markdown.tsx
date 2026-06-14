import { marked } from "marked";

// Renders admin-authored content. `html` format is passed through verbatim;
// `markdown` is converted with marked. Content is trusted (admin-only).
export default function Markdown({ content, format }: { content: string; format?: "markdown" | "html" }) {
  const html = format === "html" ? content : (marked.parse(content || "", { async: false }) as string);
  return <div className="prose-ctf" dangerouslySetInnerHTML={{ __html: html }} />;
}
