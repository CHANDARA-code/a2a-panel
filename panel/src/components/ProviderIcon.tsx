import React, { useState } from "react";
import { theme } from "antd";
import type { Provider, ProviderId } from "../api";
import { CLAUDE_ICON } from "../providerIcons";

export interface ProviderIconProps {
  provider?: Provider | ProviderId | string | null;
  providerId?: ProviderId | string | null;
  iconUrl?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ProviderIcon({
  provider,
  providerId,
  iconUrl,
  size = 20,
  className,
  style,
}: ProviderIconProps) {
  const { token } = theme.useToken();
  const [imgError, setImgError] = useState(false);

  const pId = (
    typeof provider === "string"
      ? provider
      : provider?.id ?? providerId ?? "agy"
  ) as ProviderId;

  const resolvedIconUrl =
    iconUrl !== undefined
      ? iconUrl
      : typeof provider === "object" && provider !== null && "iconUrl" in provider
      ? provider.iconUrl
      : pId === "claude"
      ? null
      : `/api/providers/${pId}/icon`;

  if (pId === "claude") {
    return (
      <svg
        viewBox={CLAUDE_ICON.viewBox}
        width={size}
        height={size}
        style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
        className={className}
        aria-hidden="true"
      >
        <path fill={CLAUDE_ICON.color} d={CLAUDE_ICON.path} />
      </svg>
    );
  }

  if (resolvedIconUrl && !imgError) {
    return (
      <img
        src={resolvedIconUrl}
        alt=""
        width={size}
        height={size}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          display: "inline-block",
          verticalAlign: "middle",
          flexShrink: 0,
          borderRadius: Math.max(2, Math.round(size * 0.18)),
          ...style,
        }}
        className={className}
      />
    );
  }

  const borderRadius = Math.max(3, Math.round(size * 0.22));

  if (pId === "codex") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: token.colorText,
          color: token.colorBgContainer,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: Math.max(8, Math.round(size * 0.45)),
          lineHeight: 1,
          userSelect: "none",
          flexShrink: 0,
          verticalAlign: "middle",
          ...style,
        }}
        className={className}
        aria-hidden="true"
      >
        &gt;_
      </span>
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: token.colorPrimary,
        color: "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(9, Math.round(size * 0.6)),
        lineHeight: 1,
        userSelect: "none",
        flexShrink: 0,
        verticalAlign: "middle",
        ...style,
      }}
      className={className}
      aria-hidden="true"
    >
      A
    </span>
  );
}

export default ProviderIcon;
