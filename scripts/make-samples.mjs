// 生成示例文件：sample-memo.pdf（2 页）与 sample-photo.png（证件照式样）
// 用法：node scripts/make-samples.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

// ---------- PDF ----------
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const pageW = 595, pageH = 842;

for (let p = 1; p <= 2; p++) {
  const page = doc.addPage([pageW, pageH]);
  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(1, 1, 1) });
  page.drawText("XINGCHEN (SHANGHAI) TECHNOLOGY CO., LTD.", { x: 64, y: pageH - 70, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
  page.drawLine({ start: { x: 64, y: pageH - 82 }, end: { x: pageW - 64, y: pageH - 82 }, thickness: 1.6, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Employment & Income Verification  -  Page ${p} of 2`, { x: 64, y: pageH - 130, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  const lines = [
    "This is to certify that the employee named below has been employed by",
    "our company since March 2021, and currently holds the position of",
    "Senior Manager of the Marketing Department.",
    "",
    "Monthly after-tax salary: RMB 28,500.00",
    "Annual income: RMB 356,000.00",
    "",
    "This certificate is issued at the request of the employee for the sole",
    "purpose stated by the receiver, and our company takes no responsibility",
    "for any other use of this document.",
    "",
    p === 1 ? "Personnel Department        2026-09-28" : "Attachment: salary slip (6 months)",
  ];
  let y = pageH - 180;
  for (const line of lines) {
    if (line) page.drawText(line, { x: 64, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 26;
  }
  for (let i = 0; i < 6; i++) {
    page.drawLine({ start: { x: 64, y: 200 - i * 24 }, end: { x: pageW - 64, y: 200 - i * 24 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  }
}
writeFileSync(join(pub, "sample-memo.pdf"), await doc.save());
console.log("sample-memo.pdf written");

// ---------- PNG（做一张“证件扫描件”风格的图） ----------
const W = 1000, H = 700;
const rowBytes = W * 3;
const raw = Buffer.alloc((rowBytes + 1) * H);
// 背景：浅灰纸纹
for (let y = 0; y < H; y++) {
  const off = y * (rowBytes + 1);
  raw[off] = 0; // filter: None
  for (let x = 0; x < W; x++) {
    const v = 244 + ((x * 7 + y * 13) % 7) - 3;
    const i = off + 1 + x * 3;
    raw[i] = v; raw[i + 1] = v - 2; raw[i + 2] = v - 6;
  }
}
const rect = (x0, y0, w, h, r, g, b) => {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
    const off = y * (rowBytes + 1) + 1;
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
      const i = off + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
};
// 「身份证复印件」版式：照片框 + 信息条
rect(70, 70, 860, 560, 255, 255, 255);
rect(110, 150, 260, 330, 210, 200, 185); // 照片
rect(130, 170, 220, 240, 150, 140, 130);
rect(410, 180, 460, 26, 60, 60, 60);
rect(410, 230, 380, 20, 90, 90, 90);
rect(410, 275, 420, 20, 90, 90, 90);
rect(410, 320, 300, 20, 90, 90, 90);
rect(110, 520, 700, 22, 60, 60, 60);
rect(110, 560, 500, 18, 120, 120, 120);

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(join(pub, "sample-photo.png"), png);
console.log("sample-photo.png written");
