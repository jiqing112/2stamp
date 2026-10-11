// 盖章绘制引擎：把原版 StampCore 的 StampRenderer（Swift/CoreGraphics）移植到 Canvas2D。
// 排版数值、边框规格、弧形排字、印泥质感算法均与原版一致；坐标系换成画布惯用的「原点左上、y 向下」。
import { STAMP_COLORS, type InkTexture, type StampDesign, type StampFont, type StampText } from "./types";

// ---------- 字体 ----------

interface FontSpec { stack: string; weight: number }

/** 正文字体（对应原版 StampFont.mainName） */
const MAIN_FONT: Record<StampFont, FontSpec> = {
  songti: { stack: '"Songti SC","STSongti-SC","SimSun","Noto Serif SC",serif', weight: 700 },
  kaiti: { stack: '"Kaiti SC","STKaitiSC","KaiTi","Ma Shan Zheng","Noto Serif SC",serif', weight: 700 },
  fangsong: { stack: '"FangSong","STFangsong","ZCOOL XiaoWei","Noto Serif SC",serif', weight: 400 },
  libian: { stack: '"LiSu","STLibianSC","ZCOOL XiaoWei","Noto Serif SC",serif', weight: 400 },
  weibei: { stack: '"WeibeiSC-Bold","Weibei SC","STZhongsong","ZCOOL XiaoWei","Noto Serif SC",serif', weight: 700 },
  heiti: { stack: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif', weight: 600 },
  serif: { stack: '"Baskerville","Playfair Display","Georgia","Times New Roman",serif', weight: 600 },
};

/** 日期/编号小字（对应 metaName） */
const META_FONT: Record<StampFont, FontSpec> = {
  songti: { stack: '"Songti SC","STSongti-SC","SimSun","Noto Serif SC",serif', weight: 400 },
  kaiti: { stack: '"Kaiti SC","STKaitiSC","KaiTi","Ma Shan Zheng","Noto Serif SC",serif', weight: 400 },
  fangsong: { stack: '"FangSong","STFangsong","ZCOOL XiaoWei","Noto Serif SC",serif', weight: 400 },
  libian: { stack: '"Songti SC","STSongti-SC","SimSun","Noto Serif SC",serif', weight: 400 },
  weibei: { stack: '"Songti SC","STSongti-SC","SimSun","Noto Serif SC",serif', weight: 400 },
  heiti: { stack: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif', weight: 400 },
  serif: { stack: '"Baskerville","Playfair Display","Georgia","Times New Roman",serif', weight: 400 },
};

/** 方印印文（笔画要重一些才压得住） */
const SEAL_FONT: Record<StampFont, FontSpec> = {
  songti: { stack: MAIN_FONT.songti.stack, weight: 900 },
  kaiti: { stack: MAIN_FONT.kaiti.stack, weight: 900 },
  heiti: { stack: MAIN_FONT.heiti.stack, weight: 600 },
  serif: { stack: MAIN_FONT.serif.stack, weight: 700 },
  fangsong: MAIN_FONT.fangsong,
  libian: MAIN_FONT.libian,
  weibei: MAIN_FONT.weibei,
};
const sealFontOf = (f: StampFont): FontSpec => SEAL_FONT[f] ?? MAIN_FONT[f];

const fontCSS = (f: FontSpec, size: number) => `${f.weight} ${size}px ${f.stack}`;

/** 需要从网络加载的 Web 字体（本机有宋楷仿隶时优先用本机） */
const WEB_FONT_LOADS: Array<[string, string, string]> = [
  ["700", '"Noto Serif SC"', "章"], ["900", '"Noto Serif SC"', "章"],
  ["400", '"ZCOOL XiaoWei"', "章"], ["400", '"Ma Shan Zheng"', "章"],
  ["500", '"Noto Sans SC"', "章"], ["700", '"Noto Sans SC"', "章"],
  ["600", '"Playfair Display"', "AX"], ["700", '"Playfair Display"', "AX"],
];

export async function ensureStampFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.all(
    WEB_FONT_LOADS.map(([w, f, sample]) => document.fonts.load(`${w} 16px ${f}`, sample).catch(() => {})),
  );
}

// ---------- 基础 ----------

const isLatin = (s: string) => ![...s].some((ch) => ch.codePointAt(0)! >= 0x2e80);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    measureCtx = c.getContext("2d")!;
  }
  return measureCtx;
}

/** 一行排好的字：逐字记录步进，绘制时手动加字距（保证与宽度测量一致） */
interface TypeLine {
  width: number;
  ascent: number;
  descent: number;
  height: number;
}

// 逐字信息（供绘制与弧形排字使用），按行弱引用
interface GlyphRun { chars: string[]; advances: number[]; tracking: number; css: string }
const glyphRuns = new WeakMap<TypeLine, GlyphRun>();

function typeset(str: string, font: FontSpec, size: number, tracking: number): TypeLine {
  const ctx = mctx();
  ctx.font = fontCSS(font, size);
  const chars = [...str];
  const advances = chars.map((ch) => ctx.measureText(ch).width);
  const width = Math.max(
    advances.reduce((a, b) => a + b, 0) + tracking * Math.max(chars.length - 1, 0),
    0,
  );
  const m = chars.length ? ctx.measureText(str) : null;
  const ascent = m?.fontBoundingBoxAscent ?? size * 0.86;
  const descent = m?.fontBoundingBoxDescent ?? size * 0.14;
  const tl: TypeLine = { width, ascent, descent, height: ascent + descent };
  glyphRuns.set(tl, { chars, advances, tracking, css: fontCSS(font, size) });
  return tl;
}

function drawLine(ctx: CanvasRenderingContext2D, line: TypeLine, x: number, yBaseline: number) {
  const run = glyphRuns.get(line);
  if (!run) return;
  ctx.font = run.css;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let cx = x;
  for (let i = 0; i < run.chars.length; i++) {
    ctx.fillText(run.chars[i], cx, yBaseline);
    cx += run.advances[i] + run.tracking;
  }
}

/** 逐字沿圆弧排。上弧字头朝外、从左往右顺时针；下弧字头朝圆心、从左往右逆时针。 */
function drawArc(ctx: CanvasRenderingContext2D, line: TypeLine, cx: number, cy: number, radius: number, upper: boolean) {
  const run = glyphRuns.get(line);
  if (!run) return;
  ctx.font = run.css;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const mid = line.width / 2;
  let x = 0;
  for (let i = 0; i < run.chars.length; i++) {
    const advance = run.advances[i];
    const offset = x + advance / 2 - mid;
    const phi = upper ? -Math.PI / 2 + offset / radius : Math.PI / 2 - offset / radius;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(phi), cy + radius * Math.sin(phi));
    ctx.rotate(upper ? phi + Math.PI / 2 : phi - Math.PI / 2);
    ctx.fillText(run.chars[i], -advance / 2, 0);
    ctx.restore();
    x += advance;
  }
}

// ---------- 随机数（可复现，同一枚章每次质感一致） ----------

const MASK64 = 0xffffffffffffffffn;

class SplitMix64 {
  private state: bigint;
  constructor(seed: bigint) {
    this.state = seed;
  }
  nextU64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
  }
  next(min: number, max: number): number {
    return min + Number(this.nextU64() >> 11n) / 9007199254740992 * (max - min);
  }
}

function stableSeed(s: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    hash = (hash ^ BigInt(b)) & MASK64;
    hash = (hash * 0x100000001b3n) & MASK64;
  }
  return hash;
}

// ---------- 边框 ----------

interface BorderMetrics {
  outer: number;
  inner: number;
  gap: number;
  none: boolean;
  thickness: number;
}

function borderMetrics(style: StampDesign["border"], fs: number): BorderMetrics {
  const hairline = Math.max(fs * 0.04, 0.25);
  let outer = 0, inner = 0, gap = 0;
  switch (style) {
    case "double": outer = Math.max(fs * 0.1, 0.4); inner = hairline; gap = fs * 0.16; break;
    case "single": outer = Math.max(fs * 0.085, 0.35); break;
    case "thickThin": outer = Math.max(fs * 0.2, 0.6); inner = hairline; gap = fs * 0.14; break;
    case "none": break;
  }
  const none = style === "none";
  return { outer, inner, gap, none, thickness: none ? 0 : outer + (inner > 0 ? gap + inner : 0) };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function strokeRectBorder(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number, b: BorderMetrics) {
  if (b.none) return;
  ctx.lineWidth = b.outer;
  roundRectPath(ctx, b.outer / 2, b.outer / 2, w - b.outer, h - b.outer, Math.min(radius, (h - b.outer) / 2));
  ctx.stroke();
  if (b.inner > 0) {
    const inset = b.outer + b.gap + b.inner / 2;
    ctx.lineWidth = b.inner;
    const iw = w - inset * 2, ih = h - inset * 2;
    if (iw > 0 && ih > 0) {
      roundRectPath(ctx, inset, inset, iw, ih, Math.max(Math.min(radius - inset, ih / 2), 0));
      ctx.stroke();
    }
  }
}

function strokeCircleBorder(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, b: BorderMetrics) {
  if (b.none) return;
  ctx.lineWidth = b.outer;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - b.outer / 2, 0, Math.PI * 2);
  ctx.stroke();
  if (b.inner > 0) {
    ctx.lineWidth = b.inner;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - b.outer - b.gap - b.inner / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------- 排版 ----------

interface Layout {
  w: number;
  h: number;
  paint: (ctx: CanvasRenderingContext2D) => void;
}

function rectangleLayout(body: string[], meta: string | undefined, design: StampDesign, fs: number, pill: boolean): Layout {
  const track = design.tracking * fs;
  const main = MAIN_FONT[design.font];
  const metaF = META_FONT[design.font];
  const lines: Array<{ tl: TypeLine; isMeta: boolean }> = [];
  body.forEach((s, i) => {
    if (!s) return;
    const size = i === 0 ? fs : (isLatin(s) && !isLatin(body[0]) ? fs * 0.74 : fs * 0.9);
    lines.push({ tl: typeset(s, main, size, track), isMeta: false });
  });
  if (meta) lines.push({ tl: typeset(meta, metaF, fs * 0.6, fs * 0.06), isMeta: true });

  const gap = fs * 0.34;
  const contentWidth = Math.max(...lines.map((l) => l.tl.width), fs);
  const contentHeight = lines.reduce(
    (sum, l, i) => sum + l.tl.height + (i === 0 ? 0 : (l.isMeta ? gap * 1.15 : gap)),
    0,
  );

  const border = borderMetrics(design.border, fs);
  const padY = border.none ? fs * 0.2 : fs * 0.55 + border.thickness;
  let padX = border.none ? fs * 0.25 : fs * 0.95 + border.thickness;
  const height = Math.ceil(contentHeight + padY * 2);
  if (pill) padX = Math.max(padX, height * 0.5 + fs * 0.25);
  const width = Math.ceil(contentWidth + padX * 2);
  const radius = pill ? height / 2 : fs * 0.16;

  const placed: Array<{ tl: TypeLine; x: number; y: number }> = [];
  let y = padY;
  lines.forEach((l, i) => {
    if (i > 0) y += l.isMeta ? gap * 1.15 : gap;
    y += l.tl.ascent;
    placed.push({ tl: l.tl, x: (width - l.tl.width) / 2, y });
    y += l.tl.descent;
  });

  return {
    w: width,
    h: height,
    paint(ctx) {
      const color = STAMP_COLORS[design.color];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      strokeRectBorder(ctx, width, height, radius, border);
      for (const p of placed) drawLine(ctx, p.tl, p.x, p.y);
    },
  };
}

function circleLayout(body: string[], meta: string | undefined, design: StampDesign, fs: number): Layout {
  const track = design.tracking * fs;
  const main = MAIN_FONT[design.font];
  const metaF = META_FONT[design.font];

  const top = typeset(body[0] || " ", main, fs, Math.max(track, fs * 0.1));
  const centerLines = body.slice(1).filter(Boolean)
    .map((s) => typeset(s, main, fs * 1.18, track * 1.2));
  const centerGap = fs * 0.28;
  const centerWidth = Math.max(...centerLines.map((l) => l.width), 0);
  const centerHeight = centerLines.reduce((a, l) => a + l.height, 0) + centerGap * Math.max(centerLines.length - 1, 0);

  const maxSpan = 3.7; // 上弧最多占约 212°
  const fromArc = top.width / maxSpan;
  const fromCenter = Math.hypot(centerWidth / 2, centerHeight / 2) + fs * 0.5 + top.descent;
  const topRadius = Math.max(fromArc, fromCenter, fs * 2.6);
  const ring = topRadius + top.ascent + fs * 0.32; // 文字外侧的那一圈
  const border = borderMetrics(design.border === "none" ? "none" : design.border, fs);
  const outer = ring + border.thickness;
  const side = Math.ceil(outer * 2 + fs * 0.1);
  const c = side / 2;

  let metaLine: TypeLine | null = null;
  let metaRadius = 0;
  if (meta) {
    let m = typeset(meta, metaF, fs * 0.58, fs * 0.05);
    metaRadius = ring - fs * 0.32 - m.descent;
    const maxMetaSpan = 1.75;
    if (m.width / metaRadius > maxMetaSpan) {
      const shrink = maxMetaSpan / (m.width / metaRadius);
      m = typeset(meta, metaF, fs * 0.58 * shrink, fs * 0.05 * shrink);
      metaRadius = ring - fs * 0.32 - m.descent;
    }
    metaLine = m;
  }

  const placedCenter: Array<{ tl: TypeLine; y: number }> = [];
  let yy = c - centerHeight / 2;
  for (const line of centerLines) {
    yy += line.ascent;
    placedCenter.push({ tl: line, y: yy });
    yy += line.descent + centerGap;
  }

  return {
    w: side,
    h: side,
    paint(ctx) {
      const color = STAMP_COLORS[design.color];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      strokeCircleBorder(ctx, c, c, outer, border);
      drawArc(ctx, top, c, c, topRadius, true);
      for (const p of placedCenter) drawLine(ctx, p.tl, c - p.tl.width / 2, p.y);
      if (metaLine) drawArc(ctx, metaLine, c, c, metaRadius, false);
    },
  };
}

function squareLayout(design: StampDesign, fs: number): Layout {
  const chars = [...design.sealText].filter((ch) => !/\s/.test(ch));
  const list = chars.length ? chars : ["印"];
  const n = list.length;
  let cols = 1, rows = 1;
  if (n === 2) { cols = 1; rows = 2; }
  else if (n === 3) { cols = 1; rows = 3; }
  else if (n === 4) { cols = 2; rows = 2; }
  else if (n === 5 || n === 6) { cols = 2; rows = 3; }
  else if (n > 6) { cols = 3; rows = Math.ceil(n / 3); }

  const cell = fs * 1.5;
  const yin = design.sealStyle === "yin";
  const frame = yin ? fs * 0.34 : Math.max(fs * 0.17, 0.5);
  const pad = yin ? fs * 0.08 : fs * 0.2;
  const width = Math.ceil(cols * cell + (pad + frame) * 2);
  const height = Math.ceil(rows * cell + (pad + frame) * 2);
  const radius = fs * 0.12;

  // 印文按传统从右往左、从上往下排进格子，字撑满格子（长宽比最多拉伸 18%）
  const font = sealFontOf(design.font);
  const mc = mctx();
  mc.font = fontCSS(font, cell);
  const glyphs: Array<{ ch: string; x: number; y: number; ox: number; oy: number; sx: number; sy: number }> = [];
  list.forEach((ch, i) => {
    const col = cols - 1 - Math.floor(i / rows); // 从右往左
    const row = i % rows; // 从上往下
    const cx = pad + frame + col * cell + cell / 2;
    const cy = pad + frame + row * cell + cell / 2;
    const m = mc.measureText(ch);
    const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const bw = left + right, bh = asc + desc;
    if (!(bw > 0 && bh > 0)) return;
    let sx = (cell * 0.9) / bw, sy = (cell * 0.9) / bh;
    const limit = 1.18;
    if (sx > sy * limit) sx = sy * limit;
    if (sy > sx * limit) sy = sx * limit;
    glyphs.push({ ch, x: cx, y: cy, ox: -(right - left) / 2, oy: (asc - desc) / 2, sx, sy });
  });

  return {
    w: width,
    h: height,
    paint(ctx) {
      const color = STAMP_COLORS[design.color];
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      if (yin) {
        // 白文：红底整块，字从红底上「刻」掉
        roundRectPath(ctx, 0, 0, width, height, radius);
        ctx.fill();
        ctx.globalCompositeOperation = "destination-out";
        for (const g of glyphs) {
          ctx.save();
          ctx.translate(g.x, g.y);
          ctx.scale(g.sx, g.sy);
          ctx.fillText(g.ch, g.ox, g.oy);
          ctx.restore();
        }
        ctx.globalCompositeOperation = "source-over";
      } else {
        // 朱文：边框 + 红字
        ctx.lineWidth = frame;
        roundRectPath(ctx, frame / 2, frame / 2, width - frame, height - frame, radius);
        ctx.stroke();
        for (const g of glyphs) {
          ctx.save();
          ctx.translate(g.x, g.y);
          ctx.scale(g.sx, g.sy);
          ctx.fillText(g.ch, g.ox, g.oy);
          ctx.restore();
        }
      }
    },
  };
}

function plainLayout(body: string[], meta: string | undefined, design: StampDesign, fs: number): Layout {
  const track = design.tracking * fs;
  const main = MAIN_FONT[design.font];
  const metaF = META_FONT[design.font];
  const lines = body.map((s, i) => ({ s, i })).filter(({ s }) => s)
    .map(({ s, i }) => typeset(s, main, i === 0 ? fs : fs * 0.9, track));
  const metaLine = meta ? typeset(meta, metaF, fs * 0.6, fs * 0.05) : null;
  const gap = fs * 0.3;
  const rule = Math.max(fs * 0.06, 0.3);
  const ruleGap = fs * 0.28;
  const contentWidth = Math.max(...lines.map((l) => l.width), fs, metaLine?.width ?? 0);
  const bodyHeight = lines.reduce((a, l) => a + l.height, 0) + gap * Math.max(lines.length - 1, 0);
  const metaHeight = metaLine ? metaLine.height + ruleGap : 0;
  const padX = fs * 0.3, padY = fs * 0.2;
  const width = Math.ceil(contentWidth + padX * 2);
  const height = Math.ceil(bodyHeight + ruleGap + rule + metaHeight + padY * 2);

  const placed: Array<{ tl: TypeLine; x: number; y: number }> = [];
  let y = padY;
  lines.forEach((tl, i) => {
    if (i > 0) y += gap;
    y += tl.ascent;
    placed.push({ tl, x: (width - tl.width) / 2, y });
    y += tl.descent;
  });
  const ruleY = y + ruleGap;
  const metaY = ruleY + rule + ruleGap * 0.8 + (metaLine?.ascent ?? 0);
  const metaX = width - padX - (metaLine?.width ?? 0);

  return {
    w: width,
    h: height,
    paint(ctx) {
      const color = STAMP_COLORS[design.color];
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      for (const p of placed) drawLine(ctx, p.tl, p.x, p.y);
      ctx.lineWidth = rule;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(padX, ruleY);
      ctx.lineTo(width - padX, ruleY);
      ctx.stroke();
      if (metaLine) drawLine(ctx, metaLine, metaX, metaY);
    },
  };
}

function computeLayout(text: StampText, design: StampDesign): Layout {
  const fs = Math.max(design.fontSize, 0.5);
  const body = design.uppercaseLatin ? text.body.map((s) => s.toUpperCase()) : text.body;
  switch (design.shape) {
    case "rectangle": return rectangleLayout(body, text.meta, design, fs, false);
    case "pill": return rectangleLayout([body.filter(Boolean).join(" · ")], text.meta, design, fs, true);
    case "circle": return circleLayout(body, text.meta, design, fs);
    case "square": return squareLayout(design, fs);
    case "plain": return plainLayout(body, text.meta, design, fs);
  }
}

// ---------- 渲染输出 ----------

export interface StampMetrics { w: number; h: number }

/** 未旋转时印章的尺寸（pt） */
export function stampSize(text: StampText, design: StampDesign): StampMetrics {
  const l = computeLayout(text, design);
  return { w: l.w, h: l.h };
}

/** 旋转后的外接矩形尺寸（pt） */
export function stampBounds(text: StampText, design: StampDesign): StampMetrics {
  const { w, h } = stampSize(text, design);
  const a = (design.rotation * Math.PI) / 180;
  return {
    w: Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)),
    h: Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)),
  };
}

/**
 * 把印章渲染成一张透明底的位图（含旋转、印泥质感、墨色浓度）。
 * `ppp` 是每个 pt 对应的像素数（决定清晰度）。
 */
export function renderStampLayer(text: StampText, design: StampDesign, ppp: number): HTMLCanvasElement {
  const layout = computeLayout(text, design);
  const bounds = stampBounds(text, design);
  const padPx = Math.ceil(2 * ppp);
  const width = Math.max(1, Math.ceil(bounds.w * ppp) + padPx * 2);
  const height = Math.max(1, Math.ceil(bounds.h * ppp) + padPx * 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-design.rotation * Math.PI) / 180); // 正数逆时针
  ctx.scale(ppp, ppp); // 此后全部用 pt 坐标作画
  ctx.translate(-layout.w / 2, -layout.h / 2);
  ctx.globalAlpha = clamp(design.opacity, 0.1, 1);
  layout.paint(ctx);
  ctx.restore();

  if (design.texture !== "clean") {
    applyTexture(canvas, ppp, design.texture, stableSeed(textSeed(text) + design.id + design.sealText));
  }
  return canvas;
}

function textSeed(text: StampText): string {
  return [...text.body, text.meta ?? ""].join("|") + "|";
}

/** 把整层画布画到目标 ctx 的 (cxPt, cyPt) 处（pt 坐标系，需先 scale(ppp)） */
export function drawLayerAt(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  cx: number,
  cy: number,
  ppp: number,
) {
  const w = layer.width / ppp;
  const h = layer.height / ppp;
  ctx.drawImage(layer, cx - w / 2, cy - h / 2, w, h);
}

// ---------- 印泥质感 ----------

/** 灰度遮罩：白色保留墨迹，黑色去掉。细密的缺墨颗粒 + 几处淡淡的不均匀。 */
function applyTexture(canvas: HTMLCanvasElement, ppp: number, level: InkTexture, seed: bigint) {
  const { width, height } = canvas;
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const mctx2 = mask.getContext("2d")!;
  mctx2.fillStyle = "#fff";
  mctx2.fillRect(0, 0, width, height);

  const rng = new SplitMix64(seed);
  const areaPt = (width * height) / Math.max(ppp * ppp, 0.0001);
  const strength = level === "aged" ? 1 : 0.42;

  // 墨色不匀：几块大而淡的斑
  const blotches = Math.round(Math.max(1, areaPt / 900) * (level === "aged" ? 4 : 2));
  for (let i = 0; i < blotches; i++) {
    const r = rng.next(3, 9) * ppp;
    const px = rng.next(0, 1) * width;
    const py = rng.next(0, 1) * height;
    const g = 1 - rng.next(0.12, 0.3) * strength;
    const grad = mctx2.createRadialGradient(px, py, 0, px, py, r);
    const gi = Math.round(g * 255);
    grad.addColorStop(0, `rgb(${gi},${gi},${gi})`);
    grad.addColorStop(1, "rgb(255,255,255)");
    mctx2.fillStyle = grad;
    mctx2.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // 纸纹颗粒：细小的缺墨点
  const specks = Math.round(areaPt * (level === "aged" ? 1.6 : 0.7));
  for (let i = 0; i < specks; i++) {
    const r = rng.next(0.05, 0.22) * ppp * (level === "aged" ? 1.4 : 1);
    const px = rng.next(0, 1) * width;
    const py = rng.next(0, 1) * height;
    const g = Math.round(rng.next(0, 0.55) * 255);
    mctx2.fillStyle = `rgb(${g},${g},${g})`;
    mctx2.beginPath();
    mctx2.ellipse(px, py, r, r, 0, 0, Math.PI * 2);
    mctx2.fill();
  }
  // 做旧：再加几道断续的缺口
  if (level === "aged") {
    const gaps = Math.round(Math.max(2, areaPt / 400));
    for (let i = 0; i < gaps; i++) {
      const r = rng.next(0.3, 0.8) * ppp;
      const px = rng.next(0, 1) * width;
      const py = rng.next(0, 1) * height;
      mctx2.fillStyle = "rgb(0,0,0)";
      mctx2.beginPath();
      mctx2.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      mctx2.fill();
    }
  }

  // 灰度 → alpha（白=保留，黑=去掉）
  const img = mctx2.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = 255 - d[i];
  }
  mctx2.putImageData(img, 0, 0);

  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}
