// 自定义印章：用户上传的印章图片（扫描件 / 透明底 PNG）。
// 上传时自动做两件事：白底转透明（仅当四角都是近白时）+ 裁掉空白边缘，
// 之后像普通印章一样参与盖章、缩放、导出。只存内存，用完即走。

export interface CustomImage {
  id: string;
  name: string;
  /** 处理后（透明化 + 裁边）的画布 */
  canvas: HTMLCanvasElement;
  /** 处理后的 dataURL（预览 / PDF 嵌入用） */
  src: string;
  /** 处理后像素尺寸 */
  pxW: number;
  pxH: number;
  /** 页面上的标称尺寸（pt，mult=1 时），保持原始宽高比 */
  boxW: number;
  boxH: number;
}

const store = new Map<string, CustomImage>();

export const getCustomImage = (id: string): CustomImage | undefined => store.get(id);
export const listCustomImages = (): CustomImage[] => [...store.values()];

const BOX_MAX_PT = 110; // 自定义印章的默认长边（≈39mm），滚轮可再缩放
const BOX_MIN_PT = 40;

export async function processStampUpload(file: File): Promise<CustomImage> {
  const bmp = await createImageBitmap(file);
  const src = document.createElement("canvas");
  src.width = bmp.width;
  src.height = bmp.height;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(bmp, 0, 0);

  let out: HTMLCanvasElement = src;
  if (hasWhiteCorners(sctx, src.width, src.height)) {
    out = whiteToAlpha(src);
  }
  out = trimTransparent(out);

  const dataUrl = out.toDataURL("image/png");
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const scale = Math.min(BOX_MAX_PT / out.width, BOX_MAX_PT / out.height);
  let boxW = out.width * scale;
  let boxH = out.height * scale;
  const long = Math.max(boxW, boxH);
  if (long < BOX_MIN_PT) {
    boxW *= BOX_MIN_PT / long;
    boxH *= BOX_MIN_PT / long;
  }

  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const entry: CustomImage = {
    id,
    name: file.name.replace(/\.[^.]+$/, "") || "自定义印章",
    canvas: out,
    src: dataUrl,
    pxW: out.width,
    pxH: out.height,
    boxW: Math.round(boxW * 10) / 10,
    boxH: Math.round(boxH * 10) / 10,
  };
  store.set(id, entry);
  return entry;
}

export function removeCustomImage(id: string) {
  store.delete(id);
  layerCache.clear();
}

// ---------- 内部 ----------

/** 四角都是近白 → 认定为「白底扫描件」，做透明化 */
function hasWhiteCorners(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const pts: Array<[number, number]> = [
    [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
  ];
  const d = ctx.getImageData(0, 0, w, h).data;
  return pts.every(([x, y]) => {
    const i = (y * w + x) * 4;
    return Math.min(d[i], d[i + 1], d[i + 2]) >= 235;
  });
}

/** 白底转透明：近白 → 全透明；深色 → 不透明；中间平滑过渡（保留印色） */
function whiteToAlpha(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const HI = 245, LO = 210; // min 通道 ≥HI 全透明，≤LO 全不透明
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    if (m >= HI) d[i + 3] = 0;
    else if (m > LO) d[i + 3] = Math.round((255 * (HI - m)) / (HI - LO));
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** 裁掉四周的透明/空白边缘，让章正好贴住内容 */
function trimTransparent(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = src;
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src; // 全透明，原样保留
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------- 绘制与导出 ----------

interface LayerRef { canvas: HTMLCanvasElement; ppp: number }
const layerCache = new Map<string, LayerRef>();

/** 自定义印章的位图层（pt × mult → 像素），与 StampSurface 的印章层同约定 */
export function getCustomImageLayer(id: string, mult: number, ppp: number): LayerRef {
  const q = Math.max(ppp, 2);
  const key = `${id}|${mult}|${q}`;
  let entry = layerCache.get(key);
  if (!entry) {
    const ci = store.get(id);
    const canvas = document.createElement("canvas");
    if (ci) {
      canvas.width = Math.max(1, Math.round(ci.boxW * mult * q));
      canvas.height = Math.max(1, Math.round(ci.boxH * mult * q));
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(ci.canvas, 0, 0, canvas.width, canvas.height);
      entry = { canvas, ppp: q };
    } else {
      canvas.width = canvas.height = 1;
      entry = { canvas, ppp: q };
    }
    if (layerCache.size > 40) layerCache.delete(layerCache.keys().next().value!);
    layerCache.set(key, entry);
  }
  return entry;
}

/** 处理后的画布（栅格化导出 / 图片导出直接画它） */
export function getCustomCanvas(id: string): HTMLCanvasElement | null {
  return store.get(id)?.canvas ?? null;
}

const pngBytesCache = new Map<string, Uint8Array>();
/** 处理后 PNG 字节（pdf-lib 嵌入用，同一张图只转一次） */
export async function getCustomImagePngBytes(id: string): Promise<Uint8Array> {
  const hit = pngBytesCache.get(id);
  if (hit) return hit;
  const ci = store.get(id);
  if (!ci) throw new Error("自定义印章不存在");
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    ci.canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab))) : reject(new Error("PNG 导出失败"))),
      "image/png",
    ),
  );
  pngBytesCache.set(id, bytes);
  return bytes;
}
