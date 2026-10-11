// PDF 预览（pdf.js）与导出（pdf-lib 覆盖原页 / 栅格化重建）。
// 全程在浏览器本地完成，文件不上传。
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { degrees, PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import { renderStampLayer, stampSize } from "./stamp/engine";
import type { StampDesign, StampText } from "./stamp/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export class PasswordRequiredError extends Error {
  retry: boolean;
  constructor(retry: boolean) {
    super(retry ? "密码不对，再试一次" : "这个 PDF 加了密码，需要先解锁");
    this.retry = retry;
  }
}

export interface LoadedPdf {
  doc: pdfjsLib.PDFDocumentProxy;
  numPages: number;
  /** 第 1 页的 pt 尺寸 */
  pageSize: { w: number; h: number };
}

export async function loadPdf(
  data: ArrayBuffer,
  password?: string,
  onNeedPassword?: () => Promise<string | null>,
): Promise<LoadedPdf> {
  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({ data, password }).promise;
  } catch (e) {
    const err = e as { name?: string };
    if (err?.name === "PasswordException") {
      if (onNeedPassword) {
        const pw = await onNeedPassword();
        if (pw !== null) return loadPdf(data, pw, undefined);
      }
      throw new PasswordRequiredError(!!password);
    }
    throw e;
  }
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  return { doc, numPages: doc.numPages, pageSize: { w: vp.width, h: vp.height } };
}

/** 把某一页渲染到画布（pt × scale）。同一画布上的旧渲染任务会被取消，避免并发绘制互相踩踏。 */
export async function renderPageToCanvas(
  pdf: LoadedPdf,
  pageNo: number, // 1-based
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<{ w: number; h: number }> {
  const page = await pdf.doc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const prev = (canvas as CanvasWithTask).__renderTask;
  if (prev) {
    prev.cancel();
    try {
      await prev.promise;
    } catch {
      /* 取消本身会以异常结束，忽略 */
    }
    (canvas as CanvasWithTask).__renderTask = null;
  }
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // 清掉任何遗留变换
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
  (canvas as CanvasWithTask).__renderTask = task;
  try {
    await task.promise;
  } finally {
    if ((canvas as CanvasWithTask).__renderTask === task) {
      (canvas as CanvasWithTask).__renderTask = null;
    }
  }
  return { w: vp.width, h: vp.height };
}

interface CanvasWithTask extends HTMLCanvasElement {
  __renderTask?: import("pdfjs-dist").RenderTask | null;
}

// ---------- 导出 ----------

export interface PlacedStampLike {
  relX: number; // 0…1，页面左上为原点
  relY: number;
  mult: number;
  text: StampText;
  design: StampDesign;
}

export type PageScope = "current" | "all" | "first" | "last";

export interface StampExportOptions {
  pageScope: PageScope;
  currentPage: number; // 1-based
  numPages: number;
}

/** 计算哪些页要落章：范围以「当前页的章」为准 */
function targetPages(opts: StampExportOptions): number[] {
  switch (opts.pageScope) {
    case "all": return Array.from({ length: opts.numPages }, (_, i) => i + 1);
    case "first": return [1];
    case "last": return [opts.numPages];
    case "current": return [opts.currentPage];
  }
}

/**
 * 给 PDF 盖章：把每枚章渲染成高分辨率透明 PNG，用 pdf-lib 覆盖到对应页上。
 * 原页面内容一个字节都不重排 —— 和原版一样，只动副本。
 */
export async function exportStampedPdf(
  pdfBytes: ArrayBuffer,
  currentPageStamps: PlacedStampLike[],
  opts: StampExportOptions,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const ppp = 300 / 72; // 300 dpi

  // 同一枚章（同文字同设计同倍率）只渲染、嵌入一次
  const cache = new Map<string, { img: PDFImage; wPt: number; hPt: number }>();

  for (const pageNo of targetPages(opts)) {
    const page: PDFPage | undefined = pages[pageNo - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    // 页面可能带 /Rotate：预览坐标基于「显示后的页面」，落回未旋转的原始页面要映射回去
    const rotRaw = ((page.getRotation().angle % 360) + 360) % 360;
    for (const st of currentPageStamps) {
      const key = JSON.stringify([st.text, st.design, st.mult]);
      let entry = cache.get(key);
      if (!entry) {
        const layer = renderStampLayer(st.text, st.design, ppp);
        const pngBytes = await canvasPngBytes(layer);
        const img = await src.embedPng(pngBytes);
        const size = stampSize(st.text, st.design);
        entry = { img, wPt: size.w * st.mult, hPt: size.h * st.mult };
        cache.set(key, entry);
      }
      let cx: number, cy: number, theta: number;
      switch (rotRaw) {
        case 90: // 显示 = 原始页面顺时针转 90°
          cx = st.relY * width;
          cy = st.relX * height;
          theta = st.design.rotation + 90;
          break;
        case 180:
          cx = (1 - st.relX) * width;
          cy = st.relY * height;
          theta = st.design.rotation + 180;
          break;
        case 270:
          cx = (1 - st.relY) * width;
          cy = (1 - st.relX) * height;
          theta = st.design.rotation + 270;
          break;
        default:
          cx = st.relX * width;
          cy = (1 - st.relY) * height;
          theta = st.design.rotation;
      }
      // pdf-lib 的 drawImage 绕左下角旋转；先算「左下角指向中心」的向量旋转后的位置，反推左下角
      const rad = (theta * Math.PI) / 180; // 逆时针
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const ox = (cos * entry.wPt) / 2 - (sin * entry.hPt) / 2;
      const oy = (sin * entry.wPt) / 2 + (cos * entry.hPt) / 2;
      page.drawImage(entry.img, {
        x: cx - ox,
        y: cy - oy,
        width: entry.wPt,
        height: entry.hPt,
        rotate: degrees(theta),
      });
    }
  }
  return src.save();
}

/** 栅格化导出（加密 PDF 等 pdf-lib 动不了的情况）：每页渲染成位图再拼成 PDF */
export async function exportStampedPdfRasterized(
  pdf: LoadedPdf,
  currentPageStamps: PlacedStampLike[],
  opts: StampExportOptions & { scale?: number },
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const scale = opts.scale ?? 2;
  for (const pageNo of targetPages(opts)) {
    if (pageNo > pdf.numPages) continue;
    const page = await pdf.doc.getPage(pageNo);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

    for (const st of currentPageStamps) {
      const layer = renderStampLayer(st.text, st.design, scale);
      const size = stampSize(st.text, st.design);
      const w = size.w * st.mult, h = size.h * st.mult;
      ctx.save();
      ctx.translate(st.relX * vp.width, st.relY * vp.height); // 画布 y 向下
      ctx.rotate((-st.design.rotation * Math.PI) / 180);
      ctx.drawImage(layer, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    const img = await out.embedJpg(canvas.toDataURL("image/jpeg", 0.92));
    const wPt = vp.width / scale, hPt = vp.height / scale;
    out.addPage([wPt, hPt]).drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
  }
  return out.save();
}

export function stampedFileName(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}_stamped.${ext}`;
}

async function canvasPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画布导出失败"))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export function downloadBytes(bytes: Uint8Array | ArrayBuffer, filename: string, mime: string) {
  const buf: ArrayBuffer =
    bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      : bytes;
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
