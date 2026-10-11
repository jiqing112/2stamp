// 小章：从原版 app.js 原样移植的 36×36 表情章，五种心情
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FACE = "#FFF6F0";
const BLUSH = "#FFB3A3";

const eye = (x: number, y: number) => `<rect x="${x}" y="${y}" width="4" height="6" rx="2" fill="${FACE}"/>`;
const blush = (x: number, y: number, w: number) => `<rect x="${x}" y="${y}" width="${w}" height="3" rx="1.5" fill="${BLUSH}"/>`;
const line = (x: number, y: number, a = 0) =>
  `<rect x="${x}" y="${y}" width="6" height="2" rx="1" fill="${FACE}" transform="rotate(${a} ${x + 3} ${y + 1})"/>`;

export type Mood = "normal" | "expectant" | "happy" | "troubled" | "sleepy";

const faces: Record<Mood, () => string> = {
  normal: () => `<g>${eye(11, 14)}${eye(21, 14)}</g>${blush(6, 22, 6)}${blush(24, 22, 6)}`,
  expectant: () =>
    `<g>${eye(11, 16)}${eye(21, 16)}</g><circle cx="18" cy="26" r="1.25" fill="none" stroke="${FACE}" stroke-width="1.5"/>${blush(6, 23, 6)}${blush(24, 23, 6)}`,
  happy: () =>
    `<g fill="none" stroke="${FACE}" stroke-width="2" stroke-linecap="round"><path d="M10 19C10 15.5 14 15.5 14 19"/><path d="M22 19C22 15.5 26 15.5 26 19"/><path d="M16.5 21.5C16.5 24 19.5 24 19.5 21.5"/></g>${blush(5, 21, 7)}${blush(24, 21, 7)}`,
  troubled: () => `${line(10, 16, 12)}${line(20, 16, -12)}${line(15, 23)}`,
  sleepy: () => `${line(10, 18)}${line(20, 18)}${blush(6, 23, 6)}${blush(24, 23, 6)}`,
};

const MOODS: Mood[] = ["normal", "expectant", "happy", "troubled", "sleepy"];

let clipSeq = 0;

function mascotSVG(mood: Mood): string {
  const id = `mclip${++clipSeq}`;
  return `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false"><defs><clipPath id="${id}"><rect width="36" height="36" rx="11"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect width="36" height="36" fill="#C84936"/><rect y="-3" width="36" height="36" rx="11" fill="#E0533D"/>
    <ellipse cx="10.5" cy="7" rx="4.5" ry="2" fill="#fff" fill-opacity=".35"/></g>${(faces[mood] || faces.normal)()}</svg>`;
}

export function Mascot({
  mood = "normal",
  size = 36,
  className,
  boingKey,
}: {
  mood?: Mood;
  size?: number;
  className?: string;
  /** 变化时触发 boing 弹跳（传一个会变的 key） */
  boingKey?: number;
}) {
  return (
    <span
      key={boingKey}
      className={cn("inline-block select-none [&>svg]:block animate-boing", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: mascotSVG(mood) }}
    />
  );
}

/** 会自己换表情的小章：闲置犯困、互动时期待、落章后开心 */
export function useMascotMood(activeSignal: number): Mood {
  const [mood, setMood] = useState<Mood>("expectant");
  useEffect(() => {
    if (activeSignal > 0) {
      setMood("happy");
      const t = setTimeout(() => setMood("expectant"), 1600);
      return () => clearTimeout(t);
    }
  }, [activeSignal]);
  useEffect(() => {
    const t = setTimeout(() => setMood("sleepy"), 45000);
    const reset = () => setMood((m) => (m === "sleepy" ? "expectant" : m));
    window.addEventListener("pointerdown", reset, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", reset);
    };
  }, []);
  return mood;
}

/** 点击换表情的小章 */
export function TapMascot({ size = 36, className }: { size?: number; className?: string }) {
  const [idx, setIdx] = useState(0);
  const tap = useCallback(() => setIdx((i) => (i + 1) % MOODS.length), []);
  return (
    <button type="button" onClick={tap} aria-label="小章 —— 点一下换个表情" className={cn("cursor-pointer", className)}>
      <Mascot mood={MOODS[idx]} size={size} boingKey={idx} />
    </button>
  );
}
