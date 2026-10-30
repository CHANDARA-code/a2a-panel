import { useEffect, useState } from "react";
import { Alert, App as AntApp, AutoComplete, Button, Drawer, Flex, Form, Input, Modal, Radio, Select, Tag, Typography, theme } from "antd";
import { EyeOutlined, FileMarkdownOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { Account, DispatchInput, PresetSummary, PromptPreview, Provider, Role } from "../api";
import { AccountStatusDot } from "./StatusTag";
import { AccountAvatar } from "./AccountAvatar";
import { ProviderIcon } from "./ProviderIcon";

interface NewTaskModalProps {
  open: boolean;
  isMobile: boolean;
  initial?: Partial<DispatchInput>;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}

const STORAGE_KEY = "a2a_panel_last_task";
const EFFORT_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
const PROVIDER_NAMES: Record<string, string> = { agy: "Antigravity", claude: "Claude Code", codex: "Codex" };
const DEFAULTS: DispatchInput = { role: "lead-software-engineer", workspace: "", prompt: "", mode: "plan", effort: "high", account: "agy" };
const NO_PRESET = "__none__";

type FormValues = Omit<DispatchInput, "preset"> & { preset: string };

function loadRemembered(): Partial<DispatchInput> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { role: raw.role, workspace: raw.workspace, effort: raw.effort, account: raw.account };
  } catch {
    return {};
  }
}

export function NewTaskModal({ open, isMobile, initial, onClose, onCreated }: NewTaskModalProps) {
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm<FormValues>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [efforts, setEfforts] = useState<string[]>(["low", "medium", "high", "xhigh", "max"]);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startValues, setStartValues] = useState<FormValues>({ ...DEFAULTS, preset: NO_PRESET });
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const mode = Form.useWatch("mode", form);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    const remembered = loadRemembered();
    const values: DispatchInput = { ...DEFAULTS };
    for (const source of [remembered, initial ?? {}]) {
      for (const key of Object.keys(source) as (keyof DispatchInput)[]) {
        const value = source[key];
        if (value) values[key] = value;
      }
    }
    const explicitPreset = initial && "preset" in initial;
    setStartValues({ ...values, preset: explicitPreset ? initial.preset ?? NO_PRESET : NO_PRESET });
    setFormKey((key) => key + 1);
    api.presets().then((r) => {
      setPresets(r.presets);
      if (!explicitPreset && r.defaultPreset) form.setFieldValue("preset", r.defaultPreset);
    }).catch(() => {});
    api.roles().then((r) => {
      setRoles(r.roles);
      setEfforts(r.efforts);
    }).catch(() => {});
    api.workspaces().then(setWorkspaces).catch(() => {});
    api.accounts().then((r) => {
      setAccounts(r.accounts);
      setProviders(r.providers);
    }).catch(() => {});
  }, [open, initial, form]);

  const showPreview = async () => {
    const values = form.getFieldsValue();
    if (!values.role) return;
    setPreviewing(true);
    try {
      setPreview(await api.previewPrompt({
        role: values.role,
        workspace: (values.workspace ?? "").trim(),
        prompt: values.prompt ?? "",
        preset: values.preset === NO_PRESET ? null : values.preset,
      }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { taskId } = await api.dispatch({
        ...values,
        prompt: values.prompt.trim(),
        workspace: values.workspace.trim(),
        preset: values.preset === NO_PRESET ? null : values.preset,
        account: values.account,
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          role: values.role,
          workspace: values.workspace.trim(),
          effort: values.effort,
          account: values.account,
        }));
      } catch {}
      message.success("Task dispatched");
      onCreated(taskId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  };

  const accountGroups = (() => {
    const providerIds: ("agy" | "claude" | "codex")[] = ["agy", "claude", "codex"];
    return providerIds.map((pId) => {
      const provider = providers.find((p) => p.id === pId);
      const title = provider?.name || PROVIDER_NAMES[pId] || pId;
      const groupAccounts = accounts.filter((a) => a.provider === pId);
      return {
        label: (
          <Flex align="center" gap={6}>
            <ProviderIcon provider={provider ?? pId} size={16} />
            <span>{title}</span>
          </Flex>
        ),
        options: groupAccounts.map((a) => ({
          value: a.id,
          label: a.label || a.id,
          id: a.id,
          state: a.status?.state ?? "unknown",
        })),
      };
    }).filter((g) => g.options.length > 0);
  })();

  const content = (
    <Form key={formKey} form={form} initialValues={startValues} layout="vertical" requiredMark={false} disabled={submitting}>
      {submitError && <Alert type="error" showIcon message={submitError} style={{ marginBottom: 16 }} />}
      <Form.Item name="account" label="Account" rules={[{ required: true, message: "Select an account" }]}>
        <Select
          options={accountGroups.length > 0 ? accountGroups : [{
            label: (
              <Flex align="center" gap={6}>
                <ProviderIcon providerId="agy" size={16} />
                <span>Antigravity</span>
              </Flex>
            ),
            options: [{ value: "agy", label: "Antigravity (default)", id: "agy", state: "signed-in" as const }],
          }]}
          labelRender={(props) => (
            <Flex align="center" gap={6}>
              <AccountAvatar accountId={String(props.value)} accounts={accounts} size={20} />
              <span>{props.label}</span>
            </Flex>
          )}
          optionRender={(option) => {
            const item = option.data as unknown as { value?: string; label?: string; id?: string; state?: Account["status"]["state"] };
            return (
              <Flex align="center" justify="space-between" gap={8}>
                <Flex align="center" gap={6}>
                  <AccountAvatar accountId={item.value ?? item.id} accounts={accounts} size={20} />
                  {item.state && <AccountStatusDot state={item.state} />}
                  <Typography.Text>{item.label ?? ""}</Typography.Text>
                </Flex>
                {item.id && (
                  <Typography.Text type="secondary" code style={{ fontSize: 11 }}>
                    {item.id}
                  </Typography.Text>
                )}
              </Flex>
            );
          }}
        />
      </Form.Item>
      <Form.Item name="role" label="Specialist" rules={[{ required: true, message: "Choose a specialist" }]}>
        <Select
          showSearch
          optionFilterProp="label"
          loading={roles.length === 0}
          options={roles.map((role) => ({ value: role.id, label: role.name, description: role.description }))}
          optionRender={(option) => (
            <Flex vertical>
              <Typography.Text strong>{option.data.label}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "normal" }}>
                {option.data.description}
              </Typography.Text>
            </Flex>
          )}
        />
      </Form.Item>
      <Form.Item
        name="workspace"
        label="Workspace path"
        rules={[
          { required: true, message: "Enter the workspace folder" },
          { pattern: /^\/\S.*$/, message: "Use an absolute path starting with /" },
        ]}
      >
        <AutoComplete
          options={workspaces.map((value) => ({ value }))}
          filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
          placeholder="/Users/you/project"
        />
      </Form.Item>
      <Form.Item
        name="prompt"
        label="Task"
        rules={[
          { required: true, whitespace: true, message: "Describe the task" },
          { max: 20000, message: "Keep the task under 20000 characters" },
          { validator: (_, value: string) => (value?.trim().startsWith("--") ? Promise.reject(new Error('The task must not start with "--"')) : Promise.resolve()) },
        ]}
      >
        <Input.TextArea autoSize={{ minRows: 5, maxRows: 14 }} placeholder="What should the specialist do? Include file paths and acceptance criteria." showCount maxLength={20000} />
      </Form.Item>
      <Form.Item
        name="preset"
        label="Preset"
        extra="Coding style and technology preferences sent with the task. Files in the workspace's .agy/preferences folder are always added."
      >
        <Select
          options={[
            { value: NO_PRESET, label: "No preset", files: "" },
            ...presets.map((p) => ({ value: p.id, label: p.isDefault ? `${p.title} (default)` : p.title, files: p.files.map((f) => f.name).join(", ") })),
          ]}
          optionRender={(option) => (
            <Flex vertical>
              <Typography.Text>{option.data.label}</Typography.Text>
              {option.data.files && <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "normal" }}>{option.data.files}</Typography.Text>}
            </Flex>
          )}
        />
      </Form.Item>
      <Flex gap={16} wrap>
        <Form.Item name="mode" label="Mode" style={{ flex: "1 1 220px" }}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: "plan", label: "Plan only" },
              { value: "accept-edits", label: "Edit files" },
            ]}
          />
        </Form.Item>
        <Form.Item name="effort" label="Effort" style={{ flex: "1 1 160px" }}>
          <Select options={efforts.map((value) => ({ value, label: EFFORT_LABELS[value] ?? value }))} />
        </Form.Item>
      </Flex>
      {mode === "accept-edits" && (
        <Alert type="warning" showIcon message="This specialist can edit files and run commands inside the workspace." />
      )}
    </Form>
  );

  const footer = (
    <Flex justify="space-between" gap={8}>
      <Button icon={<EyeOutlined />} onClick={showPreview} loading={previewing} disabled={submitting}>
        {isMobile ? "Preview" : "Preview prompt"}
      </Button>
      <Flex gap={8}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button type="primary" onClick={submit} loading={submitting}>Dispatch</Button>
      </Flex>
    </Flex>
  );

  const previewModal = (
    <Modal open={preview !== null} title="Prompt the agent will receive" footer={null} onCancel={() => setPreview(null)} width={isMobile ? "100%" : 760}>
      {preview && (
        <Flex vertical gap={12}>
          <Flex gap={6} wrap align="center">
            <Typography.Text type="secondary">Preset: {preview.preset ?? "none"}</Typography.Text>
            {preview.files.map((file) => (
              <Tag key={file.name} icon={<FileMarkdownOutlined />} color={file.source === "workspace" ? "processing" : undefined}>
                {file.name}{file.source === "workspace" ? " (workspace)" : ""}
              </Tag>
            ))}
            {!preview.files.length && <Typography.Text type="secondary">· no preference files apply to this specialist</Typography.Text>}
          </Flex>
          <pre className="log-view" style={{ background: token.colorBgBase, border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius, color: token.colorText, maxHeight: "60dvh" }}>
            {preview.prompt}
          </pre>
        </Flex>
      )}
    </Modal>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onClose={onClose} placement="bottom" size="92dvh" title="New task" destroyOnHidden footer={footer} styles={{ body: { paddingBottom: 8 } }}>
        {content}
        {previewModal}
      </Drawer>
    );
  }

  return (
    <Modal open={open} onCancel={onClose} title="New task" width={640} footer={footer} destroyOnHidden maskClosable={!submitting}>
      {content}
      {previewModal}
    </Modal>
  );
}
