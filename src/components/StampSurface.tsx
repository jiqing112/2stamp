// 盖章台面：纸（children）+ 印章覆盖层。
// 章随鼠标走、滚轮调大小、点击落下、章永远完整留在纸里 —— 与原版交互一致。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getCustomImageLayer } from "@/lib/stamp/customImages";
import { drawLayerAt, renderStampLayer, stampSize } from "@/lib/stamp/engine";
import type { StampDesign, StampText } from "@/lib/stamp/types";
import { cn } from "@/lib/utils";

export interface StampImage {
  imageId: string; // customImages 里的 id
  w: number; // 标称宽（pt，mult=1）
  h: number;
}

export interface StampInstance {
  id: string;
  stampID: string; // No.XXXXXX 里的编号
  relX: number; // 0…1，左上为原点
  relY: number;
  mult: number;
  rotation: number; // 度，逆时针为正
  text: StampText;
  design: StampDesign;
  /** 自定义印章图片；存在时优先用它渲染（text/design 不参与绘制） */
  image?: StampImage;
}

export interface ActiveStamp {
  text?: StampText;
  design?: StampDesign;
  /** 手持自定义印章；存在时优先用它渲染 */
  image?: StampImage;
}

/** 实例/手持章的未旋转尺寸（pt） */
export function stampSpecSize(st: { text?: StampText; design?: StampDesign; image?: StampImage }) {
  return st.image ? { w: st.image.w, h: st.image.h } : stampSize(st.text!, st.design!);
}
/** 实例/手持章的旋转后外接尺寸（pt） */
export function stampSpecBounds(st: { text?: StampText; design?: StampDesign; image?: StampImage; rotation?: number }) {
  const { w, h } = stampSpecSize(st);
  const a = ((st.rotation ?? 0) * Math.PI) / 180;
  return {
    w: Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)),
    h: Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)),
  };
}

interface Props {
  pageW: number; // pt
  pageH: number;
  stamps: StampInstance[];
  active: ActiveStamp | null;
  mult: number;
  mode: "stamp" | "select";
  selectedId: string | null;
  interactive?: boolean;
  hint?: boolean;
  className?: string;
  children?: ReactNode;
  onStamp?: (relX: number, relY: number) => void;
  onMoveStamp?: (id: string, relX: number, relY: number) => void;
  onSelect?: (id: string | null) => void;
  onUpdateStamp?: (id: string, patch: Partial<Pick<StampInstance, "mult" | "rotation">>) => void;
  onGhostResize?: (next: number) => void;
  /** 滚轮响应区域（编辑器传桌面 ref，让指针不在纸上也能调大小）；缺省只认纸张本身 */
  wheelTargetRef?: React.RefObject<HTMLDivElement | null>;
  /** 持章区域：章在整个区域里跟手（贴边约束在纸内）、点桌面也落章；缺省只认纸张本身 */
  ghostZoneRef?: React.RefObject<HTMLDivElement | null>;
}

// ---------- 印章位图层缓存 ----------
interface LayerRef { canvas: HTMLCanvasElement; ppp: number }
const layerCache = new Map<string, LayerRef>();
function getLayer(text: StampText, design: StampDesign, mult: number, ppp: number): LayerRef {
  // 至少 2.0（≈144dpi），宁可缩小也不能放大 —— 放大会糊
  const q = Math.max(ppp, 2);
  const key = `${q}|${mult}|${design.id}|${JSON.stringify(text)}`;
  let entry = layerCache.get(key);
  if (!entry) {
    const canvas = renderStampLayer(text, design, q);
    entry = { canvas, ppp: q };
    if (layerCache.size > 80) {
      const first = layerCache.keys().next().value;
      if (first) layerCache.delete(first);
    }
    layerCache.set(key, entry);
  }
  return entry;
}

export function StampSurface({
  pageW, pageH, stamps, active, mult, mode, selectedId,
  interactive = true, hint = true, className, children,
  onStamp, onMoveStamp, onSelect, onUpdateStamp, onGhostResize, wheelTargetRef, ghostZoneRef,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // 幽灵章位置放 ref：指针每move一次只安排一次 rAF 重绘，不触发 React 重渲染
  const ghostRef = useRef<{ x: number; y: number } | null>(null);
  // 只有「指针进入/离开持章区」这种低频变化才走 React
  const [ghostOn, setGhostOn] = useState(false);
  const ghostOnRef = useRef(false);
  const setGhostPresence = useCallback((on: boolean) => {
    ghostOnRef.current = on;
    setGhostOn(on);
  }, []);
  const [sizeFlash, setSizeFlash] = useState(false);
  const flashTimer = useRef(0);
  const flashSize = useCallback(() => {
    setSizeFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSizeFlash(false), 1100);
  }, []);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; w: number; h: number }>>([]);
  const rippleSeq = useRef(0);
  const dragRef = useRef<null | {
    kind: "move" | "rotate" | "scale";
    id: string;
    grabLX: number; // 抓取点在章局部坐标（未旋转，pt）
    grabLY: number;
    startMult: number;
    startRotation: number;
    startDist: number;
    startPointerAngle: number;
  } | null>(null);
  const rafRef = useRef(0);
  const stateRef = useRef({ stamps, active, mult, mode, selectedId, pageW, pageH });
  stateRef.current = { stamps, active, mult, mode, selectedId, pageW, pageH };

  const pxPerPt = useCallback(() => {
    const el = wrapRef.current;
    return el ? el.clientWidth / pageW : 1;
  }, [pageW]);

  /** 章心位置修正：整枚章（含旋转后的外接框）必须完整留在纸里 */
  const keptInside = useCallback(
    (cx: number, cy: number, boundsW: number, boundsH: number) => {
      const hw = Math.min(boundsW / 2, pageW / 2);
      const hh = Math.min(boundsH / 2, pageH / 2);
      return {
        x: Math.min(Math.max(cx, hw), pageW - hw),
        y: Math.min(Math.max(cy, hh), pageH - hh),
      };
    },
    [pageW, pageH],
  );

  // ---------- 绘制 ----------
  const drawBase = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const p = pxPerPt();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * p, 0, 0, dpr * p, 0, 0);
    const s = stateRef.current;
    const ppp = p * dpr;

    // 已盖的章
    for (const st of s.stamps) {
      const { canvas: layer, ppp: q } = st.image
        ? getCustomImageLayer(st.image.imageId, st.mult, ppp)
        : getLayer(st.text, st.design, st.mult, ppp);
      ctx.save();
      ctx.translate(st.relX * s.pageW, st.relY * s.pageH);
      ctx.rotate((-st.rotation * Math.PI) / 180);
      const w = layer.width / q, h = layer.height / q;
      ctx.drawImage(layer, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // 选中框 + 手柄
    const sel = s.stamps.find((x) => x.id === s.selectedId);
    if (sel && s.mode === "select") {
      const size = stampSpecSize(sel);
      const w = size.w * sel.mult, h = size.h * sel.mult;
      const px = 1 / ppp; // 1 设备像素
      ctx.save();
      ctx.translate(sel.relX * s.pageW, sel.relY * s.pageH);
      ctx.rotate((-sel.rotation * Math.PI) / 180);
      ctx.strokeStyle = "#C93329";
      ctx.lineWidth = 1.2 * px;
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
      ctx.setLineDash([]);
      // 旋转手柄（上方）
      const hy = -h / 2 - 3 - 16 * px;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2 - 3);
      ctx.lineTo(0, hy + 4.5 * px);
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, hy, 4.5 * px, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
      // 缩放手柄（右下角）
      ctx.beginPath();
      ctx.arc(w / 2 + 3, h / 2 + 3, 4.5 * px, 0, Math.PI * 2);
      ctx.fillStyle = "#C93329";
      ctx.fill();
      ctx.restore();
    }

  }, [keptInside, pxPerPt]);

  // 幽灵章层：指针移动时只重绘这一层（一张小位图 + 一次 transform 写入）
  const drawGhost = useCallback(() => {
    const canvas = ghostCanvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const p = pxPerPt();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const bw = Math.round(wrap.clientWidth * dpr), bh = Math.round(wrap.clientHeight * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * p, 0, 0, dpr * p, 0, 0);
    const s = stateRef.current;
    const ppp = p * dpr;
    const ghost = ghostRef.current;
    const tip = tipRef.current;
    if (tip) {
      if (!s.active || !ghost || s.mode !== "stamp") {
        tip.style.opacity = "0";
      } else {
        const b = stampSpecBounds({ ...s.active, rotation: s.active.image ? 0 : (s.active.design?.rotation ?? 0) });
        const c = keptInside(ghost.x, ghost.y, b.w * s.mult, b.h * s.mult);
        const below = c.y < s.pageH * 0.62; // 章在纸上半部时，提示放下面
        const p = pxPerPt();
        const tipX = c.x * p;
        const tipY = (c.y + (b.h * s.mult) / 2) * p + (below ? 12 : -12);
        tip.style.transform = `translate3d(${tipX.toFixed(1)}px, ${tipY.toFixed(1)}px, 0) translate(-50%, ${below ? "0" : "-100%"})`;
        tip.style.opacity = "1";
      }
    }
    if (s.active && ghost && s.mode === "stamp") {
      const bounds = stampSpecBounds({ ...s.active, rotation: s.active.image ? 0 : (s.active.design?.rotation ?? 0) });
      const target = keptInside(ghost.x, ghost.y, bounds.w * s.mult, bounds.h * s.mult);
      const { canvas: layer, ppp: q } = s.active.image
        ? getCustomImageLayer(s.active.image.imageId, s.mult, ppp)
        : getLayer(s.active.text!, s.active.design!, s.mult, ppp);
      ctx.save();
      ctx.globalAlpha = 0.82;
      drawLayerAt(ctx, layer, target.x, target.y, q);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "rgba(201,51,41,0.9)";
      ctx.beginPath();
      ctx.arc(target.x, target.y, 1.6 / ppp, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, [keptInside, pxPerPt]);

  const draw = useCallback(() => {
    drawBase();
    drawGhost();
  }, [drawBase, drawGhost]);

  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  const ghostRafRef = useRef(0);
  const scheduleGhost = useCallback(() => {
    if (ghostRafRef.current) return;
    ghostRafRef.current = requestAnimationFrame(() => {
      ghostRafRef.current = 0;
      drawGhost();
    });
  }, [drawGhost]);

  useLayoutEffect(() => {
    schedule();
  }, [stamps, active, mult, mode, selectedId, schedule]);

  /** 幽灵章位置更新：只写 ref + 安排 rAF 重绘，零 React 开销 */
  const updateGhost = useCallback(
    (pt: { x: number; y: number } | null) => {
      ghostRef.current = pt;
      if (pt && !ghostOnRef.current) setGhostPresence(true);
      if (!pt && ghostOnRef.current) setGhostPresence(false);
      scheduleGhost();
    },
    [scheduleGhost, setGhostPresence],
  );

  useEffect(() => {
    const ro = new ResizeObserver(schedule);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [schedule]);

  // ---------- 交互 ----------
  const toPt = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = wrapRef.current!.getBoundingClientRect();
      const p = pxPerPt();
      return { x: (e.clientX - rect.left) / p, y: (e.clientY - rect.top) / p };
    },
    [pxPerPt],
  );

  const hitStamp = useCallback(
    (pt: { x: number; y: number }): StampInstance | null => {
      const p = pxPerPt();
      const slop = 4 / p;
      for (let i = stamps.length - 1; i >= 0; i--) {
        const st = stamps[i];
        const size = stampSpecSize(st);
        const w = size.w * st.mult + slop, h = size.h * st.mult + slop;
        const dx = pt.x - st.relX * pageW, dy = pt.y - st.relY * pageH;
        const a = (st.rotation * Math.PI) / 180;
        const lx = dx * Math.cos(a) + dy * Math.sin(a);
        const ly = -dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return st;
      }
      return null;
    },
    [stamps, pageW, pageH, pxPerPt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      const pt = toPt(e);
      const d = dragRef.current;
      if (d) {
        const st = stamps.find((x) => x.id === d.id);
        if (!st) return;
        const a = (st.rotation * Math.PI) / 180;
        if (d.kind === "move") {
          // 局部抓取偏移旋回世界坐标，指针位置减去偏移 = 新章心
          const wx = d.grabLX * Math.cos(a) - d.grabLY * Math.sin(a);
          const wy = d.grabLX * Math.sin(a) + d.grabLY * Math.cos(a);
          const nx = pt.x - wx, ny = pt.y - wy;
          const bounds = stampSpecBounds({ ...st });
          const c = keptInside(nx, ny, bounds.w, bounds.h);
          onMoveStamp?.(d.id, c.x / pageW, c.y / pageH);
        } else if (d.kind === "scale") {
          const cx = st.relX * pageW, cy = st.relY * pageH;
          const dist = Math.hypot(pt.x - cx, pt.y - cy);
          const next = Math.min(2.5, Math.max(0.6, d.startMult * (dist / Math.max(d.startDist, 8))));
          onUpdateStamp?.(d.id, { mult: Math.round(next * 100) / 100 });
        } else {
          const cx = st.relX * pageW, cy = st.relY * pageH;
          const ang = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI;
          let rot = d.startRotation - (ang - d.startPointerAngle);
          if (e.shiftKey) rot = Math.round(rot / 15) * 15;
          onUpdateStamp?.(d.id, { rotation: Math.round(rot) });
        }
        return;
      }
      updateGhost(pt);
      if (mode === "select") {
        const hit = hitStamp(pt);
        wrapRef.current!.style.cursor = hit ? "grab" : "default";
      }
    },
    [interactive, toPt, stamps, mode, hitStamp, keptInside, onMoveStamp, onUpdateStamp, pageW, pageH, updateGhost],
  );

  /** 在 pt 坐标处落章（含贴边修正、涟漪）。纸内与桌面持章区共用。 */
  const stampAtPt = useCallback(
    (pt: { x: number; y: number }) => {
      if (!active) return;
      const bounds = stampSpecBounds({ ...active, rotation: active.image ? 0 : (active.design?.rotation ?? 0) });
      const c = keptInside(pt.x, pt.y, bounds.w * mult, bounds.h * mult);
      onStamp?.(c.x / pageW, c.y / pageH);
      const size = stampSpecSize(active);
      rippleSeq.current += 1;
      const rid = rippleSeq.current;
      setRipples((r) => [...r.slice(-5), { id: rid, x: c.x, y: c.y, w: size.w * mult, h: size.h * mult }]);
    },
    [active, mult, keptInside, onStamp, pageW, pageH],
  );
  const stampAtPtRef = useRef(stampAtPt);
  stampAtPtRef.current = stampAtPt;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || e.button !== 0) return;
      const pt = toPt(e);
      if (mode === "stamp") {
        if (!active) return;
        stampAtPt(pt);
        return;
      }
      // select 模式：手柄优先，再试章本体
      const sel = stamps.find((x) => x.id === selectedId);
      if (sel) {
        const size = stampSize(sel.text, sel.design);
        const w = size.w * sel.mult, h = size.h * sel.mult;
        const dx = pt.x - sel.relX * pageW, dy = pt.y - sel.relY * pageH;
        const a = (sel.rotation * Math.PI) / 180;
        const lx = dx * Math.cos(a) + dy * Math.sin(a);
        const ly = -dx * Math.sin(a) + dy * Math.cos(a);
        const handleR = 12 / pxPerPt();
        const rotHandleY = -h / 2 - 3 - 16 / pxPerPt();
        if (Math.hypot(lx, ly - rotHandleY) <= handleR) {
          dragRef.current = {
            kind: "rotate", id: sel.id, grabLX: 0, grabLY: 0,
            startMult: sel.mult, startRotation: sel.rotation, startDist: 0,
            startPointerAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
          };
          wrapRef.current!.setPointerCapture(e.pointerId);
          return;
        }
        if (Math.hypot(lx - (w / 2 + 3), ly - (h / 2 + 3)) <= handleR) {
          dragRef.current = {
            kind: "scale", id: sel.id, grabLX: 0, grabLY: 0,
            startMult: sel.mult, startRotation: sel.rotation,
            startDist: Math.max(Math.hypot(dx, dy), 8), startPointerAngle: 0,
          };
          wrapRef.current!.setPointerCapture(e.pointerId);
          return;
        }
      }
      const hit = hitStamp(pt);
      if (hit) {
        onSelect?.(hit.id);
        const a = (hit.rotation * Math.PI) / 180;
        const dx = pt.x - hit.relX * pageW, dy = pt.y - hit.relY * pageH;
        dragRef.current = {
          kind: "move", id: hit.id,
          grabLX: dx * Math.cos(a) + dy * Math.sin(a),
          grabLY: -dx * Math.sin(a) + dy * Math.cos(a),
          startMult: hit.mult, startRotation: hit.rotation, startDist: 0, startPointerAngle: 0,
        };
        wrapRef.current!.setPointerCapture(e.pointerId);
        wrapRef.current!.style.cursor = "grabbing";
      } else {
        onSelect?.(null);
      }
    },
    [interactive, mode, stampAtPt, stamps, selectedId, hitStamp, onSelect, pageW, pageH, pxPerPt, toPt],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        wrapRef.current?.releasePointerCapture(e.pointerId);
      } catch { /* ignore */ }
      wrapRef.current!.style.cursor = mode === "stamp" ? "none" : "default";
    },
    [mode],
  );

  const onPointerLeave = useCallback(() => updateGhost(null), [updateGhost]);

  // 滚轮调大小：盖章模式调「手中的章」，选择模式调「选中的章」。
  // 响应区默认是纸张本身；编辑器传入 wheelTargetRef 时扩大到整个桌面。
  useEffect(() => {
    const zone = wheelTargetRef?.current ?? wrapRef.current;
    if (!zone || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // 归一化：Firefox 按行、老浏览器按页；横向滚轮（deltaY 为 0）也认
      const raw =
        (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY) || e.deltaX;
      // 指数缩放手感顺滑；单次事件限制在 ±15% 内，触控板小步长也能细调
      const f = Math.min(1.15, Math.max(0.85, Math.exp(-raw * 0.0016)));
      if (mode === "select" && selectedId) {
        const st = stamps.find((x) => x.id === selectedId);
        if (!st) return;
        const next = Math.min(2.5, Math.max(0.6, st.mult * f));
        if (next !== st.mult) {
          flashSize();
          onUpdateStamp?.(selectedId, { mult: Math.round(next * 100) / 100 });
        }
      } else {
        const next = Math.min(2.5, Math.max(0.6, mult * f));
        if (Math.abs(next - mult) > 0.0005) {
          flashSize();
          onGhostResize?.(next);
        }
      }
    };
    zone.addEventListener("wheel", onWheel, { passive: false });
    return () => zone.removeEventListener("wheel", onWheel);
  }, [interactive, mode, selectedId, stamps, mult, onUpdateStamp, onGhostResize, wheelTargetRef, flashSize]);

  // 持章区：章在整个区域里跟手（位置贴边约束在纸内），点桌面空白处也落章。
  // 纸内的指针事件仍由组件自身的 React handler 处理，这里只补纸外的部分。
  useEffect(() => {
    const zone = ghostZoneRef?.current;
    const wrap = wrapRef.current;
    if (!zone || !wrap || !interactive || zone === wrap) return;
    const toPt = (e: { clientX: number; clientY: number }) => {
      const rect = wrap.getBoundingClientRect();
      const p = pxPerPt();
      return { x: (e.clientX - rect.left) / p, y: (e.clientY - rect.top) / p };
    };
    const onMove = (e: PointerEvent) => updateGhost(toPt(e));
    const onLeave = () => updateGhost(null);
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (modeRef.current !== "stamp") return;
      if (wrap.contains(e.target as Node)) return; // 纸内交给组件自身处理
      if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
      const pt = toPt(e);
      stampAtPtRef.current(pt);
    };
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerleave", onLeave);
    zone.addEventListener("pointerdown", onDown);
    return () => {
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
      zone.removeEventListener("pointerdown", onDown);
    };
  }, [ghostZoneRef, interactive, pxPerPt, updateGhost]);

  return (
    <div
      ref={wrapRef}
      className={cn("relative select-none overflow-hidden rounded-[4px] bg-white shadow-paper", className)}
      style={{ aspectRatio: `${pageW} / ${pageH}`, cursor: mode === "stamp" ? "none" : undefined }}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={onPointerLeave}
    >
      {children}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas ref={ghostCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* 大小提示徽章：指针不在持章区时滚轮的可见反馈（仅在缩放后 1 秒内出现） */}
      {interactive && sizeFlash && mode === "stamp" && !ghostOn && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <div className="tnum rounded-full bg-ink/90 px-3 py-1.5 text-xs font-medium leading-none text-paper-50">
            大小 {Math.round(mult * 100)}%
          </div>
        </div>
      )}
      {/* 涟漪 */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none absolute rounded-[12px] border-2 border-cinnabar/60 animate-ripple"
          style={{
            left: `${(r.x / pageW) * 100}%`,
            top: `${(r.y / pageH) * 100}%`,
            width: `${(r.w / pageW) * 100}%`,
            height: `${(r.h / pageH) * 100}%`,
            transform: "translate(-50%,-50%)",
            borderRadius: Math.max(12, (r.h / pageH) * 300),
          }}
          onAnimationEnd={() => setRipples((list) => list.filter((x) => x.id !== r.id))}
        />
      ))}
      {/* 跟手提示条：位置由 draw() 用 transform3d 直接驱动（纯合成层更新，无重排无模糊） */}
      {hint && interactive && (
        <div
          ref={tipRef}
          className={cn(
            "pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap opacity-0 transition-opacity duration-150",
            !(ghostOn && mode === "stamp" && active) && "invisible",
          )}
          aria-hidden="true"
        >
          <div className="flex items-center gap-1.5 rounded-full bg-ink/90 px-2.5 py-1 text-[11px] leading-none text-paper-50">
            {sizeFlash ? (
              <>
                <span className="opacity-70">大小</span>
                <span className="tnum font-semibold">{Math.round(mult * 100)}%</span>
              </>
            ) : (
              <>
                <MouseIcon />
                <span>滚轮调大小 · 点击盖章</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MouseIcon() {
  return (
    <svg width="11" height="14" viewBox="0 0 12 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="10" height="14" rx="5" stroke="currentColor" strokeOpacity=".7" />
      <path d="M6 4v3" stroke="currentColor" strokeOpacity=".9" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
