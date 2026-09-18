import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import DistributorDashboard from '@/components/distributor-dashboard'
import { auth } from '@/lib/auth'
import { getDashboardData } from '@/app/actions/mlm'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const data = await getDashboardData()
  return <DistributorDashboard user={{ name: session.user.name, email: session.user.email }} data={data} />
}

export const metadata = {
  title: 'Oriflow Business Portal',
  description: 'A modern distributor workspace for network growth, rewards, and product orders.',
}

export const viewport = {
  colorScheme: 'light' as const,
  themeColor: '#fbf8f6',
}

// v0 Design System Showcase Page
// This dashboard is an original business portal concept inspired by premium beauty commerce.
