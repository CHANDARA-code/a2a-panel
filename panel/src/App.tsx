import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
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
import { useServerConnection, useServerEvent } from "./events";
import { darkAntdTheme, lightAntdTheme, useTheme } from "./theme";
import { NewTaskModal } from "./components/NewTaskModal";
import { TaskDrawer } from "./components/TaskDrawer";
import { TaskList } from "./components/TaskList";

type Filter = "all" | "running" | "completed" | "failed" | "cancelled" | "stale";
type View = "tasks" | "teams" | "accounts" | "usage" | "presets";

const PresetsView = lazy(() => import("./components/PresetsView").then((m) => ({ default: m.PresetsView })));
const AccountsView = lazy(() => import("./components/AccountsView").then((m) => ({ default: m.AccountsView })));
const TeamsView = lazy(() => import("./components/TeamsView").then((m) => ({ default: m.TeamsView })));
const UsageView = lazy(() => import("./components/UsageView").then((m) => ({ default: m.UsageView })));

const viewFromHash = (): View => {
  if (window.location.hash === "#teams") return "teams";
  if (window.location.hash === "#accounts") return "accounts";
  if (window.location.hash === "#usage") return "usage";
  if (window.location.hash === "#presets") return "presets";
  return "tasks";
};

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

  const { failed } = useServerConnection();
  const offline = failed;

  const [rawTasks, setRawTasks] = useState<Task[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [serverStartedAtMs, setServerStartedAtMs] = useState<number | null>(null);
  const [uptimeNow, setUptimeNow] = useState(() => Date.now());
  const [durationNow, setDurationNow] = useState(() => Date.now());

  useServerEvent("hello", (data: { uptimeSeconds: number; pid: number }) => {
    if (typeof data?.uptimeSeconds === "number") {
      setServerStartedAtMs(Date.now() - data.uptimeSeconds * 1000);
    }
  });

  useServerEvent("tasks", (data: { tasks: Task[] }) => {
    if (Array.isArray(data?.tasks)) {
      setRawTasks(data.tasks);
      setTasksLoading(false);
    }
  });

  const refreshTasks = useCallback(async () => {
    try {
      const res = await api.tasks();
      setRawTasks(res);
      setTasksLoading(false);
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const hasRunning = (rawTasks ?? []).some((task) => task.status === "running");

  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => {
      setDurationNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

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
    const targetHash = next === "tasks" ? "" : `#${next}`;
    window.history.replaceState(null, "", targetHash || window.location.pathname + window.location.search);
  };

  const viewSwitch = (
    <Segmented<View>
      value={view}
      onChange={changeView}
      options={[
        { value: "tasks", label: "Tasks" },
        { value: "teams", label: "Teams" },
        { value: "accounts", label: "Accounts" },
        { value: "usage", label: "Usage" },
        { value: "presets", label: "Presets" },
      ]}
    />
  );

  const all = useMemo(() => {
    if (!rawTasks) return [];
    return rawTasks.map((task) => {
      if (task.status === "running") {
        const startMs = Date.parse(task.startedAt);
        return {
          ...task,
          durationMs: Number.isNaN(startMs) ? null : Math.max(0, durationNow - startMs),
        };
      }
      return task;
    });
  }, [rawTasks, durationNow]);

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
      return [task.id, task.role, task.workspace, task.promptPreview ?? "", task.account ?? "agy"].some((field) =>
        field.toLowerCase().includes(needle)
      );
    });
  }, [all, filter, query]);

  const cancelTask = async (task: Task) => {
    setCancelling((prev) => new Set(prev).add(task.id));
    try {
      await api.cancel(task.id);
      message.success("Cancel requested");
      await refreshTasks();
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
    openComposer({
      role: task.role,
      workspace: task.workspace,
      prompt: task.prompt ?? task.promptPreview ?? "",
      preset: task.preset ?? null,
      account: task.account ?? "agy",
    });
  };

  const created = (taskId: string) => {
    setComposerOpen(false);
    setSelectedId(taskId);
    refreshTasks();
  };

  const stats = [
    { key: "running" as const, title: "Running", value: counts.running, color: token.colorPrimary },
    { key: "completed" as const, title: "Completed", value: counts.completed, color: token.colorSuccess },
    { key: "failed" as const, title: "Failed", value: counts.failed, color: token.colorError },
    { key: "all" as const, title: "Total", value: all.length, color: token.colorText },
  ];

  const uptimeText = serverStartedAtMs !== null ? formatUptime(Math.floor((uptimeNow - serverStartedAtMs) / 1000)) : "";

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
              {offline ? "Offline" : `Online${uptimeText ? ` · up ${uptimeText}` : ""}`}
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
              description="Reconnecting…"
            />
          )}

          {isMobile && <div>{viewSwitch}</div>}

          {view === "presets" && (
            <Suspense fallback={<Skeleton active />}>
              <PresetsView isMobile={isMobile} />
            </Suspense>
          )}

          {view === "accounts" && (
            <Suspense fallback={<Skeleton active />}>
              <AccountsView isMobile={isMobile} />
            </Suspense>
          )}

          {view === "usage" && (
            <Suspense fallback={<Skeleton active />}>
              <UsageView isMobile={isMobile} />
            </Suspense>
          )}

          {view === "teams" && (
            <Suspense fallback={<Skeleton active />}>
              <TeamsView isMobile={isMobile} onOpenTask={(taskId) => setSelectedId(taskId)} />
            </Suspense>
          )}

          {view === "tasks" && (
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
                    <Statistic title={stat.title} value={stat.value} valueStyle={{ color: stat.color, fontWeight: 600 }} loading={tasksLoading} />
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
                  <Button aria-label="Refresh" icon={<ReloadOutlined />} onClick={() => refreshTasks()} />
                </Flex>
              </Flex>

              <TaskList
                tasks={visible}
                loading={tasksLoading}
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
