import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App as AntApp, Button, Empty, Flex, Form, Input, Modal, Popconfirm, Segmented, Select, Skeleton, Tabs, Tag, Typography, theme } from "antd";
import { DeleteOutlined, SaveOutlined, StarFilled, StarOutlined, UndoOutlined } from "@ant-design/icons";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";
import type { Preset, Role } from "../api";
import { readRoles, setRoles, stripFrontmatter } from "../frontmatter";

const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}\.md$/;

interface EditableFile {
  key: string;
  name: string;
  content: string;
}

interface Draft {
  title: string;
  description: string;
  files: EditableFile[];
}

interface PresetEditorProps {
  presetId: string;
  roles: Role[];
  isMobile: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

let nextKey = 0;
const toDraft = (preset: Preset): Draft => ({
  title: preset.title,
  description: preset.description,
  files: preset.files.map((file) => ({ key: `f${nextKey++}`, name: file.name, content: file.content })),
});
const snapshot = (draft: Draft | null) => JSON.stringify(draft && { ...draft, files: draft.files.map(({ name, content }) => ({ name, content })) });

function fileProblem(files: EditableFile[]): string | null {
  const seen = new Set<string>();
  for (const file of files) {
    if (!FILE_NAME.test(file.name)) return `"${file.name}" is not a valid file name. Use lowercase letters, digits, "-", "_" or "." and end with .md`;
    if (seen.has(file.name)) return `Two files are named "${file.name}"`;
    seen.add(file.name);
  }
  return null;
}

export function PresetEditor({ presetId, roles, isMobile, onDirtyChange, onSaved, onDeleted }: PresetEditorProps) {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const [preset, setPreset] = useState<Preset | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState("");
  const [activeKey, setActiveKey] = useState<string>();
  const [view, setView] = useState<"write" | "preview">("write");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const dirtyRef = useRef(false);

  const load = (next: Preset) => {
    const fresh = toDraft(next);
    setPreset(next);
    setDraft(fresh);
    setSaved(snapshot(fresh));
    setActiveKey((key) => fresh.files.find((f) => f.key === key)?.key ?? fresh.files[0]?.key);
  };

  useEffect(() => {
    setPreset(null);
    setDraft(null);
    setLoadError(null);
    setSaveError(null);
    api.preset(presetId).then(load).catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load the preset"));
  }, [presetId]);

  const dirty = draft !== null && snapshot(draft) !== saved;
  useEffect(() => {
    if (dirtyRef.current !== dirty) {
      dirtyRef.current = dirty;
      onDirtyChange(dirty);
    }
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const roleOptions = useMemo(() => roles.map((role) => ({ value: role.id, label: role.id })), [roles]);

  if (loadError) return <Alert type="error" showIcon message={loadError} />;
  if (!preset || !draft) return <Skeleton active />;

  const updateFile = (key: string, patch: Partial<EditableFile>) =>
    setDraft({ ...draft, files: draft.files.map((file) => (file.key === key ? { ...file, ...patch } : file)) });

  const removeFile = (key: string) => {
    const files = draft.files.filter((file) => file.key !== key);
    setDraft({ ...draft, files });
    if (activeKey === key) setActiveKey(files[0]?.key);
  };

  const addFile = () => {
    const name = newName.trim().toLowerCase().replace(/\.md$/, "") + ".md";
    if (!FILE_NAME.test(name)) return message.error('Use lowercase letters, digits, "-", "_" or "."');
    if (draft.files.some((file) => file.name === name)) return message.error(`"${name}" already exists`);
    const title = name.replace(/\.md$/, "").replace(/[-_.]+/g, " ");
    const file = { key: `f${nextKey++}`, name, content: `---\ntitle: ${title.charAt(0).toUpperCase() + title.slice(1)}\n---\n- ` };
    setDraft({ ...draft, files: [...draft.files, file] });
    setActiveKey(file.key);
    setView("write");
    setAdding(false);
    setNewName("");
  };

  const save = async () => {
    const problem = fileProblem(draft.files);
    if (problem) return setSaveError(problem);
    setSaving(true);
    setSaveError(null);
    try {
      load(await api.savePreset(presetId, { title: draft.title, description: draft.description, files: draft.files.map(({ name, content }) => ({ name, content })) }));
      message.success("Preset saved");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleDefault = async () => {
    try {
      await api.setDefaultPreset(presetId, !preset.isDefault);
      setPreset({ ...preset, isDefault: !preset.isDefault });
      message.success(preset.isDefault ? "No default preset" : `"${preset.title}" is now the default`);
      onSaved();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not change the default");
    }
  };

  const remove = async () => {
    try {
      await api.deletePreset(presetId);
      message.success("Preset deleted");
      onDeleted();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const tabItems = draft.files.map((file) => {
    const fileRoles = readRoles(file.content);
    return {
      key: file.key,
      label: file.name,
      children: (
        <Flex vertical gap={12}>
          <Flex gap={12} wrap>
            <Input
              addonBefore="File"
              value={file.name}
              onChange={(event) => updateFile(file.key, { name: event.target.value.trim().toLowerCase() })}
              status={FILE_NAME.test(file.name) ? undefined : "error"}
              style={{ flex: "1 1 220px" }}
            />
            <Select
              mode="multiple"
              allowClear
              value={fileRoles}
              options={roleOptions}
              onChange={(value: string[]) => updateFile(file.key, { content: setRoles(file.content, value) })}
              placeholder="Applies to all specialists"
              maxTagCount="responsive"
              style={{ flex: "2 1 300px" }}
            />
          </Flex>
          <Flex justify="space-between" align="center" wrap gap={8}>
            <Segmented
              value={view}
              onChange={(value) => setView(value as "write" | "preview")}
              options={[
                { value: "write", label: "Write" },
                { value: "preview", label: "Preview" },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {fileRoles.length ? `Sent to ${fileRoles.length} specialist${fileRoles.length === 1 ? "" : "s"}` : "Sent to every specialist"} · {file.content.length.toLocaleString()} / 20,000
            </Typography.Text>
          </Flex>
          {view === "write" ? (
            <Input.TextArea
              className="preset-editor"
              value={file.content}
              onChange={(event) => updateFile(file.key, { content: event.target.value })}
              autoSize={{ minRows: isMobile ? 12 : 18, maxRows: 40 }}
              maxLength={20000}
              spellCheck={false}
            />
          ) : (
            <div className="markdown-preview" style={{ border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius, background: token.colorBgBase }}>
              <Markdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(file.content)}</Markdown>
            </div>
          )}
        </Flex>
      ),
    };
  });

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="flex-start" gap={12} wrap>
        <Flex vertical gap={4} style={{ minWidth: 0 }}>
          <Flex align="center" gap={8} wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>{preset.title}</Typography.Title>
            {preset.isDefault && <Tag color="success">Default</Tag>}
            {dirty && <Tag color="warning">Unsaved changes</Tag>}
          </Flex>
          <Typography.Text type="secondary" copyable={{ text: presetId }} style={{ fontSize: 12 }}>
            id: <Typography.Text code>{presetId}</Typography.Text>
          </Typography.Text>
        </Flex>
        <Flex gap={8} wrap>
          <Button icon={preset.isDefault ? <StarFilled /> : <StarOutlined />} onClick={toggleDefault}>
            {preset.isDefault ? "Unset default" : "Set as default"}
          </Button>
          <Popconfirm title="Delete this preset?" description="Its markdown files are removed." okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
            <Button danger icon={<DeleteOutlined />} aria-label="Delete preset">{isMobile ? null : "Delete"}</Button>
          </Popconfirm>
          {dirty && <Button icon={<UndoOutlined />} onClick={() => load(preset)}>{isMobile ? null : "Discard"}</Button>}
          <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={!dirty}>Save</Button>
        </Flex>
      </Flex>

      {saveError && <Alert type="error" showIcon message={saveError} closable onClose={() => setSaveError(null)} />}

      <Form layout="vertical" requiredMark={false}>
        <Flex gap={12} wrap>
          <Form.Item label="Title" style={{ flex: "1 1 220px", marginBottom: 0 }}>
            <Input value={draft.title} maxLength={80} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Form.Item>
          <Form.Item label="Description" style={{ flex: "2 1 320px", marginBottom: 0 }}>
            <Input value={draft.description} maxLength={300} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Form.Item>
        </Flex>
      </Form>

      {draft.files.length ? (
        <Tabs
          type="editable-card"
          activeKey={activeKey}
          onChange={setActiveKey}
          onEdit={(key, action) => (action === "add" ? setAdding(true) : removeFile(String(key)))}
          items={tabItems}
        />
      ) : (
        <Empty description="This preset has no files yet">
          <Button type="primary" onClick={() => setAdding(true)}>Add a markdown file</Button>
        </Empty>
      )}

      <Modal open={adding} title="Add a file" okText="Add" onOk={addFile} onCancel={() => setAdding(false)} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          One topic per file, for example coding-style, frontend, api, testing or tech-defaults.
        </Typography.Paragraph>
        <Input autoFocus addonAfter=".md" placeholder="state-management" value={newName} onChange={(event) => setNewName(event.target.value)} onPressEnter={addFile} />
      </Modal>
    </Flex>
  );
}
