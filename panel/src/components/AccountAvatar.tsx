import React, { useEffect, useState } from "react";
import { Avatar, theme } from "antd";
import { api } from "../api";
import type { Account, ProviderId } from "../api";
import { ProviderIcon } from "./ProviderIcon";

export interface AccountAvatarProps {
  account?: Account | string | null;
  accountId?: string | null;
  accounts?: Account[];
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

let accountsPromise: Promise<Account[]> | null = null;
let cachedAccounts: Account[] | null = null;
const accountListeners = new Set<(accounts: Account[]) => void>();

export function getCachedAccounts(): Account[] | null {
  return cachedAccounts;
}

export function refreshAccounts(): Promise<Account[]> {
  accountsPromise = api.accounts().then((res) => {
    cachedAccounts = res.accounts;
    accountListeners.forEach((listener) => listener(res.accounts));
    return res.accounts;
  }).catch((err) => {
    accountsPromise = null;
    throw err;
  });
  return accountsPromise;
}

export function useAccounts(): Account[] {
  const [accounts, setAccounts] = useState<Account[]>(cachedAccounts ?? []);

  useEffect(() => {
    let active = true;
    const listener = (next: Account[]) => {
      if (active) setAccounts(next);
    };
    accountListeners.add(listener);

    if (cachedAccounts) {
      setAccounts(cachedAccounts);
    } else if (!accountsPromise) {
      refreshAccounts().catch(() => {});
    } else {
      accountsPromise.then((next) => {
        if (active) setAccounts(next);
      }).catch(() => {});
    }

    return () => {
      active = false;
      accountListeners.delete(listener);
    };
  }, []);

  return accounts;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(account: Account): string {
  const name = account.identity?.name?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length >= 2 ? words[0][0] + words[words.length - 1][0] : words[0][0]).toUpperCase();
  }
  const isBuiltIn = account.system || account.id === "agy" || account.id === "claude" || account.id === "codex";
  const label = (account.label || account.id || "").trim();
  const lower = label.toLowerCase();
  const isGeneric =
    !account.label ||
    /default/i.test(label) ||
    label === account.id ||
    lower === "antigravity" ||
    lower === "claude code" ||
    lower === "codex";

  if (isBuiltIn && isGeneric) {
    if (account.status?.email && account.status.email.trim()) {
      return account.status.email.trim()[0].toUpperCase();
    }
    const prov = account.provider || account.id || "a";
    return prov[0].toUpperCase();
  }

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1 && words[0].length > 0) {
    return words[0][0].toUpperCase();
  }
  const fallback = account.provider || account.id || "A";
  return fallback[0].toUpperCase();
}

export function AccountAvatar({
  account,
  accountId,
  accounts,
  size = 32,
  className,
  style,
}: AccountAvatarProps) {
  const { token } = theme.useToken();
  const sessionAccounts = useAccounts();
  const allAccounts = accounts ?? sessionAccounts;

  const targetId =
    typeof account === "string"
      ? account
      : (accountId ?? (account as Account | undefined)?.id ?? "agy");

  const resolvedAccount: Account =
    typeof account === "object" && account !== null
      ? account
      : allAccounts.find((a) => a.id === targetId) ?? {
          id: targetId,
          provider: (targetId === "claude" ? "claude" : targetId === "codex" ? "codex" : "agy") as ProviderId,
          label: targetId,
          system: targetId === "agy" || targetId === "claude" || targetId === "codex",
          model: null,
          createdAt: null,
          signedInHere: false,
          status: {
            state: "unknown",
            detail: "",
            email: null,
            plan: null,
            checkedAt: null,
            warning: null,
          },
          usage: { tasks: 0, total_tokens: 0 },
        };

  const [imgError, setImgError] = useState(false);
  const avatarUrl = resolvedAccount.avatarUrl;

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const hasImage = Boolean(avatarUrl && !imgError);
  const initials = getInitials(resolvedAccount);

  const colors = [
    token.blue7,
    token.purple6,
    token.cyan8,
    token.green8,
    token.magenta7,
    token.volcano7,
    token.gold9,
    token.geekblue6,
  ];
  const bgColor = colors[hashString(resolvedAccount.id) % colors.length];

  const avatarNode = (
    <Avatar
      size={size}
      src={hasImage ? avatarUrl! : undefined}
      alt={hasImage ? resolvedAccount.label : undefined}
      aria-label={resolvedAccount.label}
      onError={() => {
        setImgError(true);
        return false;
      }}
      style={{
        backgroundColor: bgColor,
        color: token.colorWhite,
        fontWeight: 600,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        flexShrink: 0,
        ...(size < 32 ? style : {}),
      }}
      className={size < 32 ? className : undefined}
    >
      {!hasImage ? initials : null}
    </Avatar>
  );

  if (size < 32) {
    return avatarNode;
  }

  const badgeSize = Math.round(size * 0.4);
  const iconSize = Math.max(10, Math.round(badgeSize * 0.65));

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
        verticalAlign: "middle",
        ...style,
      }}
      className={className}
    >
      {avatarNode}
      <div
        style={{
          position: "absolute",
          bottom: -1,
          right: -1,
          width: badgeSize,
          height: badgeSize,
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          border: "2px solid #ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <ProviderIcon providerId={resolvedAccount.provider} size={iconSize} />
      </div>
    </div>
  );
}

export default AccountAvatar;
