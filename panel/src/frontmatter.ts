// Reads and rewrites the "roles:" line of a preset file's frontmatter, mirroring presets.js on the server.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function readRoles(content: string): string[] {
  const match = FRONTMATTER.exec(content);
  if (!match) return [];
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const pair = /^roles:\s*(.*)$/.exec(lines[i]);
    if (!pair) continue;
    if (pair[1].trim()) {
      return pair[1].trim().replace(/^\[/, "").replace(/\]$/, "").split(",").map(stripQuotes).filter(Boolean);
    }
    const roles: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s+(.*)$/.exec(lines[j]);
      if (!item) break;
      roles.push(stripQuotes(item[1]));
    }
    return roles;
  }
  return [];
}

export function setRoles(content: string, roles: string[]): string {
  const rolesLine = roles.length ? `roles: [${roles.join(", ")}]` : null;
  const match = FRONTMATTER.exec(content);
  if (!match) return rolesLine ? `---\n${rolesLine}\n---\n${content}` : content;

  const kept: string[] = [];
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^roles:/.test(lines[i])) {
      kept.push(lines[i]);
      continue;
    }
    while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) i++;
  }
  if (rolesLine) kept.push(rolesLine);
  const rest = content.slice(match[0].length);
  const meaningful = kept.filter((line) => line.trim());
  return meaningful.length ? `---\n${meaningful.join("\n")}\n---\n${rest}` : rest;
}

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
}
