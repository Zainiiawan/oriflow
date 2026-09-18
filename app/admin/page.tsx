import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import DistributorDashboard from '@/components/distributor-dashboard'
import { auth } from '@/lib/auth'
import { getDashboardData } from '@/app/actions/mlm'

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  const data = await getDashboardData()
  if (!data.profile || !['admin', 'manager'].includes(data.profile.role)) redirect('/')

  return <DistributorDashboard user={{ name: session.user.name, email: session.user.email }} data={data} initialActive="Admin" />
}

export const metadata = {
  title: 'Admin | Oriflow Business Portal',
  description: 'Secure Oriflow administration workspace.',
}
