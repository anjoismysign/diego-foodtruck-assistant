import React, { useState, useEffect, useCallback } from 'react';
import { Bot, MessageSquare, Mic, Settings, CheckCircle2, AlertCircle, Download, RefreshCw, LogOut, Lock, User, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx-js-style';

interface Pedido {
  id: number;
  chat_id: number;
  customer: string;
  amount: number;
  timestamp: number;
  paid: number;
}

const TOKEN_KEY = 'caravana_token';

const formatDate = (unix: number) => {
  const d = new Date(unix * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem(TOKEN_KEY, token);
        onLogin(token);
      } else {
        setError('Usuario o contraseña incorrectos.');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] mb-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)]">
            <Lock size={24} className="text-[#E4E3E0]" />
          </div>
          <h1 className="text-3xl font-serif italic tracking-tight text-[#141414]">La Caravana Rosa</h1>
          <p className="text-xs uppercase tracking-widest opacity-40 mt-2">Panel de Ventas — Acceso Restringido</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-2">Usuario</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-[#141414] pl-9 pr-4 py-3 text-sm font-mono bg-[#F8F8F7] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#141414] transition-all"
                  placeholder="admin"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-2">Contraseña</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[#141414] pl-9 pr-10 py-3 text-sm font-mono bg-[#F8F8F7] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#141414] transition-all"
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-70 transition-opacity"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-rose-600 text-xs bg-rose-50 border border-rose-200 px-3 py-2"
                >
                  <AlertCircle size={14} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#141414] text-[#E4E3E0] py-3 text-xs uppercase font-bold tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Verificando...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] opacity-30 mt-6 uppercase tracking-widest">
          © 2026 La Caravana Rosa
        </p>
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [status, setStatus] = useState<{ status: string; botStarted: boolean } | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback((url: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}` } }), [token]);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, pedidosRes] = await Promise.all([
        authFetch('/api/health'),
        authFetch('/api/pedidos'),
      ]);
      // If token expired/invalid, force logout
      if (healthRes.status === 401) { onLogout(); return; }
      setStatus(await healthRes.json());
      setPedidos(await pedidosRes.json());
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, onLogout]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportToXlsx = () => {
    const wb = XLSX.utils.book_new();
    const data = pedidos.map((p) => ({
      ID: p.id,
      Cliente: p.customer,
      Monto: p.amount,
      Fecha: formatDate(p.timestamp),
      Estado: p.paid ? 'Pagado' : 'Fiado',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "141414" } },
      alignment: { horizontal: "center" }
    };
    ['A1', 'B1', 'C1', 'D1', 'E1'].forEach(cell => {
      if (ws[cell]) ws[cell].s = headerStyle;
    });
    pedidos.forEach((p, i) => {
      const row = i + 2;
      const colorFila = p.paid ? "bdd6ac" : "d08370";
      ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
        const cellRef = `${col}${row}`;
        if (ws[cellRef]) ws[cellRef].s = { fill: { fgColor: { rgb: colorFila } } };
      });
      if (ws[`C${row}`]) ws[`C${row}`].z = '"₡"#,##0';
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, `pedidos_${new Date().toLocaleDateString('es-CR').replace(/\//g, '-')}.xlsx`);
  };

  const totalVentas = pedidos.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Encabezado */}
        <header className="mb-12 border-b border-[#141414] pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-serif italic mb-2 tracking-tight">Panel de Ventas y Pedidos (últimas 24h)</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Bot size={24} />
              <span className="font-mono text-xs">v2.1.0</span>
            </div>
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="flex items-center gap-1.5 border border-[#141414] px-3 py-1.5 text-xs uppercase font-bold hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
            >
              <LogOut size={13} /> Salir
            </button>
          </div>
        </header>

        {/* Tarjetas superiores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]"
          >
            <div className="flex justify-between items-start mb-8">
              <h2 className="font-serif italic text-xl">Estado del Sistema</h2>
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-6 w-20 rounded" />
              ) : status?.botStarted ? (
                <div className="flex items-center gap-2 text-emerald-600 font-mono text-xs uppercase font-bold">
                  <CheckCircle2 size={16} /> Activo
                </div>
              ) : (
                <div className="flex items-center gap-2 text-rose-600 font-mono text-xs uppercase font-bold">
                  <AlertCircle size={16} /> Inactivo
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-xs uppercase opacity-50">Servidor</span>
                <span className="font-mono text-sm">{loading ? '...' : 'Corriendo'}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-xs uppercase opacity-50">Bot de Telegram</span>
                <span className="font-mono text-sm">{loading ? '...' : (status?.botStarted ? 'Conectado' : 'Token faltante')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase opacity-50">Zona Horaria</span>
                <span className="font-mono text-sm">America/Costa_Rica</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#141414] text-[#E4E3E0] p-6 shadow-[4px_4px_0px_0px_rgba(228,227,224,1)]"
          >
            <h2 className="font-serif italic text-xl mb-6">Resumen General</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-[#333] pb-3">
                <span className="text-xs uppercase opacity-50">Total Vendido</span>
                <span className="font-mono text-lg font-bold">₡{totalVentas.toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabla de pedidos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border border-[#141414] p-6 bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] mb-6"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-serif italic text-2xl">Pedidos Registrados</h2>
            <div className="flex gap-3">
              <button
                onClick={fetchData}
                className="flex items-center gap-2 border border-[#141414] px-4 py-2 text-xs uppercase font-bold hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
              >
                <RefreshCw size={14} /> Actualizar
              </button>
              <button
                onClick={exportToXlsx}
                className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-4 py-2 text-xs uppercase font-bold hover:bg-gray-800 transition-colors"
              >
                <Download size={14} /> Exportar XLSX
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 h-10 rounded" />
              ))}
            </div>
          ) : pedidos.length === 0 ? (
            <p className="text-center opacity-40 py-12 text-sm uppercase tracking-widest">No hay pedidos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#141414]">
                    <th className="text-left py-3 px-2 text-xs uppercase opacity-50 font-normal">ID</th>
                    <th className="text-left py-3 px-2 text-xs uppercase opacity-50 font-normal">Cliente</th>
                    <th className="text-right py-3 px-2 text-xs uppercase opacity-50 font-normal">Monto</th>
                    <th className="text-center py-3 px-2 text-xs uppercase opacity-50 font-normal">Fecha</th>
                    <th className="text-center py-3 px-2 text-xs uppercase opacity-50 font-normal">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p, i) => (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <td className="py-3 px-2 font-mono text-xs opacity-40">#{p.id}</td>
                      <td className="py-3 px-2 font-medium">{p.customer}</td>
                      <td className="py-3 px-2 text-right font-mono">₡{p.amount.toLocaleString()}</td>
                      <td className="py-3 px-2 text-center font-mono text-xs">{formatDate(p.timestamp)}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={`inline-block px-2 py-1 text-xs font-bold uppercase rounded ${p.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {p.paid ? 'Pagado' : 'Fiado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Capacidades */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border border-[#141414] p-8"
        >
          <h2 className="font-serif italic text-2xl mb-8">Capacidades</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mic size={20} className="text-rose-500" />
                <h3 className="font-bold text-sm uppercase tracking-tight">Pedidos por Voz</h3>
              </div>
              <p className="text-xs opacity-70 leading-relaxed">
                Transcribe notas de audio para registrar pedidos usando Groq Whisper automáticamente.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-500" />
                <h3 className="font-bold text-sm uppercase tracking-tight">Lógica de Ventas</h3>
              </div>
              <p className="text-xs opacity-70 leading-relaxed">
                Registra pedidos al contado o fiados. El LLM pide los datos faltantes antes de guardar.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-emerald-500" />
                <h3 className="font-bold text-sm uppercase tracking-tight">Exportar a XLSX</h3>
              </div>
              <p className="text-xs opacity-70 leading-relaxed">
                Descarga todos los pedidos en Excel con celdas coloreadas.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Pie de página */}
        <footer className="mt-12 pt-6 border-t border-[#141414] flex justify-between items-center opacity-40">
          <p className="text-[10px] uppercase tracking-widest">© 2026 La Caravana Rosa</p>
          <div className="flex gap-4 font-mono text-[10px]">
            <span>GROQ</span>
            <span>OPENAI</span>
            <span>TELEGRAM</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  const handleLogin = (t: string) => setToken(t);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  return (
    <AnimatePresence mode="wait">
      {token ? (
        <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Dashboard token={token} onLogout={handleLogout} />
        </motion.div>
      ) : (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <LoginScreen onLogin={handleLogin} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
