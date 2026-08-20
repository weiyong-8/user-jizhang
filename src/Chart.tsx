import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

interface Props {
  option: EChartsOption;
  height: number;
  /** 点击某根柱子时回调（参数为数据下标） */
  onBarClick?: (index: number) => void;
}

/** ECharts 轻量封装：负责初始化、更新配置、窗口缩放自适应 */
export default function Chart({ option, height, onBarClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onBarClick);
  clickRef.current = onBarClick;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    chart.on("click", (params: any) => {
      if (params.componentType === "series" && clickRef.current) {
        clickRef.current(params.dataIndex as number);
      }
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
