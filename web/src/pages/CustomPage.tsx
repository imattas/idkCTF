import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import Markdown from "../components/Markdown";

interface Page {
  slug: string;
  title: string;
  content: string;
  format: "markdown" | "html";
}

export default function CustomPage() {
  const { slug } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["page", slug],
    queryFn: () => api.get<{ page: Page }>(`/pages/${slug}`),
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) {
    const e = error as ApiError;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-white">{e.status === 401 ? "Login required" : "Page not found"}</h1>
        <p className="text-slate-400">{e.message}</p>
      </div>
    );
  }

  const page = data!.page;
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-3xl font-bold text-white">{page.title}</h1>
      <Markdown content={page.content} format={page.format} />
    </article>
  );
}
