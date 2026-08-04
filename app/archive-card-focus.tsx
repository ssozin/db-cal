"use client";

import { useEffect } from "react";

const STYLE_ID = "archive-card-focus-styles";

const styles = `
.archive-card-focus-overlay{
  position:fixed;
  z-index:4900;
  inset:0;
  display:grid;
  place-items:center;
  padding:64px 18px 24px;
  background:rgba(18,18,22,.46);
  -webkit-backdrop-filter:blur(12px);
  backdrop-filter:blur(12px);
  opacity:0;
  transition:opacity .2s ease;
  touch-action:none;
}
.archive-card-focus-overlay.is-visible{opacity:1}
.archive-card-focus-card{
  position:relative;
  width:min(76vw,360px);
  max-width:calc(100vw - 36px);
  max-height:calc(100svh - 96px);
  transform:scale(.9);
  transition:transform .24s cubic-bezier(.2,.8,.2,1);
  filter:drop-shadow(0 24px 42px rgba(0,0,0,.34));
}
.archive-card-focus-overlay.is-visible .archive-card-focus-card{transform:scale(1)}
.archive-card-focus-sheet{
  position:relative;
  display:flex;
  width:100%;
  height:auto;
  flex-direction:column;
  overflow:hidden;
  background:#f7f6f8;
  color:#25252a;
  cursor:default;
  user-select:none;
  pointer-events:none;
  box-shadow:none;
}
.archive-card-focus-sheet .archive-date{
  display:flex;
  flex:0 0 44%;
  height:44%;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  color:#25252a;
  text-align:center;
}
.archive-card-focus-sheet .archive-date span{
  font-size:clamp(23px,7vw,34px);
  line-height:.9;
  letter-spacing:-.025em;
}
.archive-card-focus-sheet .archive-date strong{
  margin-top:3px;
  font-size:clamp(40px,12vw,56px);
  font-weight:400;
  line-height:.9;
}
.archive-card-focus-sheet .archive-photo{
  position:relative;
  width:100%;
  aspect-ratio:2250/906;
  flex:0 0 auto;
  overflow:hidden;
  background:#f7f6f8;
  border:0;
  outline:0;
  box-shadow:none;
}
.archive-card-focus-sheet .archive-photo img{
  display:block;
  width:calc(100% + 2px);
  height:calc(100% + 2px);
  margin:-1px;
  border:0;
  outline:0;
  object-fit:cover;
  visibility:visible!important;
  opacity:1!important;
}
.archive-card-focus-sheet .archive-footer{
  display:flex;
  flex:1 1 auto;
  align-items:flex-end;
  justify-content:space-between;
  gap:8px;
  margin-top:auto;
  padding-top:8px;
  color:#3c3c42;
  font:6px/1.25 Arial,sans-serif;
  letter-spacing:.07em;
}
.archive-card-focus-sheet .archive-footer div{
  display:flex;
  max-width:68%;
  flex-direction:column;
}
.archive-card-focus-sheet .archive-footer b{text-transform:uppercase}
.archive-card-focus-close{
  position:fixed;
  z-index:2;
  top:max(18px,env(safe-area-inset-top));
  right:18px;
  display:block;
  width:auto;
  height:auto;
  padding:0;
  border:0;
  background:transparent;
  color:#fff;
  font:200 38px/1 Arial,sans-serif;
  cursor:pointer;
  text-shadow:0 1px 8px rgba(0,0,0,.35);
}
.archive-card-focus-close:active{transform:scale(.92)}
body.archive-card-focus-open{overflow:hidden}
@media(max-width:640px){
  .archive-card-focus-overlay{padding:58px 14px 18px}
  .archive-card-focus-card{width:min(78vw,320px);max-width:calc(100vw - 28px)}
  .archive-card-focus-close{top:max(14px,env(safe-area-inset-top));right:14px;font-size:36px}
  .archive-card-focus-sheet .archive-date span{font-size:clamp(22px,7.2vw,31px)}
  .archive-card-focus-sheet .archive-date strong{font-size:clamp(38px,12vw,52px)}
}
`;

function resolveImageSource(sourceImage: HTMLImageElement | null) {
  if (!sourceImage) return "";
  return sourceImage.getAttribute("src")
    || sourceImage.dataset.archiveSource
    || sourceImage.currentSrc
    || "";
}

function buildFocusedSheet(page: HTMLElement) {
  const sourceRect = page.getBoundingClientRect();
  const sourceStyle = getComputedStyle(page);
  const ratioWidth = Math.max(1, page.offsetWidth || sourceRect.width);
  const ratioHeight = Math.max(1, page.offsetHeight || sourceRect.height);

  const sheet = page.cloneNode(true) as HTMLElement;
  sheet.className = "archive-card-focus-sheet";
  sheet.removeAttribute("style");
  sheet.style.aspectRatio = `${ratioWidth} / ${ratioHeight}`;
  sheet.style.padding = sourceStyle.padding;

  const sourceImages = Array.from(page.querySelectorAll<HTMLImageElement>("img"));
  const clonedImages = Array.from(sheet.querySelectorAll<HTMLImageElement>("img"));
  clonedImages.forEach((image, index) => {
    const resolved = resolveImageSource(sourceImages[index] ?? null)
      || image.getAttribute("src")
      || image.dataset.archiveSource
      || "";
    if (resolved) image.setAttribute("src", resolved);
    image.style.removeProperty("visibility");
    image.style.removeProperty("display");
    image.removeAttribute("loading");
    image.setAttribute("decoding", "async");
  });

  return sheet;
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

      const nextOverlay = document.createElement("div");
      nextOverlay.className = "archive-card-focus-overlay";
      nextOverlay.setAttribute("role", "dialog");
      nextOverlay.setAttribute("aria-modal", "true");
      nextOverlay.setAttribute("aria-label", "Selected torn page");

      const cardWrap = document.createElement("div");
      cardWrap.className = "archive-card-focus-card";
      cardWrap.appendChild(buildFocusedSheet(page));

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "archive-card-focus-close";
      closeButton.setAttribute("aria-label", "Close selected page");
      closeButton.textContent = "×";
      closeButton.addEventListener("click", close);

      nextOverlay.append(cardWrap, closeButton);
      nextOverlay.addEventListener("click", (event) => {
        if (event.target === nextOverlay) close();
      });

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
      if (lastTapPage === page && now - lastTapAt < 360) {
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styles;
      document.head.appendChild(style);
    } else {
      style.textContent = styles;
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
