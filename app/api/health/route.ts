import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503 })
  }
}
