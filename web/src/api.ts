export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const opts: RequestInit = { method, credentials: "include", headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) throw new ApiError(data?.error || data?.message || res.statusText || "Request failed", res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T>(path: string, body?: any) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: any) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// Download a file via fetch+blob so failures surface as errors (instead of
// navigating the SPA away to a raw JSON page) and the correct filename is used.
export async function downloadFile(id: number, filename: string): Promise<void> {
  const res = await fetch(`/api/files/${id}`, { credentials: "include" });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json())?.error || msg; } catch {}
    throw new ApiError(msg, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
