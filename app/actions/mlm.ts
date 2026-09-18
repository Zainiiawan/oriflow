'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mlmOrders, mlmProducts, mlmProfiles, mlmRewards } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
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
    const [order] = await tx.select({ total: mlmOrders.total, totalBp: mlmOrders.totalBp }).from(mlmOrders)
      .where(and(eq(mlmOrders.id, orderId), eq(mlmOrders.userId, userId), eq(mlmOrders.status, 'Pending'))).limit(1)
    if (!order) throw new Error('Order is no longer cancellable')
    const [profile] = await tx.select({ personalBp: mlmProfiles.personalBp, personalSp: mlmProfiles.personalSp, walletBalance: mlmProfiles.walletBalance, sponsorUserId: mlmProfiles.sponsorUserId })
      .from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1)
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
    await tx.insert(mlmRewards).values({ userId, type: 'Withdrawal request', amount: (-amount).toFixed(2), bp: 0, description: 'Pending admin approval' })
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
