"use client";

import { useEffect } from "react";

const STYLE_ID = "calendar-visual-tuning-styles";
const STORAGE_KEY = "db-cal-background-color";
const DEFAULT_BACKGROUND = "#ececeb";

const styles = `
.toolbar-actions button,
.toolbar-actions .upload-button{position:relative!important;isolation:isolate}
.toolbar-actions button.is-selected,
.toolbar-actions .upload-button.is-selected{color:#242428!important;font-weight:700!important}
.toolbar-actions button.is-selected:before,
.toolbar-actions button.is-selected:after,
.toolbar-actions .upload-button.is-selected:before,
.toolbar-actions .upload-button.is-selected:after{display:none!important;content:none!important;background:none!important;box-shadow:none!important}
.calendar-color-control{
  position:fixed;z-index:25;display:flex;align-items:center;gap:7px;
  padding:6px 8px;border:1px solid rgba(30,30,34,.14);border-radius:999px;
  background:rgba(255,255,255,.72);box-shadow:0 5px 14px rgba(20,20,24,.08);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)
}
.calendar-color-control span{font:700 7px/1 Arial,sans-serif;letter-spacing:.1em;color:#55555a;white-space:nowrap}
.calendar-color-control input{
  width:22px;height:22px;padding:0;border:1px solid rgba(20,20,24,.18);
  border-radius:50%;overflow:hidden;background:transparent;cursor:pointer
}
.calendar-color-control input::-webkit-color-swatch-wrapper{padding:0}
.calendar-color-control input::-webkit-color-swatch{border:0;border-radius:50%}
.calendar-color-control input::-moz-color-swatch{border:0;border-radius:50%}
@media(max-width:640px){
  .calendar-color-control{gap:5px;padding:5px 7px}
  .calendar-color-control span{font-size:6px}
  .calendar-color-control input{width:20px;height:20px}
}
`;

function readStoredColor() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_BACKGROUND; }
  catch { return DEFAULT_BACKGROUND; }
}

function applyBackground(color: string) {
  document.documentElement.style.setProperty("--calendar-custom-background", color);
  const stage = document.querySelector<HTMLElement>(".calendar-stage");
  if (stage) stage.style.background = color;
}

export default function CalendarVisualTuning() {
  useEffect(() => {
    let selectedColor = readStoredColor();
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = styles;
    applyBackground(selectedColor);

    const captureButton = document.querySelector<HTMLButtonElement>(".calendar-capture");
    const control = document.createElement("label");
    control.className = "calendar-color-control";
    control.setAttribute("aria-label", "사용자 지정 배경색");
    const label = document.createElement("span");
    label.textContent = "BACKGROUND";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = selectedColor;
    picker.setAttribute("aria-label", "사용자 지정 배경색 선택");
    control.append(label, picker);
    document.body.appendChild(control);

    const positionControl = () => {
      if (!captureButton) {
        control.style.display = "none";
        return;
      }
      const rect = captureButton.getBoundingClientRect();
      control.style.top = `${Math.round(rect.bottom + 7)}px`;
      control.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
      control.style.transform = "translateX(-50%)";
      control.style.display = document.querySelector(".calendar-stage")?.classList.contains("archive-mode") ? "none" : "flex";
    };

    const onColorInput = () => {
      selectedColor = picker.value;
      try { localStorage.setItem(STORAGE_KEY, selectedColor); } catch { /* storage unavailable */ }
      applyBackground(selectedColor);
    };
    picker.addEventListener("input", onColorInput);
    window.addEventListener("resize", positionControl, { passive: true });
    window.addEventListener("scroll", positionControl, { passive: true });
    const observer = new MutationObserver(positionControl);
    const stage = document.querySelector(".calendar-stage");
    if (stage) observer.observe(stage, { attributes: true, attributeFilter: ["class"] });
    positionControl();

    const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function patchedFillRect(
      this: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
    ) {
      const isViewportBackground = x === 0 && y === 0
        && width >= window.innerWidth * .9
        && height >= window.innerHeight * .9
        && !document.querySelector(".calendar-stage")?.classList.contains("archive-mode");

      if (isViewportBackground) {
        const previousFillStyle = this.fillStyle;
        this.fillStyle = selectedColor;
        originalFillRect.call(this, x, y, width, height);
        this.fillStyle = previousFillStyle;
        return;
      }

      const looksLikeCalendarShadow = this.shadowBlur >= 20
        && this.shadowOffsetY >= 10
        && width > 120
        && height > 240;

      if (!looksLikeCalendarShadow) {
        originalFillRect.call(this, x, y, width, height);
        return;
      }

      const previousShadowColor = this.shadowColor;
      const previousShadowBlur = this.shadowBlur;
      const previousShadowOffsetX = this.shadowOffsetX;
      const previousShadowOffsetY = this.shadowOffsetY;
      const previousFillStyle = this.fillStyle;

      this.shadowColor = "rgba(18,18,23,.15)";
      this.shadowBlur = 28;
      this.shadowOffsetX = previousShadowOffsetX * .35;
      this.shadowOffsetY = 13;
      this.fillStyle = "rgba(20,20,24,.012)";
      originalFillRect.call(this, x, y, width, height);

      this.shadowColor = "rgba(18,18,23,.25)";
      this.shadowBlur = 11;
      this.shadowOffsetX = previousShadowOffsetX * .18;
      this.shadowOffsetY = 7;
      this.fillStyle = "rgba(20,20,24,.018)";
      originalFillRect.call(this, x, y, width, height);

      this.shadowColor = previousShadowColor;
      this.shadowBlur = previousShadowBlur;
      this.shadowOffsetX = previousShadowOffsetX;
      this.shadowOffsetY = previousShadowOffsetY;
      this.fillStyle = previousFillStyle;
    };

    return () => {
      observer.disconnect();
      picker.removeEventListener("input", onColorInput);
      window.removeEventListener("resize", positionControl);
      window.removeEventListener("scroll", positionControl);
      control.remove();
      CanvasRenderingContext2D.prototype.fillRect = originalFillRect;
    };
  }, []);

  return null;
}
