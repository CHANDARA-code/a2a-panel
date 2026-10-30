import { useEffect, useState } from "react";
import { App as AntApp, Button, Form, InputNumber, Modal, Popconfirm, Select, Switch } from "antd";
import { accountDisplayName, api } from "../api";
import type { AccountBudget, AccountUsageEntry } from "../api";

interface BudgetModalProps {
  open: boolean;
  account: AccountUsageEntry | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface BudgetFormValues {
  period: "day" | "week" | "month";
  tokens: number;
  stop: boolean;
}

export function BudgetModal({ open, account, onClose, onSuccess }: BudgetModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<BudgetFormValues>();
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (open && account) {
      if (account.budget) {
        form.setFieldsValue({
          period: account.budget.period,
          tokens: account.budget.tokens,
          stop: account.budget.stop,
        });
      } else {
        form.setFieldsValue({
          period: "month",
          tokens: 100000,
          stop: false,
        });
      }
    }
  }, [open, account, form]);

  const handleSave = async () => {
    if (!account) return;
    let values: BudgetFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const budget: AccountBudget = {
        period: values.period,
        tokens: Number(values.tokens),
        stop: Boolean(values.stop),
      };
      await api.setBudget(account.id, budget);
      message.success(`Budget updated for ${accountDisplayName(account)}`);
      onSuccess();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to set budget");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!account) return;
    setRemoving(true);
    try {
      await api.deleteBudget(account.id);
      message.success(`Budget removed for ${accountDisplayName(account)}`);
      onSuccess();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to remove budget");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={account ? `${account.budget ? "Edit" : "Set"} budget · ${accountDisplayName(account)}` : "Budget"}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        account?.budget ? (
          <Popconfirm
            key="remove"
            title="Remove budget for this account?"
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={handleRemove}
          >
            <Button danger loading={removing} style={{ float: "left" }}>
              Remove budget
            </Button>
          </Popconfirm>
        ) : null,
        <Button key="cancel" onClick={onClose} disabled={saving || removing}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={saving} disabled={removing}>
          Save budget
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" requiredMark={false} disabled={saving || removing}>
        <Form.Item
          name="period"
          label="Period"
          rules={[{ required: true, message: "Select a period" }]}
        >
          <Select
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="tokens"
          label="Token limit"
          rules={[{ required: true, message: "Enter a token limit" }]}
        >
          <InputNumber<number>
            min={1000}
            step={1000}
            style={{ width: "100%" }}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(value) => (value ? Number(value.replace(/,/g, "")) : 1000)}
          />
        </Form.Item>

        <Form.Item
          name="stop"
          label="Stop new tasks when reached"
          valuePropName="checked"
          help="Tasks and team tasks on this account are refused until the next period."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}