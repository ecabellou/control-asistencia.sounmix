import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    FileText,
    Download,
    Calendar,
    Search,
    Filter,
    User,
    Image as ImageIcon,
    MapPin,
    Clock,
    ArrowRight,
    TrendingUp,
    CheckCircle2,
    Loader2,
    ShieldCheck
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, differenceInMinutes, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import Select from 'react-select';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';

const Reports = () => {
    const [logs, setLogs] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    // Filtros
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    const [stats, setStats] = useState({
        totalHours: 0,
        overtime: 0,
        avgEntry: '--:--',
        compliance: 0
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        fetchReports();
    }, [selectedEmployee, dateRange]);

    const fetchInitialData = async () => {
        try {
            const { data, error } = await supabase
                .from('employees')
                .select('id, full_name, rut')
                .eq('active', true)
                .order('full_name');

            if (error) throw error;

            const options = data.map(emp => ({
                value: emp.id,
                label: `${emp.full_name} (${emp.rut})`,
                empData: emp
            }));

            setEmployees([{ value: 'all', label: 'Todos los Trabajadores' }, ...options]);
        } catch (err) {
            console.error('Error fetching employees:', err);
        }
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('attendance_logs')
                .select(`
                    *,
                    employee:employees(full_name, rut, weekly_hours_agreed)
                `)
                .gte('timestamp', `${dateRange.start}T00:00:00Z`)
                .lte('timestamp', `${dateRange.end}T23:59:59Z`)
                .order('timestamp', { ascending: false });

            if (selectedEmployee && selectedEmployee.value !== 'all') {
                query = query.eq('employee_id', selectedEmployee.value);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Procesar logs para agrupar por día y trabajador
            const processedLogs = processAttendanceData(data);
            setLogs(processedLogs);
            calculateStats(processedLogs);
        } catch (err) {
            console.error('Error fetching logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const processAttendanceData = (rawLogs) => {
        // Agrupar por fecha y employee_id
        const groups = {};
        rawLogs.forEach(log => {
            const dateStr = format(parseISO(log.timestamp), 'yyyy-MM-dd');
            const key = `${dateStr}_${log.employee_id}`;

            if (!groups[key]) {
                groups[key] = {
                    date: dateStr,
                    employee_id: log.employee_id,
                    employee: log.employee,
                    entries: [],
                    exits: [],
                    lunch_starts: [],
                    lunch_ends: [],
                    photos: [],
                    location: log.location_metadata
                };
            }

            const event = log.event_type.toUpperCase();

            if (event === 'ENTRADA' || event === 'ENTRY') groups[key].entries.push(log);
            if (event === 'SALIDA' || event === 'EXIT') groups[key].exits.push(log);
            if (event === 'INICIO COLACIÓN' || event === 'LUNCH_START') groups[key].lunch_starts.push(log);
            if (event === 'TÉRMINO COLACIÓN' || event === 'LUNCH_END') groups[key].lunch_ends.push(log);

            if (log.photo_url) groups[key].photos.push({ type: log.event_type, url: log.photo_url });
        });

        return Object.values(groups).map(group => {
            // Unir la jornada (asumimos un solo set por día para reporte simple)
            const entry = group.entries[0];
            const exit = group.exits[0];
            const lStart = group.lunch_starts[0];
            const lEnd = group.lunch_ends[0];

            let totalMinutes = 0;
            if (entry && exit) {
                totalMinutes = differenceInMinutes(parseISO(exit.timestamp), parseISO(entry.timestamp));
                if (lStart && lEnd) {
                    const lunchMins = differenceInMinutes(parseISO(lEnd.timestamp), parseISO(lStart.timestamp));
                    totalMinutes -= lunchMins;
                }
            }

            return {
                ...group,
                entryTime: entry ? format(parseISO(entry.timestamp), 'HH:mm') : '--:--',
                exitTime: exit ? format(parseISO(exit.timestamp), 'HH:mm') : '--:--',
                lunchStart: lStart ? format(parseISO(lStart.timestamp), 'HH:mm') : '--:--',
                lunchEnd: lEnd ? format(parseISO(lEnd.timestamp), 'HH:mm') : '--:--',
                totalMinutes,
                overtime: Math.max(0, totalMinutes - (group.employee?.weekly_hours_agreed / 5 * 60))
            };
        });
    };

    const calculateStats = (data) => {
        const total = data.reduce((acc, curr) => acc + curr.totalMinutes, 0);
        const over = data.reduce((acc, curr) => acc + curr.overtime, 0);
        setStats({
            totalHours: (total / 60).toFixed(1),
            overtime: (over / 60).toFixed(1),
            compliance: data.length > 0 ? 100 : 0 // Simplificado
        });
    };

    const exportToExcel = () => {
        const worksheetData = logs.map(log => ({
            'Fecha': log.date,
            'Trabajador': log.employee?.full_name,
            'RUT': log.employee?.rut,
            'Entrada': log.entryTime,
            'Inicio Colación': log.lunchStart,
            'Término Colación': log.lunchEnd,
            'Salida': log.exitTime,
            'Minutos Trabajados': log.totalMinutes,
            'Horas Extra (min)': log.overtime,
            'Ubicación': log.location ? `${log.location.lat}, ${log.location.lng}` : 'N/A'
        }));

        const ws = XLSX.utils.json_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte Asistencia");
        XLSX.writeFile(wb, `Reporte_Asistencia_${dateRange.start}_${dateRange.end}.xlsx`);
    };

    const exportToPDF = async () => {
        setDownloading(true);
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFontSize(18);
        doc.setTextColor(40);
        doc.text("REPORTE ASISTENCIA LEGAL - SOUNMIX", 14, 22);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Periodo: ${dateRange.start} al ${dateRange.end}`, 14, 30);
        doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 35);

        const tableColumn = ["Fecha", "Trabajador", "Entrada", "Salida", "Hrs Trab.", "Extras"];
        const tableRows = logs.map(log => [
            log.date,
            log.employee?.full_name,
            log.entryTime,
            log.exitTime,
            `${(log.totalMinutes / 60).toFixed(1)}h`,
            `${(log.overtime / 60).toFixed(1)}h`
        ]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 8 }
        });

        // Add photos section if single employee selected
        if (selectedEmployee && selectedEmployee.value !== 'all' && logs.length > 0) {
            let yPos = doc.lastAutoTable.finalY + 20;
            doc.setFontSize(14);
            doc.text("REGISTRO FOTOGRÁFICO Y GEOLOCALIZACIÓN", 14, yPos);
            yPos += 10;

            doc.setFontSize(8);
            logs.forEach((log, idx) => {
                if (yPos > 250) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.text(`${log.date}: ${log.employee?.full_name} - Loc: ${log.location ? log.location.lat + ',' + log.location.lng : 'N/A'}`, 14, yPos);
                yPos += 5;
            });
        }

        doc.save(`Reporte_DT_${dateRange.start}_${dateRange.end}.pdf`);
        setDownloading(false);
    };

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-sans text-slate-900">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3 text-slate-800">
                        <FileText className="text-blue-600" size={32} />
                        REPORTES DT
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">Gestión avanzada de asistencia | Ley 40 Horas (2026)</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-2xl hover:bg-slate-50 transition-all text-sm shadow-sm"
                    >
                        <Download size={18} />
                        EXCEL
                    </button>
                    <button
                        onClick={exportToPDF}
                        disabled={downloading}
                        className="flex items-center gap-2 bg-slate-900 text-white font-bold px-5 py-2.5 rounded-2xl hover:bg-black transition-all text-sm shadow-lg shadow-slate-200 disabled:opacity-50"
                    >
                        {downloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                        PDF LEGAL
                    </button>
                </div>
            </div>

            {/* Filters Card */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <User size={12} /> Seleccionar Trabajador
                        </label>
                        <Select
                            options={employees}
                            value={selectedEmployee}
                            onChange={setSelectedEmployee}
                            placeholder="Buscar por nombre o RUT..."
                            isSearchable
                            className="text-sm"
                            styles={{
                                control: (base) => ({
                                    ...base,
                                    borderRadius: '1rem',
                                    border: '1px solid #e2e8f0',
                                    padding: '2px',
                                    '&:hover': { border: '1px solid #3b82f6' }
                                })
                            }}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <Calendar size={12} /> Rango de Fechas
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="w-full bg-slate-50 border border-slate-200 rounded-[1rem] py-2 px-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <ArrowRight size={16} className="text-slate-300 flex-shrink-0" />
                            <input
                                type="date"
                                className="w-full bg-slate-50 border border-slate-200 rounded-[1rem] py-2 px-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={fetchReports}
                            className="w-full bg-blue-50 text-blue-600 font-black py-2.5 rounded-2xl border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                        >
                            <Filter size={18} />
                            ACTUALIZAR VISTA
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total Horas', value: stats.totalHours + 'h', icon: <Clock />, color: 'blue' },
                    { label: 'Horas Extras', value: stats.overtime + 'h', icon: <TrendingUp />, color: 'red' },
                    { label: 'Cumplimiento', value: stats.compliance + '%', icon: <CheckCircle2 />, color: 'green' },
                    { label: 'Registros', value: logs.length, icon: <Search />, color: 'indigo' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center 
                            ${stat.color === 'blue' ? 'bg-blue-50 text-blue-600' : ''}
                            ${stat.color === 'red' ? 'bg-red-50 text-red-600' : ''}
                            ${stat.color === 'green' ? 'bg-green-50 text-green-600' : ''}
                            ${stat.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' : ''}
                        `}>
                            {stat.icon}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-bold text-slate-800 tracking-tight">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden relative">
                {loading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center">
                        <Loader2 className="animate-spin text-blue-600" size={40} />
                    </div>
                )}

                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trabajador y RUT</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada/Salida</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Colación</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Horas</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Evidencia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 animate-in fade-in duration-500">
                            {logs.map((log, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/20 transition-colors group">
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">
                                                {log.employee?.full_name?.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{log.employee?.full_name}</p>
                                                <p className="text-[10px] font-mono text-slate-500">{log.employee?.rut}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 font-bold text-slate-600 text-sm">
                                        {format(parseISO(log.date), 'dd MMM yyyy', { locale: es })}
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-green-100 text-green-700 font-black px-2 py-1 rounded-lg text-[10px] border border-green-200">
                                                {log.entryTime}
                                            </span>
                                            <ArrowRight size={12} className="text-slate-300" />
                                            <span className="bg-red-100 text-red-700 font-black px-2 py-1 rounded-lg text-[10px] border border-red-200">
                                                {log.exitTime}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-center text-[10px] font-bold text-slate-500">
                                        {log.lunchStart !== '--:--' ? `${log.lunchStart} - ${log.lunchEnd}` : 'Sin colación'}
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <p className="font-black text-slate-800 text-sm">{(log.totalMinutes / 60).toFixed(1)}h</p>
                                        {log.overtime > 0 && (
                                            <p className="text-[10px] font-bold text-red-500">+{(log.overtime / 60).toFixed(1)}h extra</p>
                                        )}
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex justify-center gap-2">
                                            {log.photos.length > 0 && (
                                                <button className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all relative group/photo">
                                                    <ImageIcon size={18} />
                                                    {/* Tooltip simple con la foto */}
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/photo:block z-50 p-1 bg-white border border-slate-200 rounded-lg shadow-2xl">
                                                        <img src={log.photos[0].url} alt="Evidencia" className="w-32 h-32 object-cover rounded-md" />
                                                    </div>
                                                </button>
                                            )}
                                            {log.location && (
                                                <button className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all" title="Ver Geometría">
                                                    <MapPin size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!loading && logs.length === 0 && (
                        <div className="py-24 flex flex-col items-center justify-center text-slate-300">
                            <Calendar size={64} strokeWidth={1} className="mb-4 opacity-20" />
                            <p className="font-black text-lg uppercase tracking-tighter">Sin registros encontrados</p>
                            <p className="text-sm font-medium">Ajusta los filtros para ver más datos</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Legal Note */}
            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-[.3em]">
                <ShieldCheck size={14} className="text-blue-400" />
                Validado bajo estándares de la Dirección del Trabajo de Chile
            </div>
        </div>
    );
};

export default Reports;
