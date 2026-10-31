const fs = require('fs');
const path = require('path');
const { DATA_DIR, PACKAGE_ROOT } = require('./config');

// A preset is a folder of markdown files that describe how the user wants code written
// (coding style, frontend stack, API stack, testing, default technology choices...).
// Each file may carry frontmatter "roles: [...]" so it only reaches the specialists it concerns.
const PRESETS_DIR = process.env.A2A_PRESETS_DIR || path.join(DATA_DIR, 'presets');
const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'preset-templates');
const WORKSPACE_PREFS_DIR = path.join('.agy', 'preferences');
const SETTINGS_FILE = 'settings.json';
const META_FILE = 'preset.json';

const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}\.md$/;
const RESERVED_IDS = new Set(['none', 'default']);
const MAX_FILES = 30;
const MAX_FILE_CHARS = 20000;
const MAX_TITLE_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 300;
const PROMPT_LIMIT = 16000;

class PresetError extends Error {
  constructor(message, code = 400) {
    super(message);
    this.code = code;
  }
}

function validPresetId(id) {
  return typeof id === 'string' && PRESET_ID_PATTERN.test(id) && !RESERVED_IDS.has(id);
}

function parseList(value) {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner.split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

// Small frontmatter reader: "key: value", "key: [a, b]" and "key:" followed by "- item" lines.
function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { meta: {}, body: content.trim() };
  const meta = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      meta[listKey].push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (!value.trim()) {
      meta[key] = [];
      listKey = key;
    } else {
      meta[key] = key === 'roles' ? parseList(value) : value.trim().replace(/^['"]|['"]$/g, '');
      listKey = null;
    }
  }
  return { meta, body: content.slice(match[0].length).trim() };
}

function rolesOf(content) {
  const { roles } = parseFrontmatter(content).meta;
  if (!Array.isArray(roles) || !roles.length || roles.includes('*') || roles.includes('all')) return null;
  return roles;
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    return fallback;
  }
}

function readMarkdownDir(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return [];
  }
  return names
    .filter((name) => FILE_NAME_PATTERN.test(name))
    .sort()
    .slice(0, MAX_FILES)
    .map((name) => {
      try {
        const full = path.join(dir, name);
        if (!fs.statSync(full).isFile()) return null;
        return { name, content: fs.readFileSync(full, 'utf-8').slice(0, MAX_FILE_CHARS) };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

function getDefaultPresetId() {
  const id = readJsonFile(path.join(PRESETS_DIR, SETTINGS_FILE), {}).default;
  return validPresetId(id) && fs.existsSync(path.join(PRESETS_DIR, id)) ? id : null;
}

function setDefaultPresetId(id) {
  if (id !== null && !presetExists(id)) throw new PresetError(`Unknown preset "${id}"`, 404);
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRESETS_DIR, SETTINGS_FILE), JSON.stringify({ default: id }, null, 2) + '\n');
  return id;
}

function presetExists(id) {
  return validPresetId(id) && fs.existsSync(path.join(PRESETS_DIR, id, META_FILE));
}

function summarize(id, dir, defaultId) {
  const meta = readJsonFile(path.join(dir, META_FILE), {});
  const files = readMarkdownDir(dir);
  return {
    id,
    title: meta.title || id,
    description: meta.description || '',
    isDefault: id === defaultId,
    files: files.map((file) => ({ name: file.name, roles: rolesOf(file.content) }))
  };
}

function listPresets() {
  let names = [];
  try {
    names = fs.readdirSync(PRESETS_DIR);
  } catch (err) {
    return [];
  }
  const defaultId = getDefaultPresetId();
  return names
    .filter((id) => presetExists(id))
    .sort()
    .map((id) => summarize(id, path.join(PRESETS_DIR, id), defaultId));
}

function getPreset(id) {
  if (!presetExists(id)) throw new PresetError(`Unknown preset "${id}"`, 404);
  const dir = path.join(PRESETS_DIR, id);
  return { ...summarize(id, dir, getDefaultPresetId()), files: readMarkdownDir(dir).map((file) => ({ ...file, roles: rolesOf(file.content) })) };
}

function listTemplates() {
  let names = [];
  try {
    names = fs.readdirSync(TEMPLATES_DIR);
  } catch (err) {
    return [];
  }
  return names
    .filter((id) => PRESET_ID_PATTERN.test(id) && fs.existsSync(path.join(TEMPLATES_DIR, id, META_FILE)))
    .sort()
    .map((id) => {
      const { isDefault, ...rest } = summarize(id, path.join(TEMPLATES_DIR, id), null);
      return rest;
    });
}

function cleanFiles(files) {
  if (!Array.isArray(files)) throw new PresetError('files must be a list');
  if (files.length > MAX_FILES) throw new PresetError(`A preset can hold at most ${MAX_FILES} files`);
  const seen = new Set();
  return files.map((file) => {
    if (!file || typeof file.name !== 'string' || !FILE_NAME_PATTERN.test(file.name)) {
      throw new PresetError(`Invalid file name "${file && file.name}". Use lowercase letters, digits, "-", "_" or "." and end with .md`);
    }
    if (seen.has(file.name)) throw new PresetError(`Duplicate file name "${file.name}"`);
    seen.add(file.name);
    if (typeof file.content !== 'string') throw new PresetError(`File "${file.name}" has no content`);
    if (file.content.length > MAX_FILE_CHARS) throw new PresetError(`File "${file.name}" is longer than ${MAX_FILE_CHARS} characters`);
    return { name: file.name, content: file.content };
  });
}

function writePreset(id, { title, description, files }) {
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_CHARS)) throw new PresetError(`title must be at most ${MAX_TITLE_CHARS} characters`);
  if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_CHARS)) {
    throw new PresetError(`description must be at most ${MAX_DESCRIPTION_CHARS} characters`);
  }
  const cleaned = cleanFiles(files);
  const dir = path.join(PRESETS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify({ title: (title || '').trim() || id, description: (description || '').trim() }, null, 2) + '\n');
  const keep = new Set(cleaned.map((file) => file.name));
  for (const file of cleaned) fs.writeFileSync(path.join(dir, file.name), file.content);
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.md') && !keep.has(name)) fs.unlinkSync(path.join(dir, name));
  }
  return getPreset(id);
}

// Create a preset: empty, copied from a shipped template, or copied from another preset.
function createPreset({ id, title, description, template, from }) {
  if (!validPresetId(id)) throw new PresetError('Preset id must be lowercase letters, digits and "-" (and not "none" or "default")');
  if (presetExists(id)) throw new PresetError(`Preset "${id}" already exists`, 409);
  let source = { title, description, files: [] };
  if (template) {
    if (!PRESET_ID_PATTERN.test(template) || !fs.existsSync(path.join(TEMPLATES_DIR, template, META_FILE))) throw new PresetError(`Unknown template "${template}"`, 404);
    const dir = path.join(TEMPLATES_DIR, template);
    const meta = readJsonFile(path.join(dir, META_FILE), {});
    source = { title: title || meta.title, description: description ?? meta.description, files: readMarkdownDir(dir) };
  } else if (from) {
    const existing = getPreset(from);
    source = { title: title || `${existing.title} (copy)`, description: description ?? existing.description, files: existing.files };
  }
  return writePreset(id, source);
}

function updatePreset(id, body) {
  if (!presetExists(id)) throw new PresetError(`Unknown preset "${id}"`, 404);
  return writePreset(id, body);
}

function deletePreset(id) {
  if (!presetExists(id)) throw new PresetError(`Unknown preset "${id}"`, 404);
  if (getDefaultPresetId() === id) setDefaultPresetId(null);
  fs.rmSync(path.join(PRESETS_DIR, id), { recursive: true, force: true });
}

// undefined -> the default preset; null, "" or "none" -> no preset; anything else must exist.
function resolvePresetId(preset) {
  if (preset === undefined) return getDefaultPresetId();
  if (preset === null || preset === '' || preset === 'none') return null;
  if (!presetExists(preset)) throw new PresetError(`Unknown preset "${preset}". Run "agy-bridge presets list" to see the available presets.`, 404);
  return preset;
}

// The preferences a given role receives: preset files merged with <workspace>/.agy/preferences
// (a workspace file replaces the preset file of the same name), filtered by each file's roles.
function resolvePreferences({ preset, role, workspace }) {
  const presetId = resolvePresetId(preset);
  const merged = new Map();
  if (presetId) {
    for (const file of readMarkdownDir(path.join(PRESETS_DIR, presetId))) merged.set(file.name, { ...file, source: 'preset' });
  }
  if (workspace) {
    for (const file of readMarkdownDir(path.join(workspace, WORKSPACE_PREFS_DIR))) merged.set(file.name, { ...file, source: 'workspace' });
  }
  const files = [];
  for (const file of [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const roles = rolesOf(file.content);
    if (roles && !roles.includes(role)) continue;
    const body = parseFrontmatter(file.content).body;
    if (body) files.push({ name: file.name, source: file.source, body });
  }
  return { presetId, files, text: formatPreferences(presetId, files) };
}

function formatPreferences(presetId, files) {
  if (!files.length) return '';
  const label = presetId ? `preset: ${presetId}` : 'workspace';
  let text = `### USER PREFERENCES (${label})\nFollow these conventions and technology choices unless the task explicitly says otherwise.\n`;
  for (const file of files) text += `\n#### ${file.name}${file.source === 'workspace' ? ' (workspace)' : ''}\n${file.body}\n`;
  if (text.length > PROMPT_LIMIT) text = `${text.slice(0, PROMPT_LIMIT)}\n[... preferences truncated at ${PROMPT_LIMIT} characters ...]\n`;
  return text.trim();
}

module.exports = {
  PRESETS_DIR,
  TEMPLATES_DIR,
  WORKSPACE_PREFS_DIR,
  PresetError,
  parseFrontmatter,
  listPresets,
  listTemplates,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  getDefaultPresetId,
  setDefaultPresetId,
  resolvePresetId,
  resolvePreferences
};
