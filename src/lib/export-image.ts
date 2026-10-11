// 图片文档的导出：原图 + 印章，按原图分辨率合成后下载
import { getCustomCanvas } from "./stamp/customImages";
import { renderStampLayer, stampSize } from "./stamp/engine";
import type { PlacedStampLike } from "./pdf";

/**
 * 把章画到原图上，返回画布。
 * 图片按「宽度 = 595pt 的虚拟 A4」折算 pt，让 22mm 的章在照片上也是 22mm 的大小。
 */
export function renderStampsOnImage(
  bitmap: ImageBitmap | HTMLImageElement,
  stamps: PlacedStampLike[],
): HTMLCanvasElement {
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const pxPerPt = w / 595;
  const ppp = Math.max(pxPerPt, 1); // 印章至少 1:1 渲染
  for (const st of stamps) {
    const rot = st.rotation ?? st.design?.rotation ?? 0;
    const layout = st.image
      ? { w: st.image.w, h: st.image.h }
      : stampSize(st.text!, st.design!);
    const wPx = layout.w * st.mult * pxPerPt;
    const hPx = layout.h * st.mult * pxPerPt;
    const cx = st.relX * w;
    const cy = st.relY * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-rot * Math.PI) / 180);
    if (st.image) {
      const c = getCustomCanvas(st.image.imageId);
      if (c) ctx.drawImage(c, -wPx / 2, -hPx / 2, wPx, hPx);
    } else {
      const layer = renderStampLayer(st.text!, st.design!, ppp);
      ctx.drawImage(layer, -wPx / 2, -hPx / 2, wPx, hPx);
    }
    ctx.restore();
  }
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), type, quality));
}
