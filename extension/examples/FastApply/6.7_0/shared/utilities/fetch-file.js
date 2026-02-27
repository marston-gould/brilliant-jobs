/**
 * Fetches a file via the background service worker to bypass CORS.
 * Returns a Response-like object with .ok, .blob(), and .headers.get().
 */
export async function fetchFile(url) {
  const response = await chrome.runtime.sendMessage({
    type: "FETCH_FILE",
    url,
  });
  if (response.error) throw new Error(response.error);
  // base64 -> Blob
  const binary = atob(response.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: response.contentType });
  return {
    ok: true,
    status: 200,
    blob: async () => blob,
    headers: {
      get: (name) => {
        const n = name.toLowerCase();
        if (n === "content-type") return response.contentType;
        if (n === "content-disposition") return response.contentDisposition;
        return null;
      },
    },
  };
}
