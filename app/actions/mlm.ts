'use server'

import { and, desc, eq } from 'drizzle-orm'
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
  return { profile: profile ?? null, products, orders, rewards }
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

    const [profile] = await tx.select({ personalBp: mlmProfiles.personalBp, personalSp: mlmProfiles.personalSp })
      .from(mlmProfiles)
      .where(eq(mlmProfiles.userId, userId))
      .limit(1)

    if (profile) {
      const commission = total * 0.1
      await tx.update(mlmProfiles)
        .set({
          personalBp: profile.personalBp + totalBp,
          personalSp: (Number(profile.personalSp) + total * 2).toFixed(2),
          walletBalance: (Number((await tx.select({ walletBalance: mlmProfiles.walletBalance }).from(mlmProfiles).where(eq(mlmProfiles.userId, userId)).limit(1))[0]?.walletBalance ?? 0) + commission).toFixed(2),
        })
        .where(eq(mlmProfiles.userId, userId))
      await tx.insert(mlmRewards).values({
        userId,
        type: 'Personal commission',
        amount: commission.toFixed(2),
        bp: totalBp,
        description: `10% commission from order ${createdOrder.id.slice(0, 8).toUpperCase()}`,
      })
    }

    return [createdOrder] as const
  })
  revalidatePath('/')
  return order
}
