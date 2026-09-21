/**
 * Stand-in for lib/prisma.ts so the suite never touches a real database.
 * Every `prisma.<model>.<method>(args)` call is recorded instead of run and
 * resolves to `{ id: "test-id", count: 1 }`, which is enough for the create /
 * update / delete registries to complete. Tests assert on what would have been
 * written (`calls[n].args.data`), which is the part that must never depend on
 * what the browser sent.
 */
export type RecordedCall = { model: string; method: string; args: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const calls: RecordedCall[] = [];

/**
 * "own": the record exists and belongs to the caller (finds return a row,
 * writes affect one row). "foreign": the id belongs to someone else, which
 * from the caller's scoped query looks like nothing matched (finds return
 * null / [], writes affect zero rows). Handlers must not write anything
 * unscoped in the second case.
 */
let mode: "own" | "foreign" = "own";

export function resetCalls() {
  calls.length = 0;
  mode = "own";
}

export function simulateForeignRecords() {
  mode = "foreign";
}

const FIND_METHODS = new Set(["findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow"]);
const AFFECT_METHODS = new Set(["update", "updateMany", "delete", "deleteMany"]);

function result(method: string) {
  if (mode === "foreign") {
    if (FIND_METHODS.has(method)) return null;
    if (method === "findMany") return [];
    if (AFFECT_METHODS.has(method)) return { count: 0 };
  }
  return { id: "test-id", count: 1 };
}

function makeDelegate(model: string) {
  return new Proxy(
    {},
    {
      get(_target, method: string) {
        return (args: unknown) => {
          calls.push({ model, method, args });
          return Promise.resolve(result(method));
        };
      },
    },
  );
}

export const prismaRecorder: any = new Proxy( // eslint-disable-line @typescript-eslint/no-explicit-any
  {},
  {
    get(_target, name: string) {
      if (name === "$transaction") {
        return (arg: unknown) =>
          typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prismaRecorder) : Promise.all(arg as unknown[]);
      }
      return makeDelegate(name);
    },
  },
);
