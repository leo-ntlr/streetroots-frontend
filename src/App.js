import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// CONFIG
// ============================================================
const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001/ws';

// ============================================================
// AUTH CONTEXT
// ============================================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('sr_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => { if (data.id) setUser(data); else logout(); })
        .catch(logout)
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [token]);

  const login = async (username, password) => {
    const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    localStorage.setItem('sr_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('sr_token');
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  return <AuthContext.Provider value={{ user, token, login, logout, loading }}>{children}</AuthContext.Provider>;
}

// ============================================================
// WEBSOCKET CONTEXT
// ============================================================
const WSContext = createContext(null);
const useWS = () => useContext(WSContext);

function WSProvider({ children }) {
  const { token } = useAuth();
  const wsRef = useRef(null);
  const [online, setOnline] = useState([]);
  const listenersRef = useRef({});

  const on = useCallback((type, fn) => {
    if (!listenersRef.current[type]) listenersRef.current[type] = [];
    listenersRef.current[type].push(fn);
    return () => { listenersRef.current[type] = listenersRef.current[type].filter(f => f !== fn); };
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(data));
  }, []);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => { ws.send(JSON.stringify({ type: 'AUTH', token })); };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'USER_ONLINE') setOnline(p => [...new Set([...p, data.userId])]);
      if (data.type === 'USER_OFFLINE') setOnline(p => p.filter(id => id !== data.userId));
      const fns = listenersRef.current[data.type] || [];
      fns.forEach(fn => fn(data));
    };

    ws.onclose = () => setTimeout(() => { if (token) {} }, 3000);

    return () => ws.close();
  }, [token]);

  return <WSContext.Provider value={{ send, on, online }}>{children}</WSContext.Provider>;
}

// ============================================================
// API HELPERS
// ============================================================
function useApi() {
  const { token } = useAuth();
  const req = useCallback(async (method, path, body) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur');
    return data;
  }, [token]);
  return { get: (p) => req('GET', p), post: (p, b) => req('POST', p, b), patch: (p, b) => req('PATCH', p, b), del: (p) => req('DELETE', p) };
}

// ============================================================
// STYLES
// ============================================================
const S = {
  app: { display: 'flex', height: '100vh', background: '#0a0a0a', color: '#f0ebe0', fontFamily: "'Space Grotesk', 'DM Sans', system-ui, sans-serif", overflow: 'hidden' },
  sidebar: { width: 260, background: '#111', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sideHeader: { padding: '20px 16px', borderBottom: '1px solid #222' },
  logo: { fontFamily: 'Bebas Neue, Impact, sans-serif', fontSize: 22, letterSpacing: 4, color: '#f0ebe0' },
  logoRed: { color: '#e63022' },
  userBadge: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: '#e63022', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 },
  username: { fontSize: 13, color: '#aaa' },
  roleBadge: { fontSize: 9, letterSpacing: 1, padding: '2px 6px', background: '#e63022', color: 'white', borderRadius: 2, textTransform: 'uppercase' },
  nav: { flex: 1, padding: '8px 0', overflowY: 'auto' },
  navSection: { padding: '16px 16px 4px', fontSize: 10, letterSpacing: 2, color: '#555', textTransform: 'uppercase' },
  navItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', background: active ? '#1e1e1e' : 'transparent', borderLeft: active ? '2px solid #e63022' : '2px solid transparent', color: active ? '#f0ebe0' : '#777', fontSize: 13, transition: 'all 0.15s' }),
  dot: (online) => ({ width: 7, height: 7, borderRadius: '50%', background: online ? '#4caf50' : '#555', flexShrink: 0 }),
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: { padding: '0 24px', height: 52, borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', flexShrink: 0 },
  topTitle: { fontSize: 15, fontWeight: 600, color: '#f0ebe0' },
  content: { flex: 1, overflow: 'auto' },
  btn: (variant = 'primary') => ({
    padding: variant === 'sm' ? '6px 12px' : '10px 20px',
    background: variant === 'danger' ? '#c0392b' : variant === 'ghost' ? 'transparent' : '#e63022',
    color: '#fff', border: variant === 'ghost' ? '1px solid #444' : 'none',
    borderRadius: 4, cursor: 'pointer', fontSize: variant === 'sm' ? 12 : 13,
    fontFamily: 'inherit', fontWeight: 500, transition: 'opacity 0.15s',
  }),
  input: { background: '#1e1e1e', border: '1px solid #333', color: '#f0ebe0', padding: '10px 14px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: '100%', outline: 'none', boxSizing: 'border-box' },
  card: { background: '#161616', border: '1px solid #222', borderRadius: 6, padding: 20 },
  tag: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, background: color === 'red' ? '#e63022' : color === 'green' ? '#2d6a2d' : color === 'orange' ? '#7a5000' : color === 'blue' ? '#1a3a6a' : '#2a2a2a', color: '#fff' }),
};

// ============================================================
// PAGES
// ============================================================

// LOGIN PAGE
function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('code');

  if (inviteCode) return <RegisterPage code={inviteCode} />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try { await login(form.username, form.password); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'Bebas Neue, Impact, sans-serif', fontSize: 36, letterSpacing: 6 }}>street<span style={{ color: '#e63022' }}>Roots</span></div>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 2, marginTop: 4 }}>INTERNAL OS</div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input style={S.input} placeholder="Nom d'utilisateur ou email" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          <input style={S.input} type="password" placeholder="Mot de passe" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          {err && <div style={{ color: '#e63022', fontSize: 12 }}>{err}</div>}
          <button style={S.btn()} disabled={loading}>{loading ? 'Connexion...' : 'Se connecter'}</button>
        </form>
      </div>
    </div>
  );
}

// REGISTER PAGE (via invite link)
function RegisterPage({ code }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', inviteCode: code });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setDone(true);
    } catch (e) { setErr(e.message); }
  };

  if (done) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f0ebe0', textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 18, marginBottom: 8 }}>Compte créé avec succès</div>
        <div style={{ color: '#888', fontSize: 13 }}>Ton accès est en attente de validation par le fondateur.</div>
        <button style={{ ...S.btn(), marginTop: 24 }} onClick={() => window.location.href = '/'}>Retour à la connexion</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'Bebas Neue, Impact, sans-serif', fontSize: 36, letterSpacing: 6 }}>street<span style={{ color: '#e63022' }}>Roots</span></div>
          <div style={{ fontSize: 11, color: '#4caf50', letterSpacing: 2, marginTop: 4 }}>INVITATION VALIDE ✓</div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input style={S.input} placeholder="Nom d'utilisateur" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          <input style={S.input} type="email" placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <input style={S.input} type="password" placeholder="Mot de passe" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          {err && <div style={{ color: '#e63022', fontSize: 12 }}>{err}</div>}
          <button style={S.btn()}>Créer mon compte</button>
        </form>
      </div>
    </div>
  );
}

// MESSAGING
function MessagingPage() {
  const { user } = useAuth();
  const { send, on } = useWS();
  const api = useApi();
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // { type: 'channel'|'dm', id, name }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/api/channels').then(setChannels);
    api.get('/api/users').then(u => setUsers(u.filter(x => x.id !== user.id)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.get(`/api/messages/${selected.id}`).then(setMessages);
  }, [selected]);

  useEffect(() => {
    const off = on('MESSAGE', (data) => {
      if (!selected) return;
      const m = data.message;
      const relevant = (m.channel === selected.id) || (m.type === 'dm' && (m.from === selected.id || m.to === selected.id));
      if (relevant) setMessages(p => [...p, m]);
    });
    return off;
  }, [on, selected]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMsg = (e) => {
    e.preventDefault();
    if (!input.trim() || !selected) return;
    send({ type: 'MESSAGE', ...(selected.type === 'channel' ? { channel: selected.id } : { to: selected.id }), content: input.trim() });
    setInput('');
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar canaux */}
      <div style={{ width: 200, background: '#0f0f0f', borderRight: '1px solid #1e1e1e', overflow: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '12px 14px 4px', fontSize: 10, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>Canaux</div>
        {channels.map(c => (
          <div key={c.id} onClick={() => setSelected({ type: 'channel', id: c.id, name: c.name })}
            style={S.navItem(selected?.id === c.id)}># {c.name}</div>
        ))}
        <div style={{ padding: '12px 14px 4px', fontSize: 10, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>Messages directs</div>
        {users.map(u => (
          <div key={u.id} onClick={() => setSelected({ type: 'dm', id: u.id, name: u.username })}
            style={S.navItem(selected?.id === u.id)}>
            <span style={S.dot(false)} />{u.username}
          </div>
        ))}
      </div>

      {/* Zone messages */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
            Sélectionne un canal ou une personne
          </div>
        ) : (
          <>
            <div style={{ padding: '0 20px', height: 48, borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
              {selected.type === 'channel' ? `# ${selected.name}` : `@ ${selected.name}`}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ ...S.avatar, width: 32, height: 32, fontSize: 13, flexShrink: 0 }}>{(m.fromUsername || '?')[0].toUpperCase()}</div>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: m.from === user.id ? '#e63022' : '#f0ebe0' }}>{m.fromUsername}</span>
                      <span style={{ fontSize: 10, color: '#555' }}>{new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ fontSize: 14, color: '#ccc', lineHeight: 1.5 }}>{m.content}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={sendMsg} style={{ padding: '12px 20px', borderTop: '1px solid #1e1e1e', display: 'flex', gap: 8, flexShrink: 0 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder={`Message ${selected.type === 'channel' ? '#' + selected.name : '@' + selected.name}`} value={input} onChange={e => setInput(e.target.value)} />
              <button style={S.btn()} type="submit">Envoyer</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// VIDEO CALL PAGE
function VideoPage() {
  const { user } = useAuth();
  const { send, on } = useWS();
  const api = useApi();
  const [users, setUsers] = useState([]);
  const [callState, setCallState] = useState('idle'); // idle, calling, in-call, incoming
  const [remoteUser, setRemoteUser] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => { api.get('/api/users').then(u => setUsers(u.filter(x => x.id !== user.id))); }, []);

  const getMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  };

  const createPC = (targetId) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    pcRef.current = pc;

    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'VIDEO_ICE', to: targetId, candidate: e.candidate }); };

    pc.ontrack = (e) => { if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]; };

    streamRef.current?.getTracks().forEach(t => pc.addTrack(t, streamRef.current));

    return pc;
  };

  const callUser = async (target) => {
    setRemoteUser(target);
    setCallState('calling');
    const stream = await getMedia();
    streamRef.current = stream;
    const pc = createPC(target.id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: 'VIDEO_CALL_REQUEST', to: target.id, fromUsername: user.username });
    send({ type: 'VIDEO_OFFER', to: target.id, offer });
  };

  const acceptCall = async () => {
    const stream = await getMedia();
    streamRef.current = stream;
    const pc = createPC(incomingCall.from);
    await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: 'VIDEO_ANSWER', to: incomingCall.from, answer });
    send({ type: 'VIDEO_CALL_ACCEPT', to: incomingCall.from });
    setRemoteUser({ id: incomingCall.from, username: incomingCall.fromUsername });
    setCallState('in-call');
    setIncomingCall(null);
  };

  const endCall = () => {
    if (remoteUser) send({ type: 'VIDEO_CALL_END', to: remoteUser.id });
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setCallState('idle');
    setRemoteUser(null);
    if (localRef.current) localRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
  };

  // WS listeners
  useEffect(() => {
    const offs = [
      on('VIDEO_CALL_REQUEST', (d) => { setIncomingCall(d); }),
      on('VIDEO_CALL_ACCEPT', () => { setCallState('in-call'); }),
      on('VIDEO_CALL_REJECT', () => { setCallState('idle'); setRemoteUser(null); alert('Appel refusé'); }),
      on('VIDEO_CALL_END', () => { endCall(); }),
      on('VIDEO_OFFER', async (d) => {
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(d.offer));
      }),
      on('VIDEO_ANSWER', async (d) => {
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(d.answer));
      }),
      on('VIDEO_ICE', async (d) => {
        if (!pcRef.current) return;
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch {}
      }),
    ];
    return () => offs.forEach(f => f && f());
  }, [on, remoteUser]);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, marginBottom: 20, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3 }}>APPELS & VIDÉO</h2>

      {/* Incoming call */}
      {incomingCall && (
        <div style={{ ...S.card, marginBottom: 20, background: '#1a0a0a', border: '1px solid #e63022', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>📞 Appel entrant de <span style={{ color: '#e63022' }}>{incomingCall.fromUsername}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn()} onClick={acceptCall}>Décrocher</button>
            <button style={S.btn('danger')} onClick={() => { send({ type: 'VIDEO_CALL_REJECT', to: incomingCall.from }); setIncomingCall(null); }}>Refuser</button>
          </div>
        </div>
      )}

      {/* In-call view */}
      {callState !== 'idle' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ background: '#000', borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
              <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 12, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 3 }}>{remoteUser?.username || 'Connexion...'}</div>
            </div>
            <div style={{ background: '#111', borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
              <video ref={localRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 12, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 3 }}>Toi</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button style={S.btn('danger')} onClick={endCall}>🔴 Raccrocher</button>
          </div>
          {callState === 'calling' && <div style={{ textAlign: 'center', color: '#888', fontSize: 13, marginTop: 8 }}>Appel en cours...</div>}
        </div>
      )}

      {/* User list to call */}
      {callState === 'idle' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {users.map(u => (
            <div key={u.id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={S.avatar}>{u.username[0].toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</div>
                  <div style={{ fontSize: 10, color: '#666' }}>{u.role}</div>
                </div>
              </div>
              <button style={S.btn('sm')} onClick={() => callUser(u)}>📞</button>
            </div>
          ))}
          {users.length === 0 && <div style={{ color: '#555', fontSize: 13 }}>Aucun autre membre connecté.</div>}
        </div>
      )}
    </div>
  );
}

// TASKS PAGE
const STATUSES = [
  { id: 'todo', label: 'À faire', color: '#2a2a2a' },
  { id: 'en-cours', label: 'En cours', color: '#7a5000' },
  { id: 'review', label: 'En review', color: '#1a3a6a' },
  { id: 'bloqué', label: 'Bloqué', color: '#5a1010' },
  { id: 'fait', label: 'Fait ✓', color: '#2d6a2d' },
];
const STEPS = ['concept', 'croquis', 'validation', 'production', 'livré'];

function TasksPage() {
  const { user } = useAuth();
  const { on } = useWS();
  const api = useApi();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', assignedTo: '', projectStep: 'concept', status: 'todo' });

  useEffect(() => {
    api.get('/api/tasks').then(setTasks);
    api.get('/api/users').then(setUsers);
  }, []);

  useEffect(() => {
    const offs = [
      on('TASK_CREATED', (d) => setTasks(p => [...p, d.task])),
      on('TASK_UPDATED', (d) => setTasks(p => p.map(t => t.id === d.task.id ? d.task : t))),
      on('TASK_DELETED', (d) => setTasks(p => p.filter(t => t.id !== d.taskId))),
    ];
    return () => offs.forEach(f => f && f());
  }, [on]);

  const createTask = async (e) => {
    e.preventDefault();
    await api.post('/api/tasks', form);
    setModal(null);
    setForm({ title: '', description: '', assignedTo: '', projectStep: 'concept', status: 'todo' });
  };

  const updateStatus = async (task, status) => {
    await api.patch(`/api/tasks/${task.id}`, { status });
  };

  const deleteTask = async (id) => {
    if (!window.confirm('Supprimer cette tâche ?')) return;
    await api.del(`/api/tasks/${id}`);
  };

  const getUserName = (id) => users.find(u => u.id === id)?.username || 'Non assigné';

  // Progress bar
  const totalByStep = STEPS.map(step => ({ step, count: tasks.filter(t => t.projectStep === step).length }));
  const doneCount = tasks.filter(t => t.status === 'fait').length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3 }}>TÂCHES & PROJET</h2>
        <button style={S.btn()} onClick={() => setModal('create')}>+ Nouvelle tâche</button>
      </div>

      {/* Progress */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <span>Avancement global</span>
          <span style={{ color: '#e63022', fontWeight: 700 }}>{progress}%</span>
        </div>
        <div style={{ height: 6, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#e63022', transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          {STEPS.map(step => (
            <div key={step} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e63022' }}>{tasks.filter(t => t.projectStep === step).length}</div>
              <div style={{ fontSize: 10, color: '#666', textTransform: 'capitalize', marginTop: 2 }}>{step}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {STATUSES.map(status => (
          <div key={status.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: status.color === '#2a2a2a' ? '#666' : status.color }} />
              <span style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#aaa' }}>{status.label}</span>
              <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>{tasks.filter(t => t.status === status.id).length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.filter(t => t.status === status.id).map(task => (
                <div key={task.id} style={{ ...S.card, padding: 14, borderLeft: `3px solid ${status.color === '#2a2a2a' ? '#444' : status.color}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{task.title}</div>
                  {task.description && <div style={{ fontSize: 11, color: '#777', marginBottom: 8, lineHeight: 1.4 }}>{task.description}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    <span style={S.tag('blue')}>{task.projectStep}</span>
                    <span style={S.tag('')}>{getUserName(task.assignedTo)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {STATUSES.filter(s => s.id !== task.status).map(s => (
                      <button key={s.id} style={{ ...S.btn('sm'), fontSize: 9, padding: '3px 6px', background: '#2a2a2a' }} onClick={() => updateStatus(task, s.id)}>{s.label}</button>
                    ))}
                    <button style={{ ...S.btn('sm'), fontSize: 9, padding: '3px 6px', background: '#3a0000' }} onClick={() => deleteTask(task.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {modal === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ ...S.card, width: 440, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 16, marginBottom: 20, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 2 }}>NOUVELLE TÂCHE</h3>
            <form onSubmit={createTask} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input style={S.input} placeholder="Titre de la tâche *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
              <textarea style={{ ...S.input, height: 80, resize: 'vertical' }} placeholder="Description (optionnel)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              <select style={S.input} value={form.assignedTo} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))}>
                <option value="">Non assigné</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
              <select style={S.input} value={form.projectStep} onChange={e => setForm(p => ({ ...p, projectStep: e.target.value }))}>
                {STEPS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <select style={S.input} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={S.btn('ghost')} onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" style={S.btn()}>Créer la tâche</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// FOUNDER DASHBOARD
function FounderPage() {
  const api = useApi();
  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [inviteLink, setInviteLink] = useState(null);
  const [tab, setTab] = useState('pending');

  const load = () => {
    api.get('/api/founder/pending').then(setPending);
    api.get('/api/founder/members').then(setMembers);
  };

  useEffect(() => { load(); }, []);

  const approve = async (id, role = 'member') => {
    await api.post(`/api/founder/approve/${id}`, { role });
    load();
  };

  const suspend = async (id) => {
    await api.post(`/api/founder/suspend/${id}`);
    load();
  };

  const genInvite = async () => {
    const data = await api.post('/api/founder/invite', { expiresInHours: 48 });
    const base = process.env.REACT_APP_FRONTEND_URL || window.location.origin;
    setInviteLink(`${base}?code=${data.code}`);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3, marginBottom: 24 }}>DASHBOARD FONDATEUR</h2>

      {/* Generate invite */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🔗 Générer un lien d'invitation</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={S.btn()} onClick={genInvite}>Générer un lien (valable 48h)</button>
          {inviteLink && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
              <input style={{ ...S.input, flex: 1 }} value={inviteLink} readOnly />
              <button style={S.btn('ghost')} onClick={() => navigator.clipboard.writeText(inviteLink)}>Copier</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #222' }}>
        {[['pending', `En attente (${pending.length})`], ['members', 'Membres']].map(([id, label]) => (
          <button key={id} style={{ ...S.btn('ghost'), borderRadius: 0, borderBottom: tab === id ? '2px solid #e63022' : '2px solid transparent', color: tab === id ? '#f0ebe0' : '#666' }} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.length === 0 && <div style={{ color: '#555', fontSize: 13 }}>Aucun compte en attente.</div>}
          {pending.map(u => (
            <div key={u.id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{u.username}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btn('sm')} onClick={() => approve(u.id, 'designer')}>Designer</button>
                <button style={S.btn('sm')} onClick={() => approve(u.id, 'member')}>Membre</button>
                <button style={S.btn('danger')} onClick={() => suspend(u.id)}>Refuser</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map(u => (
            <div key={u.id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={S.avatar}>{u.username[0].toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.username}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{u.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={S.tag(u.status === 'approved' ? 'green' : 'red')}>{u.status}</span>
                <span style={S.tag('blue')}>{u.role}</span>
                {u.status === 'approved' && <button style={S.btn('danger')} onClick={() => suspend(u.id)}>Suspendre</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// CANVAS (Design Studio)
function DesignPage() {
  const { user } = useAuth();
  const { send, on } = useWS();
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#e63022');
  const [size, setSize] = useState(4);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [votes, setVotes] = useState({ up: 0, down: 0, heart: 0 });
  const [myVote, setMyVote] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const off = on('CANVAS_UPDATE', (d) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = d.data;
    });
    return off;
  }, [on]);

  useEffect(() => {
    const off = on('VOTE', (d) => {
      setVotes(p => ({ ...p, [d.vote]: (p[d.vote] || 0) + 1 }));
    });
    return off;
  }, [on]);

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const startDraw = (e) => { drawing.current = true; lastPos.current = getPos(e); };

  const draw = (e) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.strokeStyle = tool === 'eraser' ? '#0f0f0f' : color;
    ctx.lineWidth = tool === 'eraser' ? size * 4 : size;
    ctx.lineCap = 'round';
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => {
    drawing.current = false;
    const data = canvasRef.current.toDataURL();
    send({ type: 'CANVAS_UPDATE', data });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    send({ type: 'CANVAS_UPDATE', data: canvas.toDataURL() });
  };

  const vote = (v) => {
    if (myVote === v) return;
    setMyVote(v);
    setVotes(p => ({ ...p, [v]: (p[v] || 0) + 1 }));
    send({ type: 'VOTE', vote: v, targetId: 'canvas' });
  };

  const TOOLS = [['pen', '✏️'], ['eraser', '⬜']];
  const COLORS = ['#e63022', '#f0ebe0', '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#000000', '#ffeb3b'];

  return (
    <div style={{ padding: 20, display: 'flex', gap: 16, height: '100%', boxSizing: 'border-box' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 52 }}>
        {TOOLS.map(([id, icon]) => (
          <button key={id} onClick={() => setTool(id)} style={{ ...S.btn(tool === id ? 'primary' : 'ghost'), padding: '10px', fontSize: 18, width: 44, height: 44 }}>{icon}</button>
        ))}
        <div style={{ width: 44, height: 1, background: '#333', margin: '4px 0' }} />
        {COLORS.map(c => (
          <div key={c} onClick={() => { setColor(c); setTool('pen'); }} style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c && tool !== 'eraser' ? '2px solid white' : '2px solid #333', margin: '0 auto' }} />
        ))}
        <div style={{ width: 44, height: 1, background: '#333', margin: '4px 0' }} />
        <input type="range" min="1" max="20" value={size} onChange={e => setSize(+e.target.value)} style={{ writingMode: 'vertical-lr', height: 80, cursor: 'pointer' }} />
        <div style={{ fontSize: 9, color: '#666', textAlign: 'center' }}>{size}px</div>
        <button onClick={clearCanvas} style={{ ...S.btn('ghost'), padding: '6px', fontSize: 16, width: 44 }}>🗑️</button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <canvas
          ref={canvasRef} width={900} height={540}
          style={{ background: '#0f0f0f', borderRadius: 6, cursor: tool === 'eraser' ? 'cell' : 'crosshair', maxWidth: '100%', border: '1px solid #222' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {/* Vote bar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#666' }}>Vote sur ce design :</span>
          {[['👍', 'up'], ['❤️', 'heart'], ['👎', 'down']].map(([icon, v]) => (
            <button key={v} onClick={() => vote(v)} style={{ ...S.btn(myVote === v ? 'primary' : 'ghost'), padding: '6px 14px', fontSize: 14 }}>
              {icon} {votes[v] || 0}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
const PAGES = {
  messaging: { label: 'Messagerie', icon: '💬', component: MessagingPage },
  video: { label: 'Vidéo & Appels', icon: '🎥', component: VideoPage },
  tasks: { label: 'Tâches', icon: '✅', component: TasksPage },
  design: { label: 'Studio Design', icon: '✏️', component: DesignPage },
};

function AppLayout() {
  const { user, logout } = useAuth();
  const { online } = useWS();
  const api = useApi();
  const [page, setPage] = useState('messaging');
  const [users, setUsers] = useState([]);

  useEffect(() => { api.get('/api/users').then(setUsers).catch(() => {}); }, []);

  const Page = user?.role === 'founder' && page === 'founder' ? FounderPage : (PAGES[page]?.component || MessagingPage);

  const navItems = [
    ...Object.entries(PAGES).map(([id, p]) => ({ id, ...p })),
    ...(user?.role === 'founder' ? [{ id: 'founder', label: 'Contrôle Accès', icon: '🔐' }] : []),
  ];

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={S.sideHeader}>
          <div style={S.logo}>street<span style={S.logoRed}>Roots</span></div>
          <div style={S.userBadge}>
            <div style={S.avatar}>{user.username[0].toUpperCase()}</div>
            <div>
              <div style={S.username}>{user.username}</div>
              <span style={S.roleBadge}>{user.role}</span>
            </div>
          </div>
        </div>
        <div style={S.nav}>
          <div style={S.navSection}>Navigation</div>
          {navItems.map(item => (
            <div key={item.id} style={S.navItem(page === item.id)} onClick={() => setPage(item.id)}>
              <span>{item.icon}</span> {item.label}
            </div>
          ))}
          <div style={S.navSection}>Équipe en ligne</div>
          {users.filter(u => u.id !== user.id).map(u => (
            <div key={u.id} style={S.navItem(false)}>
              <span style={S.dot(online.includes(u.id))} />{u.username}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #222' }}>
          <button style={{ ...S.btn('ghost'), width: '100%', fontSize: 12 }} onClick={logout}>Déconnexion</button>
        </div>
      </div>
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={S.topTitle}>{page === 'founder' ? '🔐 Contrôle Accès' : PAGES[page] ? `${PAGES[page].icon} ${PAGES[page].label}` : ''}</div>
        </div>
        <div style={S.content}>
          <Page />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('code');

  return (
    <AuthProvider>
      <AppInner inviteCode={inviteCode} />
    </AuthProvider>
  );
}

function AppInner({ inviteCode }) {
  const { user, token, loading } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!token || !user) return;
    fetch(`${API}/api/auth/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStatus(d.status))
      .catch(() => setStatus('approved'));
  }, [token, user]);

  if (loading || (user && status === null)) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'sans-serif' }}>
      Chargement...
    </div>
  );

  if (!user) return <LoginPage />;

  if (status === 'pending') return <PendingPage />;

  return (
    <WSProvider>
      <AppLayout />
    </WSProvider>
  );
}

// PENDING PAGE — auto-refresh quand approuvé
function PendingPage() {
  const { token, logout } = useAuth();

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/auth/status`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.status === 'approved') window.location.reload();
      } catch {}
    };
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f0ebe0', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <div>
        <div style={{ fontFamily: 'Bebas Neue, Impact, sans-serif', fontSize: 32, letterSpacing: 6, marginBottom: 24 }}>street<span style={{ color: '#e63022' }}>Roots</span></div>
        <div style={{ width: 48, height: 48, border: '3px solid #e63022', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Compte en attente de validation</div>
        <div style={{ fontSize: 13, color: '#666', maxWidth: 300 }}>Le fondateur doit approuver ton accès. Cette page se met à jour automatiquement dès que c'est validé.</div>
        <button style={{ ...S.btn('ghost'), marginTop: 32, fontSize: 12 }} onClick={logout}>Se déconnecter</button>
      </div>
    </div>
  );
}
