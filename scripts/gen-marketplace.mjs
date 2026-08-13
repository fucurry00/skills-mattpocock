#!/usr/bin/env node
// Regenerates .claude-plugin/marketplace.json: the whole-set bundle entry, plus
// one entry per skill so skills can be installed individually
// (`/plugin install tdd@mattpocock`).
//
// Run it after pulling upstream, whenever plugin.json's `skills` list changes:
//   node scripts/gen-marketplace.mjs
//
// Per-skill entries point `source` at the category directory and list the one
// skill, because a `source: "./"` entry inherits plugin.json's name and
// description in the plugin UI, and `strict: false` there fails to load
// (plugin.json already declares components).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = JSON.parse(
  readFileSync(join(repo, ".claude-plugin", "plugin.json"), "utf8"),
);
const { version } = JSON.parse(
  readFileSync(join(repo, "package.json"), "utf8"),
);

const describe = (skillPath) => {
  const src = readFileSync(join(repo, skillPath, "SKILL.md"), "utf8");
  const description = src.match(/^---\r?\n[\s\S]*?^description:\s*(.+?)\s*$/m);
  if (!description) throw new Error(`No description in ${skillPath}/SKILL.md`);
  return description[1].replace(/^["']|["']$/g, "");
};

const marketplace = {
  name: "mattpocock",
  owner: plugin.author,
  description:
    "Matt Pocock's skills for real engineering — the whole set, or one skill at a time.",
  plugins: [
    {
      name: plugin.name,
      source: "./",
      description: plugin.description,
      category: "engineering",
      keywords: plugin.keywords,
    },
    ...plugin.skills.map((skillPath) => {
      const [, , category, name] = skillPath.split("/");
      return {
        name,
        source: `./skills/${category}`,
        skills: [`./${name}`],
        description: describe(skillPath),
        version,
        author: plugin.author,
        license: plugin.license,
        category,
      };
    }),
  ],
};

writeFileSync(
  join(repo, ".claude-plugin", "marketplace.json"),
  JSON.stringify(marketplace, null, 2) + "\n",
);
console.log(`marketplace.json: ${marketplace.plugins.length} entries`);
