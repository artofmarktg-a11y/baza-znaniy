import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type AuditDatabase = Pick<PrismaClient, "auditEvent">;

type AuditEventInput = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  requestId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changes?: Array<Record<string, unknown>>;
};

export function requestIdFor(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId && /^[A-Za-z0-9._-]{8,128}$/.test(requestId) ? requestId : randomUUID();
}

export async function writeAuditEvent(database: AuditDatabase, event: AuditEventInput) {
  await database.auditEvent.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId || null,
      metadata: {
        requestId: event.requestId,
        ...(event.before ? { before: event.before } : {}),
        ...(event.after ? { after: event.after } : {}),
        ...(event.changes?.length ? { changes: event.changes } : {}),
      } as Prisma.InputJsonValue,
    },
  });
}
