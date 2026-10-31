import { useEffect, useState } from "react";
import { Alert, App as AntApp, AutoComplete, Button, Flex, Form, Input, Modal, Segmented, Typography } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { Team, TeamRun, TeamRunMode } from "../api";

interface RunTeamModalProps {
  open: boolean;
  team: Team | null;
  isMobile: boolean;
  onClose: () => void;
  onRunCreated: (run: TeamRun) => void;
}

interface FormValues {
  goal: string;
  workspace: string;
  mode: TeamRunMode;
}

export function RunTeamModal({ open, team, isMobile, onClose, onRunCreated }: RunTeamModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const mode = Form.useWatch("mode", form) ?? "plan";

  useEffect(() => {
    if (!open || !team) return;
    setError(null);
    form.resetFields();
    form.setFieldsValue({
      goal: "",
      workspace: team.workspace ?? "",
      mode: "plan",
    });
    api.workspaces().then(setWorkspaces).catch(() => {});
  }, [open, team, form]);

  const handleSubmit = async () => {
    if (!team) return;
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const run = await api.runTeam(team.id, {
        goal: values.goal.trim(),
        workspace: values.workspace.trim(),
        mode: values.mode,
      });
      message.success("Team run started");
      onRunCreated(run);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start team run";
      setError(msg);
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={team ? `Run Team: ${team.name}` : "Run Team"}
      onCancel={onClose}
      destroyOnHidden
      width={isMobile ? "100%" : 600}
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleSubmit} loading={submitting}>
            Run
          </Button>
        </Flex>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} disabled={submitting}>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

        <Form.Item
          name="goal"
          label="Goal"
          rules={[
            { required: true, whitespace: true, message: "Describe the goal" },
            { max: 20000, message: "Keep the goal under 20000 characters" },
          ]}
        >
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 12 }}
            placeholder="What should the team accomplish? Give clear requirements and constraints."
            showCount
            maxLength={20000}
          />
        </Form.Item>

        <Form.Item
          name="workspace"
          label="Workspace path"
          rules={[
            { required: true, message: "Enter workspace folder" },
            { pattern: /^\/\S.*$/, message: "Use an absolute path starting with /" },
          ]}
        >
          <AutoComplete
            options={workspaces.map((w) => ({ value: w }))}
            filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
            placeholder="/Users/you/project"
          />
        </Form.Item>

        <Form.Item name="mode" label="Execution mode">
          <Segmented<TeamRunMode>
            value={mode}
            onChange={(m) => form.setFieldValue("mode", m)}
            options={[
              { value: "plan", label: "Plan first" },
              { value: "accept-edits", label: "Plan and build" },
            ]}
          />
        </Form.Item>

        <Typography.Text type="secondary" style={{ display: "block", fontSize: 13, marginTop: -8, marginBottom: 8 }}>
          {mode === "plan"
            ? "The leader only plans and you review before any coding."
            : "The leader plans and developers code the tasks directly."}
        </Typography.Text>
      </Form>
    </Modal>
  );
}
