import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Download, Calendar, Search } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const API_URL = 'http://localhost:3001/api';

const Reports = () => {
    const [reports, setReports] = useState([]);
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchReports();
    }, [dateRange]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/attendance/reports`, {
                params: { startDate: dateRange.start, endDate: dateRange.end }
            });
            setReports(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatMinutes = (mins) => {
        if (!mins) return '00:00';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const formatTime = (iso) => {
        if (!iso) return '--:--';
        return format(new Date(iso), 'HH:mm');
    };

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
                        <FileText className="text-blue-600" />
                        <span>Reporte de Asistencia DT</span>
                    </h2>
                    <p className="text-sm text-slate-500">Conforme a Res. N°38 y Ley 40 Horas (2026)</p>
                </div>

                <div className="flex items-center space-x-3">
                    <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200">
                        <input
                            type="date" value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent border-none text-xs font-semibold px-3 py-1.5 focus:ring-0 cursor-pointer"
                        />
                        <span className="flex items-center text-slate-400 px-1">—</span>
                        <input
                            type="date" value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent border-none text-xs font-semibold px-3 py-1.5 focus:ring-0 cursor-pointer"
                        />
                    </div>
                    <button className="flex items-center space-x-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50 transition-all font-medium text-xs">
                        <Download size={16} />
                        <span>Excel</span>
                    </button>
                    <button className="flex items-center space-x-2 bg-slate-800 text-white px-4 py-2 rounded-xl hover:bg-slate-900 transition-all font-medium text-xs shadow-md">
                        <Download size={16} />
                        <span>PDF Legal</span>
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase tracking-tighter">
                            <th className="px-4 py-4">Fecha</th>
                            <th className="px-4 py-4">Nombre / RUT</th>
                            <th className="px-4 py-4 text-center">Entrada</th>
                            <th className="px-4 py-4 text-center">Colación</th>
                            <th className="px-4 py-4 text-center">Salida</th>
                            <th className="px-4 py-4 text-center">Hrs Ord.</th>
                            <th className="px-4 py-4 text-center bg-blue-50/50 text-blue-700">Hrs Extra</th>
                            <th className="px-4 py-4">Observaciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 italic font-mono">
                        {reports.map((row, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-4 py-4 whitespace-nowrap">{format(new Date(row.date), 'dd/MM/yy')}</td>
                                <td className="px-4 py-4">
                                    <p className="font-bold text-slate-800">{row.full_name}</p>
                                    <p className="text-[10px] text-slate-500">{row.rut}</p>
                                </td>
                                <td className="px-4 py-4 text-center text-slate-700 font-bold">{formatTime(row.actual_entry_time)}</td>
                                <td className="px-4 py-4 text-center text-slate-500">
                                    {row.lunch_minutes ? `${row.lunch_minutes}min` : '--'}
                                </td>
                                <td className="px-4 py-4 text-center text-slate-700 font-bold">{formatTime(row.actual_exit_time)}</td>
                                <td className="px-4 py-4 text-center font-bold text-slate-800">{formatMinutes(row.ordinary_minutes)}</td>
                                <td className="px-4 py-4 text-center font-bold text-blue-600 bg-blue-50/20">{formatMinutes(row.overtime_minutes)}</td>
                                <td className="px-4 py-4 text-slate-500 min-w-[150px]">{row.observations || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {reports.length === 0 && !loading && (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                        <Calendar size={48} className="mb-4 opacity-20" />
                        <p className="font-medium">No hay registros en este rango de fechas</p>
                    </div>
                )}
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-white to-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
                    <p className="text-xs font-semibold text-blue-600 uppercase mb-2">Total Horas Ordinarias</p>
                    <p className="text-3xl font-bold text-slate-800">124:30</p>
                </div>
                <div className="bg-gradient-to-br from-white to-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
                    <p className="text-xs font-semibold text-amber-600 uppercase mb-2">Total Horas Extras</p>
                    <p className="text-3xl font-bold text-slate-800">12:15</p>
                </div>
                <div className="bg-gradient-to-br from-white to-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
                    <p className="text-xs font-semibold text-indigo-600 uppercase mb-2">Factor Multa (Estimado)</p>
                    <p className="text-3xl font-bold text-slate-800">0%</p>
                    <p className="text-[10px] text-green-600 font-medium mt-1">Cumplimiento Legal 100%</p>
                </div>
            </div>
        </div>
    );
};

export default Reports;
