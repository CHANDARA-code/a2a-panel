import { useCallback, useEffect, useState } from "react";
import type { Key } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  List,
  Popconfirm,
  Skeleton,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { CheckOutlined, FileTextOutlined, StopOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { TeamRun, TeamRunTask } from "../api";
import { formatDateTime } from "../format";
import { useServerEvent } from "../events";
import { TeamRunStatusTag, TeamTaskStatusTag } from "./StatusTag";
import { AccountAvatar } from "./AccountAvatar";

function TaskPlanDetails({ task }: { task: TeamRunTask }) {
  return (
    <Flex vertical gap={8}>
      <div>
        <Typography.Text type="secondary">Instructions for {task.assignee}</Typography.Text>
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }} ellipsis={{ rows: 6, expandable: "collapsible" }}>
          {task.prompt}
        </Typography.Paragraph>
      </div>
      {task.acceptance_criteria?.length > 0 && (
        <div>
          <Typography.Text type="secondary">Acceptance criteria</Typography.Text>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 20 }}>
            {task.acceptance_criteria.map((criterion, index) => (
              <li key={index}>
                <Typography.Text>{criterion}</Typography.Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      {task.verification_command && (
        <Flex vertical gap={4}>
          <Typography.Text type="secondary">Check command (a2a-panel runs it on this computer after the task)</Typography.Text>
          <Typography.Text code copyable style={{ wordBreak: "break-all" }}>
            {task.verification_command}
          </Typography.Text>
        </Flex>
      )}
    </Flex>
  );
}

interface TeamRunDrawerProps {
  runId: string | null;
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}

export function TeamRunDrawer({ runId, open, isMobile, onClose, onOpenTask }: TeamRunDrawerProps) {
  const { message } = AntApp.useApp();
  const [executing, setExecuting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<readonly Key[] | null>(null);

  useEffect(() => {
    setExpandedKeys(null);
  }, [runId]);

  const [run, setRun] = useState<TeamRun | null>(null);

  const fetchRun = useCallback(async () => {
    if (!open || !runId) return;
    try {
      const data = await api.teamRun(runId);
      setRun(data);
    } catch {}
  }, [open, runId]);

  useEffect(() => {
    if (!open || !runId) {
      setRun(null);
      return;
    }
    fetchRun();
  }, [open, runId, fetchRun]);

  useServerEvent("teams", () => {
    if (open && runId) fetchRun();
  });

  useServerEvent("tasks", () => {
    if (open && runId) fetchRun();
  });

  const isActive =
    run !== null &&
    (run.status === "planning" ||
      run.status === "planned" ||
      run.status === "running" ||
      run.status === "reviewing");

  const handleExecute = async () => {
    if (!run) return;
    setExecuting(true);
    try {
      await api.executeTeamRun(run.id);
      message.success("Plan execution started");
      fetchRun();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to execute plan");
    } finally {
      setExecuting(false);
    }
  };

  const handleCancel = async () => {
    if (!run) return;
    setCancelling(true);
    try {
      await api.cancelTeamRun(run.id);
      message.success("Run cancelled");
      fetchRun();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to cancel run");
    } finally {
      setCancelling(false);
    }
  };

  const columns: TableColumnsType<TeamRunTask> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 90,
      render: (id: string) => <Typography.Text code>{id}</Typography.Text>,
    },
    {
      title: "Title",
      dataIndex: "title",
      render: (title: string, task: TeamRunTask) => (
        <Flex vertical>
          <Typography.Text strong={Boolean(task.taskId)}>{title}</Typography.Text>
          {task.taskId && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Log: {task.taskId}
            </Typography.Text>
          )}
        </Flex>
      ),
    },
    {
      title: "Assignee",
      dataIndex: "assignee",
      width: 140,
      render: (assignee: string) => (
        <Flex align="center" gap={6}>
          <AccountAvatar accountId={assignee} size={20} />
          <Tag style={{ marginInlineEnd: 0 }}>{assignee}</Tag>
        </Flex>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      width: 130,
    },
    {
      title: "Depends on",
      dataIndex: "depends_on",
      width: 110,
      render: (deps: string[]) => (deps && deps.length ? deps.join(", ") : "-"),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (status) => <TeamTaskStatusTag status={status} />,
    },
    {
      title: "Error",
      dataIndex: "error",
      width: 140,
      render: (err: string | null) => (err ? <Typography.Text type="danger" ellipsis>{err}</Typography.Text> : "-"),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={isMobile ? "100%" : 780}
      destroyOnHidden
      title={
        run ? (
          <Flex align="center" gap={10} wrap>
            <Typography.Text strong>{run.teamName}</Typography.Text>
            <TeamRunStatusTag status={run.status} />
          </Flex>
        ) : (
          "Team Run"
        )
      }
      extra={
        run && (
          <Flex gap={8}>
            {run.status === "planned" && (
              <Button type="primary" icon={<CheckOutlined />} onClick={handleExecute} loading={executing}>
                Build this plan
              </Button>
            )}
            {isActive && (
              <Popconfirm
                title="Cancel this team run?"
                okText="Cancel run"
                cancelText="Keep running"
                okButtonProps={{ danger: true }}
                onConfirm={handleCancel}
              >
                <Button danger icon={<StopOutlined />} loading={cancelling}>
                  Cancel
                </Button>
              </Popconfirm>
            )}
          </Flex>
        )
      }
    >
      {!run ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Flex vertical gap={16}>
          {run.error && <Alert type="error" showIcon message="Run reported a problem" description={run.error} />}

          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, md: 2 }}
            items={[
              {
                key: "team",
                label: "Team",
                children: run.teamName,
              },
              {
                key: "mode",
                label: "Mode",
                children: <Tag style={{ marginInlineEnd: 0 }}>{run.mode === "plan" ? "Plan first" : "Plan and build"}</Tag>,
              },
              {
                key: "workspace",
                label: "Workspace",
                span: { xs: 1, md: 2 },
                children: (
                  <Typography.Text copyable style={{ wordBreak: "break-all" }}>
                    {run.workspace}
                  </Typography.Text>
                ),
              },
              {
                key: "leader",
                label: "Leader",
                span: { xs: 1, md: 2 },
                children: (
                  <Flex align="center" gap={8} wrap>
                    <Flex align="center" gap={6}>
                      <AccountAvatar accountId={run.leader.account} size={20} />
                      <Tag style={{ marginInlineEnd: 0 }}>{run.leader.account}</Tag>
                    </Flex>
                    {run.leader.taskId ? (
                      <Button
                        type="link"
                        size="small"
                        icon={<FileTextOutlined />}
                        onClick={() => run.leader.taskId && onOpenTask(run.leader.taskId)}
                        style={{ padding: 0 }}
                      >
                        Leader log
                      </Button>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        (No log yet)
                      </Typography.Text>
                    )}
                  </Flex>
                ),
              },
              {
                key: "started",
                label: "Started",
                children: formatDateTime(run.startedAt),
              },
              {
                key: "finished",
                label: "Finished",
                children: formatDateTime(run.finishedAt),
              },
              {
                key: "tokens",
                label: "Total tokens",
                span: { xs: 1, md: 2 },
                children: (run.usage?.total_tokens ?? 0).toLocaleString(),
              },
            ]}
          />

          <div>
            <Typography.Title level={5} style={{ marginTop: 0 }}>Goal</Typography.Title>
            <Typography.Paragraph
              ellipsis={{ rows: 4, expandable: "collapsible" }}
              style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
            >
              {run.goal}
            </Typography.Paragraph>
          </div>

          {run.summary && (
            <div>
              <Typography.Title level={5} style={{ marginTop: 0 }}>Summary</Typography.Title>
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                {run.summary}
              </Typography.Paragraph>
            </div>
          )}

          <div>
            <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
              Tasks ({run.tasks?.length ?? 0})
            </Typography.Title>

            {run.status === "planned" && (run.tasks ?? []).some((task) => task.verification_command) && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 8 }}
                message="Review each task before you build"
                description="The leader wrote these instructions and check commands. Check commands run on this computer with your permissions."
              />
            )}

            {isMobile ? (
              <List
                dataSource={run.tasks ?? []}
                locale={{ emptyText: <Empty description="No tasks planned yet" /> }}
                renderItem={(task) => (
                  <Card
                    key={task.id}
                    size="small"
                    hoverable={Boolean(task.taskId)}
                    onClick={() => task.taskId && onOpenTask(task.taskId)}
                    style={{ marginBottom: 8 }}
                  >
                    <Flex justify="space-between" align="center" gap={8}>
                      <Typography.Text code>{task.id}</Typography.Text>
                      <TeamTaskStatusTag status={task.status} />
                    </Flex>
                    <Typography.Text strong style={{ display: "block", marginTop: 4 }}>
                      {task.title}
                    </Typography.Text>
                    <Flex gap={6} wrap align="center" style={{ marginTop: 6 }}>
                      <Flex align="center" gap={4}>
                        <AccountAvatar accountId={task.assignee} size={20} />
                        <Tag style={{ marginInlineEnd: 0 }}>{task.assignee}</Tag>
                      </Flex>
                      <Tag style={{ marginInlineEnd: 0 }}>{task.role}</Tag>
                      {task.depends_on?.length > 0 && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Depends on: {task.depends_on.join(", ")}
                        </Typography.Text>
                      )}
                    </Flex>
                    {task.error && (
                      <Typography.Text type="danger" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                        {task.error}
                      </Typography.Text>
                    )}
                    <div onClick={(event) => event.stopPropagation()} style={{ marginTop: 6 }}>
                      <Collapse
                        size="small"
                        ghost
                        defaultActiveKey={run.status === "planned" ? ["details"] : []}
                        items={[{ key: "details", label: "What this task will do", children: <TaskPlanDetails task={task} /> }]}
                      />
                    </div>
                    {task.taskId && (
                      <Typography.Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                        Tap to open log ({task.taskId})
                      </Typography.Text>
                    )}
                  </Card>
                )}
              />
            ) : (
              <Table<TeamRunTask>
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={run.tasks ?? []}
                pagination={false}
                expandable={{
                  expandedRowRender: (task) => <TaskPlanDetails task={task} />,
                  expandedRowKeys: expandedKeys ?? (run.status === "planned" ? (run.tasks ?? []).map((task) => task.id) : []),
                  onExpandedRowsChange: (keys) => setExpandedKeys(keys),
                }}
                rowClassName={(task) => (task.taskId ? "task-row" : "")}
                onRow={(task) => ({
                  onClick: () => {
                    if (task.taskId) onOpenTask(task.taskId);
                  },
                })}
                locale={{ emptyText: <Empty description="No tasks planned yet" /> }}
              />
            )}
          </div>

          {run.review && (
            <Card size="small" title="Review">
              <Flex vertical gap={8}>
                <Flex align="center" justify="space-between">
                  <Typography.Text strong>Status: {run.review.status}</Typography.Text>
                  {run.review.taskId && (
                    <Button
                      type="link"
                      size="small"
                      icon={<FileTextOutlined />}
                      onClick={() => run.review?.taskId && onOpenTask(run.review.taskId)}
                    >
                      Review log
                    </Button>
                  )}
                </Flex>
                <pre
                  className="log-view"
                  style={{
                    maxHeight: 240,
                    margin: 0,
                    overflow: "auto",
                  }}
                >
                  {run.review.output}
                </pre>
              </Flex>
            </Card>
          )}
        </Flex>
      )}
    </Drawer>
  );
}
