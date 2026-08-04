"use client";

import { useEffect } from "react";

const STYLE_ID = "calendar-experience-fix-styles";
const ARCHIVE_INITIAL_ZOOM = 1.18;

const styles = `
.capture-preview-hint{display:none!important}
.archive-card-focus-card{width:min(78vw,380px)!important;max-width:calc(100vw - 32px)!important;max-height:calc(100svh - 92px)!important}
.archive-card-focus-sheet{aspect-ratio:.88!important;padding:5.25%!important}
.archive-card-focus-sheet .archive-date{flex:0 0 47%!important;height:47%!important}
.archive-card-focus-sheet .archive-date span{font-size:clamp(24px,10.8cqw,40px)!important;line-height:.9!important;letter-spacing:-.035em!important}
.archive-card-focus-sheet .archive-date strong{margin-top:2px!important;font-size:clamp(42px,18.8cqw,68px)!important;line-height:.9!important}
.archive-card-focus-sheet .archive-photo{width:100%!important;aspect-ratio:2250/906!important;flex:0 0 auto!important}
.archive-card-focus-sheet .archive-footer{flex:1 1 auto!important;margin-top:0!important;padding-top:7px!important;padding-bottom:0!important;align-items:flex-end!important;font-size:clamp(6px,2.15cqw,8px)!important;line-height:1.25!important}
.archive-card-focus-close{width:34px!important;height:34px!important;font-size:0!important;text-shadow:none!important}
.archive-card-focus-close:before,.archive-card-focus-close:after{content:"";position:absolute;top:50%;left:50%;width:29px;height:1px;background:#fff;transform-origin:center}
.archive-card-focus-close:before{transform:translate(-50%,-50%) rotate(45deg)}
.archive-card-focus-close:after{transform:translate(-50%,-50%) rotate(-45deg)}
.calendar-stable-flash{position:fixed;z-index:7000;inset:0;background:#fff;pointer-events:none;animation:calendarStableFlash .25s ease-out}
@keyframes calendarStableFlash{0%{opacity:0}12%{opacity:.92}100%{opacity:0}}
.calendar-stable-preview{position:fixed;z-index:7100;inset:0;display:grid;place-items:center;padding:16px 12px;background:rgba(20,20,24,.58);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.calendar-stable-panel{display:flex;width:min(94vw,430px);max-height:92svh;flex-direction:column;gap:10px;padding:12px;background:rgba(248,248,247,.98);box-shadow:0 22px 50px rgba(0,0,0,.3)}
.calendar-stable-panel img{display:block;width:100%;max-height:72svh;object-fit:contain;background:#ecece9}
.calendar-stable-actions{display:flex;gap:8px}
.calendar-stable-actions button{flex:1;min-height:46px;border:0;background:#242428;color:#fff;font:700 12px/1 Arial,sans-serif;cursor:pointer}
.calendar-stable-actions .is-cancel{background:#dededc;color:#242428}
@media(max-width:640px){
  .archive-card-focus-card{width:min(78vw,320px)!important;max-width:calc(100vw - 28px)!important}
  .archive-card-focus-sheet{padding:5.25%!important}
  .archive-card-focus-close{top:max(14px,env(safe-area-inset-top))!important;right:14px!important;width:32px!important;height:32px!important}
  .archive-card-focus-close:before,.archive-card-focus-close:after{width:27px!important}
}
`;

type Point = { x: number; y: number };

function textOf(element: Element | null) {
  return (element?.textContent || "").trim();
}

function isMobileTarget() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));
}

function parseTransform(shell: HTMLElement) {
  const transform = shell.style.transform || "";
  const rotationMatch = transform.match(/rotateY\(([-\d.]+)deg\)/);
  return { rotation: rotationMatch ? Number(rotationMatch[1]) : 0 };
}

function readScale(element: HTMLElement) {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return 1;
  try {
    return new DOMMatrixReadOnly(transform).a || 1;
  } catch {
    return 1;
  }
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve(image.complete && image.naturalWidth > 0);
    };
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
    if (typeof image.decode === "function") void image.decode().then(done).catch(() => undefined);
    window.setTimeout(done, 1600);
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const imageRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
  const targetRatio = width / Math.max(1, height);
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  if (imageRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }
  ctx.save();
  ctx.filter = "saturate(.9) contrast(1.05)";
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}

async function buildFrontTexture(shell: HTMLElement) {
  const binder = shell.querySelector<HTMLElement>(".binder");
  const paper = shell.querySelector<HTMLElement>(".paper-current");
  const stack = shell.querySelector<HTMLElement>(".paper-stack");
  if (!binder || !paper || !stack) throw new Error("Calendar elements unavailable");

  const width = Math.max(280, Math.round(shell.offsetWidth));
  const binderHeight = Math.max(58, Math.round(binder.offsetHeight));
  const paperHeight = Math.max(300, Math.round(stack.offsetHeight));
  const height = binderHeight + paperHeight;
  const quality = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * quality;
  canvas.height = height * quality;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(quality, quality);

  const binderGradient = ctx.createLinearGradient(0, 0, 0, binderHeight);
  binderGradient.addColorStop(0, "#38343c");
  binderGradient.addColorStop(.65, "#28252b");
  binderGradient.addColorStop(1, "#201e23");
  ctx.fillStyle = binderGradient;
  roundedRect(ctx, 0, 0, width, binderHeight + 2, 3);
  ctx.fill();

  const ringRadius = Math.max(13, Math.min(16, binderHeight * .21));
  const ringY = binderHeight * .5;
  [width * .29, width * .71].forEach((ringX) => {
    const ringGradient = ctx.createRadialGradient(ringX - ringRadius * .3, ringY - ringRadius * .35, 1, ringX, ringY, ringRadius);
    ringGradient.addColorStop(0, "#eef0f1");
    ringGradient.addColorStop(.45, "#d0d1d2");
    ringGradient.addColorStop(.76, "#a0a2a4");
    ringGradient.addColorStop(1, "#747679");
    ctx.beginPath();
    ctx.arc(ringX, ringY, ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = ringGradient;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(72,73,76,.75)";
    ctx.stroke();
  });

  const paperY = binderHeight;
  ctx.fillStyle = "#f4f3f7";
  ctx.fillRect(0, paperY, width, paperHeight);
  const paperStyle = getComputedStyle(paper);
  const padLeft = Number.parseFloat(paperStyle.paddingLeft) || width * .05;

  const dateBlock = paper.querySelector<HTMLElement>(".date-block");
  const dateSpans = paper.querySelectorAll(".date-block span");
  const dateStrong = paper.querySelector<HTMLElement>(".date-block strong");
  if (dateBlock) {
    const dateTop = paperY + dateBlock.offsetTop;
    const dateHeight = dateBlock.offsetHeight;
    const spanStyle = dateSpans[0] ? getComputedStyle(dateSpans[0]) : null;
    const strongStyle = dateStrong ? getComputedStyle(dateStrong) : null;
    const spanSize = Number.parseFloat(spanStyle?.fontSize || "42") || 42;
    const strongSize = Number.parseFloat(strongStyle?.fontSize || "70") || 70;
    ctx.fillStyle = "#242429";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 ${spanSize}px "Courier New", Courier, monospace`;
    ctx.fillText(textOf(dateSpans[0] ?? null), width / 2, dateTop + dateHeight * .31);
    ctx.fillText(textOf(dateSpans[1] ?? null), width / 2, dateTop + dateHeight * .49);
    ctx.font = `400 ${strongSize}px "Courier New", Courier, monospace`;
    ctx.fillText(textOf(dateStrong), width / 2, dateTop + dateHeight * .75);
  }

  const photoFrame = paper.querySelector<HTMLElement>(".photo-frame");
  const image = photoFrame?.querySelector<HTMLImageElement>("img") ?? null;
  if (image) await waitForImage(image);
  if (photoFrame) {
    const photoX = photoFrame.offsetLeft;
    const photoY = paperY + photoFrame.offsetTop;
    const photoWidth = photoFrame.offsetWidth;
    const photoHeight = photoFrame.offsetHeight;
    if (image && image.naturalWidth > 0) {
      try { drawCoverImage(ctx, image, photoX, photoY, photoWidth, photoHeight); }
      catch { ctx.fillStyle = "#173028"; ctx.fillRect(photoX, photoY, photoWidth, photoHeight); }
    } else {
      ctx.fillStyle = "#173028";
      ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
    }
  }

  const footer = paper.querySelector<HTMLElement>(".paper-footer");
  if (footer) {
    const footerTop = paperY + footer.offsetTop + Math.max(4, footer.offsetHeight * .16);
    const footerSize = Number.parseFloat(getComputedStyle(footer).fontSize) || 8;
    const lines = Array.from(footer.querySelectorAll("div:first-child span, div:first-child b"))
      .map((node) => textOf(node)).filter(Boolean);
    ctx.fillStyle = "#3c3c42";
    ctx.font = `700 ${footerSize}px Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    lines.slice(0, 2).forEach((line, index) => ctx.fillText(line.slice(0, 48), padLeft, footerTop + index * footerSize * 1.28));
    ctx.textAlign = "right";
    ctx.fillText(textOf(footer.querySelector(".day-count")), width - padLeft, footerTop + footerSize * 1.2);
  }

  return { canvas, width, height, binderHeight };
}

function drawSide(ctx: CanvasRenderingContext2D, frontLeft: number, frontRight: number, top: number, height: number, binderHeight: number, sideWidth: number, rotation: number) {
  if (sideWidth < .5) return;
  const toLeft = rotation > 0;
  const edgeX = toLeft ? frontLeft : frontRight;
  const backX = edgeX + (toLeft ? -sideWidth : sideWidth);
  const points: Point[] = [
    { x: edgeX, y: top }, { x: backX, y: top + 2 },
    { x: backX, y: top + height + 4 }, { x: edgeX, y: top + height },
  ];
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  const sideGradient = ctx.createLinearGradient(Math.min(edgeX, backX), 0, Math.max(edgeX, backX), 0);
  sideGradient.addColorStop(0, "#efeff1");
  sideGradient.addColorStop(.55, "#c8c7cb");
  sideGradient.addColorStop(1, "#8f8f94");
  ctx.fillStyle = sideGradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(edgeX, top);
  ctx.lineTo(backX, top + 2);
  ctx.lineTo(backX, top + binderHeight + 2);
  ctx.lineTo(edgeX, top + binderHeight);
  ctx.closePath();
  const binderSide = ctx.createLinearGradient(Math.min(edgeX, backX), 0, Math.max(edgeX, backX), 0);
  binderSide.addColorStop(0, "#2b282f");
  binderSide.addColorStop(1, "#17151a");
  ctx.fillStyle = binderSide;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = .35;
  ctx.strokeStyle = "#86868a";
  ctx.lineWidth = .7;
  for (let y = top + binderHeight + 3; y < top + height; y += 3) {
    ctx.beginPath();
    ctx.moveTo(edgeX, y);
    ctx.lineTo(backX, y + 2);
    ctx.stroke();
  }
  ctx.restore();
}

async function captureCurrentCalendar() {
  const shell = document.querySelector<HTMLElement>(".calendar-shell");
  if (!shell) throw new Error("Calendar unavailable");
  const texture = await buildFrontTexture(shell);
  const shellRect = shell.getBoundingClientRect();
  const stage = document.querySelector<HTMLElement>(".calendar-stage");
  const cssWidth = Math.max(1, window.innerWidth);
  const cssHeight = Math.max(1, window.innerHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(dpr, dpr);

  const gradient = ctx.createRadialGradient(cssWidth * .5, cssHeight * .46, 0, cssWidth * .5, cssHeight * .46, Math.max(cssWidth, cssHeight));
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(.38, "#f3f3f1");
  gradient.addColorStop(.76, "#e7e7e5");
  gradient.addColorStop(1, "#dededc");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const { rotation } = parseTransform(shell);
  const radians = rotation * Math.PI / 180;
  const cos = Math.max(.18, Math.abs(Math.cos(radians)));
  const sin = Math.sin(radians);
  const scale = shellRect.height / Math.max(1, texture.height);
  const depth = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--full-depth")) || 72;
  const sideWidth = Math.abs(sin) * depth * scale;
  const frontWidth = texture.width * cos * scale;
  const objectCenterX = shellRect.left + shellRect.width / 2;
  const frontCenterX = objectCenterX + (rotation > 0 ? sideWidth / 2 : rotation < 0 ? -sideWidth / 2 : 0);
  const centerY = shellRect.top + shellRect.height / 2;
  const frontLeft = frontCenterX - frontWidth / 2;
  const frontRight = frontCenterX + frontWidth / 2;
  const top = centerY - texture.height * scale / 2;

  ctx.save();
  ctx.shadowColor = "rgba(18,18,23,.28)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = rotation > 0 ? 10 : -10;
  ctx.shadowOffsetY = 15;
  ctx.fillStyle = "rgba(20,20,24,.12)";
  ctx.fillRect(frontLeft, top, frontWidth, texture.height * scale);
  ctx.restore();

  drawSide(ctx, frontLeft, frontRight, top, texture.height * scale, texture.binderHeight * scale, sideWidth, rotation);

  ctx.save();
  ctx.translate(frontCenterX, centerY);
  ctx.scale(cos * scale, scale);
  ctx.drawImage(texture.canvas, -texture.width / 2, -texture.height / 2, texture.width, texture.height);
  ctx.restore();

  if (stage) {
    const stageStyle = getComputedStyle(stage);
    if (stageStyle.filter && stageStyle.filter !== "none") ctx.filter = stageStyle.filter;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 1;
  canvas.height = 1;
  texture.canvas.width = 1;
  texture.canvas.height = 1;
  if (!blob || blob.size === 0) throw new Error("Capture failed");
  return blob;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showPreview(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const overlay = document.createElement("div");
  overlay.className = "calendar-stable-preview";
  const panel = document.createElement("div");
  panel.className = "calendar-stable-panel";
  const image = document.createElement("img");
  image.src = url;
  image.alt = "Captured calendar";
  const actions = document.createElement("div");
  actions.className = "calendar-stable-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "이미지 저장";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "is-cancel";
  cancel.textContent = "닫기";
  const close = () => { URL.revokeObjectURL(url); overlay.remove(); };
  cancel.addEventListener("click", close);
  save.addEventListener("click", async () => {
    const file = new File([blob], name, { type: "image/png" });
    try {
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Calendar" });
      } else downloadBlob(blob, name);
      close();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) downloadBlob(blob, name);
    }
  });
  actions.append(save, cancel);
  panel.append(image, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function setArchiveInitialZoom() {
  window.setTimeout(() => {
    const floor = document.querySelector<HTMLElement>(".archive-floor");
    if (!floor) return;
    const current = readScale(floor);
    const steps = Math.round((ARCHIVE_INITIAL_ZOOM - current) / .06);
    const direction = steps >= 0 ? -1 : 1;
    for (let index = 0; index < Math.abs(steps); index += 1) {
      floor.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: direction }));
    }
  }, 80);
}

export default function CalendarExperienceFix() {
  useEffect(() => {
    let capturing = false;
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = styles;

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".floor-pile-trigger")) setArchiveInitialZoom();
      const captureButton = target?.closest<HTMLButtonElement>(".calendar-capture");
      if (!captureButton) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (capturing) return;
      capturing = true;
      const flash = document.createElement("div");
      flash.className = "calendar-stable-flash";
      document.body.appendChild(flash);
      window.setTimeout(() => flash.remove(), 280);
      void captureCurrentCalendar()
        .then((blob) => {
          const name = `calendar-${Date.now()}.png`;
          if (isMobileTarget()) showPreview(blob, name);
          else downloadBlob(blob, name);
        })
        .catch((error) => console.warn("Stable calendar capture failed", error))
        .finally(() => { capturing = false; });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
