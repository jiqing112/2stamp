// 落地页：Hero（可直接盖章的示例台）· 三步 · 刻章工坊 · 隐私 · 页脚
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download, FileUp, Lock, Minus, MousePointerClick, Plus, RotateCcw,
  Stamp as StampIcon, Trash2, Undo2, ShieldCheck, Hand,
} from "lucide-react";
import { Badge } from "@/lib/ui/badge";
import { Button } from "@/lib/ui/button";
import { TooltipProvider } from "@/lib/ui/tooltip";
import { Mascot, TapMascot } from "@/components/Mascot";
import { SamplePaper } from "@/components/SamplePaper";
import { StampSurface, type StampInstance } from "@/components/StampSurface";
import { StampThumb } from "@/components/StampThumb";
import { makeStampID, stampTextOf, TEMPLATES, editorStampFromTemplate, defaultStatement } from "@/lib/stamp/templates";
import type { Template } from "@/lib/stamp/templates";
import { cn } from "@/lib/utils";
import { playStampSound } from "@/lib/sound";

const PAGE_W = 595;
const PAGE_H = 842;
const PICKS = ["t00", "t01", "t02", "t03", "t05", "t07"]; // 首屏演示的六枚章

export function Landing({ onOpenFile, onUseSample }: { onOpenFile: (file: File) => void; onUseSample: (kind: "pdf" | "img") => void }) {
  return (
    <TooltipProvider delayDuration={200}>
      <SiteNav />
      <main>
        <Hero onOpenFile={onOpenFile} onUseSample={onUseSample} />
        <HowItWorks />
        <Workshop onUseSample={onUseSample} />
        <Privacy />
      </main>
      <SiteFooter />
    </TooltipProvider>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

// ---------- 顶栏 ----------

function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled ? "border-b border-border/70 bg-background/95 shadow-sm" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5">
          <TapMascot size={30} />
          <span className="text-[15px] font-semibold tracking-wide">
            小章<span className="ml-1.5 text-[11px] font-normal text-muted-foreground">网页版</span>
          </span>
        </a>
        <nav className="hidden items-center gap-6 text-[13px] text-muted-foreground md:flex">
          <a className="transition-colors hover:text-foreground" href="#how">怎么用</a>
          <a className="transition-colors hover:text-foreground" href="#try">试一试</a>
          <a className="transition-colors hover:text-foreground" href="#workshop">刻章工坊</a>
          <a className="transition-colors hover:text-foreground" href="#privacy">隐私</a>
          <a
            className="transition-colors hover:text-foreground"
            href="https://github.com/lemomo-ai/lemo-stampy"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 上的原版项目"
          >
            <GitHubMark className="h-4 w-4" />
          </a>
        </nav>
      </div>
    </header>
  );
}

// ---------- Hero ----------

function Hero({ onOpenFile, onUseSample }: { onOpenFile: (file: File) => void; onUseSample: (kind: "pdf" | "img") => void }) {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      {/* 背景装饰：淡淡的印泥光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(201,51,41,0.10), transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-64 left-[-12%] h-[420px] w-[420px] rounded-full opacity-50"
        style={{ background: "radial-gradient(closest-side, rgba(33,61,115,0.08), transparent)" }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <HeroCopy onOpenFile={onOpenFile} onUseSample={onUseSample} />
        <Playground />
      </div>
    </section>
  );
}

function HeroCopy({ onOpenFile, onUseSample }: { onOpenFile: (file: File) => void; onUseSample: (kind: "pdf" | "img") => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="animate-fade-up">
        <Badge variant="accent" className="gap-1.5 pl-2">
          <Mascot mood="normal" size={18} />
          <span>住在浏览器里的盖章小帮手</span>
        </Badge>
      </div>
      <h1
        className="mt-6 animate-fade-up font-song text-[44px] font-black leading-[1.14] tracking-tight text-foreground sm:text-[56px] md:text-[64px] [animation-delay:80ms]"
      >
        给电子文件，
        <br />
        盖个<span className="squiggle text-primary">小小</span>的章。
      </h1>
      <p className="mt-6 max-w-md animate-fade-up text-[15px] leading-7 text-muted-foreground [animation-delay:160ms] md:text-base md:leading-8">
        办签证、开账户、交材料，总要交证件复印件。
        盖上「仅供××使用，他用无效」，复印件就只此一用 ——{" "}
        <span className="text-foreground">原件一个像素都不动。</span>
      </p>
      <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:240ms]">
        <Button size="lg" className="h-12 rounded-full px-7 text-[15px] shadow-pop" onClick={() => inputRef.current?.click()}>
          <FileUp className="!h-[18px] !w-[18px]" />
          上传文件，开始盖章
        </Button>
        <Button size="lg" variant="outline" asChild className="h-12 rounded-full px-6 text-[15px]">
          <a href="#try">先在旁边试一试</a>
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onOpenFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-5 animate-fade-up text-xs leading-5 text-muted-foreground [animation-delay:320ms]">
        支持 PDF 与图片 · 免费无注册 · 全程在你的浏览器里完成，文件不上传 · 用完即走
        <span className="mx-2 opacity-40">/</span>
        <a
          className="whitespace-nowrap font-medium text-primary/90 underline-offset-4 transition-colors hover:text-primary hover:underline"
          href="?sample=pdf"
          onClick={() => onUseSample("pdf")}
        >
          没有文件？用示例 PDF 试试
        </a>
      </p>
    </div>
  );
}

// ---------- 可盖章的示例台 ----------

function Playground() {
  const deskCardRef = useRef<HTMLDivElement>(null);
  const [templateKey, setTemplateKey] = useState(PICKS[0]);
  const [stamps, setStamps] = useState<StampInstance[]>([]);
  const [mult, setMult] = useState(1);
  const [lastID, setLastID] = useState<string | null>(null);

  const template = useMemo(() => TEMPLATES.find((t) => t.key === templateKey)!, [templateKey]);
  const editorStamp = useMemo(() => editorStampFromTemplate(template, { recipient: "招商银行", purpose: "办理开户" }), [template]);

  const active = useMemo(() => {
    const id = makeStampID(); // 幽灵章的 ID 只用于排版，落章时会重新生成
    return { text: stampTextOf(editorStamp.statement, editorStamp.design, id), design: editorStamp.design };
  }, [editorStamp]);

  const handleStamp = useCallback(
    (relX: number, relY: number) => {
      const stampID = makeStampID();
      const inst: StampInstance = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        stampID,
        relX, relY,
        mult,
        rotation: editorStamp.design.rotation,
        text: stampTextOf(editorStamp.statement, editorStamp.design, stampID),
        design: editorStamp.design,
      };
      setStamps((s) => [...s, inst]);
      setLastID(stampID);
      playStampSound();
    },
    [editorStamp, mult],
  );

  const undo = useCallback(() => setStamps((s) => s.slice(0, -1)), []);
  const clear = useCallback(() => setStamps([]), []);

  return (
    <div id="try" className="relative animate-fade-up scroll-mt-24 [animation-delay:200ms]">
      {/* 桌面 */}
      <div ref={deskCardRef} className="desk-grain rounded-2xl border border-border/80 bg-desk p-4 shadow-desk sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            示例纸张 · 可以直接盖章，不会保存
          </div>
          <div className="tnum font-mono text-[11px] text-muted-foreground">
            {lastID ? <>No.<span className="font-semibold text-foreground">{lastID}</span></> : "No.——"}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[420px]">
          <StampSurface
            pageW={PAGE_W}
            pageH={PAGE_H}
            stamps={stamps}
            active={active}
            mult={mult}
            mode="stamp"
            selectedId={null}
            onStamp={handleStamp}
            onGhostResize={setMult}
            wheelTargetRef={deskCardRef}
            ghostZoneRef={deskCardRef}
          >
            <SamplePaper />
          </StampSurface>
        </div>

        {/* 印台：选章 + 大小 + 撤销/清空 */}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between gap-1.5" role="radiogroup" aria-label="选一枚章">
            {PICKS.map((key) => {
              const t = TEMPLATES.find((x) => x.key === key)!;
              return (
                <PickButton key={key} active={key === templateKey} onClick={() => setTemplateKey(key)} title={t.name}>
                  <StampPickThumb template={t} />
                </PickButton>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
            <IconBtn label="小一点" onClick={() => setMult((m) => Math.max(0.6, m - 0.1))}><Minus /></IconBtn>
            <span className="tnum w-12 text-center text-xs text-muted-foreground">{Math.round(mult * 100)}%</span>
            <IconBtn label="大一点" onClick={() => setMult((m) => Math.min(2.5, m + 0.1))}><Plus /></IconBtn>
            <span className="mx-1 h-5 w-px bg-border" />
            <IconBtn label="撤销" onClick={undo} disabled={!stamps.length}><Undo2 /></IconBtn>
            <IconBtn label="清空" onClick={clear} disabled={!stamps.length}><Trash2 /></IconBtn>
            <span className="ml-auto text-[11px] text-muted-foreground">
              已盖 <span className="tnum font-medium text-foreground">{stamps.length}</span> 枚
            </span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        鼠标移到纸上就是章 · 滚轮调大小 · 点一下落章
      </p>
    </div>
  );
}

function PickButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-14 flex-1 items-center justify-center rounded-lg border bg-card/90 transition-all",
        active
          ? "border-primary/60 shadow-[0_0_0_2px_rgba(201,51,41,0.14)]"
          : "border-border/70 hover:border-primary/30 hover:shadow-sm",
      )}
    >
      {children}
    </button>
  );
}

const pickStampMemo = new Map<string, { text: ReturnType<typeof stampTextOf> }>();
function StampPickThumb({ template }: { template: Template }) {
  const st = useMemo(() => {
    const cached = pickStampMemo.get(template.key);
    if (cached) return cached.text;
    const es = editorStampFromTemplate(template, { recipient: "招商银行", purpose: "办理开户" });
    const text = stampTextOf({ ...defaultStatement(), recipient: "招商银行", purpose: "办理开户" }, es.design, "A7K3Q2");
    pickStampMemo.set(template.key, { text });
    return text;
  }, [template]);
  return (
    <span className="flex max-h-12 max-w-[62px] items-center justify-center overflow-hidden">
      <StampThumb text={st} design={template.design} maxWidth={58} />
    </span>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card/90 text-muted-foreground shadow-sm transition-all hover:border-primary/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4"
    >
      {children}
    </button>
  );
}

// ---------- 三步 ----------

function HowItWorks() {
  const steps = [
    {
      icon: <Hand className="!h-5 !w-5" />,
      title: "拿起",
      desc: "选一枚章，它就跟着你的指针走。滚轮一滚，大小随手调整。",
    },
    {
      icon: <MousePointerClick className="!h-5 !w-5" />,
      title: "点一下",
      desc: "移到想盖的地方点一下 —— 带日期和编号，章永远完整留在页面里。",
    },
    {
      icon: <Download className="!h-5 !w-5" />,
      title: "存一份",
      desc: "导出 xxx_stamped 副本：PDF 原样保留、只在上面盖图章，原件不动。",
    },
  ];
  return (
    <section id="how" className="scroll-mt-20 border-y border-border/70 bg-paper-50/70 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <Kicker>三步</Kicker>
          <h2 className="mt-3 font-song text-3xl font-bold tracking-tight md:text-4xl">拿起 · 点一下 · 存一份</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 90}>
              <div className="group h-full rounded-xl border border-border/80 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-pop">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    {s.icon}
                  </span>
                  <span className="tnum font-song text-4xl font-black text-primary/15 transition-colors group-hover:text-primary/25">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-8 flex items-center justify-center gap-2 text-center text-[13px] text-muted-foreground">
            <StampIcon className="h-4 w-4 text-primary/70" />
            长章约 35mm、圆章 22mm、方印 7mm，盖在签名旁不遮内容
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- 刻章工坊：模板墙 ----------

const CATS = ["全部", "常用", "复印件", "英文", "方印"] as const;

function Workshop({ onUseSample }: { onUseSample: (kind: "pdf" | "img", templateKey?: string) => void }) {
  const [cat, setCat] = useState<(typeof CATS)[number]>("全部");
  const list = useMemo(() => (cat === "全部" ? TEMPLATES : TEMPLATES.filter((t) => t.category === cat)), [cat]);
  return (
    <section id="workshop" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Kicker>刻章工坊</Kicker>
            <h2 className="mt-3 font-song text-3xl font-bold tracking-tight md:text-4xl">十七枚章，总有一枚合用</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              圆的、方的、长的，中文的、英文的。进入编辑器还能改文字、字体、边框、颜色和印泥质感。
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs transition-all",
                  cat === c
                    ? "border-primary/60 bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {c}
                <span className="tnum ml-1 opacity-60">
                  {c === "全部" ? TEMPLATES.length : TEMPLATES.filter((t) => t.category === c).length}
                </span>
              </button>
            ))}
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-6">
          {list.map((t, i) => (
            <Reveal key={t.key} delay={Math.min(i * 40, 300)}>
              <button
                type="button"
                title={`用「${t.name}」和示例文件开始`}
                onClick={() => onUseSample("pdf", t.key)}
                className="group flex h-full w-full cursor-pointer flex-col rounded-xl border border-border/80 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-pop"
              >
                <div className="flex h-[88px] items-center justify-center">
                  <StampPickThumb template={t} />
                </div>
                <div className="mt-3 border-t border-border/60 pt-3">
                  <div className="truncate text-[13px] font-medium">{t.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.blurb}</div>
                  <div className="tnum mt-1 text-[10px] text-muted-foreground/70">{t.mm[0]} × {t.mm[1]} mm</div>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 隐私 ----------

function Privacy() {
  const points = [
    { icon: <Lock className="!h-4 !w-4" />, title: "文件不上传", desc: "读取、盖章、导出全部发生在你的浏览器里。断网也能用。" },
    { icon: <ShieldCheck className="!h-4 !w-4" />, title: "原件不动", desc: "章只盖在导出的副本上，原始文件一个像素都不会变。" },
    { icon: <RotateCcw className="!h-4 !w-4" />, title: "用完即走", desc: "关掉页面就什么都不剩：不注册、不存档、没有痕迹。" },
  ];
  return (
    <section id="privacy" className="scroll-mt-20 border-t border-border/70 bg-ink py-20 text-paper-50 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="text-xs font-medium tracking-[0.3em] text-paper-50/50">隐私</div>
          <h2 className="mt-3 font-song text-3xl font-bold tracking-tight md:text-[40px] md:leading-snug">
            你的证件，只经过<span className="text-[#E8A79B]">你自己的电脑</span>。
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.04] p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C93329]/20 text-[#E8A79B]">{p.icon}</span>
                <h3 className="mt-4 font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-6 text-paper-50/60">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 页脚 ----------

function SiteFooter() {
  return (
    <footer className="bg-ink pb-10 text-paper-50/50">
      <div className="mx-auto max-w-6xl border-t border-white/10 px-5 pt-8">
        <div className="flex flex-col items-start justify-between gap-4 text-xs md:flex-row md:items-center">
          <div className="flex items-center gap-2.5">
            <Mascot mood="sleepy" size={26} />
            <span>给复印件，盖个小小的章。愿每一份副本都只去它该去的地方。</span>
          </div>
          <div className="flex items-center gap-5">
            <a className="transition-colors hover:text-paper-50" href="https://github.com/lemomo-ai/lemo-stampy" target="_blank" rel="noreferrer">
              原版 macOS 应用（MIT）
            </a>
            <span>网页版为独立开源复刻</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ---------- 通用 ----------

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium tracking-[0.3em] text-primary/80">{children}</div>;
}

export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn("transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", seen ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
