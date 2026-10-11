// 17 个内置模板 + 印章文字的自动生成（对应原版 Statement）
import type { StampDesign, StampText } from "./types";

// ---------- 措辞 ----------

export type Phrasing = "chinese" | "english" | "bilingual";

export interface Statement {
  /** 接收方/机构，例如「招商银行」 */
  recipient: string;
  /** 用途，例如「办理开户」 */
  purpose: string;
  /** 英文措辞时的机构名；留空沿用 recipient */
  recipientEN: string;
  /** 英文措辞时的用途；留空沿用 purpose */
  purposeEN: string;
  phrasing: Phrasing;
  /** 用自定义文字整体替换自动生成正文（每行一条） */
  useCustomText: boolean;
  customText: string;
  includeDate: boolean;
  includeID: boolean;
  /** 主文字：留空自动生成「仅供××使用」 */
  mainText: string;
  /** 第二行，默认「他用无效」 */
  subText: string;
  subTextEN: string;
}

export const defaultStatement = (): Statement => ({
  recipient: "",
  purpose: "",
  recipientEN: "",
  purposeEN: "",
  phrasing: "chinese",
  useCustomText: false,
  customText: "",
  includeDate: true,
  includeID: true,
  mainText: "",
  subText: "他用无效",
  subTextEN: "Not valid for other use",
});

const trimmed = (s: string) => s.trim();

function chineseLimit(st: Statement): string {
  const who = trimmed(st.recipient) + trimmed(st.purpose);
  return who ? `仅供${who}使用` : "仅供指定用途使用";
}

function whoEN(st: Statement): { r: string; p: string } {
  return {
    r: trimmed(trimmed(st.recipientEN) ? st.recipientEN : st.recipient),
    p: trimmed(trimmed(st.purposeEN) ? st.purposeEN : st.purpose),
  };
}

function englishLimit(st: Statement): string {
  const { r, p } = whoEN(st);
  if (r && p) return `For ${p} at ${r} only`;
  if (r) return `For use by ${r} only`;
  if (p) return `For ${p} only`;
  return "For the stated purpose only";
}

function englishShortLimit(st: Statement): string {
  const { r, p } = whoEN(st);
  if (p) return `For ${p} only`;
  return r ? `For use by ${r} only` : "For the stated purpose only";
}

export function bodyLines(st: Statement): string[] {
  if (st.useCustomText) {
    const custom = st.customText.split(/\r?\n/).map(trimmed).filter(Boolean);
    if (custom.length) return custom;
  }
  const main = trimmed(st.mainText) || chineseLimit(st);
  const sub = trimmed(st.subText);
  const subEN = trimmed(st.subTextEN);
  switch (st.phrasing) {
    case "chinese": return [main, sub].filter(Boolean);
    case "english": return [trimmed(st.mainText) || englishLimit(st), subEN].filter(Boolean);
    case "bilingual": return [main, englishShortLimit(st), sub].filter(Boolean);
  }
}

export function stampTextOf(st: Statement, design: StampDesign, stampID: string | null, date = new Date()): StampText {
  const meta: string[] = [];
  if (st.includeDate) meta.push(dateString(date));
  if (st.includeID && stampID) meta.push(`No.${stampID}`);
  // 方印上不排日期编号
  const m = design.shape === "square" ? undefined : meta.length ? meta.join(" · ") : undefined;
  return { body: bodyLines(st), meta: m };
}

export function dateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- 编号（与原版一致：6 位无易混字符） ----------

const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeStampID(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

// ---------- 设计工具 ----------

const design = (d: Partial<StampDesign> & { id: string; name: string }): StampDesign => ({
  shape: "rectangle",
  border: "double",
  font: "songti",
  color: "red",
  opacity: 0.92,
  fontSize: 6.5,
  tracking: 0.12,
  rotation: 0,
  texture: "light",
  sealText: "他用无效",
  sealStyle: "yin",
  uppercaseLatin: true,
  ...d,
});

// ---------- 17 个模板（与 stamps.json 一一对应） ----------

export interface Template {
  key: string;
  name: string;
  blurb: string;
  category: "常用" | "复印件" | "英文" | "方印";
  /** 标称物理尺寸 mm（展示用） */
  mm: [number, number];
  design: StampDesign;
  /** 模板自带的内容覆盖 */
  statement?: Partial<Statement>;
}

export const TEMPLATES: Template[] = [
  {
    key: "t00", name: "细框长章", blurb: "长章 · 双线 · 宋体", category: "常用", mm: [35, 13],
    design: design({ id: "t00", name: "细框长章" }),
  },
  {
    key: "t01", name: "胶囊签", blurb: "胶囊 · 单线 · 宋体 · 胭脂", category: "常用", mm: [37, 8],
    design: design({ id: "t01", name: "胶囊签", shape: "pill", border: "single", color: "crimson" }),
    statement: { subText: "" },
  },
  {
    key: "t02", name: "圆章", blurb: "圆章 · 双线 · 宋体", category: "常用", mm: [22, 22],
    design: design({ id: "t02", name: "圆章", shape: "circle", fontSize: 5.8 }),
  },
  {
    key: "t03", name: "方印 · 白文", blurb: "他用无效 · 红底白字", category: "方印", mm: [7, 7],
    design: design({ id: "t03", name: "方印 · 白文", shape: "square", sealText: "他用无效", sealStyle: "yin", fontSize: 5.2 }),
  },
  {
    key: "t04", name: "方印 · 朱文", blurb: "限用 · 隶书", category: "方印", mm: [4, 7],
    design: design({ id: "t04", name: "方印 · 朱文", shape: "square", border: "none", font: "libian", sealText: "限用", sealStyle: "yang", fontSize: 5, color: "red" }),
  },
  {
    key: "t05", name: "签注", blurb: "无框 · 楷体 · 藏蓝，像手写", category: "常用", mm: [22, 12],
    design: design({ id: "t05", name: "签注", shape: "plain", border: "none", font: "kaiti", color: "blue" }),
  },
  {
    key: "t06", name: "英文长章", blurb: "长章 · 粗细线 · Serif", category: "英文", mm: [37, 10],
    design: design({ id: "t06", name: "英文长章", border: "thickThin", font: "serif" }),
    statement: { phrasing: "english" },
  },
  {
    key: "t07", name: "中英双语", blurb: "长章 · 单线 · 中英两行", category: "英文", mm: [30, 14],
    design: design({ id: "t07", name: "中英双语", border: "single", fontSize: 6 }),
    statement: { phrasing: "bilingual" },
  },
  {
    key: "t08", name: "墨色长章", blurb: "长章 · 粗细线 · 仿宋 · 墨", category: "常用", mm: [34, 11],
    design: design({ id: "t08", name: "墨色长章", border: "thickThin", font: "fangsong", color: "black" }),
  },
  {
    key: "t09", name: "藏蓝圆章", blurb: "圆章 · 单线 · 魏碑 · 藏蓝", category: "常用", mm: [20, 20],
    design: design({ id: "t09", name: "藏蓝圆章", shape: "circle", border: "single", font: "weibei", color: "blue", fontSize: 5.4 }),
  },
  {
    key: "t10", name: "再次复印无效", blurb: "长章 · 黑体 · 三行", category: "复印件", mm: [28, 11],
    design: design({ id: "t10", name: "再次复印无效", border: "single", font: "heiti", fontSize: 6 }),
    statement: { useCustomText: true, customText: "复印件\n再次复印无效" },
  },
  {
    key: "t11", name: "与原件一致", blurb: "长章 · 双线 · 胭脂 · 本人确认", category: "复印件", mm: [32, 12],
    design: design({ id: "t11", name: "与原件一致", color: "crimson" }),
    statement: { useCustomText: true, customText: "本人确认\n与原件一致" },
  },
  {
    key: "t12", name: "身份证复印件", blurb: "胶囊 · 黑体 · 一行写完", category: "复印件", mm: [38, 6],
    design: design({ id: "t12", name: "身份证复印件", shape: "pill", border: "single", font: "heiti", fontSize: 5.5 }),
    statement: { useCustomText: true, customText: "身份证复印件 · 仅供办理××使用" },
  },
  {
    key: "t13", name: "英文圆章", blurb: "圆章 · 双线 · COPY ONLY", category: "英文", mm: [23, 23],
    design: design({ id: "t13", name: "英文圆章", shape: "circle", font: "serif", fontSize: 5.2 }),
    statement: { phrasing: "english", subText: "COPY ONLY" },
  },
  {
    key: "t14", name: "英文胶囊", blurb: "胶囊 · Serif · 墨 · 一句话", category: "英文", mm: [37, 6],
    design: design({ id: "t14", name: "英文胶囊", shape: "pill", border: "single", font: "serif", color: "black", fontSize: 5.5 }),
    statement: { phrasing: "english", useCustomText: true, customText: "For verification purpose only" },
  },
  {
    key: "t15", name: "方印 · 复印无效", blurb: "复印无效 · 红底白字", category: "方印", mm: [7, 7],
    design: design({ id: "t15", name: "方印 · 复印无效", shape: "square", sealText: "复印无效", sealStyle: "yin", fontSize: 5.2 }),
  },
  {
    key: "t16", name: "方印 · 专用", blurb: "专用 · 楷体 · 胭脂", category: "方印", mm: [4, 7],
    design: design({ id: "t16", name: "方印 · 专用", shape: "square", border: "none", font: "kaiti", color: "crimson", sealText: "专用", sealStyle: "yang", fontSize: 5 }),
  },
];

/** 用户当前正在用的章：模板外观 + 自己的内容 */
export interface EditorStamp {
  templateKey: string;
  design: StampDesign;
  statement: Statement;
}

export function editorStampFromTemplate(t: Template, base?: Partial<Statement>): EditorStamp {
  return {
    templateKey: t.key,
    design: { ...t.design },
    statement: { ...defaultStatement(), ...t.statement, ...base },
  };
}
