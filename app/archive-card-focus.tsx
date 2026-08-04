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
  padding:18px;
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
  width:min(90.2vw,462px);
  max-width:calc(100vw - 36px);
  transform:scale(.92);
  transition:transform .24s cubic-bezier(.2,.8,.2,1);
  filter:drop-shadow(0 22px 38px rgba(0,0,0,.32));
}
.archive-card-focus-overlay.is-visible .archive-card-focus-card{transform:scale(1)}
.archive-card-focus-sheet{
  position:relative;
  display:grid;
  grid-template-rows:42% auto 1fr;
  width:100%;
  aspect-ratio:382/405!important;
  min-height:0;
  overflow:hidden;
  padding:14px 14px 12px!important;
  background:#f7f6f8;
  color:#25252a;
  cursor:default;
  user-select:none;
  pointer-events:none;
  box-shadow:none;
}
.archive-card-focus-sheet::before,
.archive-card-focus-sheet::after,
.archive-card-focus-sheet .archive-date::before,
.archive-card-focus-sheet .archive-date::after,
.archive-card-focus-sheet .archive-photo::before,
.archive-card-focus-sheet .archive-photo::after,
.archive-card-focus-sheet .archive-footer::before,
.archive-card-focus-sheet .archive-footer::after{
  content:none!important;
  display:none!important;
}
.archive-card-focus-sheet .archive-date{
  display:flex;
  min-height:0;
  flex-direction:column;
  align-items:center;
  justify-content:flex-end;
  padding:0 0 6px;
  color:#25252a;
  text-align:center;
  overflow:visible;
}
.archive-card-focus-sheet .archive-date span{
  display:block;
  font-size:clamp(46px,10.5vw,64px);
  line-height:.9;
  letter-spacing:-.04em;
  white-space:nowrap;
}
.archive-card-focus-sheet .archive-date strong{
  display:block;
  margin-top:2px;
  font-size:clamp(86px,17.2vw,114px);
  font-weight:400;
  line-height:.84;
  letter-spacing:-.055em;
  white-space:nowrap;
}
.archive-card-focus-sheet .archive-photo{
  position:relative;
  width:100%;
  aspect-ratio:2250/906;
  min-height:0;
  overflow:hidden;
  background:#f7f6f8;
  border:0;
  outline:0;
  box-shadow:none;
}
.archive-card-focus-sheet .archive-photo img{
  display:block;
  width:100%;
  height:100%;
  margin:0;
  border:0;
  outline:0;
  object-fit:cover;
  visibility:visible!important;
  opacity:1!important;
}
.archive-card-focus-sheet .archive-footer{
  display:flex;
  min-height:0;
  align-items:flex-start;
  justify-content:space-between;
  gap:8px;
  padding-top:8px;
  color:#3c3c42;
  font:7px/1.2 Arial,sans-serif;
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
  top:max(12px,env(safe-area-inset-top));
  right:14px;
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
  .archive-card-focus-overlay{padding:12px}
  .archive-card-focus-card{width:min(96.8vw,396px);max-width:calc(100vw - 24px)}
  .archive-card-focus-sheet{
    padding:12px 12px 10px!important;
    grid-template-rows:42% auto 1fr;
    aspect-ratio:382/405!important;
  }
  .archive-card-focus-close{top:max(10px,env(safe-area-inset-top));right:10px;font-size:34px}
  .archive-card-focus-sheet .archive-date{padding:0 0 5px}
  .archive-card-focus-sheet .archive-date span{font-size:clamp(41px,11.2vw,56px)}
  .archive-card-focus-sheet .archive-date strong{font-size:clamp(76px,18.8vw,100px)}
  .archive-card-focus-sheet .archive-footer{font-size:6px;padding-top:7px}
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
  const sheet = page.cloneNode(true) as HTMLElement;
  sheet.className = "archive-card-focus-sheet";
  sheet.removeAttribute("style");

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
