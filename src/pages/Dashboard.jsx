import React, { useEffect, useState } from 'react';
import { Users, Clock, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';

const Dashboard = () => {
    const [stats, setStats] = useState([
        { label: 'Total Trabajadores', value: '-', icon: <Users size={20} />, color: 'blue' },
        { label: 'Presentes Hoy', value: '-', icon: <Clock size={20} />, color: 'green' },
        { label: 'Alertas Pendientes', value: '-', icon: <AlertCircle size={20} />, color: 'red' },
        { label: 'Cumplimiento', value: '-', icon: <CheckCircle2 size={20} />, color: 'indigo' },
    ]);
    const [recentAlerts, setRecentAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Usando Edge Function de Supabase
                const res = await axios.get('https://twyndowkjummyjoouqnf.supabase.co/functions/v1/get-dashboard-stats', {
                    headers: {
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    }
                });
                const apiStats = res.data.stats;
                setStats(prev => prev.map((s, i) => ({ ...s, value: apiStats[i].value })));
                setRecentAlerts(res.data.recentAlerts);
            } catch (err) {
                console.error("Error cargando dashboard", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    return (
        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {stats.map((stat, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                        key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center 
                            ${stat.color === 'blue' ? 'bg-blue-50 text-blue-600' : ''}
                            ${stat.color === 'green' ? 'bg-green-50 text-green-600' : ''}
                            ${stat.color === 'red' ? 'bg-red-50 text-red-600' : ''}
                            ${stat.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' : ''}
                        `}>
                            {stat.icon}
                        </div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold text-slate-800">
                            {loading ? <span className="animate-pulse">...</span> : stat.value}
                        </p>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800">Alertas Recientes</h3>
                        <span className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">Ver todas</span>
                    </div>
                    <div className="space-y-4">
                        {loading ? (
                            <p className="text-center text-slate-400 py-4">Cargando alertas...</p>
                        ) : recentAlerts.length > 0 ? (
                            recentAlerts.map((alert, idx) => (
                                <div key={idx} className="flex items-center space-x-4 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                    <div className={`w-2 h-2 rounded-full ${alert.type === 'error' ? 'bg-red-500' : alert.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">{alert.user}</p>
                                        <p className="text-xs text-slate-500">{alert.msg}</p>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{alert.time}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-slate-400 py-4 text-sm italic italic">Sin alertas pendientes hoy</p>
                        )}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                    <TrendingUp className="text-slate-200 mb-4" size={64} />
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Resumen Semanal</h3>
                    <p className="text-sm text-slate-500 max-w-xs mb-6">El promedio de horas extras esta semana se mantiene un 5% bajo el límite de la Ley 40 Horas.</p>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} className="h-full bg-green-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-500 mt-2">65% del límite ocupado</p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
