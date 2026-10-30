import React from "react";
import { Badge, Tag } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import type { AccountState, Task, TaskStatus, TeamRunStatus, TeamRunTaskStatus } from "../api";

const STATUS_VIEW: Record<TaskStatus, { color: string; icon: React.ReactNode; label: string }> = {
  running: { color: "processing", icon: <SyncOutlined spin />, label: "Running" },
  completed: { color: "success", icon: <CheckCircleOutlined />, label: "Completed" },
  failed: { color: "error", icon: <CloseCircleOutlined />, label: "Failed" },
  cancelled: { color: "warning", icon: <StopOutlined />, label: "Cancelled" },
  stale: { color: "default", icon: <ClockCircleOutlined />, label: "Stale" },
};

export function StatusTag({ task }: { task: Pick<Task, "status" | "cancelRequested"> }) {
  const view = STATUS_VIEW[task.status];
  const label = task.status === "running" && task.cancelRequested ? "Cancelling" : view.label;
  return (
    <Tag color={task.status === "running" && task.cancelRequested ? "warning" : view.color} icon={view.icon} style={{ marginInlineEnd: 0 }}>
      {label}
    </Tag>
  );
}

const TEAM_RUN_STATUS_VIEW: Record<TeamRunStatus, { color: string; icon: React.ReactNode; label: string }> = {
  planning: { color: "processing", icon: <SyncOutlined spin />, label: "Planning" },
  planned: { color: "cyan", icon: <CheckCircleOutlined />, label: "Planned" },
  running: { color: "processing", icon: <SyncOutlined spin />, label: "Running" },
  reviewing: { color: "purple", icon: <SyncOutlined spin />, label: "Reviewing" },
  completed: { color: "success", icon: <CheckCircleOutlined />, label: "Completed" },
  failed: { color: "error", icon: <CloseCircleOutlined />, label: "Failed" },
  cancelled: { color: "warning", icon: <StopOutlined />, label: "Cancelled" },
  stale: { color: "default", icon: <ClockCircleOutlined />, label: "Stale" },
};

export function TeamRunStatusTag({ status }: { status: TeamRunStatus }) {
  const view = TEAM_RUN_STATUS_VIEW[status] ?? { color: "default", icon: <ClockCircleOutlined />, label: status };
  return (
    <Tag color={view.color} icon={view.icon} style={{ marginInlineEnd: 0 }}>
      {view.label}
    </Tag>
  );
}

const TEAM_TASK_STATUS_VIEW: Record<TeamRunTaskStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: "default", icon: <ClockCircleOutlined />, label: "Pending" },
  running: { color: "processing", icon: <SyncOutlined spin />, label: "Running" },
  completed: { color: "success", icon: <CheckCircleOutlined />, label: "Completed" },
  failed: { color: "error", icon: <CloseCircleOutlined />, label: "Failed" },
  skipped: { color: "default", icon: <StopOutlined />, label: "Skipped" },
  cancelled: { color: "warning", icon: <StopOutlined />, label: "Cancelled" },
};

export function TeamTaskStatusTag({ status }: { status: TeamRunTaskStatus }) {
  const view = TEAM_TASK_STATUS_VIEW[status] ?? { color: "default", icon: <ClockCircleOutlined />, label: status };
  return (
    <Tag color={view.color} icon={view.icon} style={{ marginInlineEnd: 0 }}>
      {view.label}
    </Tag>
  );
}

export function AccountStatusDot({ state }: { state: AccountState }) {
  const statusMap: Record<AccountState, "success" | "default" | "warning" | "error"> = {
    "signed-in": "success",
    "signed-out": "default",
    unknown: "warning",
    error: "error",
  };
  return <Badge status={statusMap[state] ?? "default"} style={{ marginInlineEnd: 6 }} />;
}
