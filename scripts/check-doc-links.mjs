import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  "dist",
  "node_modules",
  "sources",
]);

const retiredPaths = [
  { label: "docs/PRD.md", pattern: /docs\/PRD\.md/g },
  { label: "docs/SDD.md", pattern: /docs\/SDD\.md/g },
  { label: "docs/architecture.md", pattern: /docs\/architecture\.md/g },
  { label: "docs/technical-design.md", pattern: /docs\/technical-design\.md/g },
  { label: "docs/decisions/", pattern: /docs\/decisions\//g },
];

const requiredContextFiles = [
  "AGENTS.md",
  "llms.txt",
  "README.md",
  "docs/README.md",
  "docs/product/PRD.md",
  "docs/architecture/system-architecture.md",
  "docs/architecture/technical-design.md",
  "docs/architecture/decisions/0008-mainline-groups-derived-todo-progress.md",
  "docs/architecture/decisions/0007-two-tab-console-information-architecture.md",
  "docs/specs/README.md",
  "docs/specs/current/0010-long-term-goals-and-current-action.md",
  "docs/specs/current/0011-aggregated-profile-graph.md",
  "docs/development/SDD.md",
];

const requiredAgentRoutes = [
  "docs/README.md",
  "docs/product/PRD.md",
  "docs/architecture/system-architecture.md",
  "docs/architecture/technical-design.md",
  "docs/architecture/decisions/0008-mainline-groups-derived-todo-progress.md",
  "docs/architecture/decisions/0007-two-tab-console-information-architecture.md",
  "docs/specs/current/0010-long-term-goals-and-current-action.md",
  "docs/specs/current/0011-aggregated-profile-graph.md",
  "docs/development/SDD.md",
];

const requiredExternalIndexRoutes = [
  ...requiredAgentRoutes,
  "AGENTS.md",
  "README.md",
  "docs/product/README.md",
  "docs/architecture/README.md",
  "docs/architecture/decisions/0001-local-first-mvp.md",
  "docs/architecture/decisions/0002-web-stack.md",
  "docs/architecture/decisions/0003-server-backed-mvp.md",
  "docs/architecture/decisions/0004-single-mainline-workbench-mvp.md",
  "docs/architecture/decisions/0005-evidence-based-profile.md",
  "docs/architecture/decisions/README.md",
  "docs/specs/foundation/0007-data-export-and-clear.md",
  "docs/specs/foundation/0008-identity-and-server-persistence.md",
  "docs/specs/backlog/0004-daily-close.md",
  "docs/specs/backlog/0005-quick-capture.md",
  "docs/specs/backlog/0006-weekly-review.md",
  "docs/specs/archive/0001-current-focus-and-actions.md",
  "docs/specs/archive/0002-state-aware-next-action.md",
  "docs/specs/archive/0003-unfinished-action-resolution.md",
  "docs/specs/archive/0009-mainline-profile.md",
  "docs/development/README.md",
];

const lifecycleDirectories = [
  { directory: "docs/specs/archive", expectedStatus: "Superseded" },
  { directory: "docs/specs/backlog", expectedStatus: "Deferred" },
];

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeMarkdownTarget(rawTarget) {
  let target = rawTarget.trim();

  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  } else {
    target = target.split(/\s+["']/u, 1)[0];
  }

  if (
    target.length === 0 ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return null;
  }

  const pathOnly = target.split(/[?#]/u, 1)[0];
  if (!pathOnly) {
    return null;
  }

  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return pathOnly;
  }
}

function hasDirectDocumentLink(contents, route) {
  return contents.includes(`](${route})`);
}

const markdownFiles = await collectMarkdownFiles(projectRoot);
const documentationFiles = [...markdownFiles, path.join(projectRoot, "llms.txt")];
const errors = [];
let checkedLinks = 0;

for (const file of requiredContextFiles) {
  try {
    await access(path.join(projectRoot, file));
  } catch {
    errors.push(`缺少 AI 上下文必需文档 -> ${file}`);
  }
}

const agentGuide = await readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
const externalAgentIndex = await readFile(path.join(projectRoot, "llms.txt"), "utf8");
for (const route of requiredAgentRoutes) {
  if (!hasDirectDocumentLink(agentGuide, route)) {
    errors.push(`AGENTS.md 未路由当前事实源 -> ${route}`);
  }
}

for (const route of requiredExternalIndexRoutes) {
  if (!hasDirectDocumentLink(externalAgentIndex, route)) {
    errors.push(`llms.txt 未索引文档 -> ${route}`);
  }
}

for (const { directory, expectedStatus } of lifecycleDirectories) {
  const absoluteDirectory = path.join(projectRoot, directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const specPath = path.join(absoluteDirectory, entry.name);
    const contents = await readFile(specPath, "utf8");
    if (!contents.includes(`> 状态：${expectedStatus}`)) {
      errors.push(`${path.relative(projectRoot, specPath)} 必须标记为 ${expectedStatus}`);
    }
  }
}

for (const file of documentationFiles) {
  const contents = await readFile(file, "utf8");
  const relativeFile = path.relative(projectRoot, file);

  for (const retiredPath of retiredPaths) {
    retiredPath.pattern.lastIndex = 0;
    if (retiredPath.pattern.test(contents)) {
      errors.push(`${relativeFile}: 仍引用已迁移路径 ${retiredPath.label}`);
    }
  }

  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  for (const match of contents.matchAll(linkPattern)) {
    const target = normalizeMarkdownTarget(match[1]);
    if (!target) {
      continue;
    }

    checkedLinks += 1;
    const resolvedTarget = path.resolve(path.dirname(file), target);

    try {
      await access(resolvedTarget);
    } catch {
      errors.push(`${relativeFile}: 链接不存在 -> ${match[1]}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Documentation check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed: ${markdownFiles.length} Markdown files plus llms.txt, ${checkedLinks} relative links.`,
  );
}
