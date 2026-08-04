"use client";

import { useEffect } from "react";

const desktopLabels = ["START", "TODAY", "DATE"];

export default function DateButtonReopen() {
  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 768px)");

    const syncLabels = () => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".toolbar-actions > button"),
      );

      buttons.slice(0, 3).forEach((button, index) => {
        const selected = button.classList.contains("is-selected");
        const label = mobileQuery.matches
          ? selected
            ? "·"
            : String(index + 1).padStart(2, "0")
          : desktopLabels[index];

        if (button.textContent !== label) button.textContent = label;
      });
    };

    syncLabels();

    const observer = new MutationObserver(syncLabels);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-pressed"],
    });

    mobileQuery.addEventListener("change", syncLabels);
    document.addEventListener("click", syncLabels, true);

    return () => {
      observer.disconnect();
      mobileQuery.removeEventListener("change", syncLabels);
      document.removeEventListener("click", syncLabels, true);
    };
  }, []);

  return null;
}
