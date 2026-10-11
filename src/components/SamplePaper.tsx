// 示例纸张：一张排好版的「收入证明」，按 595×842 pt（A4）设计，随容器缩放
import { useEffect, useRef, useState } from "react";

const W = 595;
const H = 842;

export function SamplePaper() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <div
        className="origin-top-left bg-white"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
        aria-hidden="true"
      >
        <div className="flex h-full flex-col px-[72px] py-[64px] font-song text-[#242120]">
          {/* 抬头 */}
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-bold tracking-[0.18em]">星辰（上海）科技有限公司</span>
            <span className="text-[10px] tracking-[0.1em] text-black/40">XINGCHEN TECH CO., LTD.</span>
          </div>
          <div className="mt-3 border-t-[2.5px] border-[#242120]/80" />
          <div className="mt-1 border-t border-[#242120]/30" />

          {/* 标题 */}
          <div className="mt-[54px] text-center">
            <div className="text-[30px] font-bold tracking-[0.5em]">收入证明</div>
            <div className="mt-2 text-[9px] tracking-[0.42em] text-black/35">PROOF OF INCOME</div>
          </div>

          {/* 正文 */}
          <div className="mt-[46px] space-y-[26px] text-[13.5px] leading-[30px] tracking-[0.05em]">
            <p className="indent-[2em]">兹证明 <span className="mx-1 inline-block w-[72px] border-b border-black/60" /> 先生/女士（身份证号：<span className="inline-block w-[150px] border-b border-black/60" />），自 2021 年 3 月起在我司任职，现任市场部高级经理一职。</p>
            <p className="indent-[2em]">该员工近一年平均月税后收入为人民币 <span className="mx-0.5 inline-block w-[64px] border-b border-black/60" /> 元（大写：<span className="inline-block w-[120px] border-b border-black/60" />），年收入合计人民币 <span className="mx-0.5 inline-block w-[64px] border-b border-black/60" /> 元。</p>
            <p className="indent-[2em]">以上收入信息真实无误，我司对本证明内容的真实性负责。本证明仅用于办理个人事务，请贵方酌情使用。</p>
            <p className="indent-[2em]">特此证明。</p>
          </div>

          {/* 落款 */}
          <div className="mt-auto">
            <div className="flex items-end justify-between pb-2 text-[13px] leading-[26px]">
              <div>
                <div className="text-black/55">经办人</div>
                <div className="mt-1 font-kai text-[17px]">周雨眠</div>
              </div>
              <div className="text-right">
                <div className="text-black/55">单位人事专用章</div>
                <div className="mt-[38px] text-[12px] text-black/70">2026 年 9 月 28 日</div>
              </div>
            </div>
            <div className="border-t border-[#242120]/25 pt-2 text-[8.5px] tracking-[0.08em] text-black/30">
              本证明复印无效 · 地址：上海市徐汇区漕河泾开发区宜州路 180 号 · 电话：021-6027 XXXX
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
