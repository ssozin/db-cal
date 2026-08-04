"use client";

import { useEffect } from "react";

const STYLE_ID = "archive-card-focus-styles";

const styles = `
.archive-card-focus-overlay{position:fixed;z-index:4900;inset:0;display:grid;place-items:center;padding:70px 20px 24px;background:rgba(18,18,22,.5);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);opacity:0;transition:opacity .2s ease;touch-action:none}
.archive-card-focus-overlay.is-visible{opacity:1}
.archive-card-focus-card{position:relative;width:min(72vw,360px);max-height:calc(100svh - 110px);transform:scale(.88);transition:transform .24s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 24px 42px rgba(0,0,0,.35))}
.archive-card-focus-overlay.is-visible .archive-card-focus-card{transform:scale(1)}
.archive-card-focus-card .archive-page{position:relative!important;inset:auto!important;left:auto!important;top:auto!important;width:100%!important;transform:none!important;z-index:auto!important;cursor:default!important;pointer-events:none;box-shadow:none!important}
.archive-card-focus-close{position:fixed;z-index:2;top:max(18px,env(safe-area-inset-top));right:18px;display:grid;width:42px;height:42px;place-items:center;border:1px solid rgba(255,255,255,.5);border-radius:999px;background:rgba(25,25,29,.72);color:#fff;font:300 26px/1 Arial,sans-serif;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.archive-card-focus-close:active{transform:scale(.94)}
body.archive-card-focus-open{overflow:hidden}
@media(max-width:640px){.archive-card-focus-card{width:min(78vw,320px)}.archive-card-focus-close{width:40px;height:40px;right:14px}}
`;

function restoreImages(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>("img[data-archive-source]").forEach((image) => {
    if (!image.getAttribute("src") && image.dataset.archiveSource) image.setAttribute("src", image.dataset.archiveSource);
    image.style.removeProperty("visibility");
  });
}

export default function ArchiveCardFocus() {
  useEffect(() => {
    let overlay: HTMLDivElement | null = null;
    let lastTapAt = 0;
    let lastTapPage: HTMLElement | null = null;

    const close = () => {
      if (!overlay) return;
      const current = overlay;
      overlay = null;
      current.classList.remove("is-visible");
      document.body.classList.remove("archive-card-focus-open");
      window.setTimeout(() => current.remove(), 220);
    };

    const open = (page: HTMLElement) => {
      close();
      const clone = page.cloneNode(true) as HTMLElement;
      clone.classList.remove("is-active");
      clone.removeAttribute("style");
      restoreImages(clone);

      const nextOverlay = document.createElement("div");
      nextOverlay.className = "archive-card-focus-overlay";
      nextOverlay.setAttribute("role", "dialog");
      nextOverlay.setAttribute("aria-modal", "true");
      nextOverlay.setAttribute("aria-label", "Selected torn page");

      const cardWrap = document.createElement("div");
      cardWrap.className = "archive-card-focus-card";
      cardWrap.appendChild(clone);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "archive-card-focus-close";
      closeButton.setAttribute("aria-label", "Close selected page");
      closeButton.textContent = "×";
      closeButton.addEventListener("click", close);

      nextOverlay.append(cardWrap, closeButton);
      nextOverlay.addEventListener("click", (event) => { if (event.target === nextOverlay) close(); });
      document.body.appendChild(nextOverlay);
      document.body.classList.add("archive-card-focus-open");
      overlay = nextOverlay;
      requestAnimationFrame(() => nextOverlay.classList.add("is-visible"));
    };

    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const page = target?.closest<HTMLElement>(".archive-page");
      if (!page || !page.closest(".archive-view")) return;
      event.preventDefault();
      event.stopPropagation();
      open(page);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target instanceof Element ? event.target : null;
      const page = target?.closest<HTMLElement>(".archive-page");
      if (!page || !page.closest(".archive-view")) return;
      const now = performance.now();
      if (lastTapPage === page && now - lastTapAt < 330) {
        event.preventDefault();
        event.stopPropagation();
        lastTapAt = 0;
        lastTapPage = null;
        open(page);
        return;
      }
      lastTapAt = now;
      lastTapPage = page;
    };

    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styles;
      document.head.appendChild(style);
    }

    document.addEventListener("dblclick", onDoubleClick, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("dblclick", onDoubleClick, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKeyDown);
      close();
    };
  }, []);

  return null;
}
