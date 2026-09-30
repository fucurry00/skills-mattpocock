#!/usr/bin/env node
// Regenerates, from the `skills` list in .claude-plugin/plugin.json:
//
//   plugins/<skill>/.claude-plugin/plugin.json   one plugin per skill
//   plugins/<skill>/skills/<skill>/…             a copy of skills/<category>/<skill>
//   plugins/<bundle>/.claude-plugin/plugin.json  empty plugin that depends on every skill plugin
//   .claude-plugin/marketplace.json              the bundle entry + one entry per skill
//
// so a single skill can be installed on its own (`/plugin install tdd@mattpocock`).
//
// Run it after pulling upstream, or after editing a skill:
//   node scripts/gen-marketplace.mjs
//
// Skills that call other skills ("Call the Skill tool with "grilling"") get those
// as plugin `dependencies`, so installing one skill pulls in what it needs and the
// bundle never duplicates a skill that was also installed on its own.
//
// plugins/ is generated output — edit skills/ and rerun, never edit plugins/ directly.
//
// The copies exist because the plugin directory has to be a real, self-contained
// plugin. A marketplace entry that points `source` at the shared skills/ tree and
// narrows it with a `skills` array works in the Claude Code CLI, but the Claude
// desktop directory ingests the repo server-side, skips entries whose source has no
// .claude-plugin/plugin.json, and ignores the `skills` array entirely.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = JSON.parse(
  readFileSync(join(repo, ".claude-plugin", "plugin.json"), "utf8"),
);
const { version } = JSON.parse(
  readFileSync(join(repo, "package.json"), "utf8"),
);

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
};

const describe = (skillPath) => {
  const src = readFileSync(join(repo, skillPath, "SKILL.md"), "utf8");
  const description = src.match(/^---\r?\n[\s\S]*?^description:\s*(.+?)\s*$/m);
  if (!description) throw new Error(`No description in ${skillPath}/SKILL.md`);
  return description[1].replace(/^["']|["']$/g, "");
};

const names = new Set(plugin.skills.map((p) => p.split("/")[3]));
const userInvoked = (skillPath) =>
  /^---\r?\n[\s\S]*?^disable-model-invocation:\s*true\s*$/m.test(
    readFileSync(join(repo, skillPath, "SKILL.md"), "utf8"),
  );
const invoked = new Map(
  plugin.skills.map((p) => [p.split("/")[3], userInvoked(p)]),
);

// Names quoted on a "Skill tool" line are operative dependencies (see .agents/invocation.md).
const dependencies = (skillPath, self) => {
  const src = readFileSync(join(repo, skillPath, "SKILL.md"), "utf8");
  const found = new Set();
  for (const [line] of src.matchAll(/Skill tool[^\n]*/g))
    for (const [, n] of line.matchAll(/"([a-z][a-z0-9-]*)"/g))
      if (n !== self && names.has(n)) found.add(n);
  for (const n of found)
    if (invoked.get(n))
      throw new Error(`${self} calls user-invoked skill ${n}; it cannot be a dependency`);
  return [...found].sort();
};

rmSync(join(repo, "plugins"), { recursive: true, force: true });

const entries = plugin.skills.map((skillPath) => {
  const [, , category, name] = skillPath.split("/");
  const description = describe(skillPath);
  const root = join(repo, "plugins", name);
  const deps = dependencies(skillPath, name);

  cpSync(join(repo, skillPath), join(root, "skills", name), {
    recursive: true,
  });
  writeJson(join(root, ".claude-plugin", "plugin.json"), {
    name,
    description,
    version,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    license: plugin.license,
    ...(deps.length && { dependencies: deps }),
  });

  return {
    name,
    source: `./plugins/${name}`,
    description,
    version,
    author: plugin.author,
    license: plugin.license,
    category,
  };
});

writeJson(join(repo, ".claude-plugin", "marketplace.json"), {
  name: "mattpocock",
  owner: plugin.author,
  description:
    "Matt Pocock's skills for real engineering — the whole set, or one skill at a time.",
  plugins: [
    {
      name: plugin.name,
      source: `./plugins/${plugin.name}`,
      description: plugin.description,
      version,
      author: plugin.author,
      license: plugin.license,
      category: "engineering",
      keywords: plugin.keywords,
    },
    ...entries,
  ],
});

// The bundle holds no skills of its own, only dependencies, so it can sit beside single installs.
writeJson(join(repo, "plugins", plugin.name, ".claude-plugin", "plugin.json"), {
  name: plugin.name,
  description: plugin.description,
  version,
  author: plugin.author,
  homepage: plugin.homepage,
  repository: plugin.repository,
  license: plugin.license,
  dependencies: [...names].sort(),
});

console.log(`plugins/: ${entries.length} single-skill plugins + bundle`);
