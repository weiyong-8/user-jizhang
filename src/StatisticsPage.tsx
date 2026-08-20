import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import Chart from "./Chart";
import { toYuan } from "./categories";

const { Title } = Typography;

interface SubStat {
  category_id: number;
  category_name: string;
  total_cents: number;
  count: number;
}

interface CategoryStat {
  category_id: number;
  category_name: string;
  total_cents: number;
  count: number;
  subs: SubStat[];
}

// 图表配色（数据可视化规范：单一蓝色序列 + 文字用墨色而非数据色）
const SERIES = "#2a78d6";
const INK_SECONDARY = "#52514e";

interface RowItem {
  key: string;
  name: string;
  total_cents: number;
  pct: string;
  count: number;
}

export default function StatisticsPage() {
  const { message } = App.useApp();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<CategoryStat[]>("monthly_stats", {
        month: month.format("YYYY-MM"),
      });
      setStats(result);
      setSelected(null);
    } catch (e) {
      message.error(`加载统计失败：${e}`);
    } finally {
      setLoading(false);
    }
  }, [month, message]);

  useEffect(() => {
    load();
  }, [load]);

  const total = stats.reduce((s, r) => s + r.total_cents, 0);
  const count = stats.reduce((s, r) => s + r.count, 0);
  const daysInMonth = month.daysInMonth();
  const avg = daysInMonth > 0 ? total / daysInMonth : 0;

  // 横向条形图：按金额从高到低（图上方向为从下到上）
  const ordered = [...stats].reverse();

  const option = {
    grid: { left: 8, right: 120, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: "value" as const, show: false },
    yAxis: {
      type: "category" as const,
      data: ordered.map((s) => s.category_name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: INK_SECONDARY, fontSize: 13 },
    },
    tooltip: {
      trigger: "item" as const,
      formatter: (p: any) => {
        const s = stats.find((x) => x.category_name === p.name);
        if (!s) return "";
        const pct = total ? ((s.total_cents / total) * 100).toFixed(1) : "0.0";
        return `${p.name}<br/>¥${toYuan(s.total_cents)} · 占本月 ${pct}%<br/>${s.count} 笔`;
      },
    },
    series: [
      {
        type: "bar" as const,
        data: ordered.map((s) => ({ value: s.total_cents, id: s.category_id })),
        barWidth: 20,
        itemStyle: { color: SERIES, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right" as const,
          color: INK_SECONDARY,
          fontSize: 13,
          formatter: (p: any) => {
            const s = stats.find((x) => x.category_id === p.data.id);
            if (!s) return "";
            const pct = total ? ((s.total_cents / total) * 100).toFixed(1) : "0.0";
            return `¥${toYuan(s.total_cents)} · ${pct}%`;
          },
        },
      },
    ],
  };

  const detailRows: RowItem[] =
    selected === null
      ? stats.map((s) => ({
          key: `p-${s.category_id}`,
          name: s.category_name,
          total_cents: s.total_cents,
          pct: total ? ((s.total_cents / total) * 100).toFixed(1) : "0.0",
          count: s.count,
        }))
      : (stats.find((s) => s.category_id === selected)?.subs ?? []).map((s) => ({
          key: `c-${s.category_id}`,
          name: s.category_name,
          total_cents: s.total_cents,
          pct: total ? ((s.total_cents / total) * 100).toFixed(1) : "0.0",
          count: s.count,
        }));

  const columns: ColumnsType<RowItem> = [
    { title: selected === null ? "大类" : "小类", dataIndex: "name" },
    {
      title: "金额（元）",
      dataIndex: "total_cents",
      align: "right",
      width: 140,
      render: (v: number) => <span className="amount">¥{toYuan(v)}</span>,
    },
    { title: "占本月支出", dataIndex: "pct", align: "right", width: 120, render: (v: string) => `${v}%` },
    { title: "笔数", dataIndex: "count", align: "right", width: 80 },
  ];

  const selectedName = stats.find((s) => s.category_id === selected)?.category_name;

  return (
    <>
      <Title level={3} style={{ marginBottom: 20 }}>
        月度统计
      </Title>

      <Card size="small" className="filter-card">
        <Space wrap>
          <span>选择月份：</span>
          <DatePicker
            picker="month"
            value={month}
            allowClear={false}
            onChange={(v) => v && setMonth(v)}
          />
        </Space>
      </Card>

      <Row gutter={16} className="stat-row">
        <Col span={8}>
          <Card size="small">
            <Statistic title="本月总支出（元）" value={toYuan(total)} loading={loading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="记账笔数" value={count} loading={loading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="日均支出（元）" value={toYuan(Math.round(avg))} loading={loading} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        className="chart-card"
        title="各大类支出排行"
        extra={<span className="chart-tip">点击柱子查看小类明细</span>}
      >
        {stats.length === 0 ? (
          <Empty description="本月还没有账单" style={{ padding: 24 }} />
        ) : (
          <Chart
            option={option}
            height={Math.max(160, ordered.length * 44 + 20)}
            onBarClick={(idx) => {
              const s = ordered[idx];
              setSelected((cur) => (cur === s.category_id ? null : s.category_id));
            }}
          />
        )}
      </Card>

      <Card
        size="small"
        className="detail-card"
        title={selectedName ? `「${selectedName}」的小类明细` : "各大类明细"}
        extra={
          selected !== null ? (
            <Button type="link" size="small" onClick={() => setSelected(null)}>
              返回全部大类
            </Button>
          ) : undefined
        }
      >
        <Table
          rowKey="key"
          columns={columns}
          dataSource={detailRows}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: "本月还没有账单" }}
          onRow={(r) =>
            selected === null
              ? { onClick: () => setSelected(stats.find((s) => s.category_name === r.name)?.category_id ?? null), style: { cursor: "pointer" } }
              : {}
          }
        />
      </Card>
    </>
  );
}
