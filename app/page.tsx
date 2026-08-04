"use client";

import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
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

export default function Home() {
  const dates = useMemo(buildDates, []);
  const [index, setIndex] = useState(() => todayIndex(dates));
  const [photos, setPhotos] = useState<PhotoMap>({});
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [falling, setFalling] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [finished, setFinished] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [archiveZoom, setArchiveZoom] = useState(1);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [landingX, setLandingX] = useState(-4.3);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveOffsets, setArchiveOffsets] = useState<Record<number, { x: number; y: number }>>({});
  const [activeArchivePage, setActiveArchivePage] = useState<number | null>(null);
  // Persists which page was picked up last so it stays stacked on top even
  // after it's dropped, instead of falling back under later pages.
  const [archiveZIndices, setArchiveZIndices] = useState<Record<number, number>>({});
  const archiveZCounter = useRef(1000);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => dates[todayIndex(dates)].getMonth());
  // Depth visuals lag the page index so tear/jump animations never snap the shadow.
  const [depthIndex, setDepthIndex] = useState(() => todayIndex(dates));
  const pointerStart = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const archiveDrag = useRef<{ page: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  // Two-finger pinch tracking for the main calendar and, separately, the archive floor.
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const archivePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const archivePinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const gestureLayerRef = useRef<HTMLDivElement | null>(null);
  const archiveFloorRef = useRef<HTMLDivElement | null>(null);
  const calendarCaptureRef = useRef<HTMLDivElement | null>(null);
  const photosRef = useRef<PhotoMap>({});
  const current = dates[index];
  const currentPhoto = photos[dateKey(current)];
  const next = dates[Math.min(index + 1, dates.length - 1)];
  const nextPhoto = photos[dateKey(next)];

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => Object.values(photosRef.current).forEach((photo) => {
    if (photo.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
  }), []);

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

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size === 2) {
      const [a, b] = Array.from(activePointers.current.values());
      pinchStart.current = { distance: pointerDistance(a, b), zoom };
      pointerStart.current = null;
      return;
    }
    if (falling || jumping) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, rotation };
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
      setRotation(Math.max(-55, Math.min(55, pointerStart.current.rotation + dx * 0.24)));
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
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
    pointerStart.current = null;
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

  function onArchivePointerDown(event: PointerEvent<HTMLElement>, page: number) {
    archivePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (beginArchivePinchIfNeeded()) return;
    const offset = archiveOffsets[page] ?? { x: 0, y: 0 };
    archiveDrag.current = { page, x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    setActiveArchivePage(page);
    archiveZCounter.current += 1;
    setArchiveZIndices((existing) => ({ ...existing, [page]: archiveZCounter.current }));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onArchivePointerMove(event: PointerEvent<HTMLElement>) {
    const drag = archiveDrag.current;
    if (!drag) return;
    setArchiveOffsets((existing) => ({
      ...existing,
      [drag.page]: { x: drag.offsetX + event.clientX - drag.x, y: drag.offsetY + event.clientY - drag.y },
    }));
  }

  function onArchivePointerUp(event: PointerEvent<HTMLElement>) {
    archivePointers.current.delete(event.pointerId);
    if (archivePointers.current.size < 2) archivePinchStart.current = null;
    archiveDrag.current = null;
    setActiveArchivePage(null);
  }

  async function saveCapturedBlob(blob: Blob, filenamePrefix: string) {
    const file = new File([blob], `${filenamePrefix}-${Date.now()}.png`, { type: "image/png" });

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        // User cancelled, or this browser's share() doesn't support files — fall through.
      }
    }

    // Direct-to-gallery isn't reliably possible from a plain web page once
    // share() is unavailable. Ask instead of silently doing nothing — a
    // fresh click inside confirm()'s response also re-arms window.open()
    // on browsers that would otherwise block it as a stale-gesture popup.
    const wantsSave = window.confirm("갤러리에 바로 저장할 수 없어요. 이미지를 저장하시겠습니까?");
    if (!wantsSave) return;

    const url = URL.createObjectURL(blob);
    // <a download> is silently unreliable on mobile Safari; opening the
    // image directly lets a phone's long-press "Save Image" always work.
    const opened = window.open(url, "_blank");
    if (!opened) {
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function captureArchive() {
    const node = archiveFloorRef.current;
    if (!node || capturing) return;
    setCapturing(true);
    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 260);
    try {
      // Deep into the year there can be 100s of torn-page cards in the DOM
      // (most scattered off-screen now that nothing clamps them into view).
      // html-to-image clones + re-fetches every descendant's images, so
      // capturing all of them could hang/time out on a phone. Only clone
      // cards that are at least partially on screen — that's what "capture
      // the calendar cards" means anyway.
      const blob = await htmlToImageToBlob(node, {
        pixelRatio: Math.min(1.5, window.devicePixelRatio || 1.5),
        cacheBust: true,
        filter: (el) => {
          if (!(el instanceof HTMLElement) || !el.classList.contains("archive-page")) return true;
          // Every photo has to be re-fetched and base64-embedded, which is
          // slow — only bother with cards that are meaningfully on screen
          // (not just a sliver peeking out from under the pile), or capture
          // can take so long that a phone's share/save gesture times out.
          const rect = el.getBoundingClientRect();
          const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
          const area = rect.width * rect.height;
          return area > 0 && (visibleWidth * visibleHeight) / area > 0.18;
        },
      });
      if (!blob) throw new Error("Capture returned no image data");
      await saveCapturedBlob(blob, "torn-pages");
    } catch (error) {
      console.warn("Could not capture torn pages", error);
    } finally {
      setCapturing(false);
    }
  }

  async function captureCalendar() {
    const node = calendarCaptureRef.current;
    if (!node || capturing) return;
    setCapturing(true);
    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 260);
    try {
      const blob = await htmlToImageToBlob(node, {
        pixelRatio: Math.min(1.5, window.devicePixelRatio || 1.5),
        cacheBust: true,
      });
      if (!blob) throw new Error("Capture returned no image data");
      await saveCapturedBlob(blob, "calendar");
    } catch (error) {
      console.warn("Could not capture calendar", error);
    } finally {
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
    <main className={`calendar-stage${archiveOpen ? " archive-mode" : ""}`}>
      <div className={`capture-flash${captureFlash ? " is-flashing" : ""}`} aria-hidden="true" />
      <header className="toolbar">
        <div className="toolbar-title">
          <p className="eyebrow">DOUBLE FEATURE</p>
          <p className="notice">Online Daily Tear-Off Calendar · {photoCount ?? "—"} Photos</p>
        </div>
        <div className="toolbar-actions">
          <button className={index === 0 && !finished ? "is-selected" : undefined} aria-pressed={index === 0 && !finished} type="button" onClick={() => { setDatePickerOpen(false); jumpTo(0); setRotation(0); }}>START</button>
          <button className={index === todayIndex(dates) && !finished ? "is-selected" : undefined} aria-pressed={index === todayIndex(dates) && !finished} type="button" onClick={() => { setDatePickerOpen(false); jumpTo(todayIndex(dates)); }}>TODAY</button>
          <button className={datePickerOpen || (index !== 0 && index !== todayIndex(dates) && !finished) ? "is-selected" : undefined} aria-pressed={datePickerOpen} type="button" onClick={() => { setPickerMonth(current.getMonth()); setDatePickerOpen((open) => !open); }}>DATE</button>
          <button className="capture-button" type="button" aria-label="Capture calendar" onClick={captureCalendar} disabled={capturing}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 4 7.6 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
        </div>
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
              <button className={pickerDayClass(date)} key={dateKey(date)} type="button" onClick={() => { setDatePickerOpen(false); setRotation(0); jumpTo(dates.findIndex((item) => dateKey(item) === dateKey(date))); }}>{date.getDate()}</button>
            ) : <span key={`empty-${cell}`} />)}
          </div>
        </section>
      )}

      <div className="calendar-zoom-wrap" ref={calendarCaptureRef}>
        <section
          className={`calendar-shell${finished ? " is-finished" : ""}`}
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
          transform: `rotateY(${rotation || 0.01}deg) scale3d(${zoom}, ${zoom}, ${zoom})`,
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
              {nextPhoto ? <img src={nextPhoto.url} alt="" /> : <div className="photo-placeholder"><span>{dateKey(next).replaceAll("-", "")}</span></div>}
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
              {currentPhoto ? <img src={currentPhoto.url} alt={`${months[current.getMonth()]} ${current.getDate()}`} /> : <div className="photo-placeholder"><span>{dateKey(current).replaceAll("-", "")}</span></div>}
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
        <button className="floor-pile-trigger" type="button" aria-label={`View ${tornCount} torn calendar pages`} onClick={() => setArchiveOpen(true)}>
          <i /><i /><i />
          <span>TORN PAGES · {tornCount}</span>
        </button>
      )}

      <section className="archive-view" aria-hidden={!archiveOpen}>
        <div className="archive-toolbar">
          <button className="archive-back" type="button" aria-label="Back to calendar" onClick={() => setArchiveOpen(false)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5 7 12l8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="archive-capture" type="button" aria-label="Capture torn pages" onClick={captureArchive} disabled={capturing}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4 7.6 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
        </div>
        <p className="archive-instruction">DRAG EACH PAGE SIDEWAYS · PINCH OR SCROLL TO ZOOM</p>
        <div
          ref={archiveFloorRef}
          className="archive-floor"
          // transform:scale (not CSS `zoom`) keeps every card's layout/position
          // exactly where it was — only the visual size changes, in place.
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
                className={`archive-page${activeArchivePage === pageIndex ? " is-active" : ""}`}
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
              >
                <div className="archive-date">
                  <span>{weekdays[date.getDay()]}</span>
                  <span>{months[date.getMonth()]}</span>
                  <strong>{String(date.getDate()).padStart(2, "0")}</strong>
                </div>
                <div className="archive-photo">
                  {photo ? <img src={photo.url} alt="" draggable={false} /> : <div className="photo-placeholder"><span>{dateKey(date).replaceAll("-", "")}</span></div>}
                </div>
                <footer className="archive-footer">
                  <div>{photo ? <><span>{photo.sourceDate}</span><b>{photo.event}</b></> : <b>NO EVENT ARCHIVE</b>}</div>
                  <span>DAY {String(pageIndex + 1).padStart(3, "0")} / 365</span>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
