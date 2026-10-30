import { useEffect, useRef, useState } from "react";
import { Alert, App as AntApp, Button, Descriptions, Drawer, Flex, Popconfirm, Skeleton, Switch, Tag, Typography, theme } from "antd";
import { CopyOutlined, FileMarkdownOutlined, ReloadOutlined, StopOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { Task } from "../api";
import { formatDateTime, formatDuration } from "../format";
import { StatusTag } from "./StatusTag";
import { AccountAvatar } from "./AccountAvatar";

interface TaskDrawerProps {
  taskId: string | null;
  summary: Task | undefined;
  isMobile: boolean;
  cancelling: boolean;
  onClose: () => void;
  onCancel: (task: Task) => void;
  onRerun: (task: Task) => void;
}

export function TaskDrawer({ taskId, summary, isMobile, cancelling, onClose, onCancel, onRerun }: TaskDrawerProps) {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const open = taskId !== null;
  const [follow, setFollow] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);
  const [detail, setDetail] = useState<Task | null>(null);
  const [log, setLog] = useState<string>("");
  const [loadingLog, setLoadingLog] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !taskId) {
      setDetail(null);
      setLog("");
      setLoadingLog(false);
      return;
    }
    let cancelled = false;
    setLoadingLog(true);
    api.task(taskId)
      .then((t) => {
        if (!cancelled) setDetail(t);
      })
      .catch(() => {});
    api.log(taskId)
      .then((l) => {
        if (!cancelled) {
          setLog(l);
          setLoadingLog(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingLog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, taskId, summary?.updatedAt, summary?.status]);

  const task: Task | undefined = detail && detail.id === taskId ? detail : summary;
  const fallbackActive = open && !summary && task?.status === "running";

  useEffect(() => {
    if (!fallbackActive || !taskId) return;
    const timer = setInterval(() => {
      api.task(taskId)
        .then((t) => setDetail(t))
        .catch(() => {});
      api.log(taskId)
        .then((l) => setLog(l))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [fallbackActive, taskId]);

  useEffect(() => {
    if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, follow]);

  useEffect(() => {
    if (open) setFollow(true);
  }, [taskId, open]);

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(log);
      message.success("Log copied");
    } catch {
      message.error("Copy failed");
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={isMobile ? "100%" : 680}
      destroyOnHidden
      title={
        task ? (
          <Flex align="center" gap={10} wrap>
            <span>{task.role}</span>
            <StatusTag task={task} />
          </Flex>
        ) : (
          "Task"
        )
      }
      extra={
        task && (
          <Flex gap={8}>
            <Button icon={<ReloadOutlined />} onClick={() => onRerun(task)}>
              {isMobile ? null : "Run again"}
            </Button>
            {task.cancellable && !task.cancelRequested && (
              <Popconfirm
                title="Cancel this task?"
                description="The agent process will be stopped."
                okText="Cancel task"
                cancelText="Keep running"
                okButtonProps={{ danger: true }}
                onConfirm={() => onCancel(task)}
              >
                <Button danger icon={<StopOutlined />} loading={cancelling}>
                  {isMobile ? null : "Cancel"}
                </Button>
              </Popconfirm>
            )}
          </Flex>
        )
      }
    >
      {!task ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={16}>
          {task.error && <Alert type="error" showIcon message="Task reported a problem" description={task.error} />}
          {task.status === "stale" && (
            <Alert type="info" showIcon message="The agent process is gone and no finish marker was written." />
          )}
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, md: 2 }}
            items={[
              { key: "id", label: "Task ID", span: { xs: 1, md: 2 }, children: <Typography.Text copyable code>{task.id}</Typography.Text> },
              {
                key: "account",
                label: "Account",
                span: { xs: 1, md: 2 },
                children: (
                  <Flex align="center" gap={8}>
                    <AccountAvatar accountId={task.account ?? "agy"} size={20} />
                    <Tag style={{ marginInlineEnd: 0 }}>{task.account ?? "agy"}</Tag>
                  </Flex>
                ),
              },
              { key: "workspace", label: "Workspace", span: { xs: 1, md: 2 }, children: <Typography.Text copyable style={{ wordBreak: "break-all" }}>{task.workspace}</Typography.Text> },
              {
                key: "preset",
                label: "Preset",
                span: { xs: 1, md: 2 },
                children: (
                  <Flex gap={4} wrap align="center">
                    <Typography.Text style={{ marginInlineEnd: 4 }}>{task.preset ?? "none"}</Typography.Text>
                    {(task.preferences ?? []).map((file) => (
                      <Tag key={file} icon={<FileMarkdownOutlined />} style={{ marginInlineEnd: 0 }}>{file}</Tag>
                    ))}
                  </Flex>
                ),
              },
              { key: "started", label: "Started", children: formatDateTime(task.startedAt) },
              { key: "finished", label: "Finished", children: formatDateTime(task.finishedAt) },
              { key: "duration", label: "Duration", children: formatDuration(task.durationMs) },
              { key: "exit", label: "Exit code", children: task.exitCode ?? "-" },
            ]}
          />
          <div>
            <Typography.Title level={5} style={{ marginTop: 0 }}>Prompt</Typography.Title>
            <Typography.Paragraph
              ellipsis={{ rows: 4, expandable: "collapsible" }}
              style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
            >
              {task.prompt ?? task.promptPreview ?? "-"}
            </Typography.Paragraph>
          </div>
          <div>
            <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 8 }}>
              <Typography.Title level={5} style={{ margin: 0 }}>Log</Typography.Title>
              <Flex align="center" gap={12}>
                <Flex align="center" gap={6}>
                  <Switch size="small" checked={follow} onChange={setFollow} />
                  <Typography.Text type="secondary">Follow</Typography.Text>
                </Flex>
                <Button size="small" icon={<CopyOutlined />} onClick={copyLog} disabled={!log}>
                  Copy
                </Button>
              </Flex>
            </Flex>
            <pre
              ref={logRef}
              className="log-view"
              style={{
                background: token.colorBgBase,
                border: `1px solid ${token.colorBorder}`,
                borderRadius: token.borderRadius,
                color: token.colorText,
              }}
            >
              {log || (loadingLog ? "Loading log..." : "No output yet.")}
            </pre>
          </div>
        </Flex>
      )}
    </Drawer>
  );
}
