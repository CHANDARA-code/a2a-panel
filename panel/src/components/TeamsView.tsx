import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  Flex,
  List,
  Popconfirm,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { accountDisplayName, api } from "../api";
import type { Account, Team, TeamRun } from "../api";
import { formatAgo, formatDateTime } from "../format";
import { useServerEvent } from "../events";
import { RunTeamModal } from "./RunTeamModal";
import { TeamEditor } from "./TeamEditor";
import { TeamRunDrawer } from "./TeamRunDrawer";
import { TeamRunStatusTag } from "./StatusTag";
import { AccountAvatar } from "./AccountAvatar";

interface TeamsViewProps {
  isMobile: boolean;
  onOpenTask: (taskId: string) => void;
}

export function TeamsView({ isMobile, onOpenTask }: TeamsViewProps) {
  const { message } = AntApp.useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [runs, setRuns] = useState<TeamRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const [runningTeam, setRunningTeam] = useState<Team | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshTeamsAndAccounts = useCallback(async () => {
    try {
      const [tRes, aRes] = await Promise.all([api.teams(), api.accounts()]);
      setTeams(tRes);
      setAccounts(aRes.accounts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRuns = useCallback(async () => {
    try {
      const r = await api.teamRuns();
      setRuns(r);
    } catch {}
  }, []);

  useEffect(() => {
    refreshTeamsAndAccounts();
  }, [refreshTeamsAndAccounts]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  useServerEvent("teams", () => {
    refreshRuns();
  });

  const handleDeleteTeam = async (team: Team) => {
    setDeletingId(team.id);
    try {
      await api.deleteTeam(team.id);
      message.success(`Team "${team.name}" deleted`);
      await refreshTeamsAndAccounts();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenNewTeam = () => {
    setEditingTeam(null);
    setEditorOpen(true);
  };

  const handleOpenEditTeam = (team: Team) => {
    setEditingTeam(team);
    setEditorOpen(true);
  };

  const handleRunCreated = (run: TeamRun) => {
    setRunningTeam(null);
    setSelectedRunId(run.id);
    refreshRuns();
  };

  const runColumns: TableColumnsType<TeamRun> = [
    {
      title: "Team",
      dataIndex: "teamName",
      width: 180,
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: "Goal",
      dataIndex: "goal",
      render: (goal: string) => (
        <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
          {goal}
        </Typography.Paragraph>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 130,
      render: (status) => <TeamRunStatusTag status={status} />,
    },
    {
      title: "Started",
      dataIndex: "startedAt",
      width: 130,
      render: (value: string) => (
        <Tooltip title={formatDateTime(value)}>
          <span>{formatAgo(value)}</span>
        </Tooltip>
      ),
    },
  ];

  return (
    <Flex vertical gap={24}>
      <Flex justify="space-between" align={isMobile ? "flex-start" : "center"} vertical={isMobile} gap={12}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Teams</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            A team leader account plans a goal into tasks, and member accounts code them.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenNewTeam}>
          New team
        </Button>
      </Flex>

      {error && <Alert type="error" showIcon message={error} />}
      {loading && !error && <Skeleton active paragraph={{ rows: 6 }} />}

      {!loading && teams.length === 0 && (
        <Empty description="No teams configured yet">
          <Button type="primary" onClick={handleOpenNewTeam}>
            Create your first team
          </Button>
        </Empty>
      )}

      {!loading && teams.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
          }}
        >
          {teams.map((team) => {
            const leaderAcc = accounts.find((a) => a.id === team.leader.account);
            return (
              <Card
                key={team.id}
                size="small"
                styles={{ body: { padding: 14 } }}
                actions={[
                  <Button
                    type="link"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    key="run"
                    onClick={() => setRunningTeam(team)}
                  >
                    Run
                  </Button>,
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    key="edit"
                    onClick={() => handleOpenEditTeam(team)}
                  >
                    Edit
                  </Button>,
                  <Popconfirm
                    key="del"
                    title="Delete this team?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeleteTeam(team)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deletingId === team.id}
                    >
                      Delete
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <Flex vertical gap={8}>
                  <Flex justify="space-between" align="flex-start" gap={8}>
                    <div>
                      <Typography.Text strong style={{ fontSize: 16, display: "block" }}>
                        {team.name}
                      </Typography.Text>
                      <Typography.Text code copyable style={{ fontSize: 12 }}>
                        {team.id}
                      </Typography.Text>
                    </div>
                    {team.preset && team.preset !== "none" && (
                      <Tag style={{ marginInlineEnd: 0 }}>{team.preset}</Tag>
                    )}
                  </Flex>

                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>
                    {team.description || "No description"}
                  </Typography.Paragraph>

                  <Flex align="center" gap={6} wrap style={{ marginTop: 4 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Leader:
                    </Typography.Text>
                    <AccountAvatar account={leaderAcc} accountId={team.leader.account} accounts={accounts} size={20} />
                    <Typography.Text style={{ fontSize: 12, fontWeight: 500 }}>
                      {leaderAcc ? accountDisplayName(leaderAcc) : team.leader.account}
                    </Typography.Text>
                    <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                      {leaderAcc?.provider ?? "agy"}
                    </Tag>
                  </Flex>

                  <Flex justify="space-between" align="center" style={{ fontSize: 12, marginTop: 4 }}>
                    <Flex align="center" gap={4}>
                      <UserOutlined />
                      <Typography.Text type="secondary">
                        {team.members.length} {team.members.length === 1 ? "member" : "members"}
                      </Typography.Text>
                    </Flex>
                    {team.maxParallel > 1 && (
                      <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>
                        Max {team.maxParallel} parallel
                      </Tag>
                    )}
                  </Flex>
                </Flex>
              </Card>
            );
          })}
        </div>
      )}

      <Flex vertical gap={12} style={{ marginTop: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Recent runs
        </Typography.Title>

        {isMobile ? (
          <List
            dataSource={runs}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No runs yet" /> }}
            renderItem={(run) => (
              <Card
                key={run.id}
                size="small"
                hoverable
                onClick={() => setSelectedRunId(run.id)}
                style={{ marginBottom: 8 }}
              >
                <Flex justify="space-between" align="center" gap={8}>
                  <Typography.Text strong>{run.teamName}</Typography.Text>
                  <TeamRunStatusTag status={run.status} />
                </Flex>
                <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {run.goal}
                </Typography.Paragraph>
                <Typography.Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                  {formatAgo(run.startedAt)}
                </Typography.Text>
              </Card>
            )}
          />
        ) : (
          <Table<TeamRun>
            rowKey="id"
            size="middle"
            columns={runColumns}
            dataSource={runs}
            pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
            rowClassName="task-row"
            onRow={(run) => ({ onClick: () => setSelectedRunId(run.id) })}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No runs yet" /> }}
          />
        )}
      </Flex>

      <TeamEditor
        open={editorOpen}
        team={editingTeam}
        accounts={accounts}
        isMobile={isMobile}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          refreshTeamsAndAccounts();
        }}
      />

      <RunTeamModal
        open={runningTeam !== null}
        team={runningTeam}
        isMobile={isMobile}
        onClose={() => setRunningTeam(null)}
        onRunCreated={handleRunCreated}
      />

      <TeamRunDrawer
        runId={selectedRunId}
        open={selectedRunId !== null}
        isMobile={isMobile}
        onClose={() => setSelectedRunId(null)}
        onOpenTask={(taskId) => {
          onOpenTask(taskId);
        }}
      />
    </Flex>
  );
}
