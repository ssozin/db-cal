"use client";

import { useEffect } from "react";

export default function DateButtonReopen() {
  useEffect(() => {
    let replaying = false;

    const onClick = (event: MouseEvent) => {
      if (replaying) return;
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>(".toolbar-actions > button:nth-child(3)");
      if (!button) return;

      window.setTimeout(() => {
        if (document.querySelector(".date-picker")) return;
        replaying = true;
        button.click();
        window.setTimeout(() => { replaying = false; }, 0);
      }, 60);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
