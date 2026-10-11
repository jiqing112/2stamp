import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { FileUp } from "lucide-react";
import { Editor, type EditorDoc } from "@/views/Editor";
import { Landing } from "@/views/Landing";

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}
function isImage(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i.test(file.name);
}

export default function App() {
  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const [dragging, setDragging] = useState(false);

  const openFile = useCallback((file: File) => {
    if (isPdf(file)) setDoc({ file, kind: "pdf" });
    else if (isImage(file)) setDoc({ file, kind: "image" });
    else toast.error("先支持 PDF 和图片", { description: `${file.name} 这个格式还盖不了。` });
  }, []);

  // 内置示例：无文件也能完整体验（?sample=pdf|img 或首页入口）
  const pendingTemplate = useRef<string | null>(null);
  const openSample = useCallback(
    (kind: "pdf" | "img" | "exif180" | "rot180", templateKey?: string) => {
      pendingTemplate.current = templateKey ?? null;
      // rot180 / exif180 是诊断样本（scripts/make-diag-samples.mjs 生成）
      // BASE_URL：部署在 GitHub Pages 子路径（如 /2stamp/）时也能正确取到
      const base = import.meta.env.BASE_URL;
      const spec =
        kind === "pdf"
          ? { url: `${base}sample-memo.pdf`, name: "收入证明-示例.pdf", type: "application/pdf" }
          : kind === "exif180"
            ? { url: `${base}diag-exif180.pdf`, name: "诊断-EXIF旋转扫描件.pdf", type: "application/pdf" }
            : kind === "rot180"
              ? { url: `${base}diag-rot180.pdf`, name: "诊断-页面旋转180.pdf", type: "application/pdf" }
              : { url: `${base}sample-photo.png`, name: "证件扫描-示例.png", type: "image/png" };
      fetch(spec.url)
        .then((r) => r.arrayBuffer())
        .then((buf) => openFile(new File([buf], spec.name, { type: spec.type })))
        .catch(() => toast.error("示例文件没加载出来"));
    },
    [openFile],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("sample");
    const tpl = params.get("tpl") ?? undefined;
    if (q === "pdf" || q === "exif180" || q === "rot180") openSample(q, tpl);
    else if (q === "img") openSample("img", tpl);
  }, [openSample]);

  // 全屏拖放：任何时刻把文件丢进来都能开始
  useEffect(() => {
    let counter = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      counter += 1;
      setDragging(true);
    };
    const onDragLeave = () => {
      counter = Math.max(0, counter - 1);
      if (counter === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) openFile(f);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [openFile]);

  return (
    <>
      {doc ? <Editor key={doc.file.name + doc.file.size} doc={doc} initialTemplateKey={pendingTemplate.current} onBack={() => setDoc(null)} /> : <Landing onOpenFile={openFile} onUseSample={openSample} />}
      {/* 拖放遮罩 */}
      {dragging && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70">
          <div className="pointer-events-none flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-paper-50/50 px-16 py-14 text-paper-50">
            <span className="animate-float">
              <FileUp className="h-12 w-12" />
            </span>
            <p className="font-song text-2xl font-bold">松手，把文件放到桌上</p>
            <p className="text-sm text-paper-50/70">PDF 或图片 · 只在本地打开，不上传</p>
          </div>
        </div>
      )}
      <Toaster
        position="top-center"
        visibleToasts={2}
        toastOptions={{
          style: {
            background: "#FFFCF6",
            color: "#242120",
            border: "1px solid rgba(201,51,41,0.22)",
            boxShadow: "0 2px 6px rgba(36,33,32,0.10), 0 16px 36px -12px rgba(36,33,32,0.28)",
          },
          classNames: {
            title: "!text-[#242120] !font-medium",
            description: "!text-[#8a7f72]",
          },
        }}
      />
    </>
  );
}
