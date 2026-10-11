// 编辑器工作台：左边是纸，右边是印台（内容 / 设计 / 模板 / 记录）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Download, Lock, Minus, MousePointer2,
  CopyPlus, Plus, Redo2, SlidersHorizontal, Stamp as StampIcon, Trash2, Undo2, Upload, Volume2, VolumeX, Sparkles, History, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/lib/ui/badge";
import { Button } from "@/lib/ui/button";
import { Input } from "@/lib/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/lib/ui/select";
import { Separator } from "@/lib/ui/separator";
import { Slider } from "@/lib/ui/slider";
import { Switch } from "@/lib/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/lib/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/lib/ui/toggle-group";
import { TooltipProvider } from "@/lib/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/lib/ui/dialog";
import { Mascot } from "@/components/Mascot";
import { StampSurface, type StampInstance } from "@/components/StampSurface";
import { StampThumb } from "@/components/StampThumb";
import { ensureStampFonts, stampSize } from "@/lib/stamp/engine";
import { processStampUpload, getCustomImage, removeCustomImage } from "@/lib/stamp/customImages";
import {
  BORDER_LABELS, COLOR_LABELS, FONT_LABELS, SEAL_STYLE_LABELS, SHAPE_LABELS, STAMP_COLORS,
  TEXTURE_LABELS, type StampBorder, type StampColor, type StampFont, type StampShape, type StampText,
} from "@/lib/stamp/types";
import {
  editorStampFromTemplate, makeStampID, stampTextOf, TEMPLATES,
  type EditorStamp, type Statement,
} from "@/lib/stamp/templates";
import {
  downloadBytes, exportStampedPdf, exportStampedPdfRasterized, loadPdf, PasswordRequiredError,
  renderPageToCanvas, stampedFileName, type LoadedPdf, type PageScope, type PlacedStampLike,
} from "@/lib/pdf";
import { canvasToBlob, renderStampsOnImage } from "@/lib/export-image";
import { playStampSound, setMuted } from "@/lib/sound";
import { cn, formatBytes } from "@/lib/utils";
import { PDFDocument } from "pdf-lib";

export interface EditorDoc {
  file: File;
  kind: "pdf" | "image";
}

interface HistoryEntry {
  id: string;
  time: Date;
  page: number;
  templateName: string;
  file: string;
}

export function Editor({ doc, onBack, initialTemplateKey }: { doc: EditorDoc; onBack: () => void; initialTemplateKey?: string | null }) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pwDialog, setPwDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingBytes, setPendingBytes] = useState<ArrayBuffer | null>(null);

  const [pagesStamps, setPagesStamps] = useState<Record<number, StampInstance[]>>({});
  const [editorStamp, setEditorStamp] = useState<EditorStamp>(() =>
    editorStampFromTemplate(
      TEMPLATES.find((t) => t.key === initialTemplateKey) ?? TEMPLATES[0],
      { recipient: "招商银行", purpose: "办理开户" },
    ),
  );
  const [mult, setMult] = useState(1);
  const [mode, setMode] = useState<"stamp" | "select">("stamp");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<PageScope>("current");
  const [exporting, setExporting] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [fontTick, setFontTick] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  // 自定义印章（上传的图片章）：id 列表 + 当前手持的自定义章
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [activeCustomId, setActiveCustomId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pristineBytes = useRef<ArrayBuffer | null>(null); // pdf.js 会转移 buffer，给 pdf-lib 留一份
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  const stamps = pagesStamps[page] ?? [];
  const numPages = pdf?.numPages ?? 1;

  // 页面 pt 尺寸
  const pageSize = useMemo(() => {
    if (pdf) return pdf.pageSize;
    if (bitmap) return { w: 595, h: 595 * (bitmap.height / bitmap.width) };
    return { w: 595, h: 842 };
  }, [pdf, bitmap]);

  const fileIsPdf = doc.kind === "pdf";

  // ---------- 载入 ----------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPagesStamps({});
    setPage(1);
    (async () => {
      try {
        await ensureStampFonts();
        if (doc.kind === "image") {
          const bmp = await createImageBitmap(doc.file);
          if (!cancelled) {
            setBitmap(bmp);
            setPdf(null);
          }
        } else {
          const bytes = await doc.file.arrayBuffer();
          pristineBytes.current = bytes.slice(0);
          try {
            const loaded = await loadPdf(bytes);
            if (!cancelled) {
              setPdf(loaded);
              setBitmap(null);
            }
          } catch (e) {
            if (e instanceof PasswordRequiredError) {
              if (!cancelled) {
                setPendingBytes(bytes.slice(0));
                setPwDialog(true);
              }
              return;
            }
            throw e;
          }
        }
        if (!cancelled) setFontTick((t) => t + 1);
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error("文件打不开", { description: String((e as Error)?.message ?? e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const submitPassword = useCallback(async () => {
    if (!pendingBytes) return;
    setLoading(true);
    setPwDialog(false);
    try {
      const loaded = await loadPdf(pendingBytes, password || undefined);
      setPdf(loaded);
      setBitmap(null);
      setFontTick((t) => t + 1);
    } catch (e) {
      if (e instanceof PasswordRequiredError) {
        setPwDialog(true);
        toast.error("密码不对，再试一次");
        return;
      }
      toast.error("文件打不开", { description: String((e as Error)?.message ?? e) });
    } finally {
      setLoading(false);
      setPendingBytes(null);
    }
  }, [pendingBytes, password]);

  // ---------- 自适应缩放 ----------
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const compute = () => {
      const availW = el.clientWidth - 48;
      const availH = el.clientHeight - 48;
      const s = Math.min(availW / pageSize.w, availH / pageSize.h, 1.8);
      setFitScale(Math.max(s, 0.2));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageSize]);

  // ---------- 渲染当前页 ----------
  useEffect(() => {
    let stale = false;
    (async () => {
      const canvas = pageCanvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      try {
        if (pdf) {
          if (stale) return;
          await renderPageToCanvas(pdf, page, canvas, fitScale * dpr);
        } else if (bitmap) {
          canvas.width = Math.round(pageSize.w * fitScale * dpr);
          canvas.height = Math.round(pageSize.h * fitScale * dpr);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
      } catch (e) {
        if (!stale) console.error(e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [pdf, bitmap, page, fitScale, pageSize]);

  // ---------- 落章 / 编辑 ----------
  const active = useMemo<StampTextPlus>(() => {
    if (activeCustomId) {
      const ci = getCustomImage(activeCustomId);
      if (ci) return { image: { imageId: ci.id, w: ci.boxW, h: ci.boxH } };
    }
    const id = makeStampID();
    return { text: stampTextOf(editorStamp.statement, editorStamp.design, id), design: editorStamp.design };
    // fontTick：Web 字体就绪后重排一次
  }, [editorStamp, fontTick, activeCustomId]);

  const handleStamp = useCallback(
    (relX: number, relY: number) => {
      const stampID = makeStampID();
      const custom = activeCustomId ? getCustomImage(activeCustomId) : null;
      const inst: StampInstance = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        stampID,
        relX, relY,
        mult,
        rotation: custom ? 0 : editorStamp.design.rotation,
        text: stampTextOf(editorStamp.statement, editorStamp.design, stampID),
        design: { ...editorStamp.design },
        ...(custom ? { image: { imageId: custom.id, w: custom.boxW, h: custom.boxH } } : {}),
      };
      setPagesStamps((m) => ({ ...m, [page]: [...(m[page] ?? []), inst] }));
      setHistory((h) => [{ id: stampID, time: new Date(), page, templateName: custom ? `${custom.name}（自定义）` : editorStamp.design.name, file: doc.file.name }, ...h].slice(0, 60));
      playStampSound();
      toast(`No.${stampID}`, {
        description: `${editorStamp.design.name} · 第 ${page} 页`,
        duration: 1800,
      });
    },
    [editorStamp, mult, page, doc.file.name, activeCustomId],
  );

  const moveStamp = useCallback(
    (id: string, relX: number, relY: number) => {
      setPagesStamps((m) => ({ ...m, [page]: (m[page] ?? []).map((s) => (s.id === id ? { ...s, relX, relY } : s)) }));
    },
    [page],
  );

  const updateStamp = useCallback(
    (id: string, patch: Partial<Pick<StampInstance, "mult" | "rotation">>) => {
      setPagesStamps((m) => ({ ...m, [page]: (m[page] ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
    },
    [page],
  );

  const deleteStamp = useCallback(
    (id: string) => {
      setPagesStamps((m) => ({ ...m, [page]: (m[page] ?? []).filter((s) => s.id !== id) }));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [page],
  );

  /** 把当前页的章复制到全部页面（其它页已有的章会被替换） */
  const copyToAllPages = useCallback(() => {
    const cur = pagesStamps[page] ?? [];
    if (!cur.length) {
      toast.error("这一页还没有章");
      return;
    }
    if (numPages < 2) return;
    setPagesStamps((m) => {
      const next = { ...m };
      for (let pno = 1; pno <= numPages; pno++) {
        if (pno === page) continue;
        next[pno] = cur.map((s, i) => ({ ...s, id: `${s.id}-c${pno}-${i}` }));
      }
      return next;
    });
    toast.success(`已复制到全部页面`, { description: `当前页的 ${cur.length} 枚章已盖到其余 ${numPages - 1} 页（可再单独调整）` });
  }, [pagesStamps, page, numPages]);

  const uploadCustomStamp = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const ci = await processStampUpload(file);
        setCustomIds((ids) => (ids.includes(ci.id) ? ids : [...ids, ci.id]));
        setActiveCustomId(ci.id); // 传完直接拿在手里
        toast.success("印章已就位", { description: `${ci.name} · 显示约 ${ci.boxW.toFixed(0)}×${ci.boxH.toFixed(0)}mm，滚轮可调` });
      } catch (e) {
        toast.error("图片读不出来", { description: String((e as Error)?.message ?? e) });
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const removeCustomStamp = useCallback(
    (id: string) => {
      removeCustomImage(id);
      setCustomIds((ids) => ids.filter((x) => x !== id));
      setActiveCustomId((cur) => (cur === id ? null : cur));
      // 同时清掉页面上已盖的该印章
      setPagesStamps((m) => {
        const next: Record<number, StampInstance[]> = {};
        for (const [pno, list] of Object.entries(m)) {
          next[Number(pno)] = list.filter((x) => x.image?.imageId !== id);
        }
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setPagesStamps((m) => ({ ...m, [page]: (m[page] ?? []).slice(0, -1) }));
    setSelectedId(null);
  }, [page]);
  const clearPage = useCallback(() => {
    setPagesStamps((m) => ({ ...m, [page]: [] }));
    setSelectedId(null);
  }, [page]);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (selectedId) setSelectedId(null);
        else setMode("stamp");
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteStamp(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "PageDown" && page < numPages) {
        setPage((p) => p + 1);
      } else if (e.key === "PageUp" && page > 1) {
        setPage((p) => p - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteStamp, undo, page, numPages]);

  // ---------- 导出 ----------
  const exportFile = useCallback(async () => {
    const currentStamps = pagesStamps[page] ?? [];
    if (!currentStamps.length) {
      toast.error("这一页还没有章", { description: "先在纸上盖几枚，再来导出。" });
      return;
    }
    // 每页各自的章（含「复制到全部页面」得到的副本）
    const pagesMap = new Map<number, PlacedStampLike[]>();
    for (const [pno, list] of Object.entries(pagesStamps)) {
      if (!list.length) continue;
      pagesMap.set(Number(pno), list);
    }
    setExporting(true);
    try {
      const exportStamps = scope === "each"
        ? [...pagesMap.values()].flat()
        : currentStamps;
      if (doc.kind === "image" && bitmap) {
        const canvas = renderStampsOnImage(bitmap, exportStamps);
        const blob = await canvasToBlob(canvas, "image/png");
        downloadBytes(await blob.arrayBuffer(), stampedFileName(doc.file.name, "png"), "image/png");
        toast.success("副本已下载", { description: stampedFileName(doc.file.name, "png") });
        return;
      }
      if (!pristineBytes.current) throw new Error("原始文件不见了");
      const opts = { pageScope: scope, currentPage: page, numPages };
      // 能用 pdf-lib 就无损覆盖；加密的 PDF 走栅格化
      let lossless = true;
      try {
        await PDFDocument.load(pristineBytes.current);
      } catch {
        lossless = false;
      }
      const out = lossless
        ? await exportStampedPdf(pristineBytes.current, pagesMap, opts)
        : await exportStampedPdfRasterized(
            { doc: pdf!.doc, numPages, pageSize } as LoadedPdf,
            pagesMap,
            opts,
          );
      downloadBytes(out, stampedFileName(doc.file.name, "pdf"), "application/pdf");
      toast.success("副本已下载", {
        description: `${stampedFileName(doc.file.name, "pdf")}${lossless ? "" : " · 加密 PDF，已栅格化导出"}`,
      });
    } catch (e) {
      console.error(e);
      toast.error("导出失败", { description: String((e as Error)?.message ?? e) });
    } finally {
      setExporting(false);
    }
  }, [pagesStamps, page, doc, bitmap, scope, numPages, pdf, pageSize]);

  const scopeLabel: Record<PageScope, string> = {
    current: "仅当前页",
    each: "各页各自的章",
    all: "每一页同位置",
    first: "仅第一页",
    last: "仅最后一页",
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col overflow-hidden bg-desk desk-grain">
        {/* 顶栏 */}
        <TopBar
          doc={doc}
          onBack={onBack}
          page={page}
          numPages={numPages}
          setPage={setPage}
          mode={mode}
          setMode={(m) => {
            setMode(m);
            if (m === "stamp") setSelectedId(null);
          }}
          mult={mult}
          setMult={setMult}
          undo={undo}
          clearPage={clearPage}
          canUndo={stamps.length > 0}
          selectedId={selectedId}
          onDeleteSelected={() => selectedId && deleteStamp(selectedId)}
          muted={muted}
          onToggleMute={() => {
            const v = !muted;
            setMutedState(v);
            setMuted(v);
          }}
          scope={scope}
          setScope={setScope}
          scopeLabel={scopeLabel}
          isPdf={fileIsPdf}
          exporting={exporting}
          onExport={exportFile}
          stampCount={stamps.length}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onCopyToAllPages={copyToAllPages}
        />

        <div className="flex min-h-0 flex-1">
          {/* 纸张区 */}
          <div ref={deskRef} className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
            {loading ? (
              <div className="flex flex-col items-center gap-4 text-muted-foreground">
                <div className="animate-float">
                  <Mascot mood="expectant" size={56} />
                </div>
                <p className="text-sm">正在打开文件…</p>
              </div>
            ) : (
              <div style={{ width: pageSize.w * fitScale, maxWidth: "100%" }}>
                <StampSurface
                  pageW={pageSize.w}
                  pageH={pageSize.h}
                  stamps={stamps}
                  active={active}
                  mult={mult}
                  mode={mode}
                  selectedId={selectedId}
                  onStamp={handleStamp}
                  onMoveStamp={moveStamp}
                  onSelect={setSelectedId}
                  onUpdateStamp={updateStamp}
                  onGhostResize={setMult}
                  wheelTargetRef={deskRef}
                  ghostZoneRef={deskRef}
                >
                  <canvas ref={pageCanvasRef} className="block h-auto w-full" />
                </StampSurface>
              </div>
            )}

            {/* 页码浮标 */}
            {!loading && numPages > 1 && (
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/70 bg-card px-1.5 py-1 shadow-pop">
                <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft /></PageBtn>
                <span className="tnum px-2 text-xs text-muted-foreground">
                  第 <span className="font-semibold text-foreground">{page}</span> / {numPages} 页
                </span>
                <PageBtn disabled={page >= numPages} onClick={() => setPage((p) => Math.min(numPages, p + 1))}><ChevronRight /></PageBtn>
              </div>
            )}
          </div>

          {/* 印台面板 */}
          <aside
            aria-hidden={!panelOpen}
            className={cn(
              "fixed inset-x-0 bottom-0 top-14 z-30 flex flex-col border-t border-border/70 bg-card transition-transform duration-300 ease-out",
              "lg:static lg:top-auto lg:w-[340px] lg:shrink-0 lg:border-t-0 lg:border-l lg:bg-card/70 lg:transition-none",
              panelOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0",
            )}
          >
            <StampPanel
              editorStamp={editorStamp}
              setEditorStamp={setEditorStamp}
              history={history}
              onClearHistory={() => setHistory([])}
              fileName={doc.file.name}
              fileSize={doc.file.size}
              customIds={customIds}
              activeCustomId={activeCustomId}
              onSelectCustom={(id) => setActiveCustomId((cur) => (cur === id ? null : id))}
              onUploadCustom={uploadCustomStamp}
              onRemoveCustom={removeCustomStamp}
              uploading={uploading}
            />
          </aside>
        </div>

        {/* 密码对话框 */}
        <Dialog open={pwDialog} onOpenChange={(open) => { if (!open) onBack(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                这个 PDF 加了密码
              </DialogTitle>
              <DialogDescription>输入一次密码就能盖章，副本会用同一密码加密，密码不会被保存。</DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              autoFocus
              placeholder="PDF 密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitPassword()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onBack}>算了</Button>
              <Button onClick={() => void submitPassword()}>解锁并打开</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

type StampTextPlus = { text?: StampText; design?: EditorStamp["design"]; image?: { imageId: string; w: number; h: number } };

function PageBtn({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4"
    >
      {children}
    </button>
  );
}

// ---------- 顶栏 ----------

interface TopBarProps {
  doc: EditorDoc;
  onBack: () => void;
  page: number;
  numPages: number;
  setPage: (fn: (p: number) => number) => void;
  mode: "stamp" | "select";
  setMode: (m: "stamp" | "select") => void;
  mult: number;
  setMult: (fn: (m: number) => number) => void;
  undo: () => void;
  clearPage: () => void;
  canUndo: boolean;
  selectedId: string | null;
  onDeleteSelected: () => void;
  muted: boolean;
  onToggleMute: () => void;
  scope: PageScope;
  setScope: (s: PageScope) => void;
  scopeLabel: Record<PageScope, string>;
  isPdf: boolean;
  exporting: boolean;
  onExport: () => void;
  stampCount: number;
  onTogglePanel: () => void;
  onCopyToAllPages: () => void;
}

function TopBar(p: TopBarProps) {
  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-card px-3 md:px-4">
      <Button variant="ghost" size="icon" onClick={p.onBack} aria-label="返回首页">
        <ArrowLeft />
      </Button>
      <div className="mr-2 min-w-0">
        <div className="truncate text-[13px] font-medium leading-tight">{p.doc.file.name}</div>
        <div className="text-[11px] leading-tight text-muted-foreground">
          {formatBytes(p.doc.file.size)} · 已盖 <span className="tnum font-medium text-foreground">{p.stampCount}</span> 枚
        </div>
      </div>

      <Separator orientation="vertical" className="mx-1 !h-7" />

      {/* 模式 */}
      <ToggleGroup
        type="single"
        value={p.mode}
        onValueChange={(v) => v && p.setMode(v as "stamp" | "select")}
        aria-label="切换盖章 / 选择模式"
      >
        <ToggleGroupItem value="stamp" aria-label="盖章模式" title="盖章模式（S）">
          <StampIcon className="!h-3.5 !w-3.5" />
          <span className="hidden sm:inline">盖章</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="select" aria-label="选择模式" title="选择模式（V）">
          <MousePointer2 className="!h-3.5 !w-3.5" />
          <span className="hidden sm:inline">选择</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 !h-7" />

      {/* 大小 */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="小一点" onClick={() => p.setMult((m) => Math.max(0.6, m - 0.1))}>
          <Minus className="!h-4 !w-4" />
        </Button>
        <span className="tnum w-11 text-center text-xs text-muted-foreground">{Math.round(p.mult * 100)}%</span>
        <Button variant="ghost" size="icon-sm" aria-label="大一点" onClick={() => p.setMult((m) => Math.min(2.5, m + 0.1))}>
          <Plus className="!h-4 !w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-1 !h-7" />

      {p.isPdf && p.numPages > 1 && (
        <Button variant="ghost" size="sm" onClick={p.onCopyToAllPages} disabled={!p.canUndo} title="把当前页的章复制到全部页面">
          <CopyPlus className="!h-4 !w-4" />
          <span className="hidden xl:inline">复制到全部页</span>
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="撤销" onClick={p.undo} disabled={!p.canUndo}>
        <Undo2 />
      </Button>
      <Button variant="ghost" size="icon" aria-label="清空这一页" onClick={p.clearPage} disabled={!p.canUndo}>
        <Trash2 />
      </Button>
      {p.selectedId && (
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={p.onDeleteSelected}>
          <Trash2 className="!h-3.5 !w-3.5" />
          <span className="hidden sm:inline">删除选中</span>
        </Button>
      )}

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="lg:hidden" onClick={p.onTogglePanel}>
        <SlidersHorizontal className="!h-4 !w-4" />
        印台
      </Button>
      <Button variant="ghost" size="icon" aria-label={p.muted ? "开启音效" : "关闭音效"} onClick={p.onToggleMute}>
        {p.muted ? <VolumeX /> : <Volume2 />}
      </Button>

      {p.isPdf && (
        <Select value={p.scope} onValueChange={(v) => p.setScope(v as PageScope)}>
          <SelectTrigger className="h-9 w-[132px] text-xs" aria-label="盖章范围">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(p.scopeLabel) as PageScope[]).map((k) => (
              <SelectItem key={k} value={k}>{p.scopeLabel[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button onClick={p.onExport} disabled={p.exporting} className="rounded-full px-4">
        {p.exporting ? <Redo2 className="animate-spin" /> : <Download />}
        导出副本
      </Button>
    </header>
  );
}

// ---------- 右侧面板 ----------

function StampPanel({
  editorStamp, setEditorStamp, history, onClearHistory, fileName, fileSize,
  customIds, activeCustomId, onSelectCustom, onUploadCustom, onRemoveCustom, uploading,
}: {
  editorStamp: EditorStamp;
  setEditorStamp: (s: EditorStamp) => void;
  history: HistoryEntry[];
  onClearHistory: () => void;
  fileName: string;
  fileSize: number;
  customIds: string[];
  activeCustomId: string | null;
  onSelectCustom: (id: string) => void;
  onUploadCustom: (file: File) => void;
  onRemoveCustom: (id: string) => void;
  uploading: boolean;
}) {
  return (
    <Tabs defaultValue="content" className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-4 pb-3 pt-4">
        <TabsList className="w-full">
          <TabsTrigger value="content" className="flex-1">内容</TabsTrigger>
          <TabsTrigger value="design" className="flex-1">设计</TabsTrigger>
          <TabsTrigger value="templates" className="flex-1">模板</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">记录</TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="content" className="mt-0 px-4 py-4">
          <ContentTab editorStamp={editorStamp} setEditorStamp={setEditorStamp} />
        </TabsContent>
        <TabsContent value="design" className="mt-0 px-4 py-4">
          <DesignTab editorStamp={editorStamp} setEditorStamp={setEditorStamp} />
        </TabsContent>
        <TabsContent value="templates" className="mt-0 px-4 py-4">
          <TemplatesTab
            editorStamp={editorStamp}
            setEditorStamp={setEditorStamp}
            customIds={customIds}
            activeCustomId={activeCustomId}
            onSelectCustom={onSelectCustom}
            onUploadCustom={onUploadCustom}
            onRemoveCustom={onRemoveCustom}
            uploading={uploading}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-0 px-4 py-4">
          <HistoryTab history={history} onClear={onClearHistory} fileName={fileName} fileSize={fileSize} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

type SetStamp = (s: EditorStamp) => void;

function ContentTab({ editorStamp, setEditorStamp }: { editorStamp: EditorStamp; setEditorStamp: SetStamp }) {
  const st = editorStamp.statement;
  const set = (patch: Partial<Statement>) =>
    setEditorStamp({ ...editorStamp, statement: { ...st, ...patch } });

  return (
    <div className="space-y-5">
      <Field label="措辞">
        <ToggleGroup
          type="single"
          value={st.phrasing}
          onValueChange={(v) => v && set({ phrasing: v as Statement["phrasing"] })}
          className="w-full"
        >
          <ToggleGroupItem value="chinese" className="flex-1">中文</ToggleGroupItem>
          <ToggleGroupItem value="english" className="flex-1">English</ToggleGroupItem>
          <ToggleGroupItem value="bilingual" className="flex-1">中英</ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {st.phrasing !== "english" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="给谁（机构）">
            <Input value={st.recipient} onChange={(e) => set({ recipient: e.target.value })} placeholder="如：招商银行" />
          </Field>
          <Field label="办什么（用途）">
            <Input value={st.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="如：办理开户" />
          </Field>
        </div>
      )}
      {st.phrasing === "english" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recipient">
            <Input value={st.recipientEN} onChange={(e) => set({ recipientEN: e.target.value })} placeholder="e.g. CMB" />
          </Field>
          <Field label="Purpose">
            <Input value={st.purposeEN} onChange={(e) => set({ purposeEN: e.target.value })} placeholder="e.g. account opening" />
          </Field>
        </div>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <Field label="主文字（留空自动生成）">
          <Input value={st.mainText} onChange={(e) => set({ mainText: e.target.value })} placeholder="仅供××使用" />
        </Field>
        <Field label={st.phrasing === "english" ? "第二行（EN）" : "第二行"}>
          <Input
            value={st.phrasing === "english" ? st.subTextEN : st.subText}
            onChange={(e) => set(st.phrasing === "english" ? { subTextEN: e.target.value } : { subText: e.target.value })}
            placeholder="他用无效"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2.5">
        <div>
          <div className="text-[13px] font-medium">自定义文字</div>
          <div className="text-[11px] text-muted-foreground">每行一条，整体替换上面自动生成的正文</div>
        </div>
        <Switch checked={st.useCustomText} onCheckedChange={(v) => set({ useCustomText: v })} />
      </div>
      {st.useCustomText && (
        <textarea
          value={st.customText}
          onChange={(e) => set({ customText: e.target.value })}
          rows={3}
          placeholder={"仅供招商银行办理开户使用\n他用无效"}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
      )}

      <Separator />

      <div className="space-y-3">
        <ToggleRow label="盖日期" checked={st.includeDate} onChange={(v) => set({ includeDate: v })} />
        <ToggleRow label="盖编号" checked={st.includeID} onChange={(v) => set({ includeID: v })} />
        <p className="text-[11px] leading-5 text-muted-foreground">
          每次落章自动生成新编号（如 No.A7K3Q2），「记录」页可以查每一枚章的去向。
        </p>
      </div>
    </div>
  );
}

function DesignTab({ editorStamp, setEditorStamp }: { editorStamp: EditorStamp; setEditorStamp: SetStamp }) {
  const d = editorStamp.design;
  const set = (patch: Partial<EditorStamp["design"]>) =>
    setEditorStamp({ ...editorStamp, design: { ...d, ...patch } });

  return (
    <div className="space-y-5">
      <Field label="形制">
        <ToggleGroup type="single" value={d.shape} onValueChange={(v) => v && set({ shape: v as StampShape })} className="flex-wrap">
          {(Object.keys(SHAPE_LABELS) as StampShape[]).map((s) => (
            <ToggleGroupItem key={s} value={s}>{SHAPE_LABELS[s]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      {d.shape !== "square" && (
        <>
          <Field label="边框">
            <ToggleGroup type="single" value={d.border} onValueChange={(v) => v && set({ border: v as StampBorder })} className="flex-wrap">
              {(Object.keys(BORDER_LABELS) as StampBorder[]).map((b) => (
                <ToggleGroupItem key={b} value={b}>{BORDER_LABELS[b]}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field label="字体">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FONT_LABELS) as StampFont[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => set({ font: f })}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-xs transition-all",
                    d.font === f
                      ? "border-primary/60 bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                  style={{ fontFamily: fontPreviewStack(f) }}
                >
                  {FONT_LABELS[f]}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {d.shape === "square" && (
        <>
          <Field label="印文">
            <Input value={d.sealText} onChange={(e) => set({ sealText: e.target.value })} maxLength={9} placeholder="他用无效" />
          </Field>
          <Field label="刻法">
            <ToggleGroup type="single" value={d.sealStyle} onValueChange={(v) => v && set({ sealStyle: v as "yang" | "yin" })}>
              {(Object.keys(SEAL_STYLE_LABELS) as Array<"yang" | "yin">).map((s) => (
                <ToggleGroupItem key={s} value={s}>{SEAL_STYLE_LABELS[s]}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </>
      )}

      <Field label="印色">
        <div className="flex gap-2">
          {(Object.keys(STAMP_COLORS) as StampColor[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_LABELS[c]}
              title={COLOR_LABELS[c]}
              onClick={() => set({ color: c })}
              className={cn(
                "h-8 w-8 rounded-full border-2 transition-all",
                d.color === c ? "scale-110 border-foreground/70 shadow-md" : "border-transparent hover:scale-105",
              )}
              style={{ background: STAMP_COLORS[c] }}
            >
              {d.color === c && <Check className="mx-auto h-4 w-4 text-white/90" />}
            </button>
          ))}
        </div>
      </Field>

      <Field label={`墨色浓度 · ${Math.round(d.opacity * 100)}%`}>
        <Slider value={[d.opacity]} min={0.4} max={1} step={0.01} onValueChange={([v]) => set({ opacity: v })} />
      </Field>

      <Field label={d.shape === "square" ? `印文大小 · ${d.fontSize.toFixed(1)} pt` : `字号 · ${d.fontSize.toFixed(1)} pt`}>
        <Slider value={[d.fontSize]} min={4.5} max={10} step={0.1} onValueChange={([v]) => set({ fontSize: v })} />
      </Field>

      {d.shape !== "square" && (
        <Field label={`字距 · ${(d.tracking * 100).toFixed(0)}%`}>
          <Slider value={[d.tracking]} min={0} max={0.35} step={0.01} onValueChange={([v]) => set({ tracking: v })} />
        </Field>
      )}

      <Field label={`旋转 · ${d.rotation}°`}>
        <Slider value={[d.rotation]} min={-90} max={90} step={1} onValueChange={([v]) => set({ rotation: v })} />
      </Field>

      <Field label="印泥质感">
        <ToggleGroup type="single" value={d.texture} onValueChange={(v) => v && set({ texture: v as EditorStamp["design"]["texture"] })} className="flex-wrap">
          {(Object.keys(TEXTURE_LABELS) as Array<EditorStamp["design"]["texture"]>).map((t) => (
            <ToggleGroupItem key={t} value={t}>{TEXTURE_LABELS[t]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <div className="rounded-lg border border-border/70 bg-background/60 p-3">
        <PreviewLabel editorStamp={editorStamp} />
        <div className="flex h-20 items-center justify-center overflow-hidden rounded-md bg-[repeating-linear-gradient(45deg,#f7f4ee_0_8px,#f2ede3_8px_16px)]">
          <LivePreview editorStamp={editorStamp} />
        </div>
      </div>
    </div>
  );
}

function fontPreviewStack(f: StampFont): string {
  const map: Record<StampFont, string> = {
    songti: '"Songti SC","SimSun","Noto Serif SC",serif',
    kaiti: '"Kaiti SC","KaiTi","Ma Shan Zheng",serif',
    fangsong: '"FangSong","ZCOOL XiaoWei","Noto Serif SC",serif',
    libian: '"LiSu","ZCOOL XiaoWei",serif',
    weibei: '"STZhongsong","ZCOOL XiaoWei",serif',
    heiti: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    serif: '"Baskerville","Playfair Display",Georgia,serif',
  };
  return map[f];
}

function PreviewLabel({ editorStamp }: { editorStamp: EditorStamp }) {
  const { w, h } = stampSize(stampTextOf(editorStamp.statement, editorStamp.design, null), editorStamp.design);
  const mmW = (w * 25.4) / 72;
  const mmH = (h * 25.4) / 72;
  return (
    <div className="mb-2 text-[11px] font-medium text-muted-foreground">
      预览 · 实际大小约 <span className="tnum text-foreground">{mmW.toFixed(0)} × {mmH.toFixed(0)} mm</span>
    </div>
  );
}

function LivePreview({ editorStamp }: { editorStamp: EditorStamp }) {
  const id = makeStampID();
  return (
    <StampThumb
      text={stampTextOf(editorStamp.statement, editorStamp.design, id)}
      design={editorStamp.design}
      maxWidth={240}
    />
  );
}

function TemplatesTab({
  editorStamp, setEditorStamp, customIds, activeCustomId, onSelectCustom, onUploadCustom, onRemoveCustom, uploading,
}: {
  editorStamp: EditorStamp;
  setEditorStamp: SetStamp;
  customIds: string[];
  activeCustomId: string | null;
  onSelectCustom: (id: string) => void;
  onUploadCustom: (file: File) => void;
  onRemoveCustom: (id: string) => void;
  uploading: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const activeCustom = activeCustomId ? getCustomImage(activeCustomId) : null;
  return (
    <div>
      <p className="mb-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
        选一枚模板开始；「内容」和「设计」里改的都是你手里这枚章。
      </p>

      {/* 自定义印章 */}
      <div className="mb-4 rounded-lg border border-dashed border-primary/35 bg-accent/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
              <Upload className="h-3.5 w-3.5 text-primary/80" />
              自定义印章
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              上传印章图片（PNG / JPG）。白底扫描件自动转透明、自动裁边。
            </div>
          </div>
          <label
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? "处理中…" : "选图片"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadCustom(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {customIds.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {customIds.map((id) => {
              const ci = getCustomImage(id);
              if (!ci) return null;
              const active = id === activeCustomId;
              return (
                <div key={id} className={cn(
                  "group relative rounded-lg border bg-card transition-all",
                  active ? "border-primary/60 shadow-[0_0_0_2px_rgba(201,51,41,0.12)]" : "border-border/80",
                )}>
                  <button
                    type="button"
                    onClick={() => onSelectCustom(id)}
                    title={active ? "手里正拿着这枚 —— 再点一下换回模板章" : "拿在手里"}
                    className="flex w-full cursor-pointer flex-col items-center rounded-lg p-2"
                  >
                    <span className="flex h-[52px] items-center justify-center">
                      <img src={ci.src} alt={ci.name} className="max-h-[52px] max-w-full object-contain" />
                    </span>
                    <span className="mt-1 w-full truncate text-center text-[11px] font-medium">{ci.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${ci.name}`}
                    onClick={(e) => { e.stopPropagation(); onRemoveCustom(id); }}
                    className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive group-hover:flex"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {active && (
                    <span className="pointer-events-none absolute inset-x-2 -bottom-0.5 text-center text-[9px] font-medium text-primary">
                      手里正拿着
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {activeCustom && (
          <p className="mt-2.5 rounded-md bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
            手里正拿着「{activeCustom.name}」。落几枚后，点上面的模板即可换回模板章。
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={pending !== null}
            onClick={() => {
              setPending(t.key);
              // 让按钮有一点按下的反馈再切换
              setTimeout(() => {
                setEditorStamp(editorStampFromTemplate(t));
                setPending(null);
              }, 120);
            }}
            className={cn(
              "flex flex-col items-center rounded-lg border p-2.5 transition-all",
              editorStamp.templateKey === t.key
                ? "border-primary/60 bg-accent shadow-[0_0_0_2px_rgba(201,51,41,0.10)]"
                : "border-border/80 bg-card hover:border-primary/30 hover:shadow-sm",
            )}
          >
            <span className="flex h-[52px] items-center justify-center overflow-hidden">
              <Thumb18 templateKey={t.key} />
            </span>
            <span className="mt-1.5 w-full truncate text-center text-[11px] font-medium">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 模板小图（内容固定，便于缓存）
const thumbMemo = new Map<string, StampText>();
function Thumb18({ templateKey }: { templateKey: string }) {
  const t = TEMPLATES.find((x) => x.key === templateKey)!;
  const text = useMemo(() => {
    const hit = thumbMemo.get(templateKey);
    if (hit) return hit;
    const es = editorStampFromTemplate(t, { recipient: "招商银行", purpose: "办理开户" });
    const tx = stampTextOf(es.statement, es.design, "A7K3Q2");
    thumbMemo.set(templateKey, tx);
    return tx;
  }, [templateKey, t]);
  return <StampThumb text={text} design={t.design} maxWidth={72} />;
}

function HistoryTab({
  history, onClear, fileName, fileSize,
}: {
  history: HistoryEntry[];
  onClear: () => void;
  fileName: string;
  fileSize: number;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Badge variant="secondary" className="gap-1">
          <History className="h-3 w-3" />
          本次会话 · {history.length} 枚
        </Badge>
        {history.length > 0 && (
          <button type="button" onClick={onClear} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            清空记录
          </button>
        )}
      </div>
      <div className="mb-4 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{fileName}</span> · {formatBytes(fileSize)}
        <br />
        关掉页面就什么都不剩 —— 记录只在内存里。
      </div>
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
          <Mascot mood="sleepy" size={44} />
          <p className="text-xs">还没盖过章。回纸上点一下吧。</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {history.map((h, i) => (
            <li key={`${h.id}-${i}`} className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2 text-xs">
              <span className="font-mono font-medium">No.{h.id}</span>
              <span className="text-muted-foreground">
                {h.templateName} · P{h.page} · {h.time.toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
