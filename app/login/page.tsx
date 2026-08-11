'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'verify' | 'reset'>('login')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { emailRedirectTo: window.location.origin }
        })
        if (error) {
          setMessage(`Erreur : ${error.message}`)
        } else {
          setMode('verify')
          setMessage('Un code de validation a été envoyé par e-mail.')
        }
      } else if (mode === 'verify') {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'signup'
        })
        if (error) {
          setMessage(`Erreur : ${error.message}`)
        } else {
          setMessage('Compte vérifié avec succès ! Connexion en cours...')
          router.push('/')
          router.refresh()
        }
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          setMessage(`Erreur : ${error.message}`)
        } else {
          router.push('/')
          router.refresh()
        }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        })
        if (error) setMessage(`Erreur : ${error.message}`)
        else setMessage('E-mail de réinitialisation envoyé ! Vérifie ta boîte mail.')
      }
    } catch (err: any) {
      setMessage(`Erreur : ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      backgroundColor: '#0b1329',
      color: 'white',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#131c35',
        padding: '2.5rem',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid #1e2942',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '1.8rem', letterSpacing: '2px', marginBottom: '0.5rem' }}>
          SQUAD RIVALS
        </h1>
        <p style={{ color: '#8b9bb4', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {mode === 'signup' && "Créer un nouveau compte"}
          {mode === 'verify' && "Entre le code reçu par e-mail"}
          {mode === 'login' && "Connecte-toi pour jouer"}
          {mode === 'reset' && "Réinitialiser ton mot de passe"}
        </p>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {mode !== 'verify' && (
            <input 
              type="email" 
              placeholder="Adresse e-mail" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '6px',
                border: '1px solid #1e2942',
                backgroundColor: '#0b1329',
                color: 'white',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
          )}

          {mode === 'verify' && (
            <input 
              type="text" 
              placeholder="Code à 6 chiffres" 
              value={token} 
              onChange={(e) => setToken(e.target.value)} 
              required 
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '6px',
                border: '1px solid #1e2942',
                backgroundColor: '#0b1329',
                color: 'white',
                fontSize: '1.2rem',
                textAlign: 'center',
                letterSpacing: '4px',
                outline: 'none'
              }}
            />
          )}

          {mode !== 'reset' && mode !== 'verify' && (
            <input 
              type="password" 
              placeholder="Mot de passe" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '6px',
                border: '1px solid #1e2942',
                backgroundColor: '#0b1329',
                color: 'white',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{
              padding: '0.8rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              backgroundColor: '#ffcc00',
              color: '#0b1329',
              border: 'none',
              borderRadius: '6px',
              marginTop: '0.5rem'
            }}
          >
            {loading ? 'Chargement...' : (
              mode === 'signup' ? "S'inscrire" : 
              mode === 'verify' ? "Valider le code" :
              mode === 'login' ? "Se connecter" : 
              "Envoyer le lien"
            )}
          </button>
        </form>

        {message && (
          <p style={{ 
            marginTop: '1.5rem', 
            padding: '0.75rem', 
            backgroundColor: message.startsWith('Erreur') ? 'rgba(255, 77, 79, 0.2)' : 'rgba(82, 196, 26, 0.2)',
            color: message.startsWith('Erreur') ? '#ff4d4f' : '#52c41a',
            border: `1px solid ${message.startsWith('Erreur') ? '#ff4d4f' : '#52c41a'}`,
            borderRadius: '6px',
            fontSize: '0.85rem'
          }}>
            {message}
          </p>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {mode === 'login' && (
            <>
              <button 
                type="button"
                onClick={() => { setMode('reset'); setMessage(''); }} 
                style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
              >
                Mot de passe oublié ?
              </button>
              <button 
                type="button"
                onClick={() => { setMode('signup'); setMessage(''); }} 
                style={{ background: 'none', border: 'none', color: '#ffcc00', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Pas de compte ? S'inscrire
              </button>
            </>
          )}

          {(mode === 'signup' || mode === 'reset' || mode === 'verify') && (
            <button 
              type="button"
              onClick={() => { setMode('login'); setMessage(''); }} 
              style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
            >
              Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  )
}