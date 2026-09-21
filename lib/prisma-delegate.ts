import "server-only";
import { prisma } from "@/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A row read through a delegate that was looked up by name: its shape is only known at runtime, from the caller's own column config. */
export type DynamicRow = Record<string, any>;

/** The slice of a Prisma model delegate the data-driven code actually calls. */
export type DynamicDelegate = {
  findMany(args?: object): Promise<any[]>;
  groupBy(args: object): Promise<any[]>;
};

/**
 * Looks up a model's Prisma delegate from its name, for code driven by
 * configuration rather than by a fixed model (the report engine and Form
 * Summary walk lists of model names). The generated client has no type for
 * "some delegate chosen at runtime", so the lookup is cast once, here,
 * instead of at every call site. A name that is not a real model fails on the
 * first call; the tests check every configured name against schema.prisma.
 */
export function modelDelegate(model: string): DynamicDelegate {
  return (prisma as any)[model];
}
