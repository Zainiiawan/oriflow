import AuthForm from '@/components/auth-form'

export const metadata = {
  title: 'Admin Login | Oriflow',
  description: 'Secure Oriflow administrator login.',
}

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-[#fbf6f4] px-6 py-12 text-[#241b19]">
      <section className="mx-auto max-w-md rounded-3xl border border-[#eadfdc] bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a78c83]">Oriflow control centre</p>
        <h1 className="mt-3 font-serif text-4xl">Administrator login</h1>
        <p className="mt-3 text-sm leading-6 text-[#806f6a]">Use your approved administrator account. Only accounts with an admin or manager role can continue.</p>
        <div className="mt-7"><AuthForm mode="sign-in" redirectTo="/admin" /></div>
        <p className="mt-5 text-center text-xs text-[#98827b]">Admin account: admin@example.com</p>
      </section>
    </main>
  )
}
