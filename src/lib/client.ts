export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" })
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
