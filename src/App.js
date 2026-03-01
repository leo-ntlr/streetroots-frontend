import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// CONFIG
// ============================================================
const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001/ws';

// ============================================================
// SOUNDS
// ============================================================
const playSound = (type) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  if (type === 'ring') {
    // Sonnerie appel — 3 bips montants
    const times = [0, 0.3, 0.6];
    times.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 480 + i * 120;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } else if (type === 'message') {
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.start(); o.stop(ctx.currentTime + 0.15);
  } else if (type === 'task') {
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.start(); o.stop(ctx.currentTime + 0.2);
  } else if (type === 'approve') {
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.15);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.15);
    });
  }
};

const sendPushNotif = (title, body, tag) => {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, tag, icon: '/favicon.ico', badge: '/favicon.ico' });
  }
};

const requestNotifPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

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

  return <WSContext.Provider value={{ send, on, online, clients }}>{children}</WSContext.Provider>;
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
const isMobile = () => window.innerWidth <= 768;

const S = {
  app: { display: 'flex', flexDirection: 'column', height: '100vh', height: '100dvh', background: '#0a0a0a', color: '#f0ebe0', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden' },
  // Desktop sidebar (hidden on mobile)
  sidebar: { width: 240, background: '#111', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sideHeader: { padding: '16px 14px', borderBottom: '1px solid #222' },
  logo: { fontFamily: 'Bebas Neue, Impact, sans-serif', fontSize: 20, letterSpacing: 4, color: '#f0ebe0' },
  logoRed: { color: '#e63022' },
  userBadge: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: '#e63022', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 },
  username: { fontSize: 12, color: '#aaa' },
  roleBadge: { fontSize: 9, letterSpacing: 1, padding: '2px 6px', background: '#e63022', color: 'white', borderRadius: 2, textTransform: 'uppercase' },
  nav: { flex: 1, padding: '8px 0', overflowY: 'auto' },
  navSection: { padding: '12px 14px 4px', fontSize: 9, letterSpacing: 2, color: '#555', textTransform: 'uppercase' },
  navItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: active ? '#1e1e1e' : 'transparent', borderLeft: active ? '2px solid #e63022' : '2px solid transparent', color: active ? '#f0ebe0' : '#777', fontSize: 13, transition: 'all 0.15s', WebkitTapHighlightColor: 'transparent' }),
  dot: (online) => ({ width: 7, height: 7, borderRadius: '50%', background: online ? '#4caf50' : '#555', flexShrink: 0 }),
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  topbar: { padding: '0 16px', height: 50, borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', flexShrink: 0 },
  topTitle: { fontSize: 14, fontWeight: 600, color: '#f0ebe0' },
  content: { flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  btn: (variant = 'primary') => ({
    padding: variant === 'sm' ? '6px 10px' : '10px 18px',
    background: variant === 'danger' ? '#c0392b' : variant === 'ghost' ? 'transparent' : '#e63022',
    color: '#fff', border: variant === 'ghost' ? '1px solid #444' : 'none',
    borderRadius: 4, cursor: 'pointer', fontSize: variant === 'sm' ? 11 : 13,
    fontFamily: 'inherit', fontWeight: 500, transition: 'opacity 0.15s',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  }),
  input: { background: '#1e1e1e', border: '1px solid #333', color: '#f0ebe0', padding: '12px 14px', borderRadius: 4, fontSize: 16, fontFamily: 'inherit', width: '100%', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' },
  card: { background: '#161616', border: '1px solid #222', borderRadius: 6, padding: 16 },
  tag: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, background: color === 'red' ? '#e63022' : color === 'green' ? '#2d6a2d' : color === 'orange' ? '#7a5000' : color === 'blue' ? '#1a3a6a' : '#2a2a2a', color: '#fff' }),
  // Bottom nav for mobile
  bottomNav: { display: 'flex', background: '#111', borderTop: '1px solid #222', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' },
  bottomNavItem: (active) => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 6px', cursor: 'pointer', color: active ? '#e63022' : '#666', fontSize: 9, gap: 3, WebkitTapHighlightColor: 'transparent', borderTop: active ? '2px solid #e63022' : '2px solid transparent', transition: 'all 0.15s' }),
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
    <div style={{ minHeight: '100vh', minHeight: '100dvh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
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
    <div style={{ minHeight: '100vh', minHeight: '100dvh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
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
      if (relevant) {
        setMessages(p => [...p, m]);
        if (m.from !== user.id) {
          playSound('message');
          sendPushNotif('Nouveau message', `${m.fromUsername}: ${m.content.slice(0, 60)}`, 'message');
        }
      }
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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
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
      on('VIDEO_CALL_REQUEST', (d) => {
        setIncomingCall(d);
        playSound('ring');
        sendPushNotif('📞 Appel entrant', `${d.fromUsername} t'appelle`, 'call');
      }),
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
    <div style={{ padding: '16px 12px' }}>
      <h2 style={{ fontSize: 18, marginBottom: 16, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3 }}>APPELS & VIDÉO</h2>

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
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
      on('TASK_CREATED', (d) => {
        setTasks(p => [...p, d.task]);
        if (d.task.createdBy !== user.id) {
          playSound('task');
          sendPushNotif('Nouvelle tâche', d.task.title, 'task');
        }
        if (d.task.assignedTo === user.id) {
          playSound('task');
          sendPushNotif('Tâche assignée', `"${d.task.title}" t'a été assignée`, 'task-assigned');
        }
      }),
      on('TASK_UPDATED', (d) => {
        setTasks(p => p.map(t => t.id === d.task.id ? d.task : t));
        if (d.task.assignedTo === user.id && d.task.status !== 'fait') {
          sendPushNotif('Tâche mise à jour', `"${d.task.title}" → ${d.task.status}`, 'task-update');
        }
      }),
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
    <div style={{ padding: '16px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3 }}>TÂCHES & PROJET</h2>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
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
                    {user.role === 'founder' && (
                      <button style={{ ...S.btn('sm'), fontSize: 9, padding: '3px 6px', background: '#3a0000' }} onClick={() => deleteTask(task.id)}>✕ Suppr</button>
                    )}
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
          <div style={{ ...S.card, width: 'min(440px, 96vw)', maxHeight: '90vh', overflow: 'auto' }}>
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

  const [inviteDuration, setInviteDuration] = useState('48');
  const [invitePermanent, setInvitePermanent] = useState(false);

  const genInvite = async () => {
    const hours = invitePermanent ? 87600 : parseInt(inviteDuration);
    const data = await api.post('/api/founder/invite', { expiresInHours: hours });
    const base = process.env.REACT_APP_FRONTEND_URL || window.location.origin;
    setInviteLink(`${base}?code=${data.code}`);
  };

  return (
    <div style={{ padding: '16px 12px' }}>
      <h2 style={{ fontSize: 18, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3, marginBottom: 16 }}>DASHBOARD FONDATEUR</h2>

      {/* Generate invite */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🔗 Lien d'invitation</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#aaa' }}>
            <input type="checkbox" checked={invitePermanent} onChange={e => setInvitePermanent(e.target.checked)} style={{ accentColor: '#e63022' }} />
            Lien permanent
          </label>
          {!invitePermanent && (
            <select style={{ ...S.input, width: 'auto' }} value={inviteDuration} onChange={e => setInviteDuration(e.target.value)}>
              <option value="1">1 heure</option>
              <option value="6">6 heures</option>
              <option value="24">24 heures</option>
              <option value="48">48 heures</option>
              <option value="168">7 jours</option>
              <option value="720">30 jours</option>
            </select>
          )}
          <button style={S.btn()} onClick={genInvite}>Générer le lien</button>
        </div>
        {inviteLink && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input style={{ ...S.input, flex: 1, fontSize: 11 }} value={inviteLink} readOnly />
            <button style={S.btn('ghost')} onClick={() => { navigator.clipboard.writeText(inviteLink); }}>Copier</button>
          </div>
        )}
        {inviteLink && invitePermanent && <div style={{ fontSize: 11, color: '#e63022', marginTop: 6 }}>⚠️ Ce lien n'expire jamais — à partager avec précaution</div>}
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
                <button style={{ ...S.btn('danger'), background: '#5a0a0a' }} onClick={async () => { if(window.confirm('Supprimer définitivement ' + u.username + ' ?')) { await api.del('/api/founder/delete/' + u.id); load(); } }}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// DESIGN STUDIO — Full featured
const CLOTHING_TEMPLATES = [
  {
    id: 'tshirt', name: 'T-Shirt', 
    svg: `<svg viewBox="0 0 300 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M60 40 L20 80 L60 100 L60 220 L240 220 L240 100 L280 80 L240 40 L200 20 Q180 10 150 10 Q120 10 100 20 Z" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
    </svg>`
  },
  {
    id: 'hoodie', name: 'Hoodie',
    svg: `<svg viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 50 L10 100 L55 120 L55 260 L245 260 L245 120 L290 100 L250 50 L210 30 Q190 5 150 5 Q110 5 90 30 Z" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
      <ellipse cx="150" cy="25" rx="30" ry="18" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
    </svg>`
  },
  {
    id: 'jacket', name: 'Veste',
    svg: `<svg viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 40 L10 100 L55 115 L55 260 L145 260 L145 40 Z" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
      <path d="M250 40 L290 100 L245 115 L245 260 L155 260 L155 40 Z" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
      <line x1="150" y1="40" x2="150" y2="260" stroke="#444" stroke-width="2" stroke-dasharray="4"/>
    </svg>`
  },
  {
    id: 'cap', name: 'Casquette',
    svg: `<svg viewBox="0 0 300 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="150" cy="90" rx="130" ry="80" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
      <ellipse cx="150" cy="90" rx="130" ry="20" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
      <path d="M20 100 Q10 120 50 130 L150 140 L250 130 Q290 120 280 100" fill="#1e1e1e" stroke="#444" stroke-width="2"/>
    </svg>`
  },
  {
    id: 'blank', name: 'Vierge',
    svg: `<svg viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="280" height="280" fill="#111" stroke="#333" stroke-width="1" stroke-dasharray="6"/>
      <text x="150" y="155" text-anchor="middle" fill="#444" font-size="12" font-family="sans-serif">Zone libre</text>
    </svg>`
  },
];

const PALETTE_PRESETS = [
  { name: 'streetRoots', colors: ['#e63022', '#f0ebe0', '#0a0a0a', '#7a7a4a', '#2a2a2a'] },
  { name: 'Urban', colors: ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ffffff'] },
  { name: 'Earth', colors: ['#8b5e3c', '#c49a6c', '#e8d5b7', '#4a3728', '#2d1b0e'] },
  { name: 'Neon', colors: ['#00ff88', '#00ccff', '#ff00aa', '#ffff00', '#111111'] },
];

function DesignPage() {
  const { user } = useAuth();
  const { send, on } = useWS();
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#e63022');
  const [size, setSize] = useState(6);
  const [opacity, setOpacity] = useState(100);
  const [template, setTemplate] = useState(null);
  const [tab, setTab] = useState('draw'); // draw | templates | images
  const [importedImages, setImportedImages] = useState([]);
  const [selectedImg, setSelectedImg] = useState(null);
  const [votes, setVotes] = useState({ up: 0, down: 0, heart: 0 });
  const [myVote, setMyVote] = useState(null);
  const [palette, setPalette] = useState(PALETTE_PRESETS[0].colors);
  const drawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const off = on('CANVAS_UPDATE', (d) => {
      if (!canvasRef.current) return;
      const img = new Image();
      img.onload = () => canvasRef.current.getContext('2d').drawImage(img, 0, 0);
      img.src = d.data;
    });
    return off;
  }, [on]);

  useEffect(() => {
    const off = on('VOTE', (d) => setVotes(p => ({ ...p, [d.vote]: (p[d.vote] || 0) + 1 })));
    return off;
  }, [on]);

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / r.width;
    const scaleY = canvasRef.current.height / r.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
  };

  const startDraw = (e) => { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e); };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.globalAlpha = opacity / 100;
    ctx.beginPath();
    if (tool === 'eraser') {
      ctx.strokeStyle = '#0f0f0f';
      ctx.lineWidth = size * 4;
    } else if (tool === 'spray') {
      for (let i = 0; i < 20; i++) {
        const rx = (Math.random() - 0.5) * size * 3;
        const ry = (Math.random() - 0.5) * size * 3;
        ctx.fillStyle = color;
        ctx.fillRect(pos.x + rx, pos.y + ry, 1.5, 1.5);
      }
      lastPos.current = pos;
      ctx.globalAlpha = 1;
      return;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    lastPos.current = pos;
  };

  const endDraw = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    send({ type: 'CANVAS_UPDATE', data: canvasRef.current.toDataURL() });
  };

  const applyTemplate = (tmpl) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    const blob = new Blob([tmpl.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      URL.revokeObjectURL(url);
      setTemplate(tmpl.id);
      setTab('draw');
      send({ type: 'CANVAS_UPDATE', data: canvas.toDataURL() });
    };
    img.src = url;
  };

  const importImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const imgData = { id: Date.now(), name: file.name, src: ev.target.result };
      setImportedImages(p => [...p, imgData]);
    };
    reader.readAsDataURL(file);
  };

  const placeImageOnCanvas = (imgSrc) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const scale = Math.min((canvas.width * 0.5) / img.width, (canvas.height * 0.5) / img.height);
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      send({ type: 'CANVAS_UPDATE', data: canvas.toDataURL() });
      setTab('draw');
    };
    img.src = imgSrc;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    send({ type: 'CANVAS_UPDATE', data: canvas.toDataURL() });
  };

  const exportCanvas = () => {
    const link = document.createElement('a');
    link.download = 'streetroots-design.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const vote = (v) => {
    if (myVote === v) return;
    setMyVote(v);
    setVotes(p => ({ ...p, [v]: (p[v] || 0) + 1 }));
    send({ type: 'VOTE', vote: v, targetId: 'canvas' });
  };

  const TOOLS = [
    { id: 'pen', icon: '✏️', label: 'Stylo' },
    { id: 'brush', icon: '🖌️', label: 'Pinceau' },
    { id: 'spray', icon: '🎨', label: 'Spray' },
    { id: 'eraser', icon: '⬜', label: 'Gomme' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* TOP TABS */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #222', background: '#111', flexShrink: 0 }}>
        {[['draw', '✏️ Dessiner'], ['templates', '👕 Mockups'], ['images', '🖼️ Images']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...S.btn('ghost'), borderRadius: 0, fontSize: 12, padding: '10px 14px', borderBottom: tab === id ? '2px solid #e63022' : '2px solid transparent', color: tab === id ? '#f0ebe0' : '#666' }}>{label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, padding: '6px 10px' }}>
          <button onClick={exportCanvas} style={{ ...S.btn('ghost'), fontSize: 11, padding: '4px 10px' }}>⬇️ Export PNG</button>
          <button onClick={clearCanvas} style={{ ...S.btn('ghost'), fontSize: 11, padding: '4px 10px' }}>🗑️ Effacer</button>
        </div>
      </div>

      {/* TEMPLATES TAB */}
      {tab === 'templates' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Clique sur un mockup pour l'appliquer au canvas — tu pourras ensuite dessiner dessus.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {CLOTHING_TEMPLATES.map(tmpl => (
              <div key={tmpl.id} onClick={() => applyTemplate(tmpl)}
                style={{ ...S.card, cursor: 'pointer', textAlign: 'center', padding: 12, border: template === tmpl.id ? '1px solid #e63022' : '1px solid #222', transition: 'border 0.2s' }}>
                <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  dangerouslySetInnerHTML={{ __html: tmpl.svg }} />
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, fontWeight: 600 }}>{tmpl.name}</div>
                {template === tmpl.id && <div style={{ fontSize: 9, color: '#e63022', marginTop: 2 }}>✓ Actif</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Palettes de couleurs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PALETTE_PRESETS.map(preset => (
                <div key={preset.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#888', width: 80 }}>{preset.name}</span>
                  {preset.colors.map(c => (
                    <div key={c} onClick={() => { setPalette(preset.colors); setColor(c); setTab('draw'); }}
                      style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: '1px solid #444' }} />
                  ))}
                  <button onClick={() => { setPalette(preset.colors); setTab('draw'); }} style={{ ...S.btn('sm'), fontSize: 10, padding: '3px 8px' }}>Utiliser</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IMAGES TAB */}
      {tab === 'images' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={importImage} />
          <button style={{ ...S.btn(), marginBottom: 16 }} onClick={() => fileInputRef.current.click()}>
            + Importer une image / logo
          </button>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Clique sur une image pour la placer au centre du canvas.</div>
          {importedImages.length === 0 && (
            <div style={{ ...S.card, textAlign: 'center', padding: 40, color: '#555', fontSize: 13 }}>
              Aucune image importée.<br/>Importe des logos, photos ou textures.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {importedImages.map(img => (
              <div key={img.id} style={{ ...S.card, cursor: 'pointer', padding: 8, textAlign: 'center' }} onClick={() => placeImageOnCanvas(img.src)}>
                <img src={img.src} alt={img.name} style={{ width: '100%', height: 80, objectFit: 'contain', borderRadius: 4 }} />
                <div style={{ fontSize: 9, color: '#777', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DRAW TAB */}
      {tab === 'draw' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* LEFT TOOLBAR */}
          <div style={{ width: 56, background: '#111', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', overflowY: 'auto', flexShrink: 0 }}>
            {TOOLS.map(t => (
              <button key={t.id} title={t.label} onClick={() => setTool(t.id)}
                style={{ width: 40, height: 40, background: tool === t.id ? '#e63022' : '#1e1e1e', border: 'none', borderRadius: 6, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {t.icon}
              </button>
            ))}
            <div style={{ width: 32, height: 1, background: '#333', margin: '4px 0' }} />
            {/* Color palette */}
            {palette.map(c => (
              <div key={c} onClick={() => { setColor(c); if(tool === 'eraser') setTool('pen'); }}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c && tool !== 'eraser' ? '2px solid white' : '1px solid #444', flexShrink: 0 }} />
            ))}
            {/* Custom color picker */}
            <div style={{ position: 'relative', width: 28, height: 28 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)', cursor: 'pointer', border: '1px solid #444' }} />
              <input type="color" value={color} onChange={e => { setColor(e.target.value); if(tool==='eraser') setTool('pen'); }}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
            </div>
            <div style={{ width: 32, height: 1, background: '#333', margin: '2px 0' }} />
            {/* Size */}
            <div style={{ fontSize: 8, color: '#555', textAlign: 'center' }}>Taille</div>
            {[2, 5, 10, 20].map(s => (
              <div key={s} onClick={() => setSize(s)}
                style={{ width: 28, height: 28, borderRadius: 4, background: size === s ? '#e63022' : '#1e1e1e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: Math.min(s * 1.2, 22), height: Math.min(s * 1.2, 22), borderRadius: '50%', background: '#f0ebe0' }} />
              </div>
            ))}
            <div style={{ width: 32, height: 1, background: '#333', margin: '2px 0' }} />
            {/* Opacity */}
            <div style={{ fontSize: 8, color: '#555', textAlign: 'center' }}>Opacité</div>
            <div style={{ fontSize: 10, color: '#e63022', fontWeight: 700 }}>{opacity}%</div>
            <input type="range" min="10" max="100" step="10" value={opacity} onChange={e => setOpacity(+e.target.value)}
              style={{ writingMode: 'vertical-lr', height: 60, cursor: 'pointer', accentColor: '#e63022' }} />
          </div>

          {/* CANVAS AREA */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0a' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
              <canvas ref={canvasRef} width={800} height={600}
                style={{ maxWidth: '100%', maxHeight: '100%', background: '#0f0f0f', cursor: tool === 'eraser' ? 'cell' : tool === 'spray' ? 'crosshair' : 'crosshair', borderRadius: 4, touchAction: 'none' }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
            </div>
            {/* Vote bar */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderTop: '1px solid #222', background: '#111', flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#666' }}>Vote :</span>
              {[['👍', 'up'], ['❤️', 'heart'], ['👎', 'down']].map(([icon, v]) => (
                <button key={v} onClick={() => vote(v)} style={{ ...S.btn(myVote === v ? 'primary' : 'ghost'), padding: '4px 10px', fontSize: 13 }}>
                  {icon} {votes[v] || 0}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>🟢 Collaboratif — les autres membres voient ton dessin en direct</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// CONFERENCE PAGE — Appel groupe avec tous les membres
// ============================================================
function ConferencePage() {
  const { user } = useAuth();
  const { send, on } = useWS();
  const api = useApi();
  const [users, setUsers] = useState([]);
  const [inConf, setInConf] = useState(false);
  const [peers, setPeers] = useState({}); // userId -> { pc, stream }
  const localRef = useRef(null);
  const streamRef = useRef(null);
  const pcsRef = useRef({});

  useEffect(() => { api.get('/api/users').then(u => setUsers(u.filter(x => x.id !== user.id))); }, []);

  const getMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  };

  const createPCForPeer = (peerId) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcsRef.current[peerId] = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'VIDEO_ICE', to: peerId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      setPeers(p => ({ ...p, [peerId]: { ...p[peerId], stream: e.streams[0] } }));
    };

    streamRef.current?.getTracks().forEach(t => pc.addTrack(t, streamRef.current));
    return pc;
  };

  const joinConference = async () => {
    const stream = await getMedia();
    streamRef.current = stream;
    setInConf(true);
    send({ type: 'CONFERENCE_JOIN' });
    playSound('ring');
  };

  const leaveConference = () => {
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (localRef.current) localRef.current.srcObject = null;
    setPeers({});
    setInConf(false);
    send({ type: 'CONFERENCE_LEAVE' });
  };

  useEffect(() => {
    const offs = [
      on('CONFERENCE_USER_JOINED', async (d) => {
        if (!inConf || !streamRef.current) return;
        playSound('ring');
        sendPushNotif('Conference', d.fromUsername + ' a rejoint', 'conf');
        const pc = createPCForPeer(d.from);
        setPeers(p => ({ ...p, [d.from]: { username: d.fromUsername } }));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: 'VIDEO_OFFER', to: d.from, offer });
      }),
      on('CONFERENCE_USER_LEFT', (d) => {
        if (pcsRef.current[d.from]) { pcsRef.current[d.from].close(); delete pcsRef.current[d.from]; }
        setPeers(p => { const n = {...p}; delete n[d.from]; return n; });
      }),
      on('VIDEO_OFFER', async (d) => {
        if (!inConf) return;
        let pc = pcsRef.current[d.from];
        if (!pc) { pc = createPCForPeer(d.from); setPeers(p => ({ ...p, [d.from]: { username: d.fromUsername } })); }
        await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'VIDEO_ANSWER', to: d.from, answer });
      }),
      on('VIDEO_ANSWER', async (d) => {
        const pc = pcsRef.current[d.from];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      }),
      on('VIDEO_ICE', async (d) => {
        const pc = pcsRef.current[d.from];
        if (pc) try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch {}
      }),
    ];
    return () => offs.forEach(f => f && f());
  }, [on, inConf]);

  const [sharedFiles, setSharedFiles] = useState([]);
  const confFileRef = useRef(null);

  useEffect(() => {
    const off = on('FILE_SHARE', (d) => {
      setSharedFiles(p => [...p, d]);
      playSound('message');
      sendPushNotif('Fichier partagé', d.fromUsername + ' a partagé ' + d.fileName, 'file');
    });
    return off;
  }, [on]);

  const shareFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      send({ type: 'FILE_SHARE', fileName: file.name, fileData: ev.target.result, fileType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const peerList = Object.entries(peers);

  return (
    <div style={{ padding: '16px 12px' }}>
      <h2 style={{ fontSize: 18, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 3, marginBottom: 8 }}>CONFÉRENCE ÉQUIPE</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>Appel vidéo avec tous les membres de streetRoots en même temps.</p>

      {!inConf ? (
        <div style={{ ...S.card, maxWidth: 400, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎥</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Lancer une conférence</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>Tous les membres connectés recevront une notification et pourront rejoindre.</div>
          <button style={S.btn()} onClick={joinConference}>Rejoindre la conférence</button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Local video */}
            <div style={{ background: '#111', borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', position: 'relative', border: '2px solid #e63022' }}>
              <video ref={localRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: 11, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: 3 }}>Toi</div>
            </div>
            {/* Remote peers */}
            {peerList.map(([peerId, peer]) => (
              <PeerVideo key={peerId} peerId={peerId} peer={peer} />
            ))}
          </div>
          {peerList.length === 0 && (
            <div style={{ color: '#555', fontSize: 13, marginBottom: 16 }}>En attente que d'autres membres rejoignent...</div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button style={S.btn('danger')} onClick={leaveConference}>🔴 Quitter</button>
            <input ref={confFileRef} type="file" style={{ display: 'none' }} onChange={shareFile} />
            <button style={S.btn('ghost')} onClick={() => confFileRef.current.click()}>📎 Partager un fichier</button>
          </div>
          {sharedFiles.length > 0 && (
            <div style={{ ...S.card, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Fichiers partagés</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sharedFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1e1e1e', padding: '8px 12px', borderRadius: 4 }}>
                    <span style={{ fontSize: 18 }}>{f.fileType?.startsWith('image') ? '🖼️' : '📄'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{f.fileName}</div>
                      <div style={{ fontSize: 10, color: '#666' }}>Partagé par {f.fromUsername}</div>
                    </div>
                    <a href={f.fileData} download={f.fileName} style={{ ...S.btn('sm'), textDecoration: 'none', fontSize: 11 }}>⬇️</a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeerVideo({ peerId, peer }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream;
  }, [peer.stream]);
  return (
    <div style={{ background: '#111', borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: 11, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: 3 }}>{peer.username || peerId}</div>
    </div>
  );
}
// ============================================================
// MAIN APP
// ============================================================
const PAGES = {
  messaging: { label: 'Messagerie', icon: '💬', component: MessagingPage },
  video: { label: 'Vidéo & Appels', icon: '🎥', component: VideoPage },
  conference: { label: 'Conférence', icon: '👥', component: ConferencePage },
  tasks: { label: 'Tâches', icon: '✅', component: TasksPage },
  design: { label: 'Studio Design', icon: '✏️', component: DesignPage },
};

function BadgeDot({ count }) {
  if (!count) return null;
  return (
    <div style={{ minWidth: 16, height: 16, background: '#e63022', borderRadius: 8, fontSize: 9, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', marginLeft: 'auto' }}>
      {count > 9 ? '9+' : count}
    </div>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const { online, on } = useWS();
  const api = useApi();
  const [page, setPage] = useState('messaging');
  const [users, setUsers] = useState([]);
  const [mobile, setMobile] = useState(window.innerWidth <= 768);
  const [sideOpen, setSideOpen] = useState(false);
  const [badges, setBadges] = useState({ messaging: 0, tasks: 0 });

  useEffect(() => {
    api.get('/api/users').then(setUsers).catch(() => {});
    requestNotifPermission();
    const onResize = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const offs = [
      on('MESSAGE', (d) => {
        if (d.message && d.message.from !== user.id) {
          setBadges(b => ({ ...b, messaging: b.messaging + 1 }));
        }
      }),
      on('TASK_CREATED', (d) => {
        if (d.task && d.task.createdBy !== user.id) {
          setBadges(b => ({ ...b, tasks: b.tasks + 1 }));
        }
      }),
      on('TASK_UPDATED', (d) => {
        if (d.task && d.task.assignedTo === user.id) {
          setBadges(b => ({ ...b, tasks: b.tasks + 1 }));
        }
      }),
    ];
    return () => offs.forEach(f => f && f());
  }, [on, user]);

  const goTo = (id) => {
    setPage(id);
    setSideOpen(false);
    if (id === 'messaging') setBadges(b => ({ ...b, messaging: 0 }));
    if (id === 'tasks') setBadges(b => ({ ...b, tasks: 0 }));
  };

  const Page = user?.role === 'founder' && page === 'founder' ? FounderPage : (PAGES[page]?.component || MessagingPage);

  const allPages = [
    ...Object.entries(PAGES).map(([id, p]) => ({ id, ...p })),
    ...(user?.role === 'founder' ? [{ id: 'founder', label: 'Contrôle Accès', icon: '🔐' }] : []),
  ];

  // Bottom nav shows only main 5 items on mobile
  const bottomItems = allPages.slice(0, user?.role === 'founder' ? 6 : 5);



  const currentLabel = page === 'founder' ? 'Contrôle Accès' : (PAGES[page]?.label || '');
  const currentIcon = page === 'founder' ? '🔐' : (PAGES[page]?.icon || '');

  return (
    <div style={{ ...S.app, flexDirection: mobile ? 'column' : 'row' }}>

      {/* DESKTOP SIDEBAR */}
      {!mobile && (
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
            {allPages.map(item => (
              <div key={item.id} style={S.navItem(page === item.id)} onClick={() => goTo(item.id)}>
                <span>{item.icon}</span> {item.label}
                <BadgeDot count={badges[item.id] || 0} />
              </div>
            ))}
            <div style={S.navSection}>Équipe en ligne</div>
            {users.filter(u => u.id !== user.id).map(u => (
              <div key={u.id} style={S.navItem(false)}>
                <span style={S.dot(online.includes(u.id))} />{u.username}
              </div>
            ))}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid #222' }}>
            <button style={{ ...S.btn('ghost'), width: '100%', fontSize: 11 }} onClick={logout}>Déconnexion</button>
          </div>
        </div>
      )}

      {/* MOBILE SLIDE MENU */}
      {mobile && sideOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setSideOpen(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260, background: '#111', display: 'flex', flexDirection: 'column', zIndex: 201 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={S.logo}>street<span style={S.logoRed}>Roots</span></div>
                <div style={S.userBadge}>
                  <div style={S.avatar}>{user.username[0].toUpperCase()}</div>
                  <div>
                    <div style={S.username}>{user.username}</div>
                    <span style={S.roleBadge}>{user.role}</span>
                  </div>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 4 }} onClick={() => setSideOpen(false)}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              <div style={S.navSection}>Navigation</div>
              {allPages.map(item => (
                <div key={item.id} style={{ ...S.navItem(page === item.id), padding: '14px 16px', fontSize: 15 }} onClick={() => goTo(item.id)}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span> {item.label}
                  <BadgeDot count={badges[item.id] || 0} />
                </div>
              ))}
              <div style={S.navSection}>Équipe en ligne</div>
              {users.filter(u => u.id !== user.id).map(u => (
                <div key={u.id} style={{ ...S.navItem(false), padding: '10px 16px' }}>
                  <span style={S.dot(online.includes(u.id))} />{u.username}
                </div>
              ))}
            </div>
            <div style={{ padding: 16, borderTop: '1px solid #222' }}>
              <button style={{ ...S.btn('ghost'), width: '100%' }} onClick={logout}>Déconnexion</button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ ...S.main, flexDirection: 'column' }}>
        {/* TOPBAR */}
        <div style={{ ...S.topbar, padding: mobile ? '0 12px' : '0 20px' }}>
          {mobile && (
            <button style={{ background: 'none', border: 'none', color: '#f0ebe0', fontSize: 20, cursor: 'pointer', padding: '4px 8px 4px 0', lineHeight: 1 }} onClick={() => setSideOpen(true)}>☰</button>
          )}
          <div style={S.topTitle}>{currentIcon} {currentLabel}</div>
          {mobile && (
            <div style={{ ...S.avatar, width: 30, height: 30, fontSize: 13 }}>{user.username[0].toUpperCase()}</div>
          )}
        </div>

        {/* PAGE CONTENT */}
        <div style={S.content}>
          <Page />
        </div>

        {/* MOBILE BOTTOM NAV */}
        {mobile && (
          <div style={S.bottomNav}>
            {bottomItems.map(item => (
              <div key={item.id} style={S.bottomNavItem(page === item.id)} onClick={() => goTo(item.id)}>
                <div style={{ position: 'relative' }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  {(badges[item.id] || 0) > 0 && (
                    <div style={{ position: 'absolute', top: -4, right: -8, minWidth: 14, height: 14, background: '#e63022', borderRadius: 7, fontSize: 8, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {badges[item.id] > 9 ? '9+' : badges[item.id]}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 9 }}>{item.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        )}
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
