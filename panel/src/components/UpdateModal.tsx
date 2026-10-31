import { useState } from "react";
import { Alert, App as AntApp, Button, Collapse, Flex, Modal, Result, Typography } from "antd";
import { CloudDownloadOutlined, LinkOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { VersionInfo } from "../api";

interface UpdateModalProps {
  open: boolean;
  info: VersionInfo;
  onClose: () => void;
  onChange: (info: VersionInfo) => void;
}

export function UpdateModal({ open, info, onClose, onChange }: UpdateModalProps) {
  const { message } = AntApp.useApp();
  const [starting, setStarting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const state = info.update.state;
  const busy = state === "installing" || state === "restarting";

  const startUpdate = async () => {
    setStarting(true);
    setRefusal(null);
    try {
      onChange(await api.startUpdate());
    } catch (err) {
      const text = err instanceof Error ? err.message : "Update failed to start";
      setRefusal(text);
      message.error(text);
    } finally {
      setStarting(false);
    }
  };

  const target = info.update.version ?? info.latest;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Flex align="center" gap={8}>
          <CloudDownloadOutlined />
          <span>{`Update ${info.name}`}</span>
        </Flex>
      }
      footer={
        <Flex justify="space-between" align="center">
          <div>
            {info.notesUrl && (
              <Button type="link" icon={<LinkOutlined />} href={info.notesUrl} target="_blank" rel="noreferrer noopener" style={{ paddingInline: 0 }}>
                What's new
              </Button>
            )}
          </div>
          <Flex gap={8}>
            <Button onClick={onClose}>Close</Button>
            {info.canUpdate && !busy && state !== "installed" && (
              <Button type="primary" icon={<CloudDownloadOutlined />} loading={starting} onClick={startUpdate}>
                Update now
              </Button>
            )}
          </Flex>
        </Flex>
      }
    >
      <Flex vertical gap={14} style={{ marginTop: 12 }}>
        <Typography.Text>
          Version <Typography.Text strong>{target}</Typography.Text> is available. You have{" "}
          <Typography.Text strong>{info.current}</Typography.Text>.
        </Typography.Text>

        {state === "idle" && info.canUpdate && (
          <Typography.Text type="secondary">
            Update now installs {info.name}@{target} with npm and{" "}
            {info.restart === "manual" ? "then asks you to restart the server." : "restarts the server. This page reloads by itself when it is back."}{" "}
            Running tasks and team runs must finish first.
          </Typography.Text>
        )}

        {!info.canUpdate && info.command && (
          <Flex vertical gap={6}>
            <Typography.Text type="secondary">
              {info.install === "source" ? "This copy runs from a git clone. To update it, run in its folder:" : "To update, run:"}
            </Typography.Text>
            <Typography.Paragraph copyable code style={{ margin: 0 }}>
              {info.command}
            </Typography.Paragraph>
            <Typography.Text type="secondary">Then restart the server: a2a-panel server restart</Typography.Text>
          </Flex>
        )}

        {refusal && <Alert type="warning" showIcon message={refusal} />}

        {state === "installing" && <Alert type="info" showIcon message={`Installing ${info.name}@${target}…`} description="This usually takes under a minute." />}

        {state === "restarting" && (
          <Alert type="info" showIcon message="Installed. Restarting the server…" description="This page reloads by itself when the new version is running." />
        )}

        {state === "installed" && (
          <Result
            status="success"
            title={`${info.name}@${target} is installed`}
            subTitle="Restart the server to start using it: a2a-panel server restart"
          />
        )}

        {state === "failed" && (
          <Flex vertical gap={8}>
            <Alert type="error" showIcon message="The update failed" description={info.update.error} />
            {info.update.output && (
              <Collapse
                ghost
                items={[
                  {
                    key: "output",
                    label: "npm output",
                    children: <pre style={{ maxHeight: 200, overflow: "auto", margin: 0, fontSize: 12 }}>{info.update.output}</pre>,
                  },
                ]}
              />
            )}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
}
