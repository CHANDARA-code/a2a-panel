import { useEffect, useState } from "react";
import { App as AntApp, Button, Flex, Modal, Popconfirm, Typography, Upload } from "antd";
import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { accountDisplayName, api } from "../api";
import type { Account } from "../api";
import { AccountAvatar, refreshAccounts } from "./AccountAvatar";

interface AvatarModalProps {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AvatarModal({ open, account, onClose, onSuccess }: AvatarModalProps) {
  const { message } = AntApp.useApp();
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (open) {
      setPreviewDataUrl(null);
      setSaving(false);
      setRemoving(false);
    }
  }, [open, account?.id]);

  const handleFile = (file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      message.error("Only PNG, JPEG, and WebP images are supported");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error("Image must be smaller than 10 MB");
      return false;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataSrc = event.target?.result;
      if (typeof dataSrc !== "string") {
        message.error("Failed to read image file");
        return;
      }
      const img = new Image();
      img.onload = () => {
        const minDim = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - minDim) / 2;
        const sy = (img.naturalHeight - minDim) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          message.error("Could not process image");
          return;
        }
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 256, 256);
        let dataUrl = canvas.toDataURL("image/webp", 0.85);
        if (dataUrl.startsWith("data:image/png")) {
          dataUrl = canvas.toDataURL("image/png");
        }
        if (dataUrl.length > 700000) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        }
        setPreviewDataUrl(dataUrl);
      };
      img.onerror = () => {
        message.error("Failed to load image");
      };
      img.src = dataSrc;
    };
    reader.onerror = () => {
      message.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleSave = async () => {
    if (!account || !previewDataUrl) return;
    setSaving(true);
    try {
      await api.setAvatar(account.id, previewDataUrl);
      message.success("Profile picture updated");
      await refreshAccounts();
      onSuccess();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update profile picture");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!account) return;
    setRemoving(true);
    try {
      await api.deleteAvatar(account.id);
      message.success("Profile picture removed");
      await refreshAccounts();
      onSuccess();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to remove profile picture");
    } finally {
      setRemoving(false);
    }
  };

  const displayAccount: Account | null = account
    ? {
        ...account,
        avatarUrl: previewDataUrl ?? account.avatarUrl,
      }
    : null;

  return (
    <Modal
      open={open}
      title={account ? `Change picture for ${accountDisplayName(account)}` : "Change profile picture"}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose} disabled={saving || removing}>
            Cancel
          </Button>
          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            disabled={!previewDataUrl || removing}
          >
            Save
          </Button>
        </Flex>
      }
    >
      <Flex vertical align="center" gap={16} style={{ margin: "16px 0 8px" }}>
        {displayAccount && <AccountAvatar account={displayAccount} size={96} />}

        <Typography.Text type="secondary" style={{ fontSize: 13, textAlign: "center" }}>
          PNG, JPEG or WebP up to 10 MB. Square cropped to 256x256.
        </Typography.Text>

        <Flex gap={8} wrap justify="center" align="center">
          <Upload
            accept="image/png,image/jpeg,image/webp"
            showUploadList={false}
            beforeUpload={handleFile}
          >
            <Button icon={<UploadOutlined />} disabled={saving || removing}>
              Choose image
            </Button>
          </Upload>

          {account?.avatarUrl && (
            <Popconfirm
              title="Remove profile picture?"
              description="Restore the default initials avatar."
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={handleRemove}
            >
              <Button danger icon={<DeleteOutlined />} loading={removing} disabled={saving}>
                Remove picture
              </Button>
            </Popconfirm>
          )}
        </Flex>
      </Flex>
    </Modal>
  );
}

export default AvatarModal;
