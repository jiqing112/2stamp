// 生成诊断样本：
//   diag-exif180.pdf —— 扫描件风格：内嵌 JPEG 带 EXIF Orientation=3（180°）
//   diag-rot180.pdf  —— 矢量页，/Rotate 180
// 正确渲染（PDF 规范忽略 EXIF）：红色条在页面顶部。
// 若渲染器错误地应用了 EXIF：红色条会出现在底部（整页上下颠倒）。
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import jpeg from "jpeg-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

// ---------- EXIF JPEG ----------
const W = 620, H = 877; // ~A4 @ 75dpi
const buf = Buffer.alloc(W * H * 4);
// 白底
buf.fill(0xff);
// 顶部红色条（正确渲染时应在页面顶部）
for (let y = 0; y < 90; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    buf[i] = 0xc9; buf[i + 1] = 0x33; buf[i + 2] = 0x29; buf[i + 3] = 0xff;
  }
// “文字行”：黑条模拟
for (let row = 0; row < 14; row++) {
  const y0 = 160 + row * 42;
  const wEnd = row % 5 === 4 ? Math.floor(W * 0.55) : W - 120;
  for (let y = y0; y < y0 + 16; y++)
    for (let x = 90; x < wEnd; x++) {
      const i = (y * W + x) * 4;
      buf[i] = 0x20; buf[i + 1] = 0x20; buf[i + 2] = 0x22; buf[i + 3] = 0xff;
    }
}

const rawJpeg = jpeg.encode({ data: buf, width: W, height: H }, 85).data;

// 在 SOI 后插入 APP1 EXIF（Orientation = 3 → 旋转 180°）
const app1 = Buffer.concat([
  Buffer.from([0xff, 0xe1, 0x00, 0x22]),
  Buffer.from("Exif\0\0", "latin1"),
  // TIFF little-endian
  Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
  // IFD0：1 项 = Orientation(0x0112), SHORT, 1, 值 3
  Buffer.from([0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
]);
const soi = rawJpeg.subarray(0, 2);
const rest = rawJpeg.subarray(2);
const exifJpeg = Buffer.concat([soi, app1, rest]);
console.log("jpeg bytes:", rawJpeg.length, "→ exif jpeg:", exifJpeg.length);

// ---------- PDF ----------
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

// 第 1 页：整页就是那张带 EXIF 的“扫描图”
const page1 = doc.addPage([595, 842]);
const img = await doc.embedJpg(exifJpeg);
page1.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });

// 第 2 页：普通矢量页（供翻页测试）
const page2 = doc.addPage([595, 842]);
page2.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(1, 1, 1) });
page2.drawText("Page 2 - flip back to page 1 to compare", { x: 64, y: 760, size: 14, font });

writeFileSync(join(pub, "diag-exif180.pdf"), await doc.save());
console.log("diag-exif180.pdf written");

// ---------- /Rotate 180 的矢量样本 ----------
const doc2 = await PDFDocument.create();
const p = doc2.addPage([595, 842]);
p.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(1, 1, 1) });
p.drawText("TOP MARKER (rotated page)", { x: 64, y: 760, size: 16, font });
p.drawRectangle({ x: 64, y: 740, width: 300, height: 8, color: rgb(0.79, 0.2, 0.16) });
p.setRotation(degrees(180));
writeFileSync(join(pub, "diag-rot180.pdf"), await doc2.save());
console.log("diag-rot180.pdf written");
