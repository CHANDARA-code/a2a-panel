import { useCallback, useEffect, useState } from "react";
import { Alert, App as AntApp, Button, Card, Empty, Flex, Skeleton, Tag, Typography, theme } from "antd";
import { ArrowLeftOutlined, FileMarkdownOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { PresetsResponse, Role } from "../api";
import { NewPresetModal } from "./NewPresetModal";
import { PresetEditor } from "./PresetEditor";

interface PresetsViewProps {
  isMobile: boolean;
}

export function PresetsView({ isMobile }: PresetsViewProps) {
  const { token } = theme.useToken();
  const { modal } = AntApp.useApp();
  const [catalog, setCatalog] = useState<PresetsResponse | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.presets();
      setCatalog(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load presets");
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().then((next) => {
      if (next && !isMobile) setSelected((current) => current ?? next.defaultPreset ?? next.presets[0]?.id ?? null);
    });
    api.roles().then((r) => setRoles(r.roles)).catch(() => {});
  }, [refresh]); // isMobile only matters for the first pick

  const guard = (action: () => void) => {
    if (!dirty) return action();
    modal.confirm({ title: "Discard unsaved changes?", okText: "Discard", okButtonProps: { danger: true }, onOk: action });
  };

  const presets = catalog?.presets ?? [];

  const list = (
    <Flex vertical gap={10}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={5} style={{ margin: 0 }}>Presets</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => guard(() => setCreating(true))}>New preset</Button>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Your coding style, libraries and default technology choices, written as markdown files. Tasks get the files that apply to their specialist.
      </Typography.Text>
      {!catalog && !error && <Skeleton active />}
      {catalog && presets.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No presets yet. Tasks run without preferences.">
          <Button onClick={() => setCreating(true)}>Create one from a template</Button>
        </Empty>
      )}
      {presets.map((preset) => (
        <Card
          key={preset.id}
          size="small"
          hoverable
          onClick={() => preset.id !== selected && guard(() => setSelected(preset.id))}
          style={preset.id === selected ? { borderColor: token.colorPrimary } : undefined}
          styles={{ body: { padding: 12 } }}
        >
          <Flex justify="space-between" align="center" gap={8}>
            <Typography.Text strong ellipsis>{preset.title}</Typography.Text>
            {preset.isDefault && <Tag color="success" style={{ marginInlineEnd: 0 }}>Default</Tag>}
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{preset.id}</Typography.Text>
          {preset.description && (
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 12, margin: "4px 0 0" }}>
              {preset.description}
            </Typography.Paragraph>
          )}
          <Flex gap={4} wrap style={{ marginTop: 8 }}>
            {preset.files.map((file) => (
              <Tag key={file.name} icon={<FileMarkdownOutlined />} style={{ marginInlineEnd: 0 }}>{file.name}</Tag>
            ))}
          </Flex>
        </Card>
      ))}
    </Flex>
  );

  const editor = selected ? (
    <PresetEditor
      key={selected}
      presetId={selected}
      roles={roles}
      isMobile={isMobile}
      onDirtyChange={setDirty}
      onSaved={refresh}
      onDeleted={() => {
        setDirty(false);
        setSelected(null);
        refresh();
      }}
    />
  ) : (
    <Empty description={presets.length ? "Choose a preset to edit" : "Create a preset to start"} style={{ marginTop: 48 }} />
  );

  return (
    <Flex vertical gap={16}>
      {error && <Alert type="error" showIcon message={error} />}
      {isMobile ? (
        selected ? (
          <Flex vertical gap={12}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => guard(() => setSelected(null))} style={{ alignSelf: "flex-start" }}>All presets</Button>
            {editor}
          </Flex>
        ) : (
          list
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
          {list}
          <Card styles={{ body: { padding: 20 } }}>{editor}</Card>
        </div>
      )}
      <NewPresetModal
        open={creating}
        catalog={catalog}
        onClose={() => setCreating(false)}
        onCreated={(preset) => {
          setCreating(false);
          setDirty(false);
          setSelected(preset.id);
          refresh();
        }}
      />
    </Flex>
  );
}
