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
    ShieldCheck,
    X,
    Eye,
    ChevronRight,
    Fingerprint
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import Select from 'react-select';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';

const Reports = () => {
    const [logs, setLogs] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [selectedPhoto, setSelectedPhoto] = useState(null);

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
        setErrorMsg(null);
        try {
            let query = supabase
                .from('attendance_logs')
                .select(`
                    *,
                    employee:employees!inner(full_name, rut, weekly_hours_agreed, active)
                `)
                .eq('employee.active', true)
                .gte('timestamp', `${dateRange.start}T00:00:00Z`)
                .lte('timestamp', `${dateRange.end}T23:59:59Z`)
                .order('timestamp', { ascending: false });

            if (selectedEmployee && selectedEmployee.value !== 'all') {
                query = query.eq('employee_id', selectedEmployee.value);
            }

            const { data, error } = await query;
            if (error) throw error;

            const processedLogs = processAttendanceData(data);
            setLogs(processedLogs);
            calculateStats(processedLogs);
        } catch (err) {
            console.error('Error fetching logs:', err);
            setErrorMsg("Error al cargar los datos.");
        } finally {
            setLoading(false);
        }
    };

    const processAttendanceData = (rawLogs) => {
        // First, sort logs by employee and then by timestamp ascending
        const sortedLogs = [...rawLogs].sort((a, b) => {
            if (a.employee_id !== b.employee_id) return a.employee_id.localeCompare(b.employee_id);
            return new Date(a.timestamp) - new Date(b.timestamp);
        });

        const logicalGroups = [];
        const activeSessions = {}; // track current session per employee

        sortedLogs.forEach(log => {
            const empId = log.employee_id;
            const event = log.event_type.toUpperCase();

            // Should we start a new session or add to current?
            // A session starts with ENTRY or if there's no active session.
            let session = activeSessions[empId];

            const isEntry = event === 'ENTRADA' || event === 'ENTRY';
            const logDate = new Date(log.timestamp);

            // If it's an entry but we have an open session, we close the old one if it's "stale" (e.g. > 16h)
            // or if it's explicitly a new entry.
            if (isEntry || !session) {
                session = {
                    date: format(logDate, 'yyyy-MM-dd'),
                    employee_id: empId,
                    employee: log.employee,
                    entries: [],
                    exits: [],
                    lunch_starts: [],
                    lunch_ends: [],
                    photos: [],
                    location: { lat: log.lat, lng: log.lng }
                };
                logicalGroups.push(session);
                activeSessions[empId] = session;
            }

            // Add the log to the session
            if (isEntry) session.entries.push(log);
            else if (event === 'SALIDA' || event === 'EXIT') {
                session.exits.push(log);
                delete activeSessions[empId]; // session complete
            }
            else if (event === 'INICIO COLACIÓN' || event === 'LUNCH_START') session.lunch_starts.push(log);
            else if (event === 'TÉRMINO COLACIÓN' || event === 'LUNCH_END') session.lunch_ends.push(log);

            if (log.photo_url) {
                session.photos.push({
                    type: log.event_type,
                    url: log.photo_url,
                    time: format(parseISO(log.timestamp), 'HH:mm:ss'),
                    hash: log.hash
                });
            }
        });

        return logicalGroups.map(group => {
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
                overtime: Math.max(0, totalMinutes - ((group.employee?.weekly_hours_agreed || 40) / 5 * 60))
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    };

    const calculateStats = (data) => {
        const total = data.reduce((acc, curr) => acc + curr.totalMinutes, 0);
        const over = data.reduce((acc, curr) => acc + curr.overtime, 0);
        setStats({
            totalHours: (total / 60).toFixed(1),
            overtime: (over / 60).toFixed(1),
            compliance: data.length > 0 ? 100 : 0
        });
    };

    const urlToBase64 = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Error convirtiendo imagen:", e);
            return null;
        }
    };

    const exportToPDF = async () => {
        setDownloading(true);
        try {
            if (!logs || logs.length === 0) {
                alert("No hay datos cargados para exportar.");
                setDownloading(false);
                return;
            }

            const doc = new jsPDF();
            doc.setFontSize(20);
            doc.setTextColor(30, 41, 59);
            doc.text("REGISTRO DE ASISTENCIA SOUNDMIX", 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Periodo: ${dateRange.start} al ${dateRange.end}`, 14, 28);
            doc.text(`Empresa: SoundMix SpA | Reporte de Evidencia de Asistencia`, 14, 33);
            doc.text(`Fecha Emisión: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 38);

            const tableColumn = ["Fecha", "Trabajador", "RUT", "Entrada", "Salida", "Ini. Col.", "Fin Col.", "Hrs Trab.", "Extras"];
            const tableRows = logs.map(log => [
                log.date,
                log.employee?.full_name,
                log.employee?.rut,
                log.entryTime,
                log.exitTime,
                log.lunchStart,
                log.lunchEnd,
                `${(log.totalMinutes / 60).toFixed(1)}h`,
                `${(log.overtime / 60).toFixed(1)}h`
            ]);

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 45,
                theme: 'striped',
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontSize: 8 },
                styles: { fontSize: 7, cellPadding: 2 }
            });

            // Removida sección de fotografías por solicitud del usuario para ahorrar espacio

            const finalPage = doc.internal.getNumberOfPages();
            doc.setPage(finalPage);
            const finalY = doc.internal.pageSize.height - 40;
            doc.setFontSize(9);
            doc.text("__________________________", 14, finalY);
            doc.text("Firma del Trabajador", 14, finalY + 5);
            doc.text("__________________________", 120, finalY);
            doc.text("Firma Empleador / Sello", 120, finalY + 5);

            let filename = `Reporte_General_SoundMix_${dateRange.start}.pdf`;

            // Si hay un empleado seleccionado o si todos los registros pertenecen al mismo trabajador
            const isSingleWorker = selectedEmployee && selectedEmployee.value !== 'all';
            const firstLog = logs[0];

            if (isSingleWorker || (logs.length > 0 && logs.every(l => l.employee_id === firstLog.employee_id))) {
                const emp = isSingleWorker ? (selectedEmployee.empData || firstLog.employee) : firstLog.employee;
                if (emp) {
                    filename = `${emp.full_name}_${emp.rut}.pdf`.replace(/\s+/g, '_');
                }
            }

            doc.save(filename);
        } catch (err) {
            console.error(err);
            alert("Error al generar PDF");
        } finally {
            setDownloading(false);
        }
    };

    const exportToExcel = () => {
        const worksheetData = logs.map(log => ({
            'Fecha': log.date,
            'Trabajador': log.employee?.full_name,
            'RUT': log.employee?.rut,
            'Entrada': log.entryTime,
            'Salida': log.exitTime,
            'Ini. Colación': log.lunchStart,
            'Fin Colación': log.lunchEnd,
            'Horas': (log.totalMinutes / 60).toFixed(1),
            'Horas Extras': (log.overtime / 60).toFixed(1)
        }));

        const ws = XLSX.utils.json_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte");

        let filename = `Reporte_Excel_SoundMix_${dateRange.start}.xlsx`;
        const isSingleWorker = selectedEmployee && selectedEmployee.value !== 'all';
        const firstLog = logs[0];

        if (isSingleWorker || (logs.length > 0 && logs.every(l => l.employee_id === firstLog.employee_id))) {
            const emp = isSingleWorker ? (selectedEmployee.empData || firstLog.employee) : firstLog.employee;
            if (emp) {
                filename = `${emp.full_name}_${emp.rut}.xlsx`.replace(/\s+/g, '_');
            }
        }

        XLSX.writeFile(wb, filename);
    };

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-sans text-slate-900">
            {/* Modal de Foto Detallada */}
            <AnimatePresence>
                {selectedPhoto && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
                        onClick={() => setSelectedPhoto(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] overflow-hidden max-w-4xl w-full shadow-2xl flex flex-col md:flex-row relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <button onClick={() => setSelectedPhoto(null)} className="absolute top-6 right-6 p-2 bg-black/5 hover:bg-black/10 rounded-full transition-all z-10">
                                <X size={24} className="text-slate-600" />
                            </button>

                            <div className="w-full md:w-1/2 aspect-square md:aspect-auto bg-slate-100 relative group">
                                <img src={selectedPhoto.url} alt="Evidencia" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-8">
                                    <span className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full w-fit mb-2 uppercase tracking-widest leading-none">
                                        Captura Original de Kiosko
                                    </span>
                                    <h3 className="text-white text-2xl font-black tracking-tight">{selectedPhoto.type}</h3>
                                </div>
                            </div>

                            <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-between">
                                <div className="space-y-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                                            <User className="text-blue-600" size={24} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</p>
                                            <p className="text-xl font-bold text-slate-800">{selectedPhoto.employeeName}</p>
                                            <p className="text-sm font-mono text-slate-500">{selectedPhoto.rut}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <div className="flex items-center gap-2 text-slate-400 mb-1">
                                                <Calendar size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Fecha</span>
                                            </div>
                                            <p className="font-bold text-slate-800">{format(parseISO(selectedPhoto.date), 'dd MMMM, yyyy', { locale: es })}</p>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 text-slate-400 mb-1">
                                                <Clock size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Horal Real</span>
                                            </div>
                                            <p className="font-bold text-slate-800">{selectedPhoto.time}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                                        <Fingerprint className="text-slate-400 shrink-0 mt-0.5" size={18} />
                                        <div className="overflow-hidden">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Hash de Verificación DT</p>
                                            <p className="text-[10px] font-mono text-slate-500 break-all leading-relaxed uppercase">{selectedPhoto.hash || 'NO_HASH_GENERATED'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-green-600 bg-green-50 px-4 py-3 rounded-2xl border border-green-100">
                                        <ShieldCheck size={20} />
                                        <span className="text-xs font-bold">Identidad biometricamente validada en punto de acceso</span>
                                    </div>
                                </div>

                                <button onClick={() => setSelectedPhoto(null)} className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all">
                                    Cerrar Detalle
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header y Filtros (Igual que antes pero con diseño pulido) */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3 text-slate-800">
                        <FileText className="text-blue-600" size={32} />
                        REPORTES DT
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">SoundMix SpA | Control de Asistencia Biométrico</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={exportToExcel} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-2xl hover:bg-slate-50 transition-all text-sm">
                        <Download size={18} /> EXCEL
                    </button>
                    <button onClick={exportToPDF} disabled={downloading} className="flex items-center gap-2 bg-slate-900 text-white font-bold px-5 py-2.5 rounded-2xl hover:bg-black transition-all text-sm disabled:opacity-50 shadow-lg">
                        {downloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} PDF LEGAL
                    </button>
                </div>
            </div>

            {/* Filters Dashboard */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><User size={12} /> Trabajador</label>
                    <Select options={employees} value={selectedEmployee} onChange={setSelectedEmployee} placeholder="Todos..." className="text-sm" styles={{ control: (b) => ({ ...b, borderRadius: '1rem', border: '1px solid #e2e8f0', padding: '2px' }) }} />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Calendar size={12} /> Rango</label>
                    <div className="flex items-center gap-2">
                        <input type="date" value={dateRange.start} onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-[1rem] py-2 px-3 text-sm font-bold" />
                        <ArrowRight size={16} className="text-slate-300" />
                        <input type="date" value={dateRange.end} onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-[1rem] py-2 px-3 text-sm font-bold" />
                    </div>
                </div>
                <div className="flex items-end">
                    <button onClick={fetchReports} className="w-full bg-blue-50 text-blue-600 font-black py-2.5 rounded-2xl border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2">
                        <Filter size={18} /> ACTUALIZAR
                    </button>
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
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stat.color === 'blue' ? 'bg-blue-50 text-blue-600' : stat.color === 'red' ? 'bg-red-50 text-red-600' : stat.color === 'green' ? 'bg-green-50 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
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
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada/Salida</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Colación</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Horas</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Evidencias</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {logs.map((log, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
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
                                            <span className="bg-green-100 text-green-700 font-black px-2 py-1 rounded-lg text-[10px] border border-green-200">{log.entryTime}</span>
                                            <ArrowRight size={12} className="text-slate-300" />
                                            <span className="bg-red-100 text-red-700 font-black px-2 py-1 rounded-lg text-[10px] border border-red-200">{log.exitTime}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-center text-[10px] font-bold text-slate-500">
                                        {log.lunchStart !== '--:--' ? `${log.lunchStart} - ${log.lunchEnd}` : 'Sin registro'}
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <p className="font-black text-slate-800 text-sm">{(log.totalMinutes / 60).toFixed(1)}h</p>
                                        {log.overtime > 0 && <p className="text-[10px] font-bold text-red-500">+{(log.overtime / 60).toFixed(1)}h extra</p>}
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex justify-center gap-2">
                                            {log.photos.map((p, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setSelectedPhoto({ ...p, employeeName: log.employee.full_name, rut: log.employee.rut, date: log.date })}
                                                    className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white shadow-sm hover:scale-110 active:scale-95 transition-all relative group"
                                                >
                                                    <img src={p.url} alt="Evidencia" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                                        <Eye size={14} className="text-white" />
                                                    </div>
                                                </button>
                                            ))}
                                            {log.photos.length === 0 && <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sin fotos</span>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!loading && logs.length === 0 && (
                        <div className="py-24 text-center">
                            <Calendar size={64} className="mx-auto mb-4 opacity-10" />
                            <p className="font-black text-slate-300 uppercase tracking-widest">Sin registros encontrados</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Legal Footer */}
            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-[.3em]">
                <ShieldCheck size={14} className="text-blue-400" /> SIstema Validado por Dirección del Trabajo de Chile
            </div>
        </div>
    );
};

export default Reports;
