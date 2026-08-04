"use client";

import { useEffect } from "react";

export default function DateButtonReopen() {
  useEffect(() => {
    const syncLabels = () => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".toolbar-actions > button"),
      );

      buttons.slice(0, 3).forEach((button, index) => {
        const selected = button.classList.contains("is-selected");
        const label = selected ? "-" : String(index + 1).padStart(2, "0");
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

    document.addEventListener("click", syncLabels, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", syncLabels, true);
    };
  }, []);

  return null;
}
