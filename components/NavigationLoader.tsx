"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;

    // Route changed — finish the bar quickly
    setProgress(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
    return () => clearTimeout(hide);
  }, [pathname]);

  // Start the bar on link click / fetch
  useEffect(() => {
    function startLoader() {
      setProgress(0);
      setVisible(true);

      let p = 0;
      timerRef.current = setInterval(() => {
        // Asymptotically approach 85% to simulate indeterminate progress
        p += (85 - p) * 0.12;
        setProgress(Math.min(p, 85));
      }, 80);
    }

    function stopLoader() {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    // Intercept navigation link clicks
    function handleClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      // Only trigger for same-origin internal navigations
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto")) return;
      if (a.target === "_blank") return;
      startLoader();
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      stopLoader();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 z-9999 h-0.5 bg-blue-600 transition-all duration-200 ease-out"
      style={{
        width: `${progress}%`,
        opacity: progress >= 100 ? 0 : 1,
        transition: progress >= 100 ? "width 150ms ease-out, opacity 200ms ease-in 100ms" : "width 80ms ease-out",
      }}
    />
  );
}
