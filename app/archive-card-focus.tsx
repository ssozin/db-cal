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
  display:flex;
  flex-direction:column;
  width:100%;
  aspect-ratio:382/405;
  overflow:hidden;
  box-sizing:border-box;
  padding:18px 18px 14px;
  background:#f7f6f8;
  color:#25252a;
  cursor:default;
  user-select:none;
  pointer-events:none;
}
.archive-card-focus-date{
  display:flex;
  flex:0 0 auto;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  width:100%;
  margin:12px 0 0;
  padding:0;
  color:#25252a;
  text-align:center;
}
.archive-card-focus-date span{
  display:block;
  margin:0;
  padding:0;
  font-size:clamp(38px,8.64vw,52px);
  font-weight:400;
  line-height:.9;
  letter-spacing:-.04em;
  white-space:nowrap;
}
.archive-card-focus-date strong{
  display:block;
  margin:3px 0 0;
  padding:0;
  font-size:clamp(70px,14.22vw,94px);
  font-weight:400;
  line-height:.84;
  letter-spacing:-.055em;
  white-space:nowrap;
}
.archive-card-focus-photo{
  position:relative;
  flex:0 0 auto;
  width:100%;
  aspect-ratio:2250/906;
  margin-top:14px;
  overflow:hidden;
  background:#f7f6f8;
}
.archive-card-focus-photo img{
  display:block;
  width:100%;
  height:100%;
  margin:0;
  object-fit:cover;
  visibility:visible!important;
  opacity:1!important;
}
.archive-card-focus-footer{
  display:flex;
  flex:1 1 auto;
  align-items:flex-end;
  justify-content:space-between;
  gap:8px;
  min-height:0;
  padding-top:10px;
  padding-bottom:5px;
  color:#3c3c42;
  font:8px/1.2 Arial,sans-serif;
  letter-spacing:.07em;
}
.archive-card-focus-footer div{
  display:flex;
  max-width:68%;
  flex-direction:column;
}
.archive-card-focus-footer b{text-transform:uppercase}
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
  .archive-card-focus-sheet{padding:14px 14px 12px}
  .archive-card-focus-close{top:max(10px,env(safe-area-inset-top));right:10px;font-size:34px}
  .archive-card-focus-date{margin-top:10px}
  .archive-card-focus-date span{font-size:clamp(33px,9.27vw,45px)}
  .archive-card-focus-date strong{font-size:clamp(62px,15.3vw,83px)}
  .archive-card-focus-photo{margin-top:12px}
  .archive-card-focus-footer{font-size:7px;padding-top:8px;padding-bottom:4px}
}
`;

function resolveImageSource(sourceImage: HTMLImageElement | null) {
  if (!sourceImage) return "";
  return sourceImage.getAttribute("src")
    || sourceImage.dataset.archiveSource
    || sourceImage.currentSrc
    || "";
}

function cleanText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function buildFocusedSheet(page: HTMLElement) {
  const sourceDate = page.querySelector<HTMLElement>(".archive-date");
  const dateLines = Array.from(sourceDate?.querySelectorAll<HTMLElement>("span") || [])
    .map((node) => cleanText(node.textContent))
    .filter(Boolean);
  const dayText = cleanText(sourceDate?.querySelector<HTMLElement>("strong")?.textContent);

  const sourcePhoto = page.querySelector<HTMLImageElement>(".archive-photo img")
    || page.querySelector<HTMLImageElement>("img");
  const imageSource = resolveImageSource(sourcePhoto);

  const sourceFooter = page.querySelector<HTMLElement>(".archive-footer");
  const footerChildren = Array.from(sourceFooter?.children || []);

  const sheet = document.createElement("section");
  sheet.className = "archive-card-focus-sheet";

  const date = document.createElement("header");
  date.className = "archive-card-focus-date";
  dateLines.slice(0, 2).forEach((line) => {
    const span = document.createElement("span");
    span.textContent = line;
    date.appendChild(span);
  });
  const strong = document.createElement("strong");
  strong.textContent = dayText;
  date.appendChild(strong);

  const photo = document.createElement("div");
  photo.className = "archive-card-focus-photo";
  const image = document.createElement("img");
  image.alt = sourcePhoto?.alt || "";
  image.decoding = "async";
  if (imageSource) image.src = imageSource;
  photo.appendChild(image);

  const footer = document.createElement("footer");
  footer.className = "archive-card-focus-footer";
  if (footerChildren.length) {
    footerChildren.slice(0, 2).forEach((child) => {
      const block = document.createElement("div");
      Array.from(child.children).forEach((line) => {
        const tag = line.tagName.toLowerCase() === "b" ? "b" : "span";
        const clonedLine = document.createElement(tag);
        clonedLine.textContent = cleanText(line.textContent);
        block.appendChild(clonedLine);
      });
      if (!block.childElementCount) {
        const span = document.createElement("span");
        span.textContent = cleanText(child.textContent);
        block.appendChild(span);
      }
      footer.appendChild(block);
    });
  } else if (sourceFooter) {
    const block = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = cleanText(sourceFooter.textContent);
    block.appendChild(span);
    footer.appendChild(block);
  }

  sheet.append(date, photo, footer);
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
