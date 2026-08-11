'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const handlePasswordRecovery = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          setReady(true)
        } else {
          setMessage(`Erreur de lien : ${error.message}`)
        }
      } else {
        // Vérifier si une session existe déjà
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setReady(true)
      }
    }

    handlePasswordRecovery()
  }, [])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setMessage(`Erreur : ${error.message}`)
      setLoading(false)
    } else {
      setMessage('Mot de passe mis à jour ! Redirection...')
      setTimeout(() => {
        router.push('/')
      }, 1500)
    }
  }

  return (
    <div style={{ backgroundColor: '#0b1329', color: 'white', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: '1rem' }}>
      <div style={{ backgroundColor: '#131c35', padding: '2.5rem', borderRadius: '12px', width: '100%', maxWidth: '400px', border: '1px solid #1e2942', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Nouveau mot de passe</h1>
        
        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="password" 
            placeholder="Entre ton nouveau mot de passe" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #1e2942', backgroundColor: '#0b1329', color: 'white' }}
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{ padding: '0.8rem', backgroundColor: '#ffcc00', color: '#0b1329', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {loading ? 'Mise à jour...' : 'Valider'}
          </button>
        </form>

        {message && <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>{message}</p>}
      </div>
    </div>
  )
}