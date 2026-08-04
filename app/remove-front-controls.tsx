"use client";

import { useEffect } from "react";

const STYLE_ID = "remove-front-controls-styles";

export default function RemoveFrontControls() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      .calendar-capture,
      .calendar-color-control{
        display:none!important;
        visibility:hidden!important;
        pointer-events:none!important;
      }
    `;

    const removeColorControl = () => {
      document.querySelectorAll(".calendar-color-control").forEach((node) => node.remove());
    };

    removeColorControl();
    const observer = new MutationObserver(removeColorControl);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
