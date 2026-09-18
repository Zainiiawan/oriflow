'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, signUp } from '@/lib/auth-client'
import { claimReferral } from '@/app/actions/mlm'

export default function AuthForm({ mode, referralCode, redirectTo = '/' }: { mode: 'sign-in' | 'sign-up'; referralCode?: string; redirectTo?: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    const result = mode === 'sign-up'
      ? await signUp.email({ name, email, password })
      : await signIn.email({ email, password })
    setPending(false)
    if (result.error) {
      const message = typeof result.error.message === 'string' ? result.error.message.toLowerCase() : ''
      setError(mode === 'sign-in' && (message.includes('invalid') || message.includes('credential') || message.includes('not found'))
        ? 'This account does not exist yet, or the password is incorrect. Create the admin account first, then sign in.'
        : 'Unable to continue. Check your details and try again.')
      return
    }
    if (mode === 'sign-up' && referralCode) {
      try {
        await claimReferral(referralCode)
      } catch {
        // Account creation should still succeed when a referral code has expired.
      }
    }
    router.push(redirectTo)
    router.refresh()
  }

  return <form onSubmit={submit} className="flex flex-col gap-4">
    {mode === 'sign-up' && <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Full name</span><input required value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border border-[#eadfdc] bg-white px-3 py-2.5 outline-none focus:border-[#762f42]" /></label>}
    <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-xl border border-[#eadfdc] bg-white px-3 py-2.5 outline-none focus:border-[#762f42]" /></label>
    <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Password</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-xl border border-[#eadfdc] bg-white px-3 py-2.5 outline-none focus:border-[#762f42]" /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <button disabled={pending} className="rounded-xl bg-[#762f42] px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Please wait...' : mode === 'sign-up' ? 'Create distributor account' : 'Sign in'}</button>
  </form>
}
