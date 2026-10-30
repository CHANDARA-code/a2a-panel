import { useEffect, useMemo, useRef, useState } from "react";
import { Flex, Segmented, Table, Typography, theme } from "antd";
import { formatCompactNumber } from "../format";

interface DailyUsageChartProps {
  byDay: { date: string; tasks: number; total_tokens: number }[];
  isMobile?: boolean;
}

export function DailyUsageChart({ byDay, isMobile }: DailyUsageChartProps) {
  const { token } = theme.useToken();
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [viewMode]);

  const height = isMobile ? 130 : 150;
  const marginLeft = 42;
  const marginRight = 10;
  const marginTop = 12;
  const marginBottom = 24;
  const plotWidth = Math.max(10, width - marginLeft - marginRight);
  const plotHeight = Math.max(10, height - marginTop - marginBottom);

  const maxVal = useMemo(() => {
    const max = Math.max(0, ...byDay.map((d) => d.total_tokens));
    return max > 0 ? max : 1000;
  }, [byDay]);

  const gridlines = useMemo(() => {
    return [
      { val: maxVal, y: marginTop },
      { val: Math.round(maxVal / 2), y: marginTop + plotHeight / 2 },
      { val: 0, y: marginTop + plotHeight },
    ];
  }, [maxVal, marginTop, plotHeight]);

  const xLabels = useMemo(() => {
    if (byDay.length === 0) return [];
    const first = { index: 0, date: byDay[0].date, align: "start" as const };
    const midIndex = Math.floor(byDay.length / 2);
    const mid = { index: midIndex, date: byDay[midIndex].date, align: "middle" as const };
    const lastIndex = byDay.length - 1;
    const last = { index: lastIndex, date: byDay[lastIndex].date, align: "end" as const };
    if (lastIndex === 0) return [first];
    if (lastIndex === 1) return [first, last];
    return [first, mid, last];
  }, [byDay]);

  const colWidth = byDay.length > 0 ? plotWidth / byDay.length : plotWidth;
  const gap = 2;
  const barWidth = Math.max(1, Math.min(18, colWidth - gap));

  const hoveredItem = hoveredIndex !== null && byDay[hoveredIndex] ? byDay[hoveredIndex] : null;

  return (
    <div style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Daily token activity
        </Typography.Text>
        <Segmented<"chart" | "table">
          size="small"
          value={viewMode}
          onChange={(val) => setViewMode(val)}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </Flex>

      {viewMode === "table" ? (
        <Table
          size="small"
          rowKey="date"
          dataSource={byDay}
          scroll={{ x: true }}
          pagination={{ pageSize: 7, size: "small", hideOnSinglePage: true }}
          columns={[
            { title: "Date", dataIndex: "date", key: "date" },
            {
              title: "Tokens",
              dataIndex: "total_tokens",
              key: "total_tokens",
              align: "right",
              render: (val: number) => val.toLocaleString(),
            },
            {
              title: "Tasks",
              dataIndex: "tasks",
              key: "tasks",
              align: "right",
              render: (val: number) => val.toLocaleString(),
            },
          ]}
        />
      ) : (
        <div ref={containerRef} style={{ position: "relative", width: "100%", overflow: "hidden" }}>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: "block", overflow: "visible" }}
          >
            {gridlines.map((g, idx) => (
              <g key={idx}>
                <line
                  x1={marginLeft}
                  y1={g.y}
                  x2={marginLeft + plotWidth}
                  y2={g.y}
                  stroke={token.colorBorderSecondary}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={marginLeft - 6}
                  y={g.y + 4}
                  textAnchor="end"
                  fill={token.colorTextTertiary}
                  fontSize={11}
                  fontFamily={token.fontFamily}
                >
                  {formatCompactNumber(g.val)}
                </text>
              </g>
            ))}

            {hoveredIndex !== null && byDay[hoveredIndex] && (
              <rect
                x={marginLeft + hoveredIndex * colWidth}
                y={marginTop}
                width={colWidth}
                height={plotHeight}
                fill={token.colorFillSecondary}
                opacity={0.4}
                rx={2}
                pointerEvents="none"
              />
            )}

            {byDay.map((item, i) => {
              if (item.total_tokens <= 0) return null;
              const hitX = marginLeft + i * colWidth;
              const barX = hitX + (colWidth - barWidth) / 2;
              const barHeight = (item.total_tokens / maxVal) * plotHeight;
              const barY = marginTop + plotHeight - barHeight;
              const r = Math.min(4, barWidth / 2, barHeight);
              const path = `M ${barX} ${barY + barHeight} L ${barX} ${barY + r} Q ${barX} ${barY} ${barX + r} ${barY} L ${barX + barWidth - r} ${barY} Q ${barX + barWidth} ${barY} ${barX + barWidth} ${barY + r} L ${barX + barWidth} ${barY + barHeight} Z`;

              return (
                <path
                  key={item.date}
                  d={path}
                  fill={hoveredIndex === i ? token.colorPrimaryHover : token.colorPrimary}
                />
              );
            })}

            {byDay.map((item, i) => {
              const hitX = marginLeft + i * colWidth;
              return (
                <rect
                  key={`hit-${item.date}`}
                  x={hitX}
                  y={marginTop}
                  width={colWidth}
                  height={plotHeight}
                  fill="transparent"
                  style={{ cursor: "pointer", outline: "none" }}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${item.date}: ${item.total_tokens.toLocaleString()} tokens, ${item.tasks} tasks`}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex((cur) => (cur === i ? null : cur))}
                  onFocus={() => setHoveredIndex(i)}
                  onBlur={() => setHoveredIndex((cur) => (cur === i ? null : cur))}
                />
              );
            })}

            {xLabels.map((lbl) => {
              const xPos =
                lbl.align === "start"
                  ? marginLeft
                  : lbl.align === "end"
                  ? marginLeft + plotWidth
                  : marginLeft + lbl.index * colWidth + colWidth / 2;
              return (
                <text
                  key={lbl.date}
                  x={xPos}
                  y={marginTop + plotHeight + 16}
                  textAnchor={lbl.align}
                  fill={token.colorTextTertiary}
                  fontSize={11}
                  fontFamily={token.fontFamily}
                >
                  {lbl.date}
                </text>
              );
            })}
          </svg>

          {hoveredItem && hoveredIndex !== null && (
            <div
              style={{
                position: "absolute",
                left: Math.max(60, Math.min(width - 60, marginLeft + hoveredIndex * colWidth + colWidth / 2)),
                top: Math.max(
                  8,
                  marginTop + plotHeight - (hoveredItem.total_tokens / maxVal) * plotHeight - 8
                ),
                transform: "translate(-50%, -100%)",
                backgroundColor: token.colorBgElevated,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusSM,
                padding: "4px 8px",
                boxShadow: token.boxShadowSecondary,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12, color: token.colorText }}>
                {hoveredItem.date}
              </div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                {hoveredItem.total_tokens.toLocaleString()} tokens
              </div>
              <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                {hoveredItem.tasks} tasks
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}