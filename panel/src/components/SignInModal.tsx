import { useEffect, useRef, useState } from "react";
import { Alert, App as AntApp, Button, Collapse, Flex, Input, Modal, Result, Segmented, Tag, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, LinkOutlined, StopOutlined, SyncOutlined } from "@ant-design/icons";
import { api } from "../api";
import type { Account, LoginMethod, LoginSession, LoginState, Provider } from "../api";
import { AccountAvatar } from "./AccountAvatar";

interface SignInModalProps {
  account: Account | null;
  provider: Provider | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  autoStart?: boolean;
}

const METHOD_LABELS: Record<LoginMethod, string> = {
  browser: "Browser",
  device: "Device code",
  terminal: "Terminal",
};

const STATE_TAGS: Record<LoginState, { color: string; label: string; icon: React.ReactNode }> = {
  starting: { color: "processing", label: "Starting", icon: <SyncOutlined spin /> },
  waiting: { color: "warning", label: "Waiting", icon: <ClockCircleOutlined /> },
  succeeded: { color: "success", label: "Signed in", icon: <CheckCircleOutlined /> },
  failed: { color: "error", label: "Failed", icon: <CloseCircleOutlined /> },
  cancelled: { color: "default", label: "Cancelled", icon: <StopOutlined /> },
};

export function SignInModal({ account, provider, open, onClose, onSuccess, autoStart }: SignInModalProps) {
  const { message } = AntApp.useApp();
  const [method, setMethod] = useState<LoginMethod>("browser");
  const [session, setSession] = useState<LoginSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [submittingCode, setSubmittingCode] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const sessionRef = useRef<LoginSession | null>(null);
  sessionRef.current = session;
  const autoStartedRef = useRef(false);

  const methods = provider?.loginMethods ?? ["terminal"];

  const startLoginWithMethod = async (targetMethod: LoginMethod) => {
    if (!account) return;
    setStarting(true);
    try {
      const res = await api.loginAccount(account.id, targetMethod);
      setSession(res);
      if (res.state === "succeeded") {
        onSuccess();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to start sign in");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false;
      setSession(null);
      setCode("");
      return;
    }
    const defaultMethod = methods.length > 0 ? methods[0] : "terminal";
    setMethod(defaultMethod);
    if (autoStart && account && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startLoginWithMethod(defaultMethod);
    }
  }, [open, account?.id, provider?.id, autoStart]);

  const active = session && (session.state === "starting" || session.state === "waiting");

  useEffect(() => {
    if (!active || !session) return;
    const sessionId = session.id;
    const interval = window.setInterval(async () => {
      try {
        const next = await api.getLoginSession(sessionId);
        setSession(next);
        if (next.state === "succeeded") {
          onSuccess();
        }
      } catch {}
    }, 1500);
    return () => window.clearInterval(interval);
  }, [active, session?.id, onSuccess]);

  useEffect(() => {
    return () => {
      const current = sessionRef.current;
      if (current && (current.state === "starting" || current.state === "waiting")) {
        api.cancelLoginSession(current.id).catch(() => {});
      }
    };
  }, []);

  const handleClose = async () => {
    if (session && (session.state === "starting" || session.state === "waiting")) {
      try {
        await api.cancelLoginSession(session.id);
      } catch {}
    }
    onClose();
  };

  const startLogin = async () => {
    await startLoginWithMethod(method);
  };

  const submitCode = async () => {
    if (!session || !code.trim()) return;
    setSubmittingCode(true);
    try {
      const next = await api.submitLoginCode(session.id, code.trim());
      setSession(next);
      if (next.state === "succeeded") {
        onSuccess();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Code submission failed");
    } finally {
      setSubmittingCode(false);
    }
  };

  const cancelSession = async () => {
    if (!session) return;
    setCancelling(true);
    try {
      const next = await api.cancelLoginSession(session.id);
      setSession(next);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={
        account ? (
          <Flex align="center" gap={8}>
            <AccountAvatar account={account} size={24} />
            <span>{`Sign in to ${account.label} (${account.id})`}</span>
          </Flex>
        ) : (
          "Sign in"
        )
      }
      destroyOnHidden
      footer={
        <Flex justify="space-between" align="center">
          <div>
            {active && (
              <Button danger onClick={cancelSession} loading={cancelling}>
                Cancel sign in
              </Button>
            )}
          </div>
          <Button onClick={handleClose}>
            {session?.state === "succeeded" ? "Done" : "Close"}
          </Button>
        </Flex>
      }
    >
      <Flex vertical gap={16} style={{ marginTop: 12 }}>
        {!session && (
          <>
            <div>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                Choose sign-in method:
              </Typography.Text>
              <Segmented<LoginMethod>
                value={method}
                onChange={setMethod}
                options={methods.map((m) => ({
                  value: m,
                  label: METHOD_LABELS[m] ?? m,
                }))}
              />
            </div>
            {provider?.id === "agy" && method === "browser" && (
              <Typography.Text type="secondary">
                Antigravity waits about a minute for the sign-in. Open the page as soon as it appears; if it shows a code, paste it here.
              </Typography.Text>
            )}
            <Button type="primary" onClick={startLogin} loading={starting} style={{ alignSelf: "flex-start" }}>
              Start sign in
            </Button>
          </>
        )}

        {session && session.state === "succeeded" && (
          <Result
            status="success"
            title="Signed in successfully"
            subTitle={`Account ${account?.id ?? ""} is ready to use.`}
          />
        )}

        {session && session.state !== "succeeded" && (
          <Flex vertical gap={14}>
            <Flex align="center" justify="space-between">
              <Typography.Text strong>Sign-in status</Typography.Text>
              <Tag
                color={STATE_TAGS[session.state]?.color ?? "default"}
                icon={STATE_TAGS[session.state]?.icon}
                style={{ marginInlineEnd: 0 }}
              >
                {STATE_TAGS[session.state]?.label ?? session.state}
              </Tag>
            </Flex>

            {session.error && <Alert type="error" showIcon message={session.error} />}

            {session.url && (
              <Flex vertical gap={6}>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  href={session.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ alignSelf: "flex-start" }}
                >
                  Open sign-in page
                </Button>
                <Typography.Text copyable style={{ wordBreak: "break-all", fontSize: 12 }}>
                  {session.url}
                </Typography.Text>
              </Flex>
            )}

            {session.code && (
              <Flex vertical gap={4}>
                <Typography.Text type="secondary">Device code</Typography.Text>
                <Typography.Title
                  level={2}
                  copyable
                  style={{ margin: 0, fontFamily: "monospace", letterSpacing: 2 }}
                >
                  {session.code}
                </Typography.Title>
              </Flex>
            )}

            {session.needsCode && (
              <Flex vertical gap={6}>
                <Typography.Text type="secondary">
                  If the page shows a code, paste it here:
                </Typography.Text>
                <Flex gap={8}>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter code"
                    onPressEnter={submitCode}
                  />
                  <Button type="primary" onClick={submitCode} loading={submittingCode} disabled={!code.trim()}>
                    Submit code
                  </Button>
                </Flex>
              </Flex>
            )}

            {session.method === "terminal" && (
              <Flex vertical gap={4}>
                <Typography.Text>
                  {session.terminalOpened
                    ? "A Terminal window opened to sign in"
                    : "Open a terminal and run:"}
                </Typography.Text>
                {!session.terminalOpened && (
                  <Typography.Paragraph copyable code style={{ margin: "4px 0" }}>
                    {session.command}
                  </Typography.Paragraph>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  The panel detects the sign-in automatically.
                </Typography.Text>
              </Flex>
            )}

            <Collapse
              ghost
              items={[
                {
                  key: "command",
                  label: "Run it yourself",
                  children: (
                    <Typography.Paragraph copyable code style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {session.command}
                    </Typography.Paragraph>
                  ),
                },
                {
                  key: "output",
                  label: "Session output",
                  children: (
                    <pre style={{ maxHeight: 180, overflow: "auto", margin: 0, fontSize: 12 }}>
                      {session.output || "No output yet."}
                    </pre>
                  ),
                },
              ]}
            />
          </Flex>
        )}
      </Flex>
    </Modal>
  );
}
