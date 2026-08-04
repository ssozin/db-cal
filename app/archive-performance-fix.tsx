"use client";

import { useEffect } from "react";

type ForwardedPointerEvent = PointerEvent & {
  __archivePerformanceForwarded?: boolean;
};

type PointerSnapshot = {
  x: number;
  y: number;
};

type DragSession = {
  pointerId: number;
  page: HTMLElement;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  nextOffsetX: number;
  nextOffsetY: number;
  frame: number | null;
  lastCommitAt: number;
};

type PinchSession = {
  floor: HTMLElement;
  startDistance: number;
  startZoom: number;
  nextZoom: number;
  frame: number | null;
  lastCommitAt: number;
};

const REACT_COMMIT_INTERVAL = 120;
const MOBILE_IMAGE_LIMIT = 52;
const DESKTOP_IMAGE_LIMIT = 96;
const VIEWPORT_MARGIN = 120;

function clampArchiveZoom(value: number) {
  return Math.max(0.65, Math.min(1.5, Number(value.toFixed(3))));
}

function distance(a: PointerSnapshot, b: PointerSnapshot) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function readCustomPixel(element: HTMLElement, property: string) {
  const inline = element.style.getPropertyValue(property);
  const computed = getComputedStyle(element).getPropertyValue(property);
  const parsed = Number.parseFloat(inline || computed || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function readScale(element: HTMLElement) {
  const inline = element.style.transform;
  const direct = inline.match(/scale\(([-\d.]+)\)/);
  if (direct) return clampArchiveZoom(Number(direct[1]));

  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return 1;
  try {
    return clampArchiveZoom(new DOMMatrixReadOnly(transform).a || 1);
  } catch {
    return 1;
  }
}

function createForwardedMove(source: PointerEvent) {
  try {
    const event = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: source.pointerId,
      pointerType: source.pointerType,
      isPrimary: source.isPrimary,
      clientX: source.clientX,
      clientY: source.clientY,
      screenX: source.screenX,
      screenY: source.screenY,
      pageX: source.pageX,
      pageY: source.pageY,
      button: -1,
      buttons: source.buttons || 1,
      pressure: source.pressure || 0.5,
      width: source.width,
      height: source.height,
      tiltX: source.tiltX,
      tiltY: source.tiltY,
      twist: source.twist,
      ctrlKey: source.ctrlKey,
      shiftKey: source.shiftKey,
      altKey: source.altKey,
      metaKey: source.metaKey,
    }) as ForwardedPointerEvent;
    event.__archivePerformanceForwarded = true;
    return event;
  } catch {
    return null;
  }
}

function imageForPage(page: HTMLElement) {
  return page.querySelector<HTMLImageElement>(".archive-photo img");
}

function warmPage(page: HTMLElement) {
  page.dataset.archiveCold = "false";
  const image = imageForPage(page);
  if (!image) return;

  const currentSource = image.getAttribute("src");
  if (currentSource && !image.dataset.archiveSource) {
    image.dataset.archiveSource = currentSource;
  }
  if (!currentSource && image.dataset.archiveSource) {
    image.setAttribute("src", image.dataset.archiveSource);
  }
  image.style.removeProperty("visibility");
  image.setAttribute("decoding", "async");
  image.setAttribute("fetchpriority", "low");
}

function coolPage(page: HTMLElement) {
  page.dataset.archiveCold = "true";
  const image = imageForPage(page);
  if (!image) return;

  const currentSource = image.getAttribute("src");
  if (currentSource && !image.dataset.archiveSource) {
    image.dataset.archiveSource = currentSource;
  }
  image.style.visibility = "hidden";
  image.removeAttribute("src");
}

function restorePage(page: HTMLElement) {
  delete page.dataset.archiveCold;
  const image = imageForPage(page);
  if (!image) return;
  if (!image.getAttribute("src") && image.dataset.archiveSource) {
    image.setAttribute("src", image.dataset.archiveSource);
  }
  image.style.removeProperty("visibility");
}

function pageZIndex(page: HTMLElement) {
  const value = Number(getComputedStyle(page).zIndex);
  return Number.isFinite(value) ? value : 0;
}

function nearViewport(page: HTMLElement) {
  const rect = page.getBoundingClientRect();
  return rect.right > -VIEWPORT_MARGIN
    && rect.bottom > -VIEWPORT_MARGIN
    && rect.left < window.innerWidth + VIEWPORT_MARGIN
    && rect.top < window.innerHeight + VIEWPORT_MARGIN;
}

export default function ArchivePerformanceFix() {
  useEffect(() => {
    const pointers = new Map<number, PointerSnapshot>();
    let drag: DragSession | null = null;
    let pinch: PinchSession | null = null;
    let virtualizeFrame: number | null = null;

    const archiveIsOpen = () => document.querySelector(".calendar-stage")?.classList.contains("archive-mode") ?? false;

    const refreshImages = () => {
      virtualizeFrame = null;
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".archive-page"));
      if (pages.length === 0) return;

      if (!archiveIsOpen()) {
        pages.forEach(coolPage);
        return;
      }

      const limit = window.matchMedia("(max-width: 640px)").matches
        ? MOBILE_IMAGE_LIMIT
        : DESKTOP_IMAGE_LIMIT;
      const ranked = pages
        .filter(nearViewport)
        .sort((a, b) => pageZIndex(b) - pageZIndex(a));
      const hotPages = new Set(ranked.slice(0, limit));
      if (drag) hotPages.add(drag.page);

      pages.forEach((page) => {
        if (hotPages.has(page)) warmPage(page);
        else coolPage(page);
      });
    };

    const scheduleImageRefresh = () => {
      if (virtualizeFrame != null) return;
      virtualizeFrame = window.requestAnimationFrame(refreshImages);
    };

    const dispatchMove = (target: HTMLElement, source: PointerEvent) => {
      const forwarded = createForwardedMove(source);
      if (forwarded) target.dispatchEvent(forwarded);
    };

    const applyDrag = (session: DragSession) => {
      session.frame = null;
      session.page.style.setProperty("--archive-x", `${session.nextOffsetX}px`);
      session.page.style.setProperty("--archive-y", `${session.nextOffsetY}px`);
    };

    const applyPinch = (session: PinchSession) => {
      session.frame = null;
      session.floor.style.transform = `scale(${session.nextZoom})`;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const floor = target?.closest<HTMLElement>(".archive-floor");
      if (!floor || !archiveIsOpen()) return;

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinch = {
          floor,
          startDistance: Math.max(1, distance(a, b)),
          startZoom: readScale(floor),
          nextZoom: readScale(floor),
          frame: null,
          lastCommitAt: performance.now(),
        };
        if (drag?.frame != null) cancelAnimationFrame(drag.frame);
        if (drag) drag.page.style.removeProperty("will-change");
        drag = null;
        return;
      }

      const page = target.closest<HTMLElement>(".archive-page");
      if (!page) return;
      warmPage(page);
      page.style.willChange = "transform";
      drag = {
        pointerId: event.pointerId,
        page,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: readCustomPixel(page, "--archive-x"),
        startOffsetY: readCustomPixel(page, "--archive-y"),
        nextOffsetX: readCustomPixel(page, "--archive-x"),
        nextOffsetY: readCustomPixel(page, "--archive-y"),
        frame: null,
        lastCommitAt: performance.now(),
      };
      window.setTimeout(scheduleImageRefresh, 0);
    };

    const onPointerMove = (event: PointerEvent) => {
      const forwarded = event as ForwardedPointerEvent;
      if (forwarded.__archivePerformanceForwarded) return;
      if (!pointers.has(event.pointerId)) return;

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pinch && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        pinch.nextZoom = clampArchiveZoom(pinch.startZoom * (distance(a, b) / pinch.startDistance));
        if (pinch.frame == null) {
          const currentPinch = pinch;
          pinch.frame = requestAnimationFrame(() => applyPinch(currentPinch));
        }

        const now = performance.now();
        if (now - pinch.lastCommitAt >= REACT_COMMIT_INTERVAL) {
          pinch.lastCommitAt = now;
          dispatchMove(pinch.floor, event);
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.nextOffsetX = drag.startOffsetX + event.clientX - drag.startX;
      drag.nextOffsetY = drag.startOffsetY + event.clientY - drag.startY;
      if (drag.frame == null) {
        const currentDrag = drag;
        drag.frame = requestAnimationFrame(() => applyDrag(currentDrag));
      }

      const now = performance.now();
      if (now - drag.lastCommitAt >= REACT_COMMIT_INTERVAL) {
        drag.lastCommitAt = now;
        dispatchMove(drag.page, event);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;

      if (drag && drag.pointerId === event.pointerId) {
        if (drag.frame != null) cancelAnimationFrame(drag.frame);
        drag.nextOffsetX = drag.startOffsetX + event.clientX - drag.startX;
        drag.nextOffsetY = drag.startOffsetY + event.clientY - drag.startY;
        applyDrag(drag);
        dispatchMove(drag.page, event);
        const finishedPage = drag.page;
        queueMicrotask(() => finishedPage.style.removeProperty("will-change"));
        drag = null;
      }

      if (pinch && pointers.size >= 2) {
        if (pinch.frame != null) cancelAnimationFrame(pinch.frame);
        applyPinch(pinch);
        dispatchMove(pinch.floor, event);
      }

      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      window.setTimeout(scheduleImageRefresh, 0);
    };

    const observer = new MutationObserver(scheduleImageRefresh);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onPointerEnd, { capture: true, passive: true });
    document.addEventListener("pointercancel", onPointerEnd, { capture: true, passive: true });
    window.addEventListener("resize", scheduleImageRefresh, { passive: true });
    scheduleImageRefresh();

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("resize", scheduleImageRefresh);
      if (drag?.frame != null) cancelAnimationFrame(drag.frame);
      if (pinch?.frame != null) cancelAnimationFrame(pinch.frame);
      if (virtualizeFrame != null) cancelAnimationFrame(virtualizeFrame);
      document.querySelectorAll<HTMLElement>(".archive-page").forEach(restorePage);
    };
  }, []);

  return null;
}
