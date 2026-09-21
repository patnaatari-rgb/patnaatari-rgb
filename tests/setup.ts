import { vi } from "vitest";
import { prismaRecorder } from "./helpers/prisma-recorder";

// No test may reach a real database or depend on a developer's .env.local.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET = "test-secret-not-used-in-any-real-environment-0000";

vi.mock("@/lib/prisma", () => ({ prisma: prismaRecorder }));
