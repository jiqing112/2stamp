// PDF 预览（pdf.js）与导出（pdf-lib 覆盖原页 / 栅格化重建）。
// 全程在浏览器本地完成，文件不上传。
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { degrees, PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import { getCustomImagePngBytes, getCustomCanvas } from "./stamp/customImages";
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
  /** 逆时针角度；与 design.rotation 同步（选择模式里旋转过则以这里为准） */
  rotation: number;
  text?: StampText;
  design?: StampDesign;
  /** 自定义印章（存在时优先用它渲染） */
  image?: { imageId: string; w: number; h: number };
}

export type PageScope = "current" | "each" | "all" | "first" | "last";

export interface StampExportOptions {
  pageScope: PageScope;
  currentPage: number; // 1-based
  numPages: number;
}

/** 计算某一页要落的章 */
function stampsForPage(
  pageNo: number,
  pagesStamps: Map<number, PlacedStampLike[]>,
  opts: StampExportOptions,
): PlacedStampLike[] {
  const cur = pagesStamps.get(opts.currentPage) ?? [];
  switch (opts.pageScope) {
    case "current": return pageNo === opts.currentPage ? cur : [];
    case "each": return pagesStamps.get(pageNo) ?? []; // 各页各自的章（含「复制到全部页面」的副本）
    case "all": return cur; // 每一页同位置：投影当前页的章
    case "first": return pageNo === 1 ? cur : [];
    case "last": return pageNo === opts.numPages ? cur : [];
  }
}

const rotOf = (st: PlacedStampLike) => st.rotation ?? st.design?.rotation ?? 0;

/**
 * 给 PDF 盖章：把每枚章渲染成高分辨率透明 PNG，用 pdf-lib 覆盖到对应页上。
 * 原页面内容一个字节都不重排 —— 和原版一样，只动副本。
 */
export async function exportStampedPdf(
  pdfBytes: ArrayBuffer,
  pagesStamps: Map<number, PlacedStampLike[]>,
  opts: StampExportOptions,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const ppp = 300 / 72; // 300 dpi

  // 同一枚章只渲染、嵌入一次
  const designedCache = new Map<string, { img: PDFImage; wPt: number; hPt: number }>();
  const imageCache = new Map<string, PDFImage>();

  for (let pageNo = 1; pageNo <= opts.numPages; pageNo++) {
    const stamps = stampsForPage(pageNo, pagesStamps, opts);
    if (!stamps.length) continue;
    const page: PDFPage | undefined = pages[pageNo - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    // 页面可能带 /Rotate：预览坐标基于「显示后的页面」，落回未旋转的原始页面要映射回去
    const rotRaw = ((page.getRotation().angle % 360) + 360) % 360;
    for (const st of stamps) {
      let img: PDFImage, wPt: number, hPt: number, designRot = 0;
      if (st.image) {
        img = imageCache.get(st.image.imageId) ?? (await src.embedPng(await getCustomImagePngBytes(st.image.imageId)));
        imageCache.set(st.image.imageId, img);
        wPt = st.image.w * st.mult;
        hPt = st.image.h * st.mult;
      } else {
        const key = JSON.stringify([st.text, st.design, st.mult]);
        let entry = designedCache.get(key);
        if (!entry) {
          const layer = renderStampLayer(st.text!, st.design!, ppp);
          const pngBytes = await canvasPngBytes(layer);
          const emb = await src.embedPng(pngBytes);
          const size = stampSize(st.text!, st.design!);
          entry = { img: emb, wPt: size.w * st.mult, hPt: size.h * st.mult };
          designedCache.set(key, entry);
        }
        img = entry.img;
        wPt = entry.wPt;
        hPt = entry.hPt;
        designRot = st.design?.rotation ?? 0;
      }
      const instRot = rotOf(st);
      let cx: number, cy: number, theta: number;
      switch (rotRaw) {
        case 90: // 显示 = 原始页面顺时针转 90°
          cx = st.relY * width;
          cy = st.relX * height;
          theta = instRot + 90;
          break;
        case 180:
          cx = (1 - st.relX) * width;
          cy = st.relY * height;
          theta = instRot + 180;
          break;
        case 270:
          cx = (1 - st.relY) * width;
          cy = (1 - st.relX) * height;
          theta = instRot + 270;
          break;
        default:
          cx = st.relX * width;
          cy = (1 - st.relY) * height;
          theta = instRot;
      }
      void designRot;
      // pdf-lib 的 drawImage 绕左下角旋转；先算「左下角指向中心」的向量旋转后的位置，反推左下角
      const rad = (theta * Math.PI) / 180; // 逆时针
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const ox = (cos * wPt) / 2 - (sin * hPt) / 2;
      const oy = (sin * wPt) / 2 + (cos * hPt) / 2;
      page.drawImage(img, {
        x: cx - ox,
        y: cy - oy,
        width: wPt,
        height: hPt,
        rotate: degrees(theta),
      });
    }
  }
  return src.save();
}

/** 栅格化导出（加密 PDF 等 pdf-lib 动不了的情况）：每页渲染成位图再拼成 PDF */
export async function exportStampedPdfRasterized(
  pdf: LoadedPdf,
  pagesStamps: Map<number, PlacedStampLike[]>,
  opts: StampExportOptions & { scale?: number },
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const scale = opts.scale ?? 2;
  for (let pageNo = 1; pageNo <= opts.numPages; pageNo++) {
    const stamps = stampsForPage(pageNo, pagesStamps, opts);
    if (!stamps.length) continue;
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

    for (const st of stamps) {
      const w = (st.image ? st.image.w : stampSize(st.text!, st.design!).w) * st.mult;
      const h = (st.image ? st.image.h : stampSize(st.text!, st.design!).h) * st.mult;
      ctx.save();
      ctx.translate(st.relX * vp.width, st.relY * vp.height); // 画布 y 向下
      ctx.rotate((-rotOf(st) * Math.PI) / 180);
      if (st.image) {
        const c = getCustomCanvas(st.image.imageId);
        if (c) ctx.drawImage(c, -w / 2, -h / 2, w, h);
      } else {
        const layer = renderStampLayer(st.text!, st.design!, scale);
        ctx.drawImage(layer, -w / 2, -h / 2, w, h);
      }
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
