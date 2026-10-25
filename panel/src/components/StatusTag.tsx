import { Tag } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import type { Task, TaskStatus } from "../api";

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
