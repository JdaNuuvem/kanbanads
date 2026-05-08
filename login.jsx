// Login screen — autenticação real via API (JWT)
// Substitui o "perfil rápido" local por login com email/senha

const LoginScreen = ({ onLogin }) => {
  const [mode, setMode] = React.useState('login'); // 'login' | 'signup'
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiAuth.login(email, password);
      setToken(data.token);
      // Connect SSE for realtime
      sseClient.connect();
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Falha ao entrar');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Nome é obrigatório'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await apiAuth.signup(name, email, password);
      setToken(data.token);
      sseClient.connect();
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Falha ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 420, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 14, padding: 32 }}>
        <div className="brand" style={{ marginBottom: 8, fontSize: 16 }}>
          <div className="brand-dot">K</div>Kanban<span className="brand-sub">/ Ads & Dropshipping</span>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 0, marginBottom: 24 }}>
          {mode === 'signup' ? 'Criar nova conta' : 'Entre com seu email e senha'}
        </p>

        {error && (
          <div className="toast toast-error" style={{ marginBottom: 16 }}>
            <Icon name="warning" size={14} /> {error}
          </div>
        )}

        <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
          {mode === 'signup' && (
            <div className="form-row">
              <label>Nome</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div className="form-row">
            <label>Email</label>
            <input
              type="email"
              autoFocus={mode === 'login'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-row">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            {mode === 'login' ? (
              <>
                <button type="button" className="btn" onClick={() => { setMode('signup'); setError(''); }}>
                  Criar conta
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => { setMode('login'); setError(''); }}>
                  Voltar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Criando...' : 'Criar conta'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

window.LoginScreen = LoginScreen;
