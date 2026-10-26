import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Grid,
  Input,
  Layout,
  Segmented,
  Skeleton,
  Statistic,
  Tag,
  Typography,
  theme,
} from "antd";
import { MoonOutlined, PlusOutlined, ReloadOutlined, SunOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "./api";
import type { DispatchInput, Task } from "./api";
import { formatUptime } from "./format";
import { usePolling } from "./hooks";
import { darkAntdTheme, lightAntdTheme, useTheme } from "./theme";
import { NewTaskModal } from "./components/NewTaskModal";
import { TaskDrawer } from "./components/TaskDrawer";
import { TaskList } from "./components/TaskList";

type Filter = "all" | "running" | "completed" | "failed" | "cancelled" | "stale";
type View = "tasks" | "presets";

// The presets page carries the markdown renderer, so it loads only when opened.
const PresetsView = lazy(() => import("./components/PresetsView").then((m) => ({ default: m.PresetsView })));

const viewFromHash = (): View => (window.location.hash === "#presets" ? "presets" : "tasks");

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "stale", label: "Stale" },
];

function Panel() {
  const { token } = theme.useToken();
  const { mode, toggleTheme } = useTheme();
  const { message } = AntApp.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const tasks = usePolling(api.tasks, 3000);
  const health = usePolling(api.health, 5000);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<Partial<DispatchInput> | undefined>(undefined);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const changeView = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", next === "presets" ? "#presets" : window.location.pathname + window.location.search);
  };

  const viewSwitch = (
    <Segmented<View>
      value={view}
      onChange={changeView}
      options={[
        { value: "tasks", label: "Tasks" },
        { value: "presets", label: "Presets" },
      ]}
    />
  );

  const all = useMemo(() => tasks.data ?? [], [tasks.data]);
  const counts = useMemo(() => {
    const result = { running: 0, completed: 0, failed: 0, cancelled: 0, stale: 0 };
    for (const task of all) result[task.status] += 1;
    return result;
  }, [all]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((task) => {
      if (filter !== "all" && task.status !== filter) return false;
      if (!needle) return true;
      return [task.id, task.role, task.workspace, task.promptPreview ?? ""].some((field) => field.toLowerCase().includes(needle));
    });
  }, [all, filter, query]);

  const cancelTask = async (task: Task) => {
    setCancelling((prev) => new Set(prev).add(task.id));
    try {
      await api.cancel(task.id);
      message.success("Cancel requested");
      await Promise.all([tasks.refresh(), health.refresh()]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const openComposer = (initial?: Partial<DispatchInput>) => {
    setComposerInitial(initial);
    setComposerOpen(true);
  };

  const rerun = (task: Task) => {
    setSelectedId(null);
    openComposer({ role: task.role, workspace: task.workspace, prompt: task.prompt ?? task.promptPreview ?? "", preset: task.preset ?? null });
  };

  const created = (taskId: string) => {
    setComposerOpen(false);
    setSelectedId(taskId);
    tasks.refresh();
    health.refresh();
  };

  const stats = [
    { key: "running" as const, title: "Running", value: counts.running, color: token.colorPrimary },
    { key: "completed" as const, title: "Completed", value: counts.completed, color: token.colorSuccess },
    { key: "failed" as const, title: "Failed", value: counts.failed, color: token.colorError },
    { key: "all" as const, title: "Total", value: all.length, color: token.colorText },
  ];

  const offline = tasks.error !== null;

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      <Layout.Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: `1px solid ${token.colorBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Flex align="center" gap={10} style={{ minWidth: 0 }}>
          <ThunderboltOutlined style={{ fontSize: 22, color: token.colorPrimary }} />
          <Typography.Title level={4} style={{ margin: 0, whiteSpace: "nowrap" }}>
            {isMobile ? "A2A" : "A2A Task Panel"}
          </Typography.Title>
          {!isMobile && (
            <Tag color={offline ? "error" : "success"} style={{ marginInlineStart: 4 }}>
              {offline ? "Offline" : `Online${health.data ? ` · up ${formatUptime(health.data.uptimeSeconds)}` : ""}`}
            </Tag>
          )}
          {!isMobile && <div style={{ marginInlineStart: 12 }}>{viewSwitch}</div>}
        </Flex>
        <Flex align="center" gap={8}>
          {isMobile && <Tag color={offline ? "error" : "success"} style={{ marginInlineEnd: 0 }}>{offline ? "Offline" : "Online"}</Tag>}
          <Button
            aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openComposer()} aria-label="New task">
            {isMobile ? null : "New task"}
          </Button>
        </Flex>
      </Layout.Header>

      <Layout.Content style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 24 }}>
        <Flex vertical gap={isMobile ? 12 : 16}>
          {offline && (
            <Alert
              type="error"
              showIcon
              message="Cannot reach the A2A server"
              description={`${tasks.error?.message}. Retrying every few seconds.`}
            />
          )}

          {isMobile && <div>{viewSwitch}</div>}

          {view === "presets" ? (
            <Suspense fallback={<Skeleton active />}>
              <PresetsView isMobile={isMobile} />
            </Suspense>
          ) : (
            <>
            <Flex gap={isMobile ? 8 : 16} wrap={false} style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))" }}>
              {stats.map((stat) => (
                <Card
                  key={stat.key}
                  size="small"
                  hoverable
                  onClick={() => setFilter(stat.key)}
                  styles={{ body: { padding: isMobile ? 12 : 16 } }}
                  style={filter === stat.key ? { borderColor: token.colorPrimary } : undefined}
                >
                  <Statistic title={stat.title} value={stat.value} valueStyle={{ color: stat.color, fontWeight: 600 }} loading={tasks.loading} />
                </Card>
              ))}
            </Flex>

            <Flex vertical={isMobile} gap={12} justify="space-between" align={isMobile ? "stretch" : "center"}>
              <div style={{ overflowX: "auto", paddingBottom: 2 }}>
                <Segmented<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={FILTERS.map((item) => ({
                    value: item.value,
                    label: item.value === "all" ? item.label : `${item.label} ${counts[item.value]}`,
                  }))}
                />
              </div>
              <Flex gap={8} style={{ flex: isMobile ? undefined : "0 1 360px" }}>
                <Input.Search allowClear placeholder="Search role, prompt, workspace, id" value={query} onChange={(event) => setQuery(event.target.value)} />
                <Button aria-label="Refresh" icon={<ReloadOutlined />} onClick={() => { tasks.refresh(); health.refresh(); }} />
              </Flex>
            </Flex>

            <TaskList
              tasks={visible}
              loading={tasks.loading}
              isMobile={isMobile}
              cancelling={cancelling}
              onOpen={(task) => setSelectedId(task.id)}
              onCancel={cancelTask}
            />
            </>
          )}
        </Flex>
      </Layout.Content>

      <TaskDrawer
        taskId={selectedId}
        summary={all.find((task) => task.id === selectedId)}
        isMobile={isMobile}
        cancelling={selectedId !== null && cancelling.has(selectedId)}
        onClose={() => setSelectedId(null)}
        onCancel={cancelTask}
        onRerun={rerun}
      />

      <NewTaskModal
        open={composerOpen}
        isMobile={isMobile}
        initial={composerInitial}
        onClose={() => setComposerOpen(false)}
        onCreated={created}
      />
    </Layout>
  );
}

export default function App() {
  const { mode } = useTheme();
  return (
    <ConfigProvider theme={mode === "dark" ? darkAntdTheme : lightAntdTheme}>
      <AntApp>
        <Panel />
      </AntApp>
    </ConfigProvider>
  );
}
