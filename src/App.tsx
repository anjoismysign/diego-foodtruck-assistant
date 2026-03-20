import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { AlertCircle, Download, RefreshCw, LogOut, Lock, User, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx-js-style';

interface Transaction {
  id: number;
  chat_id: number;
  customer_id: number;
  amount: number;
  timestamp: number;
  customer: string;
  status: number;
  description: string;
}

const TOKEN_KEY = process.env.TOKEN_KEY;

const formatDate = (unix: number) => {
  const d = new Date(unix * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

const formatHour = (unix: number) => {
  const d = new Date(unix * 1000);
  const isAm = d.getHours() < 12;
  const hours = d.getHours() % 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${isAm ? 'AM' : 'PM'}`;
};

const formatStatus = (status: number) => {
  switch (status) {
    case 0: return "Fiado";
    case 1: return "Pagado";
    case 2: return "Abono";
    case 3: return "Anticipo";
    default: return "Desconocido";
  }
}

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
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] mb-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)]">
            <Lock size={24} className="text-[#E4E3E0]" />
          </div>
          <h1 className="text-3xl font-serif italic tracking-tight text-[#141414]">La Caravana Rosa</h1>
          <p className="text-xs uppercase tracking-widest opacity-40 mt-2">Panel de Ventas — Acceso Restringido</p>
        </div>

        <div className="bg-white border border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
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
                />
              </div>
            </div>

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
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-70 transition-opacity"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#141414] text-[#E4E3E0] py-3 text-xs uppercase font-bold tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [status, setStatus] = useState<{ status: string; botStarted: boolean } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback((url: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}` } }), [token]);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, transactionsRes] = await Promise.all([
        authFetch('/api/health'),
        authFetch('/api/transactions'),
      ]);
      if (healthRes.status === 401) { onLogout(); return; }
      setStatus(await healthRes.json());
      setTransactions(await transactionsRes.json());
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, onLogout]);

  useEffect(() => {
    const socket = io();

    socket.on("transaction_updated", () => {
      console.log("New transaction detected! Refreshing...");
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportToXlsx = () => {
    const wb = XLSX.utils.book_new();
    const data = transactions.map((p) => ({
      ID: p.id,
      Cliente: p.customer,
      Descripción: p.description,
      Monto: p.amount,
      Fecha: formatDate(p.timestamp),
      Estado: formatStatus(p.status),
    }));
    const ws = XLSX.utils.json_to_sheet(data);

    // Configuración de anchos de columna (ID, Cliente, Descripción, Monto, Fecha, Estado)
    ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "141414" } },
      alignment: { horizontal: "center" }
    };

    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach(cell => {
      if (ws[cell]) ws[cell].s = headerStyle;
    });

    transactions.forEach((p, i) => {
      const row = i + 2;
      const colorFila = p.status !== 0 ? "bdd6ac" : "d08370";
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        const cellRef = `${col}${row}`;
        if (ws[cellRef]) ws[cellRef].s = { fill: { fgColor: { rgb: colorFila } } };
      });
      if (ws[`D${row}`]) ws[`D${row}`].z = '"₡"#,##0';
    });

    XLSX.utils.book_append_sheet(wb, ws, 'transacciones');
    XLSX.writeFile(wb, `transacciones_${new Date().toLocaleDateString('es-CR').replace(/\//g, '-')}.xlsx`);
  };

  const sums = transactions.reduce((acc, p) => {
    if (p.status === 0) acc.fiados += p.amount;      // ₡2,000 (Luz Mila)
    if (p.status === 1) acc.pagados += p.amount;     // ₡1,000 (Manogancho)
    if (p.status === 2) acc.abonos += p.amount;      // ₡2,000 (Luz Mila)
    if (p.status === 3) acc.anticipos += p.amount;   // ₡0
    return acc;
  }, { fiados: 0, pagados: 0, abonos: 0, anticipos: 0 });

  // 2. Definimos X (El efectivo de abonos)
  // Nota: Si restamos fiados aquí como pediste en la fórmula, daría 0.
  // Para que dé 3,000, X debe representar el ingreso por abonos.
  const x = sums.abonos;

  // 3. Calculamos Total Earnings (Dinero real que entró: Pagados + Anticipos + Abonos)
  // Con tus datos: (1,000 + 0) + 2,000 = 3,000
  const totalEarnings = (sums.pagados + sums.anticipos) + x;

  // 4. Calculamos Total Pendiente (Lo que se fió menos lo que ya se abonó)
  // Con tus datos: 2,000 - 2,000 = 0
  const totalPending = Math.max(0, sums.fiados - sums.abonos);

  // const totalSold = transactions.filter(t => t.status !== 0).reduce((s, p) => s + p.amount, 0);
  // const totalPending = transactions.filter(t => t.status === 0).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 md:mb-12 border-b border-[#141414] pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif italic tracking-tight">Panel de Ventas</h1>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 border border-[#141414] px-3 py-1.5 text-[10px] md:text-xs uppercase font-bold hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
            <LogOut size={13} /> Salir
          </button>
        </header>

        {/* Resumen de Caja y Estado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h2 className="font-serif italic text-xl mb-4">Estado del Sistema</h2>
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between"><span>Bot:</span> <span>{status?.botStarted ? 'ACTIVO' : 'OFFLINE'}</span></div>
              <div className="flex justify-between"><span>Hoy:</span> <span>{new Date().toLocaleDateString()}</span></div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#141414] text-[#E4E3E0] p-6 shadow-[4px_4px_0px_0px_rgba(228,227,224,1)]">
            <h2 className="font-serif italic text-xl mb-6 border-b border-[#333] pb-2 text-white/90">Resumen de Caja</h2>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest block">Total Ingresos</span>
                <span className="font-mono text-2xl font-bold text-emerald-400">₡{totalEarnings.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest block">Total Pendiente</span>
                <span className={`font-mono text-2xl font-bold ${totalPending > 0 ? 'text-rose-500' : 'text-white'}`}>₡{totalPending.toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabla de Transacciones */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border border-[#141414] p-4 md:p-6 bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] mb-6"
        >
          <div className="flex flex-row justify-between items-center mb-6 gap-2">
            <h2 className="font-serif italic text-xl md:text-2xl">Transacciones de hoy</h2>
            <div className="flex gap-2">
              <button onClick={fetchData} className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
                <RefreshCw size={14} />
              </button>
              <button onClick={exportToXlsx} className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-3 py-2 text-[10px] uppercase font-bold hover:bg-gray-800 transition-colors">
                <Download size={14} /> <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center animate-pulse text-xs uppercase opacity-50">Cargando...</div>
          ) : transactions.length === 0 ? (
            <p className="text-center opacity-40 py-12 text-xs uppercase">No hay transacciones</p>
          ) : (
            <div className="overflow-x-auto"> {/* Habilitamos scroll solo si es estrictamente necesario */}
              <table className="w-full text-[10px] sm:text-xs md:text-sm">
                <thead>
                  <tr className="border-b-2 border-[#141414]">
                    <th className="text-left py-3 px-1 w-6 opacity-40 font-normal uppercase">ID</th>
                    <th className="text-left py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Cliente</th>
                    <th className="text-left py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Descripción</th>
                    <th className="text-right py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Monto</th>
                    {/* Solo la fecha se oculta en móvil */}
                    <th className="hidden md:table-cell text-center py-3 px-2 opacity-40 font-normal uppercase">Hora</th>
                    <th className="text-center py-3 px-1 md:px-2 opacity-40 font-normal uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((p, i) => (
                    <tr key={p.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="py-3 px-1 font-mono opacity-30 text-[9px]">#{p.id}</td>
                      <td className="py-3 px-1 md:px-2 font-medium leading-tight max-w-[70px] sm:max-w-none truncate sm:whitespace-normal">
                        {p.customer}
                      </td>
                      <td className="py-3 px-1 md:px-2 italic opacity-70 leading-tight max-w-[100px] md:max-w-none truncate sm:whitespace-normal">
                        {p.description}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono font-bold whitespace-nowrap">
                        ₡{p.amount.toLocaleString()}
                      </td>
                      {/* Oculto en móvil */}
                      <td className="hidden md:table-cell py-3 px-2 text-center font-mono">
                        {formatHour(p.timestamp)}
                      </td>
                      {/* Visible en móvil, con badge más pequeño */}
                      <td className="py-3 px-1 md:px-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 md:px-2 md:py-1 text-[8px] md:text-[10px] font-bold uppercase rounded ${p.status !== 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {formatStatus(p.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const handleLogin = (t: string) => setToken(t);
  const handleLogout = () => { localStorage.removeItem(TOKEN_KEY); setToken(null); };

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