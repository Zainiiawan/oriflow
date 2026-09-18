'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mlmAuditLogs, mlmFulfillmentEvents, mlmNotifications, mlmOrders, mlmProducts, mlmProfiles, mlmRewards, mlmSupportTickets, mlmWithdrawals } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

async function requireAdmin() {
  const userId = await getUserId()
  const [profile] = await db.select({ role: mlmProfiles.role }).from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
  if (!profile || !['admin', 'manager'].includes(profile.role)) throw new Error('Admin access required')
  return userId
}

export async function updateFulfillment(orderId: string, statusInput: string, trackingInput = '', noteInput = '') {
  const actorUserId = await requireAdmin()
  const allowed = ['Approved', 'Packed', 'Shipped', 'Delivered', 'Cancelled']
  const status = statusInput.trim()
  if (!allowed.includes(status)) throw new Error('Invalid fulfillment status')
  const trackingReference = trackingInput.trim().slice(0, 120) || null
  const note = noteInput.trim().slice(0, 500) || null
  const [order] = await db.select({ userId: mlmOrders.userId }).from(mlmOrders).where(eq(mlmOrders.id, orderId)).limit(1)
  if (!order) throw new Error('Order not found')
  await db.transaction(async (tx) => {
    await tx.update(mlmOrders).set({ status }).where(eq(mlmOrders.id, orderId))
    await tx.insert(mlmFulfillmentEvents).values({ orderId, actorUserId, status, trackingReference, note })
    await tx.insert(mlmAuditLogs).values({ actorUserId, action: 'fulfillment_updated', entityType: 'order', entityId: orderId, details: { status, trackingReference, note } })
    await tx.insert(mlmNotifications).values({ userId: order.userId, type: 'fulfillment', title: 'Order updated', message: `Your order is now ${status}.` })
  })
  revalidatePath('/')
}

export async function reviewOrder(orderId: string, decisionInput: string) {
  const actorUserId = await requireAdmin()
  const decision = decisionInput === 'approve' ? 'Approved' : decisionInput === 'reject' ? 'Rejected' : ''
  if (!decision || !orderId) throw new Error('Invalid review')
  const [order] = await db.select({ userId: mlmOrders.userId }).from(mlmOrders).where(eq(mlmOrders.id, orderId)).limit(1)
  if (!order) throw new Error('Order not found')
  await db.transaction(async (tx) => {
    await tx.update(mlmOrders).set({ status: decision, paymentStatus: decision === 'Approved' ? 'Verified' : 'Rejected' }).where(eq(mlmOrders.id, orderId))
    await tx.insert(mlmAuditLogs).values({ actorUserId, action: `order_${decision.toLowerCase()}`, entityType: 'order', entityId: orderId, details: {} })
    await tx.insert(mlmNotifications).values({ userId: order.userId, type: 'order', title: `Order ${decision.toLowerCase()}`, message: `Your order ${orderId.slice(0, 8).toUpperCase()} was ${decision.toLowerCase()}.` })
  })
  revalidatePath('/')
}

export async function createProduct(input: { name: string; category: string; price: number; bp: number; stockQuantity: number; imageTone: string }) {
  const actorUserId = await requireAdmin()
  if (!input.name.trim() || !input.category.trim() || input.price <= 0 || input.bp < 0 || input.stockQuantity < 0) throw new Error('Invalid product')
  const [product] = await db.insert(mlmProducts).values({ name: input.name.trim().slice(0, 120), category: input.category.trim().slice(0, 80), price: input.price.toFixed(2), bp: Math.floor(input.bp), stockQuantity: Math.floor(input.stockQuantity), imageTone: input.imageTone.trim().slice(0, 40) || '#ead0d0' }).returning()
  await db.insert(mlmAuditLogs).values({ actorUserId, action: 'product_created', entityType: 'product', entityId: product.id, details: { name: product.name } })
  revalidatePath('/')
  return product
}

export async function updateProduct(productId: string, input: { name: string; category: string; price: number; bp: number }) {
  const actorUserId = await requireAdmin()
  const name = input.name.trim().slice(0, 120)
  const category = input.category.trim().slice(0, 80)
  if (!productId || !name || !category || !Number.isFinite(input.price) || input.price <= 0 || !Number.isInteger(input.bp) || input.bp < 0) throw new Error('Invalid product')
  await db.update(mlmProducts).set({ name, category, price: input.price.toFixed(2), bp: input.bp }).where(eq(mlmProducts.id, productId))
  await db.insert(mlmAuditLogs).values({ actorUserId, action: 'product_updated', entityType: 'product', entityId: productId, details: { name, category } })
  revalidatePath('/')
}

export async function updateProductStock(productId: string, quantityInput: number) {
  const actorUserId = await requireAdmin()
  const quantity = Math.floor(Number(quantityInput))
  if (!productId || !Number.isInteger(quantity) || quantity < 0) throw new Error('Invalid stock quantity')
  await db.update(mlmProducts).set({ stockQuantity: quantity }).where(eq(mlmProducts.id, productId))
  await db.insert(mlmAuditLogs).values({ actorUserId, action: 'stock_updated', entityType: 'product', entityId: productId, details: { quantity } })
  revalidatePath('/')
}

export async function archiveProduct(productId: string) {
  const actorUserId = await requireAdmin()
  await db.update(mlmProducts).set({ active: false }).where(eq(mlmProducts.id, productId))
  await db.insert(mlmAuditLogs).values({ actorUserId, action: 'product_archived', entityType: 'product', entityId: productId, details: {} })
  revalidatePath('/')
}

export async function resolveSupportTicket(ticketId: string, statusInput: string) {
  const actorUserId = await requireAdmin()
  const status = ['open', 'in_progress', 'resolved', 'closed'].includes(statusInput) ? statusInput : ''
  if (!status) throw new Error('Invalid ticket status')
  const [ticket] = await db.select({ userId: mlmSupportTickets.userId }).from(mlmSupportTickets).where(eq(mlmSupportTickets.id, ticketId)).limit(1)
  if (!ticket) throw new Error('Ticket not found')
  await db.update(mlmSupportTickets).set({ status }).where(eq(mlmSupportTickets.id, ticketId))
  await db.insert(mlmAuditLogs).values({ actorUserId, action: 'support_ticket_updated', entityType: 'support_ticket', entityId: ticketId, details: { status } })
  await db.insert(mlmNotifications).values({ userId: ticket.userId, type: 'support', title: 'Support ticket updated', message: `Your support ticket is now ${status}.` })
  revalidatePath('/')
}

export async function claimReferral(referralCodeInput: string) {
  const userId = await getUserId()
  const referralCode = referralCodeInput.trim().toUpperCase()
  if (!referralCode || referralCode.length > 40) throw new Error('Invalid referral code')
  const [sponsor] = await db.select({ userId: mlmProfiles.userId }).from(mlmProfiles).where(eq(mlmProfiles.referralCode, referralCode)).limit(1)
  if (!sponsor || sponsor.userId === userId) throw new Error('Referral code unavailable')
  const existing = await db.select({ id: mlmProfiles.id, sponsorUserId: mlmProfiles.sponsorUserId }).from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
  if (existing[0]?.sponsorUserId) return
  if (existing[0]) {
    await db.update(mlmProfiles).set({ sponsorUserId: sponsor.userId }).where(eq(mlmProfiles.userId, userId))
  } else {
    await db.insert(mlmProfiles).values({ userId, referralCode: `OF-${userId.slice(0, 8).toUpperCase()}`, sponsorUserId: sponsor.userId })
  }
  revalidatePath('/')
}

export async function getDashboardData() {
  const userId = await getUserId()
  let [profile] = await db.select().from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
  if (!profile) {
    const referralCode = `OF-${userId.slice(0, 8).toUpperCase()}`
    ;[profile] = await db.insert(mlmProfiles).values({ userId, referralCode }).onConflictDoNothing({ target: mlmProfiles.userId }).returning()
    if (!profile) {
      ;[profile] = await db.select().from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
    }
  }
  const products = await db.select().from(mlmProducts).where(eq(mlmProducts.active, true)).orderBy(desc(mlmProducts.createdAt))
  const orders = await db.select().from(mlmOrders).where(eq(mlmOrders.userId, userId)).orderBy(desc(mlmOrders.createdAt)).limit(20)
  const rewards = await db.select().from(mlmRewards).where(eq(mlmRewards.userId, userId)).orderBy(desc(mlmRewards.createdAt)).limit(20)
  const network = await db.select({
    id: mlmProfiles.id,
    userId: mlmProfiles.userId,
    rank: mlmProfiles.rank,
    personalBp: mlmProfiles.personalBp,
    personalSp: mlmProfiles.personalSp,
    createdAt: mlmProfiles.createdAt,
  }).from(mlmProfiles).where(eq(mlmProfiles.sponsorUserId, userId)).orderBy(desc(mlmProfiles.createdAt)).limit(100)
  return { profile: profile ?? null, products, orders, rewards, network }
}

export async function requestReturn(orderId: string, reasonInput: string) {
  const userId = await getUserId()
  const reason = reasonInput.trim().slice(0, 500)
  if (!orderId || !reason) throw new Error('Order and return reason are required')
  const [order] = await db.select({ id: mlmOrders.id }).from(mlmOrders).where(and(eq(mlmOrders.id, orderId), eq(mlmOrders.userId, userId))).limit(1)
  if (!order) throw new Error('Order not found')
  await db.update(mlmOrders).set({ refundStatus: 'requested' }).where(eq(mlmOrders.id, orderId))
  await db.insert(mlmNotifications).values({ userId, type: 'return', title: 'Return request received', message: 'Your return request is awaiting review.' })
  revalidatePath('/')
}

export async function reviewWithdrawal(withdrawalId: string, decisionInput: string, payoutReferenceInput = '') {
  const actorUserId = await requireAdmin()
  const status = decisionInput === 'approve' ? 'approved' : decisionInput === 'reject' ? 'rejected' : ''
  if (!status) throw new Error('Invalid withdrawal decision')
  const [withdrawal] = await db.select({ userId: mlmWithdrawals.userId, amount: mlmWithdrawals.amount }).from(mlmWithdrawals).where(eq(mlmWithdrawals.id, withdrawalId)).limit(1)
  if (!withdrawal) throw new Error('Withdrawal not found')
  await db.transaction(async (tx) => {
    await tx.update(mlmWithdrawals).set({ status, payoutReference: payoutReferenceInput.trim().slice(0, 120) || null }).where(eq(mlmWithdrawals.id, withdrawalId))
    if (status === 'rejected') await tx.update(mlmProfiles).set({ walletBalance: sql`${mlmProfiles.walletBalance} + ${withdrawal.amount}` }).where(eq(mlmProfiles.userId, withdrawal.userId))
    await tx.insert(mlmAuditLogs).values({ actorUserId, action: `withdrawal_${status}`, entityType: 'withdrawal', entityId: withdrawalId, details: { payoutReference: payoutReferenceInput } })
    await tx.insert(mlmNotifications).values({ userId: withdrawal.userId, type: 'withdrawal', title: `Withdrawal ${status}`, message: status === 'approved' ? 'Your withdrawal was approved.' : 'Your balance was restored because the withdrawal was rejected.' })
  })
  revalidatePath('/')
}

export async function createSupportTicket(subjectInput: string, messageInput: string) {
  const userId = await getUserId()
  const subject = subjectInput.trim().slice(0, 120)
  const message = messageInput.trim().slice(0, 2000)
  if (!subject || !message) throw new Error('Subject and message are required')
  await db.insert(mlmSupportTickets).values({ userId, subject, message })
  await db.insert(mlmNotifications).values({ userId, type: 'support', title: 'Support ticket created', message: 'Your request has been received and is awaiting review.' })
  revalidatePath('/')
}

export async function submitPaymentReference(orderId: string, referenceInput: string) {
  const userId = await getUserId()
  const reference = referenceInput.trim().slice(0, 120)
  if (!reference) throw new Error('Payment reference is required')
  await db.update(mlmOrders).set({ paymentReference: reference, paymentStatus: 'Proof submitted' })
    .where(and(eq(mlmOrders.id, orderId), eq(mlmOrders.userId, userId), eq(mlmOrders.status, 'Pending')))
  revalidatePath('/')
}

export async function assignFulfillmentCity(orderId: string, cityInput: string) {
  const userId = await getUserId()
  const city = cityInput.trim()
  const allowedCities = ['Multan', 'Lahore', 'Karachi', 'Islamabad']
  if (!allowedCities.includes(city)) throw new Error('Unsupported fulfillment city')
  await db.update(mlmOrders).set({ fulfillmentCity: city }).where(and(eq(mlmOrders.id, orderId), eq(mlmOrders.userId, userId), eq(mlmOrders.status, 'Pending')))
  revalidatePath('/')
}

export async function cancelOrder(orderId: string) {
  const userId = await getUserId()
  if (!orderId || orderId.length > 50) throw new Error('Invalid order')
  await db.transaction(async (tx) => {
    const [order] = await tx.select({ total: mlmOrders.total, totalBp: mlmOrders.totalBp, items: mlmOrders.items }).from(mlmOrders)
      .where(and(eq(mlmOrders.id, orderId), eq(mlmOrders.userId, userId), eq(mlmOrders.status, 'Pending'))).limit(1)
    if (!order) throw new Error('Order is no longer cancellable')
    const [profile] = await tx.select({ personalBp: mlmProfiles.personalBp, personalSp: mlmProfiles.personalSp, walletBalance: mlmProfiles.walletBalance, sponsorUserId: mlmProfiles.sponsorUserId })
      .from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
    const cancelledItems = Array.isArray(order.items) ? order.items as Array<{ id: string; quantity: number }> : []
    for (const item of cancelledItems) {
      await tx.update(mlmProducts).set({ stockQuantity: sql`${mlmProducts.stockQuantity} + ${item.quantity}` }).where(eq(mlmProducts.id, item.id))
    }
    if (profile) {
      const total = Number(order.total)
      await tx.update(mlmProfiles).set({
        personalBp: Math.max(0, profile.personalBp - order.totalBp),
        personalSp: Math.max(0, Number(profile.personalSp) - total * 2).toFixed(2),
        walletBalance: Math.max(0, Number(profile.walletBalance) - total * 0.1).toFixed(2),
      }).where(eq(mlmProfiles.userId, userId))
      await tx.insert(mlmRewards).values({ userId, type: 'Order reversal', amount: (-total * 0.1).toFixed(2), bp: -order.totalBp, description: `Reversal for cancelled order ${orderId.slice(0, 8).toUpperCase()}` })

      const commissionRates = [0.1, 0.05, 0.02]
      let sponsorUserId = profile.sponsorUserId
      const reversedSponsors = new Set<string>()
      for (let level = 0; level < commissionRates.length && sponsorUserId; level += 1) {
        if (reversedSponsors.has(sponsorUserId)) break
        reversedSponsors.add(sponsorUserId)
        const [sponsor] = await tx.select({ userId: mlmProfiles.userId, sponsorUserId: mlmProfiles.sponsorUserId, walletBalance: mlmProfiles.walletBalance }).from(mlmProfiles).where(eq(mlmProfiles.userId, sponsorUserId)).limit(1)
        if (!sponsor) break
        const commission = total * commissionRates[level]
        await tx.update(mlmProfiles).set({ walletBalance: Math.max(0, Number(sponsor.walletBalance) - commission).toFixed(2) }).where(eq(mlmProfiles.userId, sponsor.userId))
        await tx.insert(mlmRewards).values({ userId: sponsor.userId, type: `Level ${level + 1} reversal`, amount: (-commission).toFixed(2), bp: -order.totalBp, description: `Reversal of network commission for order ${orderId.slice(0, 8).toUpperCase()}` })
        sponsorUserId = sponsor.sponsorUserId
      }
    }
    await tx.update(mlmOrders).set({ status: 'Cancelled' }).where(and(eq(mlmOrders.id, orderId), eq(mlmOrders.userId, userId)))
  })
  revalidatePath('/')
}

export async function requestWithdrawal(amountInput: number) {
  const userId = await getUserId()
  const amount = Number(amountInput)
  if (!Number.isFinite(amount) || amount < 500 || amount > 500000) throw new Error('Invalid withdrawal amount')
  await db.transaction(async (tx) => {
    const [profile] = await tx.select({ walletBalance: mlmProfiles.walletBalance }).from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
    const balance = Number(profile?.walletBalance ?? 0)
    if (amount > balance) throw new Error('Insufficient wallet balance')
    await tx.update(mlmProfiles).set({ walletBalance: (balance - amount).toFixed(2) }).where(eq(mlmProfiles.userId, userId))
    const [withdrawal] = await tx.insert(mlmWithdrawals).values({ userId, amount: amount.toFixed(2) }).returning()
    await tx.insert(mlmRewards).values({ userId, type: 'Withdrawal request', amount: (-amount).toFixed(2), bp: 0, description: `Pending admin approval · ${withdrawal.id.slice(0, 8).toUpperCase()}` })
    await tx.insert(mlmAuditLogs).values({ actorUserId: userId, action: 'withdrawal_requested', entityType: 'withdrawal', entityId: withdrawal.id, details: { amount } })
  })
  revalidatePath('/')
}

export async function createOrder(items: Array<{ id: string; name: string; price: number; bp: number; quantity: number }>) {
  const userId = await getUserId()
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const hasDuplicateProducts = new Set(items.map((item) => item.id)).size !== items.length
  if (
    !items.length ||
    hasDuplicateProducts ||
    totalQuantity > 99 ||
    items.some((item) => !item.id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
  ) throw new Error('Invalid order')
  const ids = items.map((item) => item.id)
  const catalog = await db.select().from(mlmProducts).where(eq(mlmProducts.active, true))
  const catalogMap = new Map(catalog.filter((item) => ids.includes(item.id)).map((item) => [item.id, item]))
  const verifiedItems = items.map((item) => {
    const product = catalogMap.get(item.id)
    if (!product) throw new Error('Product unavailable')
    if (product.stockQuantity > 0 && product.stockQuantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`)
    return { id: product.id, name: product.name, price: Number(product.price), bp: product.bp, quantity: item.quantity }
  })
  const total = verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const totalBp = verifiedItems.reduce((sum, item) => sum + item.bp * item.quantity, 0)
  const [order] = await db.transaction(async (tx) => {
    const [createdOrder] = await tx.insert(mlmOrders).values({
      userId,
      status: 'Pending',
      total: total.toFixed(2),
      totalBp,
      items: verifiedItems,
    }).returning()

    await tx.insert(mlmAuditLogs).values({ actorUserId: userId, action: 'order_created', entityType: 'order', entityId: createdOrder.id, details: { total, totalBp } })
    await tx.insert(mlmNotifications).values({ userId, type: 'order', title: 'Order submitted', message: `Order ${createdOrder.id.slice(0, 8).toUpperCase()} is awaiting payment verification.` })

    for (const item of verifiedItems) {
      await tx.update(mlmProducts)
        .set({ stockQuantity: sql`CASE WHEN ${mlmProducts.stockQuantity} > 0 THEN GREATEST(0, ${mlmProducts.stockQuantity} - ${item.quantity}) ELSE ${mlmProducts.stockQuantity} END` })
        .where(eq(mlmProducts.id, item.id))
    }

    const [profile] = await tx.select({
      personalBp: mlmProfiles.personalBp,
      personalSp: mlmProfiles.personalSp,
      walletBalance: mlmProfiles.walletBalance,
      sponsorUserId: mlmProfiles.sponsorUserId,
    })
      .from(mlmProfiles)
      .where(eq(mlmProfiles.userId, userId))
      .limit(1)

    if (profile) {
      const personalCommission = total * 0.1
      await tx.update(mlmProfiles)
        .set({
          personalBp: profile.personalBp + totalBp,
          personalSp: (Number(profile.personalSp) + total * 2).toFixed(2),
          walletBalance: (Number(profile.walletBalance) + personalCommission).toFixed(2),
        })
        .where(eq(mlmProfiles.userId, userId))
      await tx.insert(mlmRewards).values({
        userId,
        type: 'Personal commission',
        amount: personalCommission.toFixed(2),
        bp: totalBp,
        description: `10% personal commission from order ${createdOrder.id.slice(0, 8).toUpperCase()}`,
      })

      const commissionRates = [0.1, 0.05, 0.02]
      let sponsorUserId = profile.sponsorUserId
      const paidSponsors = new Set<string>()
      for (let level = 0; level < commissionRates.length && sponsorUserId; level += 1) {
        if (paidSponsors.has(sponsorUserId)) break
        paidSponsors.add(sponsorUserId)
        const [sponsor] = await tx.select({ userId: mlmProfiles.userId, sponsorUserId: mlmProfiles.sponsorUserId, walletBalance: mlmProfiles.walletBalance })
          .from(mlmProfiles).where(eq(mlmProfiles.userId, sponsorUserId)).limit(1)
        if (!sponsor) break
        const commission = total * commissionRates[level]
        await tx.update(mlmProfiles).set({ walletBalance: (Number(sponsor.walletBalance) + commission).toFixed(2) }).where(eq(mlmProfiles.userId, sponsor.userId))
        await tx.insert(mlmRewards).values({ userId: sponsor.userId, type: `Level ${level + 1} commission`, amount: commission.toFixed(2), bp: totalBp, description: `${commissionRates[level] * 100}% network commission from order ${createdOrder.id.slice(0, 8).toUpperCase()}` })
        sponsorUserId = sponsor.sponsorUserId
      }
    }

    return [createdOrder] as const
  })
  revalidatePath('/')
  return order
}
