import React, { useEffect, useState } from 'react';
import {
    Users,
    Clock,
    AlertCircle,
    CheckCircle2,
    TrendingUp,
    UserCheck,
    Coffee,
    LogOut,
    Search,
    RefreshCw,
    Activity,
    ShieldCheck,
    Timer,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { format, parseISO, differenceInMinutes, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

const Dashboard = () => {
    const [workersStatus, setWorkersStatus] = useState([]);
    const [stats, setStats] = useState({
        total: 0,
        present: 0,
        inLunch: 0,
        inactive: 0
    });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        fetchDashboardData();
        return () => clearInterval(timer);
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const today = startOfDay(new Date()).toISOString();

            const { data: employees, error: empError } = await supabase
                .from('employees')
                .select('id, full_name, rut, weekly_hours_agreed')
                .eq('active', true)
                .order('full_name');

            if (empError) throw empError;

            const { data: logs, error: logsError } = await supabase
                .from('attendance_logs')
                .select('*')
                .gte('timestamp', today)
                .order('timestamp', { ascending: true });

            if (logsError) throw logsError;

            const statusMap = employees.map(emp => {
                const empLogs = logs.filter(l => l.employee_id === emp.id);

                let currentState = 'INACTIVO';
                let entryTime = null;
                let exitTime = null;
                let lunchStart = null;
                let lunchEnd = null;
                let totalMinutes = 0;

                empLogs.forEach(l => {
                    const event = l.event_type.toUpperCase();
                    if (event === 'ENTRY' || event === 'ENTRADA') {
                        entryTime = l.timestamp;
                        currentState = 'ACTIVO';
                    }
                    if (event === 'LUNCH_START' || event === 'INICIO COLACIÓN') {
                        lunchStart = l.timestamp;
                        currentState = 'COLACIÓN';
                    }
                    if (event === 'LUNCH_END' || event === 'TÉRMINO COLACIÓN') {
                        lunchEnd = l.timestamp;
                        currentState = 'ACTIVO';
                    }
                    if (event === 'EXIT' || event === 'SALIDA') {
                        exitTime = l.timestamp;
                        currentState = 'FINALIZADO';
                    }
                });

                if (entryTime) {
                    const endRange = exitTime ? parseISO(exitTime) : new Date();
                    totalMinutes = differenceInMinutes(endRange, parseISO(entryTime));

                    if (lunchStart && lunchEnd) {
                        totalMinutes -= differenceInMinutes(parseISO(lunchEnd), parseISO(lunchStart));
                    } else if (lunchStart && !lunchEnd && !exitTime) {
                        totalMinutes -= differenceInMinutes(new Date(), parseISO(lunchStart));
                    }
                }

                return {
                    ...emp,
                    state: currentState,
                    entryTime: entryTime ? format(parseISO(entryTime), 'HH:mm') : null,
                    exitTime: exitTime ? format(parseISO(exitTime), 'HH:mm') : null,
                    accumulatedHours: (Math.max(0, totalMinutes) / 60).toFixed(1),
                    overtime: Math.max(0, (totalMinutes - ((emp.weekly_hours_agreed || 44) / 5 * 60)) / 60).toFixed(1)
                };
            });

            setWorkersStatus(statusMap);
            setStats({
                total: employees.length,
                present: statusMap.filter(w => w.state === 'ACTIVO').length,
                inLunch: statusMap.filter(w => w.state === 'COLACIÓN').length,
                inactive: statusMap.filter(w => w.state === 'INACTIVO' || w.state === 'FINALIZADO').length
            });

        } catch (err) {
            console.error("Error Dashboard:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredWorkers = workersStatus.filter(w =>
        w.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.rut.includes(searchTerm)
    );

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-sans">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter text-slate-800 flex items-center gap-3">
                        <Activity className="text-blue-600 animate-pulse" size={32} />
                        MONITOR EN TIEMPO REAL
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">
                        Control de asistencia en vivo - {format(currentTime, "MMMM dd, yyyy | HH:mm", { locale: es })}
                    </p>
                </div>

                <div className="flex items-center gap-4 w-full lg:w-auto">
                    <div className="relative flex-1 lg:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar trabajador..."
                            className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchDashboardData} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total', value: stats.total, icon: <Users />, color: 'blue' },
                    { label: 'Presentes', value: stats.present, icon: <UserCheck />, color: 'green' },
                    { label: 'Almuerzo', value: stats.inLunch, icon: <Coffee />, color: 'amber' },
                    { label: 'Fuera', value: stats.inactive, icon: <LogOut />, color: 'slate' },
                ].map((s, i) => (
                    <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${s.color === 'blue' ? 'bg-blue-50 text-blue-600' : s.color === 'green' ? 'bg-green-50 text-green-600' : s.color === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'}`}>
                            {s.icon}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                            <p className="text-xl font-bold text-slate-800">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                    {filteredWorkers.map((worker) => (
                        <motion.div
                            key={worker.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            layout
                            className={`relative bg-white p-6 rounded-[2rem] border transition-all duration-500 overflow-hidden shadow-xl
                                ${worker.state === 'ACTIVO' ? 'border-green-100 shadow-green-100/50' :
                                    worker.state === 'COLACIÓN' ? 'border-amber-100 shadow-amber-100/50' :
                                        'border-slate-100 shadow-slate-100/50'}`}
                        >
                            <div className={`absolute top-6 right-6 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest leading-none border
                                ${worker.state === 'ACTIVO' ? 'bg-green-50 text-green-600 border-green-100' :
                                    worker.state === 'COLACIÓN' ? 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse' :
                                        'bg-slate-50 text-slate-500 border-slate-100'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${worker.state === 'ACTIVO' ? 'bg-green-500' : worker.state === 'COLACIÓN' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                {worker.state}
                            </div>

                            <div className="flex flex-col h-full justify-between gap-6">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-sm">
                                            {worker.full_name?.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-lg tracking-tight truncate max-w-[140px]">{worker.full_name}</h3>
                                            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{worker.rut}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-50 text-center">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[.2em] mb-1">Entrada</p>
                                            <p className="font-bold text-slate-700 text-xs">{worker.entryTime || '--:--'}</p>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-50 text-center">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[.2em] mb-1">Salida</p>
                                            <p className="font-bold text-slate-700 text-xs">{worker.exitTime || '--:--'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-slate-50">
                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                <Timer size={10} /> Horas Hoy
                                            </p>
                                            <p className="text-2xl font-black text-slate-800 tracking-tighter">
                                                {worker.accumulatedHours}<span className="text-xs font-medium text-slate-400 ml-1">hrs</span>
                                            </p>
                                        </div>
                                        {worker.overtime > 0 && (
                                            <div className="text-right">
                                                <p className="text-[8px] font-black text-red-400 uppercase tracking-widest">Extra</p>
                                                <p className="text-sm font-black text-red-500">+{worker.overtime}h</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, (parseFloat(worker.accumulatedHours) / 8) * 100)}%` }}
                                            className={`h-full ${parseFloat(worker.accumulatedHours) >= 8 ? 'bg-blue-600' : 'bg-green-500'}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {loading && filteredWorkers.length === 0 && (
                <div className="py-24 flex flex-col items-center justify-center text-slate-300">
                    <Loader2 className="animate-spin text-blue-600" size={48} />
                    <p className="mt-4 font-black text-sm uppercase tracking-widest animate-pulse">Sincronizando...</p>
                </div>
            )}

            <div className="mt-12 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-[.3em]">
                <ShieldCheck size={14} className="text-blue-400" /> Monitor SounMix SpA v2.8.1
            </div>
        </div>
    );
};

export default Dashboard;
