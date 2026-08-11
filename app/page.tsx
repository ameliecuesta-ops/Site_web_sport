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
}

interface Group {
  id: string
  name: string
  members?: Member[]
}

interface Message {
  id: string
  groupId: string
  senderId: string
  senderName: string
  senderAvatar: string | null
  text: string
  createdAt: string
}

export default function HomePage() {
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [joinPassword, setJoinPassword] = useState('')
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [squad, setSquad] = useState<SquadData | null>(null)
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

  const [groups, setGroups] = useState<Group[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [showNewGroupInput, setShowNewGroupInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showGroupMembers, setShowGroupMembers] = useState(false)

  const [action, setAction] = useState<'choice' | 'create' | 'join'>('choice')
  const [squadNameInput, setSquadNameInput] = useState('')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      
      setUser(session.user)
      
      const savedSquad = localStorage.getItem(`squad_${session.user.id}`)
      if (savedSquad) {
        const parsedSquad = JSON.parse(savedSquad)
        setSquad(parsedSquad)

        const savedGroups = localStorage.getItem(`chat_groups_${parsedSquad.code}`)
        if (savedGroups) {
          const parsedGroups = JSON.parse(savedGroups)
          setGroups(parsedGroups)
          setActiveGroupId(parsedGroups[0]?.id || 'general')
        } else {
          const initialGroups: Group[] = [{ id: 'general', name: parsedSquad.name }]
          setGroups(initialGroups)
          setActiveGroupId('general')
          localStorage.setItem(`chat_groups_${parsedSquad.code}`, JSON.stringify(initialGroups))
        }
      }

      const savedName = localStorage.getItem(`displayName_${session.user.id}`)
      setDisplayName(savedName || session.user.email?.split('@')[0] || 'Joueur')
      
      const savedAvatar = localStorage.getItem(`avatar_${session.user.id}`)
      if (savedAvatar) setAvatarUrl(savedAvatar)
      
      setLoading(false)
    }
    checkUser()
  }, [router])

  useEffect(() => {
    if (!squad) return

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('squad_code', squad.code)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setMessages(data.map((m: any) => ({
          id: m.id.toString(),
          groupId: m.group_id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar,
          text: m.text,
          createdAt: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })))
      }
    }

    fetchMessages()

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages'
      }, (payload) => {
        const newItem = payload.new as any
        if (newItem.squad_code === squad.code) {
          const formattedMsg: Message = {
            id: newItem.id.toString(),
            groupId: newItem.group_id,
            senderId: newItem.sender_id,
            senderName: newItem.sender_name,
            senderAvatar: newItem.sender_avatar,
            text: newItem.text,
            createdAt: new Date(newItem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
          setMessages((prev) => [...prev, formattedMsg])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [squad])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user || !squad || !activeGroupId) return

    const { error } = await supabase.from('messages').insert([
      {
        group_id: activeGroupId,
        squad_code: squad.code,
        sender_id: user.id,
        sender_name: displayName,
        sender_avatar: avatarUrl,
        text: newMessage.trim()
      }
    ])

    if (!error) setNewMessage('')
  }

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim() || !squad) return

    const newGrp: Group = {
      id: Date.now().toString(),
      name: newGroupName.trim(),
    }
    const updatedGroups = [...groups, newGrp]
    setGroups(updatedGroups)
    setActiveGroupId(newGrp.id)
    localStorage.setItem(`chat_groups_${squad.code}`, JSON.stringify(updatedGroups))
    setNewGroupName('')
    setShowNewGroupInput(false)
  }

  const handleCreateSquad = (e: React.FormEvent) => {
    e.preventDefault()
    if (!squadNameInput.trim() || !user) return

    const generatedCode = ('SQ-' + Math.random().toString(36).substring(2, 6)).toUpperCase()
    const squadData: SquadData = { name: squadNameInput.trim(), code: generatedCode, isAdmin: true }

    localStorage.setItem(`squad_${user.id}`, JSON.stringify(squadData))
    setSquad(squadData)

    const initialGroups: Group[] = [{ id: 'general', name: squadData.name }]
    setGroups(initialGroups)
    setActiveGroupId('general')
    localStorage.setItem(`chat_groups_${squadData.code}`, JSON.stringify(initialGroups))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tempName.trim() || !user) return
    localStorage.setItem(`displayName_${user.id}`, tempName.trim())
    setDisplayName(tempName.trim())
    setIsEditingName(false)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && user) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64Image = reader.result as string
        setAvatarUrl(base64Image)
        localStorage.setItem(`avatar_${user.id}`, base64Image)
      }
      reader.readAsDataURL(file)
    }
  }

  const currentGroupMessages = messages.filter((m) => m.groupId === activeGroupId)

  if (loading) return <div style={containerStyle}><p style={{ color: '#8b9bb4', textAlign: 'center', marginTop: '2rem' }}>Chargement...</p></div>

  if (!squad) {
    return (
      <div style={containerStyle}>
        <header style={headerStyle}>
          <h1 style={{ fontSize: '1.2rem', letterSpacing: '2px', color: 'white', margin: 0 }}>SQUAD RIVALS</h1>
          <button onClick={handleLogout} style={logoutButtonStyle}>Déconnexion</button>
        </header>

        <main style={{ maxWidth: '850px', margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
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

            <div style={cardStyle}>
              <h2 style={{ color: '#ffcc00', marginTop: 0, textAlign: 'center' }}>Rejoindre une équipe</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#8b9bb4' }}>Équipes existantes :</span>
                <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {Object.keys(localStorage)
                    .filter((key) => key.startsWith('squad_'))
                    .map((key) => {
                      const data = JSON.parse(localStorage.getItem(key) || '{}')
                      const isSelected = selectedCode === key

                      return (
                        <div key={key} style={{ backgroundColor: '#0b1329', padding: '0.8rem', borderRadius: '6px', border: '1px solid #1e2942', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'white', fontWeight: 'bold' }}>{data.name}</span>
                            <button 
                              type="button"
                              onClick={() => {
                                setSelectedCode(isSelected ? null : key)
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
                              if (joinPassword.trim().toUpperCase() === data.code.toUpperCase()) {
                                const squadData = { ...data, isAdmin: false }
                                localStorage.setItem(`squad_${user?.id}`, JSON.stringify(squadData))
                                setSquad(squadData)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'white', textAlign: 'center', margin: '0.5rem 0' }}>PODIUM DE L'ÉQUIPE</h2>
            <div style={podiumContainerStyle}>
              <div style={{ ...podiumStepStyle, height: '100px', backgroundColor: '#1e2942' }}>
                <span style={{ fontSize: '1.2rem' }}>🥈</span>
                <span style={{ fontSize: '0.8rem', color: '#8b9bb4' }}>2ème</span>
              </div>
              <div style={{ ...podiumStepStyle, height: '140px', backgroundColor: '#ffcc00', color: '#0b1329' }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar 1er" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '1.5rem' }}>👑</span>
                )}
                <strong style={{ fontSize: '0.85rem', marginTop: '4px' }}>{displayName}</strong>
              </div>
              <div style={{ ...podiumStepStyle, height: '80px', backgroundColor: '#1e2942' }}>
                <span style={{ fontSize: '1.2rem' }}>🥉</span>
                <span style={{ fontSize: '0.8rem', color: '#8b9bb4' }}>3ème</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'missions' && (
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
        )}

        {activeTab === 'chat' && (
          <div style={{ 
            ...cardStyle, 
            padding: 0, 
            overflow: 'hidden', 
            height: 'auto', 
            minHeight: '450px',
            display: 'flex', 
            flexDirection: 'row',
            position: 'relative' 
          }}>
            <aside style={{ width: '160px', backgroundColor: '#0b1329', borderRight: '1px solid #1e2942', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '0.8rem', borderBottom: '1px solid #1e2942', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white' }}>GROUPES</span>
                <button
                  onClick={() => setShowNewGroupInput(!showNewGroupInput)}
                  style={{ backgroundColor: '#ffcc00', color: '#0b1329', border: 'none', borderRadius: '4px', width: '22px', height: '22px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  +
                </button>
              </div>

              {showNewGroupInput && (
                <form onSubmit={handleCreateGroup} style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', borderBottom: '1px solid #1e2942' }}>
                  <input
                    type="text"
                    placeholder="Nom groupe"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    required
                    style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.75rem' }}
                  />
                  <button type="submit" style={{ ...primaryBtnStyle, padding: '0.3rem', fontSize: '0.75rem' }}>Créer</button>
                </form>
              )}

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {groups.map((grp) => (
                  <button
                    key={grp.id}
                    onClick={() => {
                      setActiveGroupId(grp.id)
                      setShowGroupMembers(false)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.7rem 0.8rem',
                      background: activeGroupId === grp.id ? '#1e2942' : 'transparent',
                      color: activeGroupId === grp.id ? '#ffcc00' : '#8b9bb4',
                      border: 'none',
                      borderBottom: '1px solid #131c35',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: activeGroupId === grp.id ? 'bold' : 'normal',
                    }}
                  >
                    # {grp.name}
                  </button>
                ))}
              </div>
            </aside>

            <section style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
              <header style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #1e2942', backgroundColor: '#131c35', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#ffcc00', fontSize: '1rem' }}>
                  # {groups.find((g) => g.id === activeGroupId)?.name || squad.name}
                </h3>
                <button
                  onClick={() => setShowGroupMembers(!showGroupMembers)}
                  style={{ background: 'none', border: 'none', color: '#ffcc00', fontSize: '1.2rem', cursor: 'pointer', padding: '0 4px', letterSpacing: '2px' }}
                  title="Voir les membres du groupe"
                >
                  •••
                </button>
              </header>

              {showGroupMembers && (
                <div style={{ position: 'absolute', top: '45px', right: '10px', width: '200px', backgroundColor: '#0b1329', border: '1px solid #ffcc00', borderRadius: '8px', padding: '0.8rem', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', borderBottom: '1px solid #1e2942', paddingBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>MEMBRES DU GROUPE</span>
                    <button onClick={() => setShowGroupMembers(false)} style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {groups.find(g => g.id === activeGroupId)?.members?.map((member) => (
                      <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#1e2942', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          👤
                        </div>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>{member.name}</span>
                      </div>
                    )) || <span style={{ color: '#8b9bb4', fontSize: '0.8rem' }}>Aucun membre listé</span>}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#ffffff' }}>
                {currentGroupMessages.length === 0 ? (
                  <p style={{ color: '#8b9bb4', fontSize: '0.85rem', textAlign: 'center', margin: 'auto' }}>Aucun message dans ce groupe. Écris le premier !</p>
                ) : (
                  currentGroupMessages.map((msg) => {
                    const isMe = msg.senderId === user?.id
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div
                          style={{
                            maxWidth: '80%',
                            backgroundColor: isMe ? '#ffcc00' : '#1e2942',
                            color: isMe ? '#0b1329' : 'white',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '10px',
                            wordBreak: 'break-word',
                            fontSize: '0.9rem',
                          }}
                        >
                          {msg.text}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#8b9bb4', marginTop: '3px', padding: '0 2px' }}>
                          {msg.senderName} • {msg.createdAt}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              <form onSubmit={handleSendMessage} style={{ padding: '0.8rem', borderTop: '1px solid #1e2942', display: 'flex', gap: '0.5rem', backgroundColor: '#131c35' }}>
                <input
                  type="text"
                  placeholder="Écris ton message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ ...inputStyle, flex: 1, padding: '0.6rem 0.8rem' }}
                />
                <button type="submit" style={{ ...primaryBtnStyle, padding: '0.6rem 1rem' }}>Envoyer</button>
              </form>
            </section>
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

              {squad.isAdmin ? (
                <div style={{ backgroundColor: '#0b1329', padding: '1rem', borderRadius: '8px', border: '1px solid #4caf50' }}>
                  <span style={{ color: '#4caf50', fontSize: '0.75rem', fontWeight: 'bold' }}>RÔLE : ADMIN DU GROUPE</span>
                  <div style={{ color: 'white', fontSize: '0.9rem', marginTop: '0.4rem' }}>
                    Code d'accès équipe : <strong style={{ color: '#ffcc00', fontSize: '1.1rem' }}>{squad.code}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#0b1329', padding: '1rem', borderRadius: '8px', border: '1px solid #1e2942' }}>
                  <span style={{ color: '#8b9bb4', fontSize: '0.75rem', fontWeight: 'bold' }}>RÔLE : MEMBRE</span>
                </div>
              )}

              <hr style={{ borderColor: '#1e2942', margin: '0.2rem 0' }} />
              <button onClick={() => { localStorage.removeItem(`squad_${user?.id}`); setSquad(null); setAction('choice'); }} style={linkBtnStyle}>Quitter l'équipe</button>
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
const podiumContainerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '0.5rem', margin: '1rem 0' }
const podiumStepStyle: React.CSSProperties = { width: '80px', borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }
const statTitleStyle: React.CSSProperties = { color: '#8b9bb4', fontSize: '0.7rem', letterSpacing: '1px' }
const primaryBtnStyle: React.CSSProperties = { padding: '0.8rem', backgroundColor: '#ffcc00', color: '#0b1329', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }
const secondaryBtnStyle: React.CSSProperties = { padding: '0.8rem', backgroundColor: 'transparent', color: '#ffcc00', border: '1px solid #ffcc00', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }
const linkBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left', padding: 0, fontSize: '0.85rem' }
const inputStyle: React.CSSProperties = { backgroundColor: '#0b1329', border: '1px solid #1e2942', borderRadius: '6px', color: 'white', padding: '0.8rem' }
const avatarLargeStyle: React.CSSProperties = { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#1e2942', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }
const avatarImgStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' }
const uploadBtnStyle: React.CSSProperties = { fontSize: '0.8rem', color: '#ffcc00', cursor: 'pointer', textDecoration: 'underline' }
const bottomNavStyle: React.CSSProperties = { position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#131c35', borderTop: '1px solid #1e2942', display: 'flex', justifyContent: 'around', padding: '0.5rem 0', zIndex: 100 }
const navBtnStyle: React.CSSProperties = { flex: 1, background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '2px' }