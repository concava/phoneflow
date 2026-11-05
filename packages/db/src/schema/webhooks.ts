import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { organization } from "@workspace/db/schema/auth"
import type {
  WebhookDeliveryEventType,
  WebhookDeliveryStatus,
  WebhookEventType,
  WebhookPayload,
} from "@workspace/shared/api/webhooks/types"

export const webhookEndpointsTable = pgTable(
  "webhook_endpoints",
  {
    id: uuid().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text().notNull(),
    secret: text().notNull(),
    events: text().$type<WebhookEventType>().array().notNull(),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("webhook_endpoints_organization_id_idx").on(table.organizationId),
  ]
)

export const webhookDeliveriesTable = pgTable(
  "webhook_deliveries",
  {
    id: uuid().primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpointsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull().$type<WebhookDeliveryEventType>(),
    payload: json().$type<WebhookPayload>().notNull(),
    status: text("status")
      .notNull()
      .$type<WebhookDeliveryStatus>()
      .default("pending"),
    attempts: integer().notNull().default(0),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("webhook_deliveries_endpoint_id_created_at_idx").on(
      table.endpointId,
      table.createdAt
    ),
  ]
)
