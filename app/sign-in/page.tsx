import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import AuthForm from '@/components/auth-form'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')
  return <main className="flex min-h-screen items-center justify-center bg-[#fbf8f6] px-5 py-10"><section className="w-full max-w-md rounded-3xl border border-[#eadfdc] bg-white p-7 shadow-[0_8px_30px_rgba(73,37,32,0.06)]"><p className="font-serif text-2xl text-[#762f42]">oriflow</p><p className="mt-1 text-sm text-[#806f6a]">Distributor business portal</p><h1 className="mt-8 font-serif text-3xl text-[#3b2522]">Welcome back</h1><p className="mt-2 text-sm text-[#806f6a]">Sign in to manage your network, orders, and rewards.</p><div className="mt-6"><AuthForm mode="sign-in" /></div><p className="mt-6 text-center text-sm text-[#806f6a]">New distributor? <Link href="/sign-up" className="font-semibold text-[#762f42]">Create an account</Link></p></section></main>
}
