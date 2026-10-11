// 模板缩略图：按目标显示尺寸「原生」渲染（不做大图缩小，细线才站得住）
import { ensureStampFonts, renderStampLayer, stampBounds } from "@/lib/stamp/engine";
import type { StampDesign, StampText } from "@/lib/stamp/types";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function StampThumb({
  text,
  design,
  maxWidth = 120,
  className,
  title,
}: {
  text: StampText;
  design: StampDesign;
  maxWidth?: number;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void ensureStampFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const render = () => {
      if (!alive || !ref.current) return;
      const canvas = ref.current;
      // 小图用干净质感 + 足墨，缩小后才站得住
      const thumbDesign: StampDesign = {
        ...design,
        texture: "clean",
        opacity: Math.min(1, Math.max(design.opacity, 0.98)),
      };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = stampBounds(text, thumbDesign);
      const displayW = Math.min(maxWidth, bounds.w * 4); // 别超过 4 倍光学放大
      const ppp = (displayW * dpr) / bounds.w;
      const layer = renderStampLayer(text, thumbDesign, ppp);
      canvas.width = layer.width;
      canvas.height = layer.height;
      canvas.style.width = `${Math.round(layer.width / dpr)}px`;
      canvas.style.height = "auto";
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(layer, 0, 0);
    };
    render();
    return () => {
      alive = false;
    };
  }, [text, design, maxWidth, fontsReady]);

  return <canvas ref={ref} title={title} className={cn("max-w-full", className)} aria-label={title} role="img" />;
}
