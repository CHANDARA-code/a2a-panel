import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Collapse,
  Empty,
  Flex,
  Popconfirm,
  Progress,
  Segmented,
  Skeleton,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
} from "antd";
import type { GlobalToken } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { accountDisplayName, api } from "../api";
import type { AccountUsageEntry, AccountUsageReport, ProviderId } from "../api";
import { formatAgo, formatDurationUntil } from "../format";
import { useServerEvent } from "../events";
import { BudgetModal } from "./BudgetModal";
import { DailyUsageChart } from "./DailyUsageChart";
import { AccountAvatar } from "./AccountAvatar";
import { ProviderIcon } from "./ProviderIcon";

interface UsageViewProps {
  isMobile: boolean;
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
  agy: "Antigravity",
  claude: "Claude Code",
  codex: "Codex",
};

function getStatusDetails(percent: number, token: GlobalToken) {
  if (percent >= 90) {
    return {
      color: token.colorError,
      icon: <CloseCircleOutlined style={{ color: token.colorError }} />,
      word: "Almost out",
      wordColor: token.colorError,
    };
  }
  if (percent >= 70) {
    return {
      color: token.colorWarning,
      icon: <ExclamationCircleOutlined style={{ color: token.colorWarning }} />,
      word: "Getting close",
      wordColor: token.colorWarning,
    };
  }
  return {
    color: token.colorSuccess,
    icon: <CheckCircleOutlined style={{ color: token.colorSuccess }} />,
    word: "OK",
    wordColor: token.colorSuccess,
  };
}

export function UsageView({ isMobile }: UsageViewProps) {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const [days, setDays] = useState<number>(30);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountUsageEntry | null>(null);

  const [report, setReport] = useState<AccountUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.usage(days);
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  useServerEvent("usage", () => {
    fetchUsage();
  });

  const accountsNearLimit = useMemo(() => {
    return (report?.accounts ?? []).filter((acc) => {
      if (acc.limits?.status === "limited") return true;
      if (acc.limits?.windows?.some((w) => w.usedPercent !== null && w.usedPercent >= 70)) return true;
      if (acc.budgetUsed && acc.budgetUsed.percent >= 70) return true;
      return false;
    }).length;
  }, [report?.accounts]);

  const { activeAccounts, zeroAccounts } = useMemo(() => {
    const active: AccountUsageEntry[] = [];
    const zero: AccountUsageEntry[] = [];
    for (const acc of report?.accounts ?? []) {
      const hasTokens = acc.totals.total_tokens > 0;
      const hasTasks = acc.totals.tasks > 0;
      const hasLimits = Boolean(acc.limits?.windows && acc.limits.windows.length > 0);
      const hasBudget = acc.budget !== null && acc.budget !== undefined;
      if (hasTokens || hasTasks || hasLimits || hasBudget) {
        active.push(acc);
      } else {
        zero.push(acc);
      }
    }
    return { activeAccounts: active, zeroAccounts: zero };
  }, [report?.accounts]);

  const openSetBudget = (account: AccountUsageEntry) => {
    setSelectedAccount(account);
    setBudgetModalOpen(true);
  };

  const handleRemoveBudget = async (accountId: string) => {
    try {
      await api.deleteBudget(accountId);
      message.success("Budget removed");
      fetchUsage();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to remove budget");
    }
  };

  const hasCost = (report?.totals?.cost_usd ?? 0) > 0;

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align={isMobile ? "stretch" : "center"} vertical={isMobile} gap={12}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Usage Monitor
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Token usage, real plan quotas, and budgets across configured accounts.
          </Typography.Text>
        </div>

        <Flex gap={8} align="center" justify={isMobile ? "space-between" : "flex-end"}>
          <Segmented<number>
            value={days}
            onChange={(val) => setDays(val)}
            options={[
              { value: 7, label: "7 days" },
              { value: 30, label: "30 days" },
              { value: 90, label: "90 days" },
            ]}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => fetchUsage()}
            aria-label="Refresh usage data"
          />
        </Flex>
      </Flex>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load usage report"
          description={error.message}
        />
      )}

      {loading && !report && <Skeleton active paragraph={{ rows: 6 }} />}

      {report && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : hasCost
                ? "repeat(4, minmax(0, 1fr))"
                : "repeat(3, minmax(0, 1fr))",
              gap: isMobile ? 8 : 16,
            }}
          >
            <Card size="small" styles={{ body: { padding: isMobile ? 12 : 16 } }}>
              <Statistic
                title="Tokens in range"
                value={report.totals.total_tokens}
                formatter={(val) => Number(val).toLocaleString()}
                valueStyle={{ fontWeight: 600, color: token.colorText }}
              />
            </Card>
            <Card size="small" styles={{ body: { padding: isMobile ? 12 : 16 } }}>
              <Statistic
                title="Tasks"
                value={report.totals.tasks}
                formatter={(val) => Number(val).toLocaleString()}
                valueStyle={{ fontWeight: 600, color: token.colorText }}
              />
            </Card>
            {hasCost && (
              <Card size="small" styles={{ body: { padding: isMobile ? 12 : 16 } }}>
                <Statistic
                  title="API-equivalent cost"
                  value={report.totals.cost_usd}
                  precision={2}
                  prefix="$"
                  valueStyle={{ fontWeight: 600, color: token.colorText }}
                />
              </Card>
            )}
            <Card size="small" styles={{ body: { padding: isMobile ? 12 : 16 } }}>
              <Statistic
                title="Near plan limit"
                value={accountsNearLimit}
                valueStyle={{
                  fontWeight: 600,
                  color: accountsNearLimit > 0 ? token.colorWarning : token.colorSuccess,
                }}
              />
            </Card>
          </div>

          {activeAccounts.length === 0 && zeroAccounts.length === 0 && (
            <Empty description="No accounts found" />
          )}

          {activeAccounts.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 16,
              }}
            >
              {activeAccounts.map((account) => {
                const bUsed = account.budgetUsed;
                const bPct = bUsed ? Math.min(100, bUsed.percent) : 0;
                const bStatus = getStatusDetails(bPct, token);
                const hasModelCost = account.byModel.some((m) => (m.cost_usd ?? 0) > 0);

                return (
                  <Card
                    key={account.id}
                    size="small"
                    styles={{ body: { padding: 14 } }}
                    style={{ minWidth: 0 }}
                  >
                    <Flex vertical gap={12}>
                      <Flex justify="space-between" align="flex-start" gap={8} wrap>
                        <Flex align="center" gap={10} style={{ minWidth: 0, flex: "1 1 auto" }}>
                          <AccountAvatar accountId={account.id} size={32} />
                          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                            <Typography.Text strong style={{ fontSize: 15, display: "block" }} ellipsis>
                              {accountDisplayName(account)}
                            </Typography.Text>
                            <Typography.Text code copyable style={{ fontSize: 12 }}>
                              {account.id}
                            </Typography.Text>
                          </div>
                        </Flex>
                        <Flex gap={4} wrap align="center">
                          <Tag style={{ marginInlineEnd: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <ProviderIcon providerId={account.provider} size={16} />
                            <span>{PROVIDER_NAMES[account.provider] ?? account.provider}</span>
                          </Tag>
                          {account.system && (
                            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                              Default
                            </Tag>
                          )}
                        </Flex>
                      </Flex>

                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Last used: {account.lastUsedAt ? formatAgo(account.lastUsedAt) : "Never"}
                      </Typography.Text>

                      {account.limits?.status === "limited" && (
                        <Alert
                          type="error"
                          showIcon
                          message="Account limited"
                          description={account.limits.detail || "Provider rate limit active"}
                          style={{ margin: 0 }}
                        />
                      )}

                      <div
                        style={{
                          border: `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: token.borderRadiusSM,
                          padding: 10,
                        }}
                      >
                        <Typography.Text strong style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                          Quota
                        </Typography.Text>
                        {!account.limits?.windows || account.limits.windows.length === 0 ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {PROVIDER_NAMES[account.provider] ?? account.provider} does not report plan
                            quota; token counts only.
                          </Typography.Text>
                        ) : (
                          <Flex vertical gap={8}>
                            {account.limits.windows.map((win) => {
                              const pct = win.usedPercent ?? 0;
                              const status = getStatusDetails(pct, token);
                              return (
                                <Flex vertical gap={2} key={win.name}>
                                  <Flex justify="space-between" align="center" wrap gap={4}>
                                    <Typography.Text style={{ fontSize: 12 }}>
                                      {win.label}
                                    </Typography.Text>
                                    <Flex align="center" gap={4}>
                                      {status.icon}
                                      <Typography.Text
                                        style={{ color: status.wordColor, fontSize: 12, fontWeight: 500 }}
                                      >
                                        {status.word}
                                      </Typography.Text>
                                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        ({win.usedPercent !== null ? `${Math.round(win.usedPercent)}%` : "N/A"})
                                      </Typography.Text>
                                    </Flex>
                                  </Flex>
                                  <Progress
                                    percent={win.usedPercent ?? 0}
                                    strokeColor={status.color}
                                    showInfo={false}
                                    size="small"
                                  />
                                  {win.resetsAt && (
                                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                      resets in {formatDurationUntil(win.resetsAt)}
                                    </Typography.Text>
                                  )}
                                </Flex>
                              );
                            })}
                          </Flex>
                        )}
                      </div>

                      <div
                        style={{
                          border: `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: token.borderRadiusSM,
                          padding: 10,
                        }}
                      >
                        {account.budget ? (
                          <Flex vertical gap={4}>
                            <Flex justify="space-between" align="center" wrap gap={4}>
                              <Flex align="center" gap={6}>
                                <Typography.Text strong style={{ fontSize: 12 }}>
                                  Budget
                                </Typography.Text>
                                {account.budget.stop && (
                                  <Tag color="error" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                    Stops new tasks
                                  </Tag>
                                )}
                              </Flex>
                              <Flex align="center" gap={4}>
                                {bStatus.icon}
                                <Typography.Text
                                  style={{ color: bStatus.wordColor, fontSize: 12, fontWeight: 500 }}
                                >
                                  {bStatus.word}
                                </Typography.Text>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  ({Math.round(bPct)}%)
                                </Typography.Text>
                              </Flex>
                            </Flex>
                            <Progress
                              percent={bPct}
                              strokeColor={bStatus.color}
                              showInfo={false}
                              size="small"
                            />
                            <Flex justify="space-between" align="center" wrap gap={4} style={{ marginTop: 2 }}>
                              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                {(bUsed?.tokens ?? 0).toLocaleString()} of{" "}
                                {account.budget.tokens.toLocaleString()} tokens this {account.budget.period}
                              </Typography.Text>
                              <Flex gap={2}>
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<EditOutlined />}
                                  onClick={() => openSetBudget(account)}
                                  style={{ padding: "0 4px", height: "auto" }}
                                >
                                  Edit
                                </Button>
                                <Popconfirm
                                  title="Remove budget for this account?"
                                  okText="Remove"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => handleRemoveBudget(account.id)}
                                >
                                  <Button
                                    type="link"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    style={{ padding: "0 4px", height: "auto" }}
                                  >
                                    Remove
                                  </Button>
                                </Popconfirm>
                              </Flex>
                            </Flex>
                          </Flex>
                        ) : (
                          <Flex justify="space-between" align="center">
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              No budget set
                            </Typography.Text>
                            <Button
                              type="link"
                              size="small"
                              icon={<SettingOutlined />}
                              onClick={() => openSetBudget(account)}
                            >
                              Set budget
                            </Button>
                          </Flex>
                        )}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                        <Card size="small" styles={{ body: { padding: 8 } }}>
                          <Statistic
                            title={<span style={{ fontSize: 11 }}>Today</span>}
                            value={account.today.total_tokens}
                            formatter={(val) => Number(val).toLocaleString()}
                            valueStyle={{ fontSize: 13, fontWeight: 600, color: token.colorText }}
                            suffix={
                              <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                ({account.today.tasks})
                              </span>
                            }
                          />
                        </Card>
                        <Card size="small" styles={{ body: { padding: 8 } }}>
                          <Statistic
                            title={<span style={{ fontSize: 11 }}>Last 7d</span>}
                            value={account.last7d.total_tokens}
                            formatter={(val) => Number(val).toLocaleString()}
                            valueStyle={{ fontSize: 13, fontWeight: 600, color: token.colorText }}
                            suffix={
                              <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                ({account.last7d.tasks})
                              </span>
                            }
                          />
                        </Card>
                        <Card size="small" styles={{ body: { padding: 8 } }}>
                          <Statistic
                            title={<span style={{ fontSize: 11 }}>{days}d Total</span>}
                            value={account.totals.total_tokens}
                            formatter={(val) => Number(val).toLocaleString()}
                            valueStyle={{ fontSize: 13, fontWeight: 600, color: token.colorText }}
                            suffix={
                              <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                ({account.totals.tasks})
                              </span>
                            }
                          />
                        </Card>
                      </div>

                      <DailyUsageChart byDay={account.byDay} isMobile={isMobile} />

                      <Collapse
                        ghost
                        size="small"
                        items={[
                          {
                            key: "breakdown",
                            label: (
                              <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                                By role and model
                              </span>
                            ),
                            children: (
                              <Flex vertical gap={12}>
                                <div>
                                  <Typography.Text
                                    strong
                                    style={{ fontSize: 12, display: "block", marginBottom: 4 }}
                                  >
                                    By Role
                                  </Typography.Text>
                                  <Table
                                    size="small"
                                    rowKey="role"
                                    scroll={{ x: true }}
                                    dataSource={[...account.byRole].sort(
                                      (a, b) => b.total_tokens - a.total_tokens
                                    )}
                                    pagination={false}
                                    columns={[
                                      { title: "Role", dataIndex: "role", key: "role" },
                                      {
                                        title: "Tasks",
                                        dataIndex: "tasks",
                                        key: "tasks",
                                        align: "right",
                                        render: (n: number) => n.toLocaleString(),
                                      },
                                      {
                                        title: "Tokens",
                                        dataIndex: "total_tokens",
                                        key: "total_tokens",
                                        align: "right",
                                        render: (n: number) => n.toLocaleString(),
                                      },
                                    ]}
                                    locale={{ emptyText: "No role data" }}
                                  />
                                </div>
                                <div>
                                  <Typography.Text
                                    strong
                                    style={{ fontSize: 12, display: "block", marginBottom: 4 }}
                                  >
                                    By Model
                                  </Typography.Text>
                                  <Table
                                    size="small"
                                    rowKey="model"
                                    scroll={{ x: true }}
                                    dataSource={[...account.byModel].sort(
                                      (a, b) => b.total_tokens - a.total_tokens
                                    )}
                                    pagination={false}
                                    columns={[
                                      { title: "Model", dataIndex: "model", key: "model" },
                                      {
                                        title: "Tasks",
                                        dataIndex: "tasks",
                                        key: "tasks",
                                        align: "right",
                                        render: (n: number) => n.toLocaleString(),
                                      },
                                      {
                                        title: "Tokens",
                                        dataIndex: "total_tokens",
                                        key: "total_tokens",
                                        align: "right",
                                        render: (n: number) => n.toLocaleString(),
                                      },
                                      ...(hasModelCost
                                        ? [
                                            {
                                              title: "API-equivalent cost",
                                              dataIndex: "cost_usd",
                                              key: "cost_usd",
                                              align: "right" as const,
                                              render: (c: number) => `$${(c ?? 0).toFixed(2)}`,
                                            },
                                          ]
                                        : []),
                                    ]}
                                    locale={{ emptyText: "No model data" }}
                                  />
                                </div>
                              </Flex>
                            ),
                          },
                        ]}
                      />
                    </Flex>
                  </Card>
                );
              })}
            </div>
          )}

          {zeroAccounts.length > 0 && (
            <Card size="small" styles={{ body: { padding: 12 } }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                No usage in this range: {zeroAccounts.map((a) => `${accountDisplayName(a)} (${a.id})`).join(", ")}
              </Typography.Text>
            </Card>
          )}
        </>
      )}

      <BudgetModal
        open={budgetModalOpen}
        account={selectedAccount}
        onClose={() => setBudgetModalOpen(false)}
        onSuccess={() => fetchUsage()}
      />
    </Flex>
  );
}