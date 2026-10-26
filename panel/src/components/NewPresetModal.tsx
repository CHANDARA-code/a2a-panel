import { useEffect, useState } from "react";
import { Alert, Flex, Form, Input, Modal, Radio, Select, Typography } from "antd";
import { api } from "../api";
import type { CreatePresetInput, Preset, PresetsResponse } from "../api";

interface NewPresetModalProps {
  open: boolean;
  catalog: PresetsResponse | null;
  onClose: () => void;
  onCreated: (preset: Preset) => void;
}

type Source = "template" | "copy" | "empty";

interface FormValues {
  source: Source;
  template?: string;
  from?: string;
  id: string;
  title?: string;
}

export function NewPresetModal({ open, catalog, onClose, onCreated }: NewPresetModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = Form.useWatch("source", form);
  const templates = catalog?.templates ?? [];
  const presets = catalog?.presets ?? [];

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    form.setFieldsValue({ source: templates.length ? "template" : "empty", template: templates[0]?.id });
  }, [open]);

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: CreatePresetInput = { id: values.id.trim(), title: values.title?.trim() || undefined };
    if (values.source === "template") input.template = values.template;
    if (values.source === "copy") input.from = values.from;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await api.createPreset(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the preset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} title="New preset" okText="Create" onOk={submit} confirmLoading={submitting} onCancel={onClose} destroyOnHidden width={560}>
      <Form form={form} layout="vertical" requiredMark={false} disabled={submitting}>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item name="source" label="Start from">
          <Radio.Group
            optionType="button"
            options={[
              { value: "template", label: "Template", disabled: !templates.length },
              { value: "copy", label: "Copy a preset", disabled: !presets.length },
              { value: "empty", label: "Empty" },
            ]}
          />
        </Form.Item>
        {source === "template" && (
          <Form.Item name="template" label="Template" rules={[{ required: true, message: "Choose a template" }]}>
            <Select
              options={templates.map((t) => ({ value: t.id, label: t.title, description: t.description, files: t.files.map((f) => f.name).join(", ") }))}
              optionRender={(option) => (
                <Flex vertical>
                  <Typography.Text strong>{option.data.label}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "normal" }}>{option.data.description}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "normal" }}>{option.data.files}</Typography.Text>
                </Flex>
              )}
            />
          </Form.Item>
        )}
        {source === "copy" && (
          <Form.Item name="from" label="Preset to copy" rules={[{ required: true, message: "Choose a preset" }]}>
            <Select options={presets.map((p) => ({ value: p.id, label: `${p.title} (${p.id})` }))} />
          </Form.Item>
        )}
        <Form.Item
          name="id"
          label="Preset id"
          extra='Used as the "preset" value from Claude Code, the CLI and the API.'
          rules={[
            { required: true, message: "Enter an id" },
            { pattern: /^[a-z0-9][a-z0-9-]{0,47}$/, message: 'Lowercase letters, digits and "-"' },
            { validator: (_, value: string) => (value === "none" || value === "default" ? Promise.reject(new Error(`"${value}" is reserved`)) : Promise.resolve()) },
          ]}
        >
          <Input placeholder="my-team" autoFocus />
        </Form.Item>
        <Form.Item name="title" label="Title (optional)">
          <Input placeholder="Defaults to the template's title" maxLength={80} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
