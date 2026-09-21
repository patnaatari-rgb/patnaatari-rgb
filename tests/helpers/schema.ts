import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));

/** Prisma delegate name (`nicraTraining`) -> field name -> scalar/relation type, read straight from schema.prisma. */
export function loadSchemaFields(): Map<string, Map<string, string>> {
  const text = readFileSync(schemaPath, "utf8").replace(/\r\n/g, "\n");
  const models = new Map<string, Map<string, string>>();
  for (const match of text.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    const fields = new Map<string, string>();
    for (const line of match[2].split("\n")) {
      const field = line.match(/^\s+(\w+)\s+(\w+)(\?|\[\])?/);
      if (field) fields.set(field[1], field[2]);
    }
    models.set(match[1][0].toLowerCase() + match[1].slice(1), fields);
  }
  return models;
}

export const NUMERIC_DB_TYPES = new Set(["Int", "Float", "Decimal", "BigInt"]);
