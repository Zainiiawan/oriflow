import { integer, jsonb, numeric, pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'

export const mlmProfiles = pgTable('mlm_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  referralCode: text('referral_code').notNull().unique(),
  sponsorUserId: text('sponsor_user_id'),
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
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull(), status: text('status').notNull().default('Pending'), paymentStatus: text('payment_status').notNull().default('Awaiting bank transfer'), paymentReference: text('payment_reference'), fulfillmentCity: text('fulfillment_city').notNull().default('Unassigned'), total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'), totalBp: integer('total_bp').notNull().default(0), items: jsonb('items').notNull().default([]), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlmRewards = pgTable('mlm_rewards', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull(), type: text('type').notNull(), amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), bp: integer('bp').notNull().default(0), description: text('description').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
