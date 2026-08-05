"use client";

import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toBlob as htmlToImageToBlob } from "html-to-image";

type PhotoMap = Record<string, { url: string; name: string; event: string; sourceDate: string }>;

const YEAR = 2026;
const PIN_LAYERS = 30;
const weekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildDates() {
  const dates: Date[] = [];
  const cursor = new Date(YEAR, 0, 1, 12);
  while (cursor.getFullYear() === YEAR) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function todayIndex(dates: Date[]) {
  const now = new Date();
  if (now.getFullYear() < YEAR) return 0;
  if (now.getFullYear() > YEAR) return dates.length - 1;
  const key = dateKey(new Date(YEAR, now.getMonth(), now.getDate(), 12));
  return Math.max(0, dates.findIndex((date) => dateKey(date) === key));
}

function filenameMeta(filename: string) {
  const cleanName = filename.replace(/\.[^.]+$/, "");
  const match = cleanName.match(/^(\d{8}|\d{6})[\s_-]*(.*)$/);
  if (!match) return null;
  const sourceDate = match[1];
  const month = Number(sourceDate.length === 8 ? sourceDate.slice(4, 6) : sourceDate.slice(2, 4));
  const day = Number(sourceDate.length === 8 ? sourceDate.slice(6, 8) : sourceDate.slice(4, 6));
  const candidate = new Date(YEAR, month - 1, day, 12);
  if (candidate.getFullYear() !== YEAR || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  const event = match[2].trim().replace(/\s*\(\d+\)\s*$/, "") || "UNTITLED EVENT";
  return { key: dateKey(candidate), sourceDate, event };
}

function isKorean(value: string) {
  return /[가-힣]/.test(value);
}

function pinLayerStyle(layer: number): CSSProperties {
  const progress = (layer + 1) / (PIN_LAYERS + 1);
  const highlight = Math.round(203 + progress * 25);
  const middle = Math.round(174 + progress * 22);
  const shadow = Math.round(121 + progress * 20);
  return {
    "--pin-inset": `${3.5 * progress}px`,
    "--pin-z": `${3.3 * progress}px`,
    "--pin-highlight": `rgb(${highlight} ${highlight + 1} ${highlight + 2})`,
    "--pin-middle": `rgb(${middle} ${middle + 2} ${middle + 5})`,
    "--pin-shadow": `rgb(${shadow} ${shadow + 3} ${shadow + 7})`,
  } as CSSProperties;
}

function seeded(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampZoom(value: number) {
  return Math.max(0.65, Math.min(1.5, Number(value.toFixed(3))));
}

let paperAudioContext: AudioContext | null = null;
let paperAudioUnlocked = false;
let lastPaperSlideAt = 0;

function isMobileSoundTarget() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));
}

function getPaperAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!paperAudioContext) paperAudioContext = new AudioCtx();
  return paperAudioContext;
}

/** iOS/Android only allow Web Audio after a real gesture + often a silent play. */
function unlockTearAudio() {
  const ctx = getPaperAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      paperAudioUnlocked = true;
    }).catch(() => undefined);
  } else {
    paperAudioUnlocked = true;
  }
  // Same-callstack silent buffer is what actually unlocks Mobile Safari.
  try {
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = silent;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    paperAudioUnlocked = true;
  } catch {
    /* ignore unlock failures — later gestures retry */
  }
  return ctx;
}

function playNoiseBurst(
  ctx: AudioContext,
  {
    duration,
    volume,
    highpass,
    lowpass,
    peakAt = 0.02,
  }: { duration: number; volume: number; highpass: number; lowpass: number; peakAt?: number },
) {
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let pink = 0;
  for (let i = 0; i < frames; i += 1) {
    const white = Math.random() * 2 - 1;
    // Soft pink-ish noise reads more like paper than harsh white noise.
    pink = pink * 0.86 + white * 0.14;
    const t = i / frames;
    const flutter = 0.65 + 0.35 * Math.sin(t * Math.PI * 7 + white);
    const envelope = Math.exp(-t * 9) * flutter;
    data[i] = pink * envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const hip = ctx.createBiquadFilter();
  hip.type = "highpass";
  hip.frequency.value = highpass;
  const lop = ctx.createBiquadFilter();
  lop.type = "lowpass";
  lop.frequency.value = lowpass;
  const gain = ctx.createGain();
  // Phone speakers need a bit more level than desktop.
  const level = volume * (isMobileSoundTarget() ? 1.45 : 1);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + peakAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(hip);
  hip.connect(lop);
  lop.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}

/** Soft peel / flutter when a page is torn from the pad. */
function playTearSound() {
  const ctx = unlockTearAudio();
  if (!ctx) return;
  // Low whoosh + light mid flutter — less "static burst", more paper peel.
  playNoiseBurst(ctx, { duration: 0.42, volume: 0.42, highpass: 180, lowpass: 1400, peakAt: 0.03 });
  window.setTimeout(() => {
    const again = unlockTearAudio();
    if (!again) return;
    playNoiseBurst(again, { duration: 0.22, volume: 0.26, highpass: 700, lowpass: 3200, peakAt: 0.012 });
  }, 40);
}

/** Quiet paper rustle when a torn-page card is picked up or dragged. */
function playPaperSlideSound(force = false) {
  const now = performance.now();
  if (!force && now - lastPaperSlideAt < 90) return;
  lastPaperSlideAt = now;
  const ctx = unlockTearAudio();
  if (!ctx) return;
  playNoiseBurst(ctx, {
    duration: force ? 0.16 : 0.11,
    volume: force ? 0.26 : 0.16,
    highpass: 900,
    lowpass: 4200,
    peakAt: 0.01,
  });
}

/** Soft settle tap when a dragged card is released. */
function playPaperPlaceSound() {
  const ctx = unlockTearAudio();
  if (!ctx) return;
  playNoiseBurst(ctx, { duration: 0.14, volume: 0.22, highpass: 400, lowpass: 1800, peakAt: 0.008 });
}

function isMobileCaptureTarget() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function transformRotation(transform: string) {
  if (!transform || transform === "none") return 0;
  const matrix = new DOMMatrix(transform);
  return Math.atan2(matrix.b, matrix.a);
}

async function waitForImage(img: HTMLImageElement) {
  if (img.complete && img.naturalWidth > 0) return true;
  try {
    if (typeof img.decode === "function") await img.decode();
  } catch {
    /* ignore decode errors — naturalWidth check below */
  }
  if (img.complete && img.naturalWidth > 0) return true;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    window.setTimeout(done, 1200);
  });
  return img.complete && img.naturalWidth > 0;
}

function drawArchiveCard(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  rect: DOMRect,
  floorScale: number,
) {
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (width < 2 || height < 2) return;

  const angle = transformRotation(getComputedStyle(el).transform);
  const drawW = width * floorScale;
  const drawH = height * floorScale;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-drawW / 2, -drawH / 2);

  ctx.fillStyle = "#f7f6f8";
  ctx.shadowColor = "rgba(22,22,27,0.2)";
  ctx.shadowBlur = 14 * floorScale;
  ctx.shadowOffsetX = 5 * floorScale;
  ctx.shadowOffsetY = 9 * floorScale;
  ctx.fillRect(0, 0, drawW, drawH);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const padX = drawW * 0.067;
  const padTop = drawW * 0.067;
  const dateH = height * 0.44 * floorScale;

  ctx.fillStyle = "#25252a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let textY = padTop + dateH * 0.28;
  ctx.font = `400 ${Math.max(9, drawW * 0.105)}px "Courier New", Courier, monospace`;
  el.querySelectorAll(".archive-date span").forEach((node) => {
    ctx.fillText((node.textContent || "").trim(), drawW / 2, textY);
    textY += drawW * 0.12;
  });
  const strong = el.querySelector(".archive-date strong");
  if (strong) {
    ctx.font = `400 ${Math.max(14, drawW * 0.19)}px "Courier New", Courier, monospace`;
    ctx.fillText((strong.textContent || "").trim(), drawW / 2, textY + drawW * 0.02);
  }

  const photoW = drawW - padX * 2;
  const photoH = photoW * (906 / 2250);
  const photoY = padTop + dateH;
  const img = el.querySelector(".archive-photo img") as HTMLImageElement | null;
  if (img && img.naturalWidth > 0) {
    const targetRatio = photoW / photoH;
    const imageRatio = img.naturalWidth / img.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (imageRatio > targetRatio) {
      sw = img.naturalHeight * targetRatio;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / targetRatio;
      sy = (img.naturalHeight - sh) / 2;
    }
    try {
      ctx.drawImage(img, sx, sy, sw, sh, padX, photoY, photoW, photoH);
    } catch {
      ctx.fillStyle = "#d0d0ce";
      ctx.fillRect(padX, photoY, photoW, photoH);
    }
  } else {
    ctx.fillStyle = "#173028";
    ctx.fillRect(padX, photoY, photoW, photoH);
  }

  const footer = el.querySelector(".archive-footer");
  if (footer) {
    const footerTop = photoY + photoH + drawW * 0.055;
    ctx.fillStyle = "#3c3c42";
    ctx.font = `700 ${Math.max(6, drawW * 0.034)}px Arial, sans-serif`;
    ctx.textBaseline = "top";
    let lineY = footerTop;
    ctx.textAlign = "left";
    footer.querySelector("div")?.querySelectorAll("span, b").forEach((node) => {
      ctx.fillText((node.textContent || "").trim().slice(0, 32), padX, lineY);
      lineY += drawW * 0.042;
    });
    const day = Array.from(footer.children).find((child) => child.tagName === "SPAN");
    if (day) {
      ctx.textAlign = "right";
      ctx.fillText((day.textContent || "").trim(), drawW - padX, footerTop);
    }
  }

  ctx.restore();
}

async function captureArchiveViewport(floorScale: number) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(dpr, dpr);

  const gradient = ctx.createRadialGradient(width * 0.42, height * 0.34, 0, width * 0.42, height * 0.34, Math.max(width, height));
  gradient.addColorStop(0, "#fafaf9");
  gradient.addColorStop(0.74, "#e8e8e6");
  gradient.addColorStop(1, "#dededb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const cards = Array.from(document.querySelectorAll<HTMLElement>(".archive-page"))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const z = Number(getComputedStyle(el).zIndex) || 0;
      return { el, rect, z };
    })
    .filter(({ rect }) => rect.right > 8 && rect.bottom > 8 && rect.left < width - 8 && rect.top < height - 8)
    .sort((a, b) => a.z - b.z)
    .slice(-48);

  await Promise.all(
    cards.map(async ({ el }) => {
      const img = el.querySelector(".archive-photo img") as HTMLImageElement | null;
      if (img) await waitForImage(img);
    }),
  );

  for (const { el, rect } of cards) {
    drawArchiveCard(ctx, el, rect, floorScale);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob || blob.size === 0) throw new Error("Capture returned no image data");
  return blob;
}

/** Full-viewport wallpaper: keep screen height, strip chrome, leave top margin. */
async function composeCalendarWallpaper(padBlob: Blob) {
  const padUrl = URL.createObjectURL(padBlob);
  try {
    const padImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode calendar pad"));
      img.src = padUrl;
    });

    const cssWidth = Math.max(1, Math.round(window.innerWidth));
    const cssHeight = Math.max(1, Math.round(window.innerHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1.5);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.scale(dpr, dpr);

    // Match the live stage wash so the save reads as the page without UI.
    const gradient = ctx.createRadialGradient(
      cssWidth * 0.5,
      cssHeight * 0.46,
      0,
      cssWidth * 0.5,
      cssHeight * 0.46,
      Math.max(cssWidth, cssHeight),
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.38, "#f3f3f1");
    gradient.addColorStop(0.76, "#e7e7e5");
    gradient.addColorStop(1, "#dededc");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Top margin clears status-bar / Dynamic Island area for wallpaper use.
    // Calendar keeps its on-screen visual width; vertical canvas = full screen.
    const sidePad = cssWidth * 0.09;
    const drawWidth = Math.min(cssWidth - sidePad * 2, cssWidth * 0.82);
    const drawHeight = drawWidth * (padImage.naturalHeight / Math.max(1, padImage.naturalWidth));
    const topMargin = Math.max(cssHeight * 0.14, 72);
    const maxBottom = cssHeight - Math.max(cssHeight * 0.1, 48);
    const fittedHeight = Math.min(drawHeight, maxBottom - topMargin);
    const fittedWidth = fittedHeight * (padImage.naturalWidth / Math.max(1, padImage.naturalHeight));
    const x = (cssWidth - fittedWidth) / 2;
    const y = topMargin;
    ctx.drawImage(padImage, x, y, fittedWidth, fittedHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob || blob.size === 0) throw new Error("Wallpaper compose returned no image data");
    return blob;
  } finally {
    URL.revokeObjectURL(padUrl);
  }
}

export default function Home() {
  const dates = useMemo(buildDates, []);
  const [index, setIndex] = useState(() => todayIndex(dates));
  const [photos, setPhotos] = useState<PhotoMap>({});
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [falling, setFalling] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [finished, setFinished] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selfRighting, setSelfRighting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [archiveZoom, setArchiveZoom] = useState(1);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturePreview, setCapturePreview] = useState<{ url: string; blob: Blob; name: string } | null>(null);
  const [landingX, setLandingX] = useState(-4.3);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveOffsets, setArchiveOffsets] = useState<Record<number, { x: number; y: number }>>({});
  const [activeArchivePage, setActiveArchivePage] = useState<number | null>(null);
  const [focusedArchivePage, setFocusedArchivePage] = useState<number | null>(null);
  // Persists which page was picked up last so it stays stacked on top even
  // after it's dropped, instead of falling back under later pages.
  const [archiveZIndices, setArchiveZIndices] = useState<Record<number, number>>({});
  const archiveZCounter = useRef(1000);
  const archiveTapRef = useRef<{ page: number; time: number; x: number; y: number } | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => dates[todayIndex(dates)].getMonth());
  // Depth visuals lag the page index so tear/jump animations never snap the shadow.
  const [depthIndex, setDepthIndex] = useState(() => todayIndex(dates));
  const pointerStart = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const rotationRef = useRef(0);
  const selfRightTimer = useRef<number | null>(null);
  const selfRightAnimTimer = useRef<number | null>(null);
  const archiveDrag = useRef<{ page: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  // Two-finger pinch tracking for the main calendar and, separately, the archive floor.
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const archivePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const archivePinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const gestureLayerRef = useRef<HTMLDivElement | null>(null);
  const calendarCaptureRef = useRef<HTMLElement | null>(null);
  const archiveViewRef = useRef<HTMLElement | null>(null);
  const archiveFloorRef = useRef<HTMLDivElement | null>(null);
  const photosRef = useRef<PhotoMap>({});
  const capturePreviewUrlRef = useRef<string | null>(null);
  const [calendarCapturePose, setCalendarCapturePose] = useState(false);
  const current = dates[index];
  const currentPhoto = photos[dateKey(current)];
  const next = dates[Math.min(index + 1, dates.length - 1)];
  const nextPhoto = photos[dateKey(next)];

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => { rotationRef.current = rotation; }, [rotation]);
  useEffect(() => () => Object.values(photosRef.current).forEach((photo) => {
    if (photo.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
  }), []);
  useEffect(() => () => {
    if (capturePreviewUrlRef.current) URL.revokeObjectURL(capturePreviewUrlRef.current);
  }, []);
  useEffect(() => () => {
    if (selfRightTimer.current != null) window.clearTimeout(selfRightTimer.current);
    if (selfRightAnimTimer.current != null) window.clearTimeout(selfRightAnimTimer.current);
  }, []);

  // Mobile Safari blocks Web Audio until a gesture runs unlock (silent buffer).
  useEffect(() => {
    const unlock = () => unlockTearAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    setDepthIndex(finished ? dates.length : index);
  }, [index, finished, dates.length]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("https://api.github.com/repos/ssozin/db-cal/contents/df_img?ref=main", {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : [])
      .then((items: Array<{ name: string; type: string; download_url: string | null }>) => {
        const assets: Array<PhotoMap[string]> = [];
        items.forEach((item) => {
          if (item.type !== "file" || !item.download_url || !/\.(png|jpe?g|webp|gif)$/i.test(item.name)) return;
          const meta = filenameMeta(item.name);
          if (!meta) return;
          assets.push({
            url: item.download_url,
            name: item.name,
            event: meta.event,
            sourceDate: meta.sourceDate,
          });
        });
        assets.sort((a, b) => a.name.localeCompare(b.name));
        setPhotoCount(assets.length);
        const randomizedPhotos: PhotoMap = {};
        if (assets.length > 0) {
          let previousIndex = -1;
          dates.forEach((date, dateIndex) => {
            let randomIndex = Math.floor(seeded((dateIndex + 1) * 97.13) * assets.length);
            if (assets.length > 1 && randomIndex === previousIndex) {
              randomIndex = (randomIndex + 1) % assets.length;
            }
            randomizedPhotos[dateKey(date)] = assets[randomIndex];
            previousIndex = randomIndex;
          });
        }
        setPhotos(randomizedPhotos);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.warn("Could not load df_img", error);
      });

    return () => controller.abort();
  }, []);

  function nextDay(targetX = -4.3) {
    if (falling || jumping || finished) return;
    setLandingX(targetX);
    setFalling(true);
    playTearSound();
    // Grow the depth/shadow the instant the tear starts so it eases in
    // alongside the falling sheet instead of snapping once it lands.
    setDepthIndex((value) => Math.min(value + 1, dates.length));
    window.setTimeout(() => {
      if (index >= dates.length - 1) setFinished(true);
      else setIndex((value) => Math.min(value + 1, dates.length - 1));
      setFalling(false);
    }, 1080);
  }

  function jumpTo(target: number) {
    if (falling || jumping) return;
    if (finished) {
      setFinished(false);
      setIndex(target);
      return;
    }
    if (target === index) return;
    setJumping(true);
    setDepthIndex(target);
    window.setTimeout(() => {
      setIndex(target);
      setJumping(false);
    }, 380);
  }

  function previousDay() {
    if (falling || index <= 0) return;
    if (finished) setFinished(false);
    setIndex((value) => Math.max(0, value - 1));
  }

  function clearSelfRightTimers() {
    if (selfRightTimer.current != null) {
      window.clearTimeout(selfRightTimer.current);
      selfRightTimer.current = null;
    }
    if (selfRightAnimTimer.current != null) {
      window.clearTimeout(selfRightAnimTimer.current);
      selfRightAnimTimer.current = null;
    }
    setSelfRighting(false);
  }

  /** After the user leaves the pad tilted, wait 2s then spring back upright. */
  function scheduleSelfRight() {
    clearSelfRightTimers();
    if (Math.abs(rotationRef.current) < 1) {
      if (rotationRef.current !== 0) {
        rotationRef.current = 0;
        setRotation(0);
      }
      return;
    }
    selfRightTimer.current = window.setTimeout(() => {
      selfRightTimer.current = null;
      setSelfRighting(true);
      rotationRef.current = 0;
      setRotation(0);
      selfRightAnimTimer.current = window.setTimeout(() => {
        selfRightAnimTimer.current = null;
        setSelfRighting(false);
      }, 720);
    }, 2000);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    unlockTearAudio();
    clearSelfRightTimers();
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size === 2) {
      const [a, b] = Array.from(activePointers.current.values());
      pinchStart.current = { distance: pointerDistance(a, b), zoom };
      pointerStart.current = null;
      return;
    }
    if (falling || jumping) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, rotation: rotationRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (activePointers.current.has(event.pointerId)) {
      activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (activePointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(activePointers.current.values());
      const ratio = pointerDistance(a, b) / pinchStart.current.distance;
      setZoom(clampZoom(pinchStart.current.zoom * ratio));
      return;
    }
    if (!pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
      const next = Math.max(-55, Math.min(55, pointerStart.current.rotation + dx * 0.24));
      rotationRef.current = next;
      setRotation(next);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
    if (pointerStart.current) {
      const dx = event.clientX - pointerStart.current.x;
      const dy = event.clientY - pointerStart.current.y;
      if (dy > 44 && Math.abs(dy) > Math.abs(dx) * .65) {
        const targetX = Math.max(-42, Math.min(42, (dx / window.innerWidth) * 180));
        nextDay(targetX);
      }
    }
    pointerStart.current = null;
    // Still touching with another finger (pinch) — wait until the gesture fully ends.
    if (activePointers.current.size === 0) scheduleSelfRight();
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
    pointerStart.current = null;
    if (activePointers.current.size === 0) scheduleSelfRight();
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((value) => clampZoom(value + direction * 0.06));
  }

  // Shared by both the floor (empty space) and individual card pointerdown
  // handlers: whichever one sees the second finger land cancels any
  // in-progress card pick-up/selection and starts a pinch instead, so a
  // 2-finger touch never "selects" the card(s) under either finger.
  function beginArchivePinchIfNeeded() {
    if (archivePointers.current.size !== 2) return false;
    const [a, b] = Array.from(archivePointers.current.values());
    archivePinchStart.current = { distance: pointerDistance(a, b), zoom: archiveZoom };
    archiveDrag.current = null;
    setActiveArchivePage(null);
    return true;
  }

  function onArchiveFloorPointerDown(event: PointerEvent<HTMLDivElement>) {
    unlockTearAudio();
    archivePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginArchivePinchIfNeeded();
  }

  function onArchiveFloorPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (archivePointers.current.has(event.pointerId)) {
      archivePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (archivePointers.current.size === 2 && archivePinchStart.current) {
      const [a, b] = Array.from(archivePointers.current.values());
      const ratio = pointerDistance(a, b) / archivePinchStart.current.distance;
      setArchiveZoom(clampZoom(archivePinchStart.current.zoom * ratio));
    }
  }

  function onArchiveFloorPointerUp(event: PointerEvent<HTMLDivElement>) {
    archivePointers.current.delete(event.pointerId);
    if (archivePointers.current.size < 2) archivePinchStart.current = null;
  }

  function onArchiveWheel(event: WheelEvent) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setArchiveZoom((value) => clampZoom(value + direction * 0.06));
  }

  // React's onWheel prop can end up bound as a passive listener on some
  // browsers, which silently breaks preventDefault(). Bind natively instead.
  useEffect(() => {
    const node = gestureLayerRef.current;
    if (!node) return;
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    const node = archiveFloorRef.current;
    if (!node) return;
    node.addEventListener("wheel", onArchiveWheel, { passive: false });
    return () => node.removeEventListener("wheel", onArchiveWheel);
  });

  useEffect(() => {
    if (!archiveOpen) setFocusedArchivePage(null);
  }, [archiveOpen]);

  useEffect(() => {
    if (focusedArchivePage === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeArchiveFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedArchivePage]);

  function openArchiveFocus(page: number) {
    archiveDrag.current = null;
    archiveTapRef.current = null;
    setActiveArchivePage(null);
    setFocusedArchivePage(page);
  }

  function closeArchiveFocus() {
    setFocusedArchivePage(null);
  }

  function onArchivePointerDown(event: PointerEvent<HTMLElement>, page: number) {
    if (focusedArchivePage !== null) return;
    unlockTearAudio();
    archivePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (beginArchivePinchIfNeeded()) return;
    const offset = archiveOffsets[page] ?? { x: 0, y: 0 };
    archiveDrag.current = { page, x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    setActiveArchivePage(page);
    archiveZCounter.current += 1;
    setArchiveZIndices((existing) => ({ ...existing, [page]: archiveZCounter.current }));
    playPaperSlideSound(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer may already be gone on quick taps. */
    }
  }

  function onArchivePointerMove(event: PointerEvent<HTMLElement>) {
    if (focusedArchivePage !== null) return;
    const drag = archiveDrag.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) playPaperSlideSound();
    setArchiveOffsets((existing) => ({
      ...existing,
      [drag.page]: { x: drag.offsetX + dx, y: drag.offsetY + dy },
    }));
  }

  function onArchivePointerUp(event: PointerEvent<HTMLElement>) {
    const drag = archiveDrag.current;
    const wasDragging = !!drag;
    const moved = drag ? Math.hypot(event.clientX - drag.x, event.clientY - drag.y) : Infinity;
    const page = drag?.page ?? null;
    archivePointers.current.delete(event.pointerId);
    if (archivePointers.current.size < 2) archivePinchStart.current = null;
    archiveDrag.current = null;
    setActiveArchivePage(null);
    // Treat small pointer jitter as a tap so double-click still registers.
    if (wasDragging && moved > 14) {
      playPaperPlaceSound();
      archiveTapRef.current = null;
      return;
    }
    if (wasDragging) playPaperPlaceSound();
    // Double-tap / second quick tap on the same card opens the focus view
    // (onDoubleClick alone is unreliable on touch devices).
    if (page == null || focusedArchivePage !== null) return;
    const now = performance.now();
    const prev = archiveTapRef.current;
    if (
      prev
      && prev.page === page
      && now - prev.time < 420
      && Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 36
    ) {
      openArchiveFocus(page);
      return;
    }
    archiveTapRef.current = { page, time: now, x: event.clientX, y: event.clientY };
  }

  function onArchiveCardClick(event: { detail: number }, page: number) {
    if (event.detail >= 2) openArchiveFocus(page);
  }

  function closeCapturePreview() {
    if (capturePreviewUrlRef.current) {
      URL.revokeObjectURL(capturePreviewUrlRef.current);
      capturePreviewUrlRef.current = null;
    }
    setCapturePreview(null);
  }

  function presentCapturedBlob(blob: Blob, filenamePrefix: string) {
    const name = `${filenamePrefix}-${Date.now()}.png`;
    // Desktop/web: download immediately. Never window.open(blob) — on iOS
    // that navigates the current tab away and dumps the user back on reload.
    if (!isMobileCaptureTarget()) {
      downloadBlobFile(blob, name);
      return;
    }
    if (capturePreviewUrlRef.current) URL.revokeObjectURL(capturePreviewUrlRef.current);
    const url = URL.createObjectURL(blob);
    capturePreviewUrlRef.current = url;
    setCapturePreview({ url, blob, name });
  }

  async function saveCapturePreview() {
    if (!capturePreview) return;
    const file = new File([capturePreview.blob], capturePreview.name, { type: "image/png" });
    // Fresh tap on "이미지 저장" re-arms the user-gesture so share()/gallery works.
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Calendar" });
        closeCapturePreview();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ files: [file], title: "Calendar" });
        closeCapturePreview();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    downloadBlobFile(capturePreview.blob, capturePreview.name);
    closeCapturePreview();
  }

  async function captureCalendar() {
    const node = calendarCaptureRef.current;
    if (!node || capturing || capturePreview || archiveOpen) return;
    setCapturing(true);
    setCaptureFlash(true);
    setDatePickerOpen(false);
    clearSelfRightTimers();
    rotationRef.current = 0;
    setRotation(0);
    document.body.classList.add("is-capturing-calendar");
    // Flatten to a front-facing 2D pad so html-to-image can rasterize on WebKit
    // (preserve-3d / translateZ trees often come out fully black).
    flushSync(() => setCalendarCapturePose(true));
    window.setTimeout(() => setCaptureFlash(false), 260);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await Promise.all(
        Array.from(node.querySelectorAll("img")).map(async (img) => {
          try {
            if (typeof img.decode === "function") await img.decode();
          } catch {
            /* still try to paint whatever decoded */
          }
        }),
      );
      // Let the capture-mode box model settle (binder + fixed paper-stack height).
      void node.offsetHeight;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const width = Math.max(1, Math.round(node.offsetWidth));
      const height = Math.max(1, Math.round(node.offsetHeight));
      const padBlob = await htmlToImageToBlob(node, {
        cacheBust: false,
        skipFonts: true,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1.5),
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        backgroundColor: "#ecece9",
        style: {
          transform: "none",
          transformStyle: "flat",
          width: `${width}px`,
          height: `${height}px`,
        },
        filter: (el) => {
          if (!(el instanceof HTMLElement)) return true;
          if (
            el.classList.contains("gesture-layer")
            || el.classList.contains("capture-flash")
            || el.classList.contains("capture-preview")
            || el.classList.contains("calendar-side")
            || el.classList.contains("back-board")
            || el.classList.contains("rear-frame")
            || el.classList.contains("tear-spine")
            || el.classList.contains("remaining-pages")
            || el.classList.contains("calendar-depth-shadow")
            || el.classList.contains("paper-next")
            || el.classList.contains("binder-top-face")
            || el.classList.contains("binder-back-face")
            || el.classList.contains("spine-face")
            || el.classList.contains("ring-depth")
          ) return false;
          return true;
        },
      });
      if (!padBlob || padBlob.size === 0) throw new Error("Capture returned no image data");

      // Compose a full-viewport wallpaper: same screen height, no chrome,
      // calendar only, with top margin so it sits below the status-bar area.
      const blob = await composeCalendarWallpaper(padBlob);
      presentCapturedBlob(blob, "calendar-wallpaper");
    } catch (error) {
      console.warn("Could not capture calendar", error);
      if (capturePreviewUrlRef.current) URL.revokeObjectURL(capturePreviewUrlRef.current);
      capturePreviewUrlRef.current = null;
      setCapturePreview({
        url: "",
        blob: new Blob(),
        name: "calendar-wallpaper.png",
      });
    } finally {
      document.body.classList.remove("is-capturing-calendar");
      setCalendarCapturePose(false);
      setCapturing(false);
    }
  }

  async function captureArchive() {
    const node = archiveViewRef.current;
    if (!node || capturing || capturePreview) return;
    // Keep archive open no matter what — never alert()/navigate (those were
    // bouncing mobile Safari back to the calendar start screen).
    setCapturing(true);
    setCaptureFlash(true);
    node.classList.add("is-capturing");
    window.setTimeout(() => setCaptureFlash(false), 260);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      let blob: Blob | null = null;
      try {
        // Lightweight path: paint only on-screen cards. Avoids cloning hundreds
        // of nodes (html-to-image) which OOMs / reloads iOS tabs.
        blob = await captureArchiveViewport(archiveZoom);
      } catch (error) {
        console.warn("Canvas archive capture failed, trying html-to-image", error);
      }

      if (!blob) {
        blob = await htmlToImageToBlob(node, {
          cacheBust: false,
          skipFonts: true,
          pixelRatio: 1,
          width: node.clientWidth,
          height: node.clientHeight,
          filter: (el) => {
            if (!(el instanceof HTMLElement)) return true;
            if (
              el.classList.contains("archive-toolbar")
              || el.classList.contains("archive-instruction")
              || el.classList.contains("capture-flash")
              || el.classList.contains("capture-preview")
            ) return false;
            if (!el.classList.contains("archive-page")) return true;
            const rect = el.getBoundingClientRect();
            const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
            const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
            const area = rect.width * rect.height;
            return area > 0 && (visibleWidth * visibleHeight) / area > 0.08;
          },
        });
      }

      if (!blob || blob.size === 0) throw new Error("Capture returned no image data");
      presentCapturedBlob(blob, "torn-pages");
    } catch (error) {
      console.warn("Could not capture torn pages", error);
      // Stay in archive; surface failure inside the save sheet so the page
      // never reloads or jumps back to the calendar.
      if (capturePreviewUrlRef.current) URL.revokeObjectURL(capturePreviewUrlRef.current);
      capturePreviewUrlRef.current = null;
      setCapturePreview({
        url: "",
        blob: new Blob(),
        name: "torn-pages.png",
      });
    } finally {
      node.classList.remove("is-capturing");
      setCapturing(false);
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === " ") nextDay();
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") previousDay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dayNumber = index + 1;
  // Shadow/stack depth follows settled pages only — never mid-tear — so mobile
  // shadows deepen with fallen sheets instead of popping on each tear.
  const removedPages = depthIndex;
  const remainingPages = Math.max(0, dates.length - depthIndex);
  // 365 sheets form one compact physical block; the visible depth shrinks
  // continuously as pages are torn away.
  const fullStackDepth = dates.length * 0.22;
  const removedDepth = (removedPages / dates.length) * fullStackDepth;
  const remainingDepth = Math.max(1.5, (remainingPages / dates.length) * fullStackDepth);
  // No forced minimum here: at removedDepth 0 this must be a true 0, not a
  // 1px floor, or the front page always shows a thin shadow line even with
  // nothing torn off yet.
  const tearShadowDepth = Math.min(46, removedDepth * 0.72);
  const tearShadowBlur = removedDepth <= 0 ? 0 : 0.6 + removedDepth * 0.025;
  const tornCount = finished ? dates.length : index;
  const archiveStart = 0;
  const archivePages = Array.from({ length: tornCount - archiveStart }, (_, offset) => archiveStart + offset);
  const focusedDate = focusedArchivePage !== null ? dates[focusedArchivePage] : null;
  const focusedPhoto = focusedDate ? photos[dateKey(focusedDate)] : null;
  const pickerStart = new Date(YEAR, pickerMonth, 1, 12);
  const pickerLead = pickerStart.getDay();
  const pickerLength = new Date(YEAR, pickerMonth + 1, 0, 12).getDate();
  const pickerCells = Array.from({ length: 42 }, (_, cell) => {
    const day = cell - pickerLead + 1;
    return day > 0 && day <= pickerLength ? new Date(YEAR, pickerMonth, day, 12) : null;
  });

  function pickerDayClass(date: Date) {
    return [
      dateKey(date) === dateKey(current) ? "is-current" : "",
    ].filter(Boolean).join(" ") || undefined;
  }

  return (
    <main className={`calendar-stage${archiveOpen ? " archive-mode" : ""}${zoom > 1 ? " is-zoomed" : ""}${falling || jumping ? " is-tearing" : ""}`}>
      <div className={`capture-flash${captureFlash ? " is-flashing" : ""}`} aria-hidden="true" />
      <header className="toolbar">
        <div className="toolbar-title">
          <p className="eyebrow">DOUBLE FEATURE</p>
          <p className="notice">Online Daily Tear-Off Calendar · {photoCount ?? "—"} Photos</p>
        </div>
        <div className="toolbar-actions">
          <button className={index === 0 && !finished ? "is-selected" : undefined} aria-pressed={index === 0 && !finished} type="button" onClick={() => { setDatePickerOpen(false); clearSelfRightTimers(); rotationRef.current = 0; jumpTo(0); setRotation(0); }}>START</button>
          <button className={index === todayIndex(dates) && !finished ? "is-selected" : undefined} aria-pressed={index === todayIndex(dates) && !finished} type="button" onClick={() => { setDatePickerOpen(false); jumpTo(todayIndex(dates)); }}>TODAY</button>
          <button className={datePickerOpen || (index !== 0 && index !== todayIndex(dates) && !finished) ? "is-selected" : undefined} aria-pressed={datePickerOpen} type="button" onClick={() => { setPickerMonth(current.getMonth()); setDatePickerOpen((open) => !open); }}>DATE</button>
        </div>
        <button
          className="calendar-capture"
          type="button"
          aria-label="Capture calendar wallpaper"
          onClick={captureCalendar}
          disabled={capturing || !!capturePreview || archiveOpen}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4 7.6 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
      </header>

      {datePickerOpen && (
        <section className="date-picker" aria-label="Choose a date in 2026">
          <header>
            <button type="button" aria-label="Previous month" disabled={pickerMonth === 0} onClick={() => setPickerMonth((month) => Math.max(0, month - 1))}>←</button>
            <strong>{months[pickerMonth]} <small>2026</small></strong>
            <button type="button" aria-label="Next month" disabled={pickerMonth === 11} onClick={() => setPickerMonth((month) => Math.min(11, month + 1))}>→</button>
          </header>
          <div className="date-picker-weekdays">{["S","M","T","W","T","F","S"].map((day, i) => <span key={`${day}-${i}`}>{day}</span>)}</div>
          <div className="date-picker-grid">
            {pickerCells.map((date, cell) => date ? (
              <button className={pickerDayClass(date)} key={dateKey(date)} type="button" onClick={() => { setDatePickerOpen(false); clearSelfRightTimers(); rotationRef.current = 0; setRotation(0); jumpTo(dates.findIndex((item) => dateKey(item) === dateKey(date))); }}>{date.getDate()}</button>
            ) : <span key={`empty-${cell}`} />)}
          </div>
        </section>
      )}

      <div className="calendar-zoom-wrap">
        <section
          ref={calendarCaptureRef}
          className={`calendar-shell${finished ? " is-finished" : ""}${selfRighting ? " is-self-righting" : ""}`}
          aria-label="2026 tear-off calendar"
          style={{
          // A perfectly flat rotateY(0deg) collapses to an identity matrix on
          // some mobile WebKit builds, which drops the 3D depth stacking for
          // translateZ'd shadow layers until the user rotates the calendar.
          // Nudging by a hair keeps the 3D context alive at rest too.
          // Zoom is a visual transform:scale (not the CSS `zoom` property) so
          // pinching/scrolling magnifies in place without reflowing anything
          // around the calendar. Use scale3d, not scale: plain scale() only
          // scales X/Y, leaving every translateZ-based depth (side panels,
          // back board, binder) at a fixed pixel size — so the stack's
          // thickness-to-width ratio would visibly warp as you zoomed while
          // rotated. scale3d scales X/Y/Z together, keeping it constant.
          transform: calendarCapturePose
            ? "rotateY(0.01deg) scale3d(1, 1, 1)"
            : `rotateY(${rotation || 0.01}deg) scale3d(${zoom}, ${zoom}, ${zoom})`,
          "--removed-depth": `${removedDepth}px`,
          "--removed-depth-negative": `${-removedDepth}px`,
          "--remaining-depth": `${remainingDepth}px`,
          "--remaining-depth-negative": `${-remainingDepth}px`,
          "--full-depth": `${fullStackDepth}px`,
          "--full-depth-negative": `${-fullStackDepth}px`,
          "--tear-shadow-depth": `${tearShadowDepth}px`,
          "--tear-shadow-blur": `${tearShadowBlur}px`,
          "--drop-x": `${landingX}vw`,
          } as CSSProperties}
        >
        <div className="binder">
          <span className="binder-top-face" aria-hidden="true" />
          <span className="binder-back-face" aria-hidden="true" />
          <span className="ring ring-left">{Array.from({ length: PIN_LAYERS }, (_, layer) => <i className="ring-depth" key={layer} style={pinLayerStyle(layer)} />)}</span>
          <span className="ring ring-right">{Array.from({ length: PIN_LAYERS }, (_, layer) => <i className="ring-depth" key={layer} style={pinLayerStyle(layer)} />)}</span>
        </div>

        <div className="paper-stack">
          <div className="back-board" aria-hidden="true">
            <i className="board-face board-back" />
            <i className="board-face board-left" />
            <i className="board-face board-right" />
            <i className="board-face board-top" />
            <i className="board-face board-bottom" />
          </div>
          <div className="remaining-pages" aria-hidden="true" />
          <div className="calendar-side side-left" aria-hidden="true" />
          <div className="calendar-side side-right" aria-hidden="true" />
          <div className="tear-spine" aria-hidden="true">
            <i className="spine-face spine-back" />
            <i className="spine-face spine-left" />
            <i className="spine-face spine-right" />
          </div>
          <div className="paper paper-next" aria-hidden="true">
            <div className="date-block">
              <span>{weekdays[next.getDay()]}</span>
              <span>{months[next.getMonth()]}</span>
              <strong>{String(next.getDate()).padStart(2, "0")}</strong>
            </div>
            <div className={`photo-frame ${nextPhoto ? "has-photo" : ""}`}>
              {nextPhoto ? <img src={nextPhoto.url} alt="" crossOrigin="anonymous" /> : <div className="photo-placeholder"><span>{dateKey(next).replaceAll("-", "")}</span></div>}
            </div>
            <footer className="paper-footer">
              <div>{nextPhoto ? <><span>{nextPhoto.sourceDate}</span><b className={`event-title${isKorean(nextPhoto.event) ? " is-korean" : ""}`}>{nextPhoto.event}</b></> : <b>NO EVENT ARCHIVE</b>}</div>
              <div className="day-count">DAY {String(Math.min(dayNumber + 1, 365)).padStart(3, "0")} / 365</div>
            </footer>
          </div>
          <div
            className={`paper paper-current ${falling ? "is-falling" : ""} ${jumping ? "is-jumping" : ""}`}
          >
            <div className="date-block">
              <span>{weekdays[current.getDay()]}</span>
              <span>{months[current.getMonth()]}</span>
              <strong>{String(current.getDate()).padStart(2, "0")}</strong>
            </div>

            <div className={`photo-frame ${currentPhoto ? "has-photo" : ""}`}>
              {currentPhoto ? <img src={currentPhoto.url} alt={`${months[current.getMonth()]} ${current.getDate()}`} crossOrigin="anonymous" /> : <div className="photo-placeholder"><span>{dateKey(current).replaceAll("-", "")}</span></div>}
            </div>

            <footer className="paper-footer">
              <div>{currentPhoto ? <><span>{currentPhoto.sourceDate}</span><b className={`event-title${isKorean(currentPhoto.event) ? " is-korean" : ""}`}>{currentPhoto.event}</b></> : <b>NO EVENT ARCHIVE</b>}</div>
              <div className="day-count">DAY {String(dayNumber).padStart(3, "0")} / 365</div>
            </footer>
          </div>
          <div className="calendar-depth-shadow" aria-hidden="true" />
        </div>
        <div className="rear-frame" aria-hidden="true" />
        <div
          ref={gestureLayerRef}
          className="gesture-layer"
          aria-label="Drag sideways to rotate or downward to tear a page"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDoubleClick={() => nextDay()}
        />
        </section>
      </div>

      {tornCount > 0 && (
        <button className="floor-pile-trigger" type="button" aria-label={`View ${tornCount} torn calendar pages`} onClick={() => { unlockTearAudio(); setArchiveOpen(true); }}>
          <i /><i /><i />
          <span>TORN PAGES · {tornCount}</span>
        </button>
      )}

      <section
        ref={archiveViewRef}
        className={`archive-view${focusedArchivePage !== null ? " is-focusing" : ""}`}
        aria-hidden={!archiveOpen}
      >
        <div className="archive-toolbar">
          <button className="archive-back" type="button" aria-label="Back to calendar" onClick={() => setArchiveOpen(false)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5 7 12l8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="archive-capture" type="button" aria-label="Capture torn pages" onClick={captureArchive} disabled={capturing || !!capturePreview || focusedArchivePage !== null}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4 7.6 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
        </div>
        <p className="archive-instruction">DRAG EACH PAGE SIDEWAYS · PINCH OR SCROLL TO ZOOM</p>
        <div
          ref={archiveFloorRef}
          className="archive-floor"
          style={{ transform: `scale(${archiveZoom})` } as CSSProperties}
          onPointerDown={onArchiveFloorPointerDown}
          onPointerMove={onArchiveFloorPointerMove}
          onPointerUp={onArchiveFloorPointerUp}
          onPointerCancel={onArchiveFloorPointerUp}
        >
          {archivePages.map((pageIndex, order) => {
            const date = dates[pageIndex];
            const photo = photos[dateKey(date)];
            const offset = archiveOffsets[pageIndex] ?? { x: 0, y: 0 };
            // Wide enough to let cards drift past every edge of the screen —
            // scattered, not corralled back into the visible frame.
            const left = -16 + seeded(pageIndex + 11) * 116;
            const top = -10 + seeded(pageIndex + 29) * 92;
            const rotate = -18 + seeded(pageIndex + 47) * 36;
            return (
              <article
                className={`archive-page${activeArchivePage === pageIndex ? " is-active" : ""}${focusedArchivePage === pageIndex ? " is-focused-source" : ""}`}
                key={pageIndex}
                style={{
                  top: `${top}%`,
                  zIndex: archiveZIndices[pageIndex] ?? order + 1,
                  "--archive-left": `${left}%`,
                  "--archive-x": `${offset.x}px`,
                  "--archive-y": `${offset.y}px`,
                  "--archive-rotate": `${rotate}deg`,
                } as CSSProperties}
                onPointerDown={(event) => onArchivePointerDown(event, pageIndex)}
                onPointerMove={onArchivePointerMove}
                onPointerUp={onArchivePointerUp}
                onPointerCancel={onArchivePointerUp}
                onClick={(event) => onArchiveCardClick(event, pageIndex)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openArchiveFocus(pageIndex);
                }}
              >
                <div className="archive-date">
                  <span>{weekdays[date.getDay()]}</span>
                  <span>{months[date.getMonth()]}</span>
                  <strong>{String(date.getDate()).padStart(2, "0")}</strong>
                </div>
                <div className="archive-photo">
                  {photo ? <img src={photo.url} alt="" draggable={false} crossOrigin="anonymous" /> : <div className="photo-placeholder"><span>{dateKey(date).replaceAll("-", "")}</span></div>}
                </div>
                <footer className="archive-footer">
                  <div>{photo ? <><span>{photo.sourceDate}</span><b>{photo.event}</b></> : <b>NO EVENT ARCHIVE</b>}</div>
                  <span>DAY {String(pageIndex + 1).padStart(3, "0")} / 365</span>
                </footer>
              </article>
            );
          })}
        </div>

        {focusedArchivePage !== null && focusedDate && (
          <div className="archive-focus" role="dialog" aria-modal="true" aria-label="Focused torn page">
            <button className="archive-focus-close" type="button" aria-label="Close focused page" onClick={closeArchiveFocus}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <article className="archive-focus-card">
              <div className="archive-date">
                <span>{weekdays[focusedDate.getDay()]}</span>
                <span>{months[focusedDate.getMonth()]}</span>
                <strong>{String(focusedDate.getDate()).padStart(2, "0")}</strong>
              </div>
              <div className="archive-photo">
                {focusedPhoto ? <img src={focusedPhoto.url} alt="" draggable={false} crossOrigin="anonymous" /> : <div className="photo-placeholder"><span>{dateKey(focusedDate).replaceAll("-", "")}</span></div>}
              </div>
              <footer className="archive-footer">
                <div>{focusedPhoto ? <><span>{focusedPhoto.sourceDate}</span><b>{focusedPhoto.event}</b></> : <b>NO EVENT ARCHIVE</b>}</div>
                <span>DAY {String(focusedArchivePage + 1).padStart(3, "0")} / 365</span>
              </footer>
            </article>
          </div>
        )}
      </section>

      {capturePreview && (
        <div className="capture-preview" role="dialog" aria-modal="true" aria-label="Captured image">
          <div className="capture-preview-panel">
            {capturePreview.url ? (
              <img src={capturePreview.url} alt="Captured image" />
            ) : (
              <p className="capture-preview-hint">캡처에 실패했습니다. 닫은 뒤 다시 시도해 주세요.</p>
            )}
            {capturePreview.url && (
              <p className="capture-preview-hint">이미지 저장을 누르면 갤러리에 저장할 수 있습니다 · 배경화면용 위 여백 포함</p>
            )}
            <div className="capture-preview-actions">
              {capturePreview.url && capturePreview.blob.size > 0 && (
                <button type="button" className="capture-preview-save" onClick={saveCapturePreview}>이미지 저장</button>
              )}
              <button type="button" className="capture-preview-cancel" onClick={closeCapturePreview}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
