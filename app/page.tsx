'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

interface SquadData {
  name: string
  code: string
  isAdmin: boolean
}

interface Member {
  id: string
  name: string
  avatar?: string | null
}

interface Message {
  id: string
  senderId: string
  senderName: string
  senderAvatar: string | null
  text: string
  createdAt: string
  reactions?: Record<string, string[]>
}

export default function HomePage() {
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [joinPassword, setJoinPassword] = useState('')
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [squad, setSquad] = useState<SquadData | null>(null)
  
  const [showAddActivityModal, setShowAddActivityModal] = useState(false)
  const [selectedSport, setSelectedSport] = useState('Course à pied')
  const [activityDistance, setActivityDistance] = useState('')
  const [activityTime, setActivityTime] = useState('')

  const weeklyMissions = [
    { id: 1, sport: 'Course à pied', km: '5 km', time: '30 min', points: 300, week: 'Semaine 1' },
    { id: 2, sport: 'Vélo', km: '10 km', time: '1 h', points: 400, week: 'Semaine 1' },
    { id: 3, sport: 'Natation', km: '500 m', time: '30 min', points: 500, week: 'Semaine 1' },
    { id: 4, sport: 'Marche', km: '10 000 pas', time: '-', points: 1000, week: 'Semaine 1' },
  ];

  const [displayName, setDisplayName] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState<boolean>(false)
  const [tempName, setTempName] = useState<string>('')

  const [activeTab, setActiveTab] = useState<'podium' | 'missions' | 'chat' | 'profile'>('podium')

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [showGroupMembers, setShowGroupMembers] = useState(false)
  const [squadMembers, setSquadMembers] = useState<Member[]>([])
  
  const [activeMessageForEmoji, setActiveMessageForEmoji] = useState<string | null>(null)
  const [reactionDetailsModal, setReactionDetailsModal] = useState<{ messageId: string; emoji: string } | null>(null)

  const [squadNameInput, setSquadNameInput] = useState('')

  const [availableSquads, setAvailableSquads] = useState<{ name: string; code: string }[]>([])

  useEffect(() => {
    const fetchSquads = async () => {
      const { data } = await supabase.from('squads').select('*')
      if (data) setAvailableSquads(data)
    }
    fetchSquads()
  }, [])

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      
      setUser(session.user)
      
      let currentUserName = session.user.email?.split('@')[0] || 'Joueur'
      let currentAvatar: string | null = null

      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_name, avatar_url')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (profileData) {
        currentUserName = profileData.user_name || currentUserName
        currentAvatar = profileData.avatar_url || null
        setDisplayName(currentUserName)
        setAvatarUrl(currentAvatar)
      } else {
        await supabase.from('profiles').upsert([
          { user_id: session.user.id, user_name: currentUserName, avatar_url: null, user_email: session.user.email }
        ], { onConflict: 'user_id' })
        setDisplayName(currentUserName)
      }
      
      const { data: memberData } = await supabase
        .from('squad_members')
        .select('squad_code, squad_name, role')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (memberData && memberData.squad_code) {
        setSquad({ 
          name: memberData.squad_name || 'Mon équipe', 
          code: memberData.squad_code, 
          isAdmin: memberData.role === 'admin' 
        })
      }
      
      setLoading(false)
    }
    checkUser()
  }, [router])

  useEffect(() => {
    if (!squad) return

    const fetchSquadData = async () => {
      const { data: membersData } = await supabase
        .from('squad_members')
        .select('*')
        .eq('squad_code', squad.code)

      if (membersData && membersData.length > 0) {
        const userIds = membersData.map((m: any) => m.user_id)
        
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, user_name, avatar_url')
          .in('user_id', userIds)

        setSquadMembers(membersData.map((m: any) => {
          const profile = profilesData?.find((p: any) => p.user_id === m.user_id)
          return {
            id: m.user_id,
            name: profile?.user_name || m.user_email?.split('@')[0] || 'Membre',
            avatar: profile?.avatar_url || null
          }
        }))
      }

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('squad_code', squad.code)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setMessages(data.map((m: any) => ({
          id: m.id.toString(),
          senderId: m.sender_id,
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar,
          text: m.text,
          createdAt: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: m.reactions || {}
        })))
      }
    }

    fetchSquadData()

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'messages'
      }, (payload) => {
        const newItem = payload.new as any
        if (newItem && newItem.squad_code === squad.code) {
          const formattedMsg: Message = {
            id: newItem.id.toString(),
            senderId: newItem.sender_id,
            senderName: newItem.sender_name,
            senderAvatar: newItem.sender_avatar,
            text: newItem.text,
            createdAt: new Date(newItem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            reactions: newItem.reactions || {}
          }
          setMessages((prev) => {
            const index = prev.findIndex(m => m.id === formattedMsg.id)
            if (index !== -1) {
              const updated = [...prev]
              updated[index] = formattedMsg
              return updated
            }
            return [...prev, formattedMsg]
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [squad])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user || !squad) return

    const { error } = await supabase.from('messages').insert([
      {
        squad_code: squad.code,
        sender_id: user.id,
        sender_name: displayName,
        sender_avatar: avatarUrl,
        text: newMessage.trim(),
        reactions: {}
      }
    ])

    if (!error) setNewMessage('')
  }

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!user) return
    
    const targetMsg = messages.find(m => m.id === messageId)
    if (!targetMsg) return

    const updatedReactions: Record<string, string[]> = JSON.parse(JSON.stringify(targetMsg.reactions || {}))
    
    const userIds = updatedReactions[emoji] || []
    if (userIds.includes(user.id)) {
      updatedReactions[emoji] = userIds.filter((id) => id !== user.id)
      if (updatedReactions[emoji].length === 0) {
        delete updatedReactions[emoji]
      }
    } else {
      updatedReactions[emoji] = [...userIds, user.id]
    }

    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, reactions: updatedReactions } : msg))
    )
    setActiveMessageForEmoji(null)

    await supabase
      .from('messages')
      .update({ reactions: updatedReactions })
      .eq('id', messageId)
  }

  const handleCreateSquad = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!squadNameInput.trim() || !user) return

    const generatedCode = ('SQ-' + Math.random().toString(36).substring(2, 6)).toUpperCase()
    
    await supabase.from('squads').insert([{ name: squadNameInput.trim(), code: generatedCode }])

    await supabase.from('squad_members').delete().eq('user_id', user.id)

    const {error} = await supabase.from('squad_members').insert([{
      squad_code: generatedCode,
      user_id: user.id,
      user_email: user.email,
      role: 'admin',
      squad_name: squadNameInput.trim()
    }])

    if(error){
      console.error("Erreur insertion squad_members :", error)
      alert("Erreur lors de la création : " + error.message)
      return
    }

    setSquad({ name: squadNameInput.trim(), code: generatedCode, isAdmin: true })
  }

  const handleJoinSquad = async (squadToJoin: { name: string; code: string }) => {
    if (!user) return

    await supabase.from('squad_members').delete().eq('user_id', user.id)

    const {error}= await supabase.from('squad_members').insert([{
      squad_code: squadToJoin.code,
      user_id: user.id,
      user_email: user.email,
      role: 'membre',
      squad_name: squadToJoin.name
    }])

    if (error) {
      console.error("Erreur insertion squad_members :", error)
      alert("Erreur lors de la jonction : " + error.message)
      return
    }

    setSquad({ name: squadToJoin.name, code: squadToJoin.code, isAdmin: false })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tempName.trim() || !user) return
    
    const newName = tempName.trim()
    
    await supabase
      .from('profiles')
      .upsert([{ user_id: user.id, user_name: newName, avatar_url: avatarUrl, user_email: user.email }], { onConflict: 'user_id' })

    if (squad) {
      await supabase
        .from('squad_members')
        .update({ user_name: newName })
        .eq('user_id', user.id)
        .eq('squad_code', squad.code)
    }

    setDisplayName(newName)
    setIsEditingName(false)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && user) {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Image = reader.result as string
        setAvatarUrl(base64Image)

        await supabase
          .from('profiles')
          .upsert([{ user_id: user.id, user_name: displayName, avatar_url: base64Image, user_email: user.email }], { onConflict: 'user_id' })

        if (squad) {
          await supabase
            .from('squad_members')
            .update({ avatar_url: base64Image })
            .eq('user_id', user.id)
            .eq('squad_code', squad.code)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleLeaveSquad = async () => {
    if (!user || !squad) return
    await supabase
      .from('squad_members')
      .delete()
      .eq('user_id', user.id)
      .eq('squad_code', squad.code)

    setSquad(null)
  }

  if (loading) return <div style={containerStyle}><p style={{ color: '#8b9bb4', textAlign: 'center', marginTop: '2rem' }}>Chargement...</p></div>

  if (!squad) {
    return (
      <div style={containerStyle}>
        <header style={headerStyle}>
          <h1 style={{ fontSize: '1.2rem', letterSpacing: '2px', color: 'white', margin: 0 }}>SQUAD RIVALS</h1>
          <button onClick={handleLogout} style={logoutButtonStyle}>Déconnexion</button>
        </header>

        <main style={{ maxWidth: '450px', margin: '2rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center' }}>
            <div style={{ ...cardStyle, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <h2 style={{ color: '#ffcc00', marginTop: 0 }}>Créer une équipe</h2>
              <form onSubmit={handleCreateSquad} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem', width: '100%' }}>
                <input 
                  type="text" 
                  placeholder="Ex: Les Warriors" 
                  value={squadNameInput} 
                  onChange={(e) => setSquadNameInput(e.target.value)} 
                  required 
                  style={inputStyle} 
                />
                <button type="submit" style={primaryBtnStyle}>Créer & Entrer</button>
              </form>
            </div>

            <div style={{ ...cardStyle, width: '100%' }}>
              <h2 style={{ color: '#ffcc00', marginTop: 0, textAlign: 'center' }}>Rejoindre une équipe</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#8b9bb4' }}>Équipes existantes :</span>
                <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {availableSquads.map((s) => {
                    const isSelected = selectedCode === s.code

                    return (
                      <div key={s.code} style={{ backgroundColor: '#0b1329', padding: '0.8rem', borderRadius: '6px', border: '1px solid #1e2942', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'white', fontWeight: 'bold' }}>{s.name}</span>
                          <button 
                            type="button"
                            onClick={() => {
                              setSelectedCode(isSelected ? null : s.code)
                              setJoinPassword('')
                            }} 
                            style={{ ...secondaryBtnStyle, padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            {isSelected ? 'Annuler' : 'Rejoindre'}
                          </button>
                        </div>

                        {isSelected && (
                          <form onSubmit={(e) => {
                            e.preventDefault()
                            if (joinPassword.trim().toUpperCase() === s.code.toUpperCase()) {
                              handleJoinSquad(s)
                            } else {
                              alert("Code incorrect !")
                            }
                          }} style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem' }}>
                            <input 
                              type="text"
                              inputMode="text"
                              placeholder="Code secret" 
                              value={joinPassword}
                              onChange={(e) => setJoinPassword(e.target.value)}
                              style={{ ...inputStyle, padding: '0.4rem', flex: 1 }}
                            />
                            <button type="submit" style={primaryBtnStyle}>OK</button>
                          </form>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={{ fontSize: '1.2rem', letterSpacing: '2px', color: 'white', margin: 0 }}>SQUAD RIVALS</h1>
        <span style={{ color: '#ffcc00', fontSize: '0.85rem', fontWeight: 'bold' }}>{squad.name}</span>
      </header>

      <main style={{ maxWidth: '700px', margin: '1rem auto 5rem auto', padding: '0 1rem' }}>
        
        {activeTab === 'podium' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', paddingTop: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: '#ffcc00', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '2px' }}>CLASSEMENT GÉNÉRAL</span>
              <h2 style={{ color: 'white', margin: '0.2rem 0 0 0', fontSize: '1.5rem' }}>PODIUM DES ÉQUIPES</h2>
            </div>

            {/* SUPER PODIUM INTER-ÉQUIPES */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '12px', width: '100%', maxWidth: '420px', marginTop: '2rem', paddingBottom: '1rem' }}>
              
              {/* 2ème PLACE (Argent) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px', textAlign: 'center' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#2a3b5c', border: '2px solid #c0c0c0', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                    <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                  </div>
                  <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 'bold', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Équipe Adverse 2</span>
                  <span style={{ color: '#8b9bb4', fontSize: '0.7rem' }}>0 pts</span>
                </div>
                <div style={{ width: '100%', height: '110px', background: 'linear-gradient(180deg, #2a3b5c 0%, #16223f 100%)', borderRadius: '12px 12px 0 0', borderTop: '3px solid #c0c0c0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', paddingTop: '12px', boxShadow: 'inset 0 4px 6px rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '1.5rem' }}>🥈</span>
                  <span style={{ color: '#c0c0c0', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '4px' }}>2</span>
                </div>
              </div>

              {/* 1ère PLACE (Or + Ton Équipe) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1.1, zIndex: 2 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px', textAlign: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', fontSize: '1.2rem' }}>👑</span>
                    <div style={{ width: '54px', height: '54px', borderRadius: '50%', backgroundColor: '#2a3b5c', border: '3px solid #ffcc00', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '4px', boxShadow: '0 6px 15px rgba(255,204,0,0.4)' }}>
                      <span style={{ fontSize: '1.5rem' }}>🛡️</span>
                    </div>
                  </div>
                  <span style={{ color: '#ffcc00', fontSize: '0.85rem', fontWeight: 'bold', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{squad.name}</span>
                  <span style={{ color: '#8b9bb4', fontSize: '0.7rem' }}>0 pts</span>
                </div>
                <div style={{ width: '100%', height: '150px', background: 'linear-gradient(180deg, #ffcc00 0%, #cc9900 100%)', borderRadius: '16px 16px 0 0', borderTop: '4px solid #fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', boxShadow: '0 10px 25px rgba(255,204,0,0.3), inset 0 4px 8px rgba(255,255,255,0.3)' }}>
                  <span style={{ fontSize: '1.8rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>🏆</span>
                  
                  <div style={{ backgroundColor: 'rgba(11, 19, 41, 0.85)', padding: '4px 8px', borderRadius: '6px', width: '90%', textAlign: 'center', border: '1px solid rgba(255,204,0,0.5)' }}>
                    <span style={{ color: '#ffcc00', fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '0.5px', display: 'block', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {squad.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3ème PLACE (Bronze) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px', textAlign: 'center' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#2a3b5c', border: '2px solid #cd7f32', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                    <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                  </div>
                  <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 'bold', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Équipe Adverse 3</span>
                  <span style={{ color: '#8b9bb4', fontSize: '0.7rem' }}>0 pts</span>
                </div>
                <div style={{ width: '100%', height: '80px', background: 'linear-gradient(180deg, #2a3b5c 0%, #16223f 100%)', borderRadius: '12px 12px 0 0', borderTop: '3px solid #cd7f32', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', paddingTop: '10px', boxShadow: 'inset 0 4px 6px rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '1.3rem' }}>🥉</span>
                  <span style={{ color: '#cd7f32', fontWeight: 'bold', fontSize: '1rem', marginTop: '2px' }}>3</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'missions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div 
              onClick={() => setShowAddActivityModal(true)}
              style={{
                background: 'linear-gradient(135deg, #ffcc00 0%, #ff9900 100%)',
                color: '#0b1329',
                padding: '1.2rem 1.5rem',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(255, 204, 0, 0.3)',
                transition: 'transform 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '2rem' }}>⚡</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Ajoute ton activité</h3>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', opacity: 0.9 }}>Enregistre tes efforts pour marquer des points</p>
                </div>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', backgroundColor: 'rgba(11, 19, 41, 0.1)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</span>
            </div>

            <div style={{ ...cardStyle, padding: '1.5rem', backgroundColor: '#0b1329', color: 'white' }}>
              <h3 style={{ color: '#ffcc00', marginBottom: '1rem', fontSize: '1.1rem' }}>🏆 Missions de la semaine</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {weeklyMissions.map((mission) => (
                  <div 
                    key={mission.id} 
                    style={{ 
                      backgroundColor: '#131c35', 
                      border: '1px solid #1e2942', 
                      borderRadius: '8px', 
                      padding: '0.8rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <h4 style={{ margin: '0 0 0.3rem 0', color: '#ffcc00', fontSize: '0.95rem' }}>{mission.sport}</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#8b9bb4' }}>
                        {mission.km} {mission.time !== '-' ? `• ${mission.time}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 'bold', color: '#ffcc00', fontSize: '0.95rem' }}>
                        +{mission.points} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showAddActivityModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: '1rem' }}>
            <div style={{ backgroundColor: '#131c35', border: '1px solid #1e2942', borderRadius: '12px', width: '100%', maxWidth: '380px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#ffcc00', margin: 0, fontSize: '1.1rem' }}>Ajouter une activité</h3>
                <button onClick={() => setShowAddActivityModal(false)} style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={statTitleStyle}>CHOISISSEZ LE SPORT</span>
                <select 
                  value={selectedSport} 
                  onChange={(e) => setSelectedSport(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                >
                  <option value="Course à pied">Course à pied</option>
                  <option value="Vélo">Vélo</option>
                  <option value="Natation">Natation</option>
                  <option value="Marche">Marche</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={statTitleStyle}>DISTANCE (KM)</span>
                <input 
                  type="number" 
                  placeholder="Ex: 5.5"
                  value={activityDistance}
                  onChange={(e) => setActivityDistance(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={statTitleStyle}>TEMPS (MINUTES)</span>
                <input 
                  type="number" 
                  placeholder="Ex: 30"
                  value={activityTime}
                  onChange={(e) => setActivityTime(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              <button 
                onClick={() => {
                  if (!activityDistance && !activityTime) {
                    alert("Veuillez renseigner au moins la distance ou le temps !")
                    return
                  }
                  alert(`Activité enregistrée : ${selectedSport} - ${activityDistance || 0} km, ${activityTime || 0} min`)
                  setShowAddActivityModal(false)
                  setActivityDistance('')
                  setActivityTime('')
                }}
                style={{ ...primaryBtnStyle, marginTop: '0.5rem' }}
              >
                Valider l'activité
              </button>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div style={{ 
            ...cardStyle, 
            padding: 0, 
            overflow: 'hidden', 
            height: '500px',
            display: 'flex', 
            flexDirection: 'column',
            position: 'relative' 
          }}>
            <header style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #1e2942', backgroundColor: '#131c35', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#ffcc00', fontSize: '1rem' }}>
                💬 Chat de l'équipe : {squad.name}
              </h3>
              <button
                onClick={() => setShowGroupMembers(!showGroupMembers)}
                style={{ background: 'none', border: 'none', color: '#ffcc00', fontSize: '1.2rem', cursor: 'pointer', padding: '0 4px', letterSpacing: '2px' }}
                title="Voir les membres de l'équipe"
              >
                •••
              </button>
            </header>

            {showGroupMembers && (
              <div style={{ position: 'absolute', top: '45px', right: '10px', width: '220px', backgroundColor: '#0b1329', border: '1px solid #ffcc00', borderRadius: '8px', padding: '0.8rem', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', borderBottom: '1px solid #1e2942', paddingBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>MEMBRES DE L'ÉQUIPE</span>
                  <button onClick={() => setShowGroupMembers(false)} style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                  {squadMembers.map((member) => (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#1e2942', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                        {member.avatar ? (
                          <img src={member.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '0.8rem' }}>👤</span>
                        )}
                      </div>
                      <span style={{ color: 'white', fontSize: '0.8rem' }}>{member.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.2rem', backgroundColor: '#ffffff' }}>
              {messages.length === 0 ? (
                <p style={{ color: '#8b9bb4', fontSize: '0.85rem', textAlign: 'center', margin: 'auto' }}>Aucun message pour l'instant. Écris le premier !</p>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === user?.id
                  const isEmojiPickerOpen = activeMessageForEmoji === msg.id

                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      
                      <div
                        onClick={() => setActiveMessageForEmoji(isEmojiPickerOpen ? null : msg.id)}
                        style={{
                          maxWidth: '80%',
                          backgroundColor: isMe ? '#ffcc00' : '#1e2942',
                          color: isMe ? '#0b1329' : 'white',
                          padding: '0.6rem 0.8rem',
                          borderRadius: '10px',
                          wordBreak: 'break-word',
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                        title="Clique pour réagir"
                      >
                        {msg.text}
                      </div>

                      {isEmojiPickerOpen && (
                        <div style={{
                          display: 'flex',
                          gap: '6px',
                          backgroundColor: '#0b1329',
                          border: '1px solid #ffcc00',
                          padding: '6px 10px',
                          borderRadius: '20px',
                          marginTop: '4px',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                          zIndex: 30
                        }}>
                          {['👍', '❤️', '🔥', '😂'].map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => handleAddReaction(msg.id, emoji)}
                              style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                padding: '2px'
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                          {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                            const hasReacted = user && userIds.includes(user.id)
                            return (
                              <button
                                key={emoji}
                                onClick={() => setReactionDetailsModal({ messageId: msg.id, emoji })}
                                style={{
                                  fontSize: '0.7rem',
                                  backgroundColor: hasReacted ? '#1e2942' : '#0b1329',
                                  border: hasReacted ? '1px solid #ffcc00' : '1px solid #2a3b5c',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  color: 'white',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <span>{emoji}</span>
                                <span>{userIds.length}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      <span style={{ fontSize: '0.7rem', color: '#8b9bb4', marginTop: '3px', padding: '0 2px' }}>
                        {msg.senderName} • {msg.createdAt}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            {reactionDetailsModal && (() => {
              const currentMsg = messages.find(m => m.id === reactionDetailsModal.messageId)
              const userIds = currentMsg?.reactions?.[reactionDetailsModal.emoji] || []
              
              return (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  zIndex: 50,
                  padding: '1rem'
                }}>
                  <div style={{
                    backgroundColor: '#131c35',
                    border: '1px solid #1e2942',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '320px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}>
                    <div style={{
                      padding: '0.8rem 1rem',
                      borderBottom: '1px solid #1e2942',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#0b1329'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{reactionDetailsModal.emoji}</span>
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{userIds.length}</span>
                      </div>
                      <button
                        onClick={() => setReactionDetailsModal(null)}
                        style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer', fontSize: '1rem' }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {userIds.map((uid) => {
                        const member = squadMembers.find(m => m.id === uid)
                        const name = uid === user?.id ? displayName : (member?.name || 'Membre')
                        const avatar = uid === user?.id ? avatarUrl : (member?.avatar || null)
                        const isMe = uid === user?.id

                        return (
                          <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1329', padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1px solid #1e2942' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#1e2942', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                                {avatar ? (
                                  <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ fontSize: '0.8rem' }}>👤</span>
                                )}
                              </div>
                              <span style={{ color: 'white', fontSize: '0.85rem' }}>{name} {isMe ? '(moi)' : ''}</span>
                            </div>

                            {isMe && (
                              <button
                                onClick={() => {
                                  handleAddReaction(reactionDetailsModal.messageId, reactionDetailsModal.emoji)
                                  setReactionDetailsModal(null)
                                }}
                                style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '2px' }}
                                title="Retirer ma réaction"
                              >
                                {reactionDetailsModal.emoji}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}

            <form onSubmit={handleSendMessage} style={{ padding: '0.8rem', borderTop: '1px solid #1e2942', display: 'flex', gap: '0.5rem', backgroundColor: '#131c35' }}>
              <input
                type="text"
                placeholder="Écris ton message à l'équipe..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                style={{ ...inputStyle, flex: 1, padding: '0.6rem 0.8rem' }}
              />
              <button type="submit" style={{ ...primaryBtnStyle, padding: '0.6rem 1rem' }}>Envoyer</button>
            </form>
          </div>
        )}

        {activeTab === 'profile' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#ffcc00', marginTop: 0 }}>Profil & Équipe</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <div style={avatarLargeStyle}>
                {avatarUrl ? <img src={avatarUrl} alt="Avatar" style={avatarImgStyle} /> : <span style={{ fontSize: '2.5rem' }}>👤</span>}
              </div>
              <label style={uploadBtnStyle}>
                Changer la photo
                <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={statTitleStyle}>SURNOM / PSEUDO</span>
                {isEditingName ? (
                  <form onSubmit={handleSaveName} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                    <input 
                      type="text" 
                      value={tempName} 
                      onChange={(e) => setTempName(e.target.value)} 
                      placeholder="Nouveau pseudo"
                      required
                      style={{ ...inputStyle, padding: '0.5rem 0.8rem', flex: 1 }}
                    />
                    <button type="submit" style={{ ...primaryBtnStyle, padding: '0.5rem 1rem' }}>OK</button>
                    <button type="button" onClick={() => setIsEditingName(false)} style={{ ...secondaryBtnStyle, padding: '0.5rem 1rem' }}>✕</button>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>{displayName}</div>
                    <button onClick={() => { setTempName(displayName); setIsEditingName(true); }} style={{ ...linkBtnStyle, color: '#ffcc00' }}>
                      Modifier
                    </button>
                  </div>
                )}
              </div>

              <hr style={{ borderColor: '#1e2942', margin: '0.2rem 0' }} />

              <div>
                <span style={statTitleStyle}>E-MAIL</span>
                <div style={{ color: '#8b9bb4', fontSize: '0.9rem' }}>{user?.email}</div>
              </div>

              <hr style={{ borderColor: '#1e2942', margin: '0.2rem 0' }} />

              <div>
                <span style={statTitleStyle}>ÉQUIPE ACTUELLE</span>
                <div style={{ color: '#ffcc00', fontWeight: 'bold', fontSize: '1.2rem' }}>{squad.name}</div>
              </div>

              <div>
                <span style={statTitleStyle}>MEMBRES DE L'ÉQUIPE</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                  {squadMembers.map((member) => (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', color: 'white', fontSize: '0.9rem', backgroundColor: '#0b1329', padding: '0.5rem 0.8rem', borderRadius: '6px', border: '1px solid #1e2942' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#1e2942', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                        {member.avatar ? (
                          <img src={member.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '0.9rem' }}>👤</span>
                        )}
                      </div>
                      <span>{member.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {squad.isAdmin ? (
                <div style={{ backgroundColor: '#0b1329', padding: '1rem', borderRadius: '8px', border: '1px solid #4caf50' }}>
                  <span style={{ color: '#4caf50', fontSize: '0.75rem', fontWeight: 'bold' }}>RÔLE : ADMIN DE L'ÉQUIPE</span>
                  <div style={{ color: 'white', fontSize: '0.9rem', marginTop: '0.4rem' }}>
                    Code d'accès équipe : <strong style={{ color: '#ffcc00', fontSize: '1.1rem' }}>{squad.code}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#0b1329', padding: '1rem', borderRadius: '8px', border: '1px solid #ffcc00' }}>
                  <span style={{ color: '#ffcc00', fontSize: '0.75rem', fontWeight: 'bold' }}>RÔLE : MEMBRE</span>
                </div>
              )}

              <hr style={{ borderColor: '#1e2942', margin: '0.2rem 0' }} />
              <button onClick={handleLeaveSquad} style={linkBtnStyle}>Quitter l'équipe</button>
              <button onClick={handleLogout} style={logoutButtonStyle}>Se déconnecter</button>
            </div>
          </div>
        )}
      </main>

      <nav style={bottomNavStyle}>
        <button onClick={() => setActiveTab('podium')} style={{ ...navBtnStyle, color: activeTab === 'podium' ? '#ffcc00' : '#8b9bb4' }}>
          <span style={{ fontSize: '1.2rem' }}>🏆</span>
          <span style={{ fontSize: '0.7rem' }}>Podium</span>
        </button>

        <button onClick={() => setActiveTab('missions')} style={{ ...navBtnStyle, color: activeTab === 'missions' ? '#ffcc00' : '#8b9bb4' }}>
          <span style={{ fontSize: '1.2rem' }}>🎯</span>
          <span style={{ fontSize: '0.7rem' }}>Missions</span>
        </button>

        <button onClick={() => setActiveTab('chat')} style={{ ...navBtnStyle, color: activeTab === 'chat' ? '#ffcc00' : '#8b9bb4' }}>
          <span style={{ fontSize: '1.2rem' }}>💬</span>
          <span style={{ fontSize: '0.7rem' }}>Chat</span>
        </button>

        <button onClick={() => setActiveTab('profile')} style={{ ...navBtnStyle, color: activeTab === 'profile' ? '#ffcc00' : '#8b9bb4' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e2942' }}>
            {avatarUrl ? <img src={avatarUrl} alt="Avatar Nav" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.8rem' }}>👤</span>}
          </div>
          <span style={{ fontSize: '0.7rem' }}>Profil</span>
        </button>
      </nav>
    </div>
  )
}

const containerStyle: React.CSSProperties = { backgroundColor: '#0b1329', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', backgroundColor: '#131c35', borderBottom: '1px solid #1e2942' }
const cardStyle: React.CSSProperties = { backgroundColor: '#131c35', padding: '1.5rem', borderRadius: '12px', border: '1px solid #1e2942' }
const logoutButtonStyle: React.CSSProperties = { padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#ff4d4f', border: '1px solid #ff4d4f', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }
const statTitleStyle: React.CSSProperties = { color: '#8b9bb4', fontSize: '0.7rem', letterSpacing: '1px' }
const primaryBtnStyle: React.CSSProperties = { padding: '0.8rem', backgroundColor: '#ffcc00', color: '#0b1329', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }
const secondaryBtnStyle: React.CSSProperties = { padding: '0.8rem', backgroundColor: 'transparent', color: '#ffcc00', border: '1px solid #ffcc00', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }
const linkBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left', padding: 0, fontSize: '0.85rem' }
const inputStyle: React.CSSProperties = { backgroundColor: '#0b1329', border: '1px solid #1e2942', borderRadius: '6px', color: 'white', padding: '0.8rem' }
const avatarLargeStyle: React.CSSProperties = { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#1e2942', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }
const avatarImgStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' }
const uploadBtnStyle: React.CSSProperties = { fontSize: '0.8rem', color: '#ffcc00', cursor: 'pointer', textDecoration: 'underline' }
const bottomNavStyle: React.CSSProperties = { position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#131c35', borderTop: '1px solid #1e2942', display: 'flex', justifyContent: 'space-around', padding: '0.5rem 0', zIndex: 100 }
const navBtnStyle: React.CSSProperties = { flex: 1, background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '2px' }