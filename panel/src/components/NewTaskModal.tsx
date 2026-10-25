import { useEffect, useState } from "react";
import { Alert, App as AntApp, AutoComplete, Button, Drawer, Flex, Form, Input, Modal, Radio, Select, Typography } from "antd";
import { api } from "../api";
import type { DispatchInput, Role } from "../api";

interface NewTaskModalProps {
  open: boolean;
  isMobile: boolean;
  initial?: Partial<DispatchInput>;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}

const STORAGE_KEY = "a2a_panel_last_task";
const EFFORT_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
const DEFAULTS: DispatchInput = { role: "lead-software-engineer", workspace: "", prompt: "", mode: "plan", effort: "high" };

function loadRemembered(): Partial<DispatchInput> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { role: raw.role, workspace: raw.workspace, effort: raw.effort };
  } catch {
    return {};
  }
}

export function NewTaskModal({ open, isMobile, initial, onClose, onCreated }: NewTaskModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<DispatchInput>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [efforts, setEfforts] = useState<string[]>(["low", "medium", "high", "xhigh", "max"]);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startValues, setStartValues] = useState<DispatchInput>(DEFAULTS);
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
    setStartValues(values);
    setFormKey((key) => key + 1);
    api.roles().then((r) => {
      setRoles(r.roles);
      setEfforts(r.efforts);
    }).catch(() => {});
    api.workspaces().then(setWorkspaces).catch(() => {});
  }, [open, initial]);

  const submit = async () => {
    let values: DispatchInput;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { taskId } = await api.dispatch({ ...values, prompt: values.prompt.trim(), workspace: values.workspace.trim() });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: values.role, workspace: values.workspace.trim(), effort: values.effort }));
      } catch {}
      message.success("Task dispatched");
      onCreated(taskId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <Form key={formKey} form={form} initialValues={startValues} layout="vertical" requiredMark={false} disabled={submitting}>
      {submitError && <Alert type="error" showIcon message={submitError} style={{ marginBottom: 16 }} />}
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
    <Flex justify="flex-end" gap={8}>
      <Button onClick={onClose} disabled={submitting}>Cancel</Button>
      <Button type="primary" onClick={submit} loading={submitting}>Dispatch</Button>
    </Flex>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onClose={onClose} placement="bottom" size="92dvh" title="New task" destroyOnHidden footer={footer} styles={{ body: { paddingBottom: 8 } }}>
        {content}
      </Drawer>
    );
  }

  return (
    <Modal open={open} onCancel={onClose} title="New task" width={640} footer={footer} destroyOnHidden maskClosable={!submitting}>
      {content}
    </Modal>
  );
}
