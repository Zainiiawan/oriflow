import { integer, jsonb, numeric, pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'

export const mlmProfiles = pgTable('mlm_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  referralCode: text('referral_code').notNull().unique(),
  sponsorUserId: text('sponsor_user_id'),
  role: text('role').notNull().default('member'),
  rank: text('rank').notNull().default('Beauty Partner'),
  personalBp: integer('personal_bp').notNull().default(0),
  personalSp: numeric('personal_sp', { precision: 12, scale: 2 }).notNull().default('0'),
  teamBp: integer('team_bp').notNull().default(0),
  walletBalance: numeric('wallet_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmProducts = pgTable('mlm_products', {
  id: uuid('id').defaultRandom().primaryKey(), name: text('name').notNull(), category: text('category').notNull(), price: numeric('price', { precision: 12, scale: 2 }).notNull(), bp: integer('bp').notNull().default(0), stockQuantity: integer('stock_quantity').notNull().default(0), imageTone: text('image_tone').notNull(), active: boolean('active').notNull().default(true), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmOrders = pgTable('mlm_orders', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull(), status: text('status').notNull().default('Pending'), paymentStatus: text('payment_status').notNull().default('Awaiting bank transfer'), paymentReference: text('payment_reference'), refundStatus: text('refund_status').notNull().default('none'), fulfillmentCity: text('fulfillment_city').notNull().default('Unassigned'), total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'), totalBp: integer('total_bp').notNull().default(0), items: jsonb('items').notNull().default([]), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmSupportTickets = pgTable('mlm_support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull(), subject: text('subject').notNull(), message: text('message').notNull(), status: text('status').notNull().default('open'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmAuditLogs = pgTable('mlm_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(), actorUserId: text('actor_user_id').notNull(), action: text('action').notNull(), entityType: text('entity_type').notNull(), entityId: text('entity_id').notNull(), details: jsonb('details').notNull().default({}), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmNotifications = pgTable('mlm_notifications', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull(), type: text('type').notNull(), title: text('title').notNull(), message: text('message').notNull(), readAt: timestamp('read_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmRewards = pgTable('mlm_rewards', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull(), type: text('type').notNull(), amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), bp: integer('bp').notNull().default(0), description: text('description').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
