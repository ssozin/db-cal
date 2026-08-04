"use client";

import { useEffect } from "react";

const STYLE_ID = "calendar-visual-tuning-styles";

const styles = `
.toolbar-actions button,
.toolbar-actions .upload-button{
  position:relative!important;
  isolation:isolate;
}
.toolbar-actions button.is-selected,
.toolbar-actions .upload-button.is-selected{
  color:#242428!important;
  font-weight:700!important;
}
.toolbar-actions button.is-selected:after,
.toolbar-actions .upload-button.is-selected:after{
  display:none!important;
  content:none!important;
}
.toolbar-actions button.is-selected:before,
.toolbar-actions .upload-button.is-selected:before{
  content:""!important;
  position:absolute!important;
  z-index:-1!important;
  left:-4px!important;
  right:-4px!important;
  bottom:2px!important;
  top:auto!important;
  width:auto!important;
  height:45%!important;
  border:0!important;
  border-radius:1px!important;
  background:rgba(125,125,130,.3)!important;
  transform:rotate(-1deg)!important;
  opacity:1!important;
  pointer-events:none!important;
}
`;

export default function CalendarVisualTuning() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = styles;

    const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;

    CanvasRenderingContext2D.prototype.fillRect = function patchedFillRect(
      this: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
    ) {
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

      this.shadowColor = "rgba(18,18,23,.42)";
      this.shadowBlur = Math.max(42, previousShadowBlur * 1.7);
      this.shadowOffsetX = previousShadowOffsetX * 1.2;
      this.shadowOffsetY = Math.max(20, previousShadowOffsetY * 1.35);
      this.fillStyle = "rgba(20,20,24,.17)";
      originalFillRect.call(this, x, y, width, height);

      this.shadowColor = previousShadowColor;
      this.shadowBlur = previousShadowBlur;
      this.shadowOffsetX = previousShadowOffsetX;
      this.shadowOffsetY = previousShadowOffsetY;
      this.fillStyle = previousFillStyle;
    };

    return () => {
      CanvasRenderingContext2D.prototype.fillRect = originalFillRect;
    };
  }, []);

  return null;
}
