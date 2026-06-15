import { marked } from "marked";
import DOMPurify from "dompurify";

// Renders content as sanitized HTML. `markdown` is converted with marked;
// `html` is passed through. Either way the result is run through DOMPurify so
// scripts, event handlers and javascript: URLs are stripped — safe even if the
// content ever comes from a non-admin source.
export default function Markdown({ content, format }: { content: string; format?: "markdown" | "html" }) {
  const raw = format === "html" ? (content || "") : (marked.parse(content || "", { async: false }) as string);
  const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
  return <div className="prose-ctf" dangerouslySetInnerHTML={{ __html: clean }} />;
}
