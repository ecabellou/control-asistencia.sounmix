import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            console.log("Intentando login para:", email);
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            if (authError) throw authError;
            localStorage.setItem('token', data.session.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = '/';
        } catch (err) {
            console.error("Error en login:", err);
            const errorMsg = err.message || 'Error al iniciar sesión';
            if (errorMsg.toLowerCase().includes('confirm')) {
                setError('Por favor revisa tu email para confirmar la cuenta (o desactiva la confirmación en Supabase).');
            } else {
                setError(errorMsg + ' (Verifica email y clave)');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 overflow-hidden font-sans">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl relative z-10"
            >
                <div className="text-center mb-8">
                    <img src={logo} alt="SounMix Logo" className="h-16 mx-auto mb-6 brightness-110 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
                    <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Panel Administrativo</h2>
                    <p className="text-slate-400 text-sm">Sistema de Gestión de Personal</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Email Corporativo</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                placeholder="usuario@sounmix.cl"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Contraseña</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                                className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {error && (
                        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl flex items-center space-x-3 text-sm">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </motion.div>
                    )}

                    <button
                        type="submit" disabled={loading}
                        className="group w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                        <span>{loading ? 'Autenticando...' : 'Entrar al Panel'}</span>
                        {!loading && <LogIn className="group-hover:translate-x-1 transition-transform" size={18} />}
                    </button>
                </form>

                <div className="mt-10 pt-6 border-t border-white/5 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                        Powered by SounMix Chile &bull; 2026
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
