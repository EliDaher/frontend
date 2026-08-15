"use client";

import { createElement, useEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";

type RevealStyle = CSSProperties & {
  "--reveal-delay": string;
  "--reveal-distance": string;
};

type RevealProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  id?: string;
  once?: boolean;
};

export function Reveal({
  as = "div",
  children,
  className = "",
  delay = 0,
  distance = 22,
  id,
  once = true
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.unobserve(entry.target);
        } else if (!once) {
          setVisible(false);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once]);

  const style: RevealStyle = {
    "--reveal-delay": `${delay}ms`,
    "--reveal-distance": `${distance}px`
  };

  return createElement(
    as,
    {
      ref,
      id,
      className: `reveal-motion ${className}`.trim(),
      "data-visible": visible ? "true" : "false",
      style
    },
    children
  );
}
