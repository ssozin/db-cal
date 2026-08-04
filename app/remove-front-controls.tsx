"use client";

import { useEffect } from "react";

const STYLE_ID = "remove-front-controls-styles";
const NAV_LABELS = new Set(["START", "TODAY", "DATE"]);

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

      .toolbar-actions .calendar-dot-nav{
        position:relative!important;
        display:inline-grid!important;
        width:18px!important;
        min-width:18px!important;
        height:24px!important;
        min-height:24px!important;
        place-items:center!important;
        padding:0!important;
        border:0!important;
        border-radius:0!important;
        background:transparent!important;
        color:transparent!important;
        font-size:0!important;
        line-height:0!important;
        letter-spacing:0!important;
        box-shadow:none!important;
        overflow:visible!important;
      }

      .toolbar-actions .calendar-dot-nav:before{
        display:none!important;
        content:none!important;
      }

      .toolbar-actions .calendar-dot-nav:after{
        content:""!important;
        position:static!important;
        display:block!important;
        width:5px!important;
        height:5px!important;
        border-radius:50%!important;
        background:rgba(36,36,40,.32)!important;
        transform:none!important;
        transition:transform .16s ease,background .16s ease,opacity .16s ease!important;
        opacity:1!important;
      }

      .toolbar-actions .calendar-dot-nav.is-selected:after{
        width:7px!important;
        height:7px!important;
        background:#242428!important;
        transform:none!important;
      }

      .toolbar-actions .calendar-dot-nav:hover:after{
        background:rgba(36,36,40,.68)!important;
      }

      .toolbar-actions{
        gap:12px!important;
      }

      @media(max-width:640px){
        .toolbar-actions{gap:10px!important}
        .toolbar-actions .calendar-dot-nav{
          width:16px!important;
          min-width:16px!important;
          height:22px!important;
          min-height:22px!important;
        }
      }
    `;

    const syncControls = () => {
      document.querySelectorAll(".calendar-color-control").forEach((node) => node.remove());

      document.querySelectorAll<HTMLButtonElement>(".toolbar-actions button").forEach((button) => {
        const label = (button.dataset.calendarDotLabel || button.textContent || "").trim().toUpperCase();
        if (!NAV_LABELS.has(label)) return;
        button.dataset.calendarDotLabel = label;
        button.classList.add("calendar-dot-nav");
        button.setAttribute("aria-label", label === "START" ? "첫 날짜" : label === "TODAY" ? "오늘" : "날짜 선택");
        button.setAttribute("title", label);
      });
    };

    syncControls();
    const observer = new MutationObserver(syncControls);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return null;
}
