// 印章设计的数据模型 —— 与原版 StampCore 的 StampDesign/Statement 一一对应
// 尺寸单位：pt（1pt = 25.4/72 mm，与 PDF 一致）

export type StampShape = "rectangle" | "pill" | "circle" | "square" | "plain";
export type StampBorder = "double" | "single" | "thickThin" | "none";
export type StampFont = "songti" | "kaiti" | "fangsong" | "libian" | "weibei" | "heiti" | "serif";
export type StampColor = "red" | "crimson" | "blue" | "black";
export type SealStyle = "yang" | "yin"; // 朱文：红字；白文：红底白字
export type InkTexture = "clean" | "light" | "aged";

export const SHAPE_LABELS: Record<StampShape, string> = {
  rectangle: "长章", pill: "胶囊", circle: "圆章", square: "方印", plain: "签注",
};
export const BORDER_LABELS: Record<StampBorder, string> = {
  double: "双线", single: "单线", thickThin: "粗细线", none: "无框",
};
export const FONT_LABELS: Record<StampFont, string> = {
  songti: "宋体", kaiti: "楷体", fangsong: "仿宋", libian: "隶书", weibei: "魏碑", heiti: "黑体", serif: "Serif",
};
export const COLOR_LABELS: Record<StampColor, string> = {
  red: "朱砂", crimson: "胭脂", blue: "藏蓝", black: "墨",
};
export const TEXTURE_LABELS: Record<InkTexture, string> = {
  clean: "干净", light: "印泥", aged: "做旧",
};
export const SEAL_STYLE_LABELS: Record<SealStyle, string> = {
  yang: "朱文", yin: "白文",
};

/** 印色（取自原版 StampColor.rgb） */
export const STAMP_COLORS: Record<StampColor, string> = {
  red: "#C93329",
  crimson: "#9E1C2E",
  blue: "#213D73",
  black: "#242120",
};

/** 一枚刻好的印章的外观 */
export interface StampDesign {
  /** 稳定 id：同 id 同文字的章，印泥质感每次一致 */
  id: string;
  name: string;
  shape: StampShape;
  border: StampBorder;
  font: StampFont;
  color: StampColor;
  /** 墨色浓度 0…1 */
  opacity: number;
  /** 正文字号（pt） */
  fontSize: number;
  /** 字距（字号的倍数） */
  tracking: number;
  /** 旋转角度（度），正数为逆时针 */
  rotation: number;
  texture: InkTexture;
  /** 方印上的字（印文） */
  sealText: string;
  sealStyle: SealStyle;
  /** 西文全部大写 */
  uppercaseLatin: boolean;
}

/** 印章上实际画出来的文字：正文若干行 + 一行较小的日期/编号 */
export interface StampText {
  body: string[];
  meta?: string;
}

export const MM_PER_PT = 25.4 / 72;

export const ptToMm = (pt: number) => pt * MM_PER_PT;
export const mmToPt = (mm: number) => mm / MM_PER_PT;
