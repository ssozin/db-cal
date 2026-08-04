"use client";

import { useLayoutEffect } from "react";

const GITHUB_PATH = "/repos/ssozin/db-cal/contents/df_img";
const INDEX_URL = "https://data.jsdelivr.com/v1/package/gh/ssozin/db-cal@main/flat";
const CDN_ROOT = "https://cdn.jsdelivr.net/gh/ssozin/db-cal@main";

export default function PhotoListFallback() {
  useLayoutEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

      let isPhotoListRequest = false;
      try {
        const parsed = new URL(url, window.location.href);
        isPhotoListRequest = parsed.hostname === "api.github.com" && parsed.pathname === GITHUB_PATH;
      } catch {
        isPhotoListRequest = url.includes(GITHUB_PATH);
      }

      if (!isPhotoListRequest) return nativeFetch(input, init);

      try {
        const githubResponse = await nativeFetch(input, init);
        if (githubResponse.ok) {
          const data = await githubResponse.clone().json().catch(() => null);
          if (Array.isArray(data) && data.length > 0) return githubResponse;
        }
      } catch {
        // Use the repository index below.
      }

      const indexResponse = await nativeFetch(INDEX_URL, {
        cache: "no-store",
        signal: init?.signal,
      });

      if (!indexResponse.ok) {
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const index = await indexResponse.json() as {
        files?: Array<{ name?: string; type?: string }>;
      };

      const files = (index.files ?? [])
        .map((entry) => entry.name ?? "")
        .filter((path) => path.startsWith("/df_img/") && /\.(png|jpe?g|webp|gif)$/i.test(path))
        .map((path) => ({
          name: decodeURIComponent(path.split("/").pop() ?? ""),
          type: "file",
          download_url: encodeURI(`${CDN_ROOT}${path}`),
        }));

      return new Response(JSON.stringify(files), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}
