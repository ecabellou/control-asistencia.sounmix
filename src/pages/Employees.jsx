import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, QrCode as QRIcon, X, MessageSquare } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [formData, setFormData] = useState({
        rut: '',
        full_name: '',
        email: '',
        phone: '',
        weekly_hours_agreed: 42,
        shift_start: '09:00',
        shift_end: '18:00',
        is_telework: false
    });
    const [qrValue, setQrValue] = useState(null);
    const [qrEmployee, setQrEmployee] = useState(null);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const { data, error } = await supabase
                .from('employees')
                .select('*')
                .eq('active', true)
                .order('full_name');

            if (error) throw error;
            setEmployees(data);
        } catch (err) {
            console.error('Error fetching employees', err);
        }
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingEmployee) {
                const { error } = await supabase
                    .from('employees')
                    .update(formData)
                    .eq('id', editingEmployee.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('employees')
                    .insert([formData]);
                if (error) throw error;
            }
            setShowModal(false);
            setEditingEmployee(null);
            fetchEmployees();
        } catch (err) {
            alert('Error al guardar trabajador: ' + err.message);
        }
    };

    const handleEdit = (emp) => {
        setEditingEmployee(emp);
        setFormData(emp);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Estás seguro de desactivar a este trabajador?')) {
            const { error } = await supabase
                .from('employees')
                .update({ active: false })
                .eq('id', id);

            if (error) alert('Error: ' + error.message);
            fetchEmployees();
        }
    };

    const handlePrint = () => {
        if (!qrEmployee) return;
        const originalTitle = document.title;
        document.title = `Credencial - ${qrEmployee.full_name} - ${qrEmployee.rut}`;
        window.print();
        document.title = originalTitle;
    };

    const shareToWhatsApp = async () => {
        if (!qrEmployee) return;

        try {
            // Usamos un canvas oculto para generar una imagen de alta calidad con el diseño elegante
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1200;
            canvas.height = 630; // Formato horizontal premium

            // Background - Gradient elegante
            const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
            gradient.addColorStop(0, '#0f172a'); // slate-900
            gradient.addColorStop(1, '#1e293b'); // slate-800
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 1200, 630);

            // Adornos - Círculos sutiles
            ctx.beginPath();
            ctx.arc(1100, 100, 300, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
            ctx.fill();

            // Dibujar el QR real
            const qrCanvasHidden = document.querySelector('.qr-canvas-hidden canvas');
            if (qrCanvasHidden) {
                // Sombra para el QR
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 30;

                // Fondo blanco redondeado para el QR
                ctx.fillStyle = '#ffffff';
                const r = 40, x = 60, y = 115, w = 400, h = 400;
                ctx.beginPath();
                ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.drawImage(qrCanvasHidden, 85, 140, 350, 350);
            }

            // Textos
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 60px Inter, system-ui, sans-serif';
            ctx.fillText(qrEmployee.full_name.toUpperCase(), 520, 280);

            ctx.fillStyle = '#94a3b8'; // slate-400
            ctx.font = '500 35px monospace';
            ctx.fillText(qrEmployee.rut, 520, 340);

            // Separador
            ctx.fillStyle = '#2563eb'; // blue-600
            ctx.fillRect(520, 380, 100, 8);

            // Branding
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 30px Inter, sans-serif';
            ctx.fillText('SOUNDMIX SPA', 520, 450);

            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '500 20px Inter, sans-serif';
            ctx.fillText('REGISTRO DE ASISTENCIA BIOMÉTRICO', 520, 485);

            // Convertir y Compartir
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `Credencial_${qrEmployee.full_name.replace(/\s+/g, '_')}.png`, { type: 'image/png' });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Credencial SoundMix - ${qrEmployee.full_name}`,
                    text: `Hola ${qrEmployee.full_name}, aquí tienes tu credencial digital para el registro de asistencia.`
                });
            } else {
                const link = document.createElement('a');
                link.download = `Credencial_${qrEmployee.full_name.replace(/\s+/g, '_')}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
                const msg = encodeURIComponent(`Hola ${qrEmployee.full_name}, te envío tu credencial de SoundMix. Por favor adjunta la imagen descargada.`);
                window.open(`https://wa.me/${qrEmployee.phone?.replace(/\D/g, '') || ''}?text=${msg}`, '_blank');
            }
        } catch (err) {
            console.error('Error sharing:', err);
            alert('Error al generar la credencial elegante.');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar trabajador..."
                        className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 w-64 text-sm transition-all"
                    />
                </div>
                <button
                    onClick={() => {
                        setShowModal(true);
                        setEditingEmployee(null);
                        setFormData({
                            rut: '', full_name: '', email: '', phone: '', weekly_hours_agreed: 42,
                            shift_start: '09:00', shift_end: '18:00', is_telework: false
                        });
                    }}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all font-medium text-sm shadow-md shadow-blue-200"
                >
                    <Plus size={18} />
                    <span>Nuevo Trabajador</span>
                </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Nombre y RUT</th>
                            <th className="px-6 py-4">Contacto</th>
                            <th className="px-6 py-4">Jornada</th>
                            <th className="px-6 py-4 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {employees.map(emp => (
                            <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <p className="font-semibold text-slate-800">{emp.full_name}</p>
                                    <p className="text-xs text-slate-500">{emp.rut}</p>
                                </td>
                                <td className="px-6 py-4 text-slate-600">
                                    <p>{emp.email}</p>
                                    <p className="text-xs">{emp.phone}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {emp.weekly_hours_agreed}h/sem
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center space-x-2">
                                        <button
                                            onClick={() => { setQrValue(emp.id); setQrEmployee(emp); }}
                                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Generar QR"
                                        >
                                            <QRIcon size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(emp)}
                                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="Editar"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(emp.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Eliminar"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal de Trabajador */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">
                                {editingEmployee ? 'Editar Trabajador' : 'Nuevo Trabajador'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nombre Completo</label>
                                    <input
                                        type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} required
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">RUT (xx.xxx.xxx-x)</label>
                                    <input
                                        type="text" name="rut" value={formData.rut} onChange={handleInputChange} required
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email</label>
                                    <input
                                        type="email" name="email" value={formData.email} onChange={handleInputChange} required
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Teléfono</label>
                                    <input
                                        type="text" name="phone" value={formData.phone} onChange={handleInputChange}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Horas Sem.</label>
                                    <input
                                        type="number" name="weekly_hours_agreed" value={formData.weekly_hours_agreed} onChange={handleInputChange}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Inicio Turno</label>
                                    <input
                                        type="time" name="shift_start" value={formData.shift_start} onChange={handleInputChange}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fin Turno</label>
                                    <input
                                        type="time" name="shift_end" value={formData.shift_end} onChange={handleInputChange}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <label className="flex items-center space-x-2 text-sm text-slate-600">
                                <input
                                    type="checkbox" name="is_telework" checked={formData.is_telework} onChange={handleInputChange}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>Trabajador remoto / Teletrabajo</span>
                            </label>
                            <button
                                type="submit"
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-2"
                            >
                                {editingEmployee ? 'Guardar Cambios' : 'Registrar Trabajador'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de QR */}
            {qrValue && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-full max-w-2xl bg-white rounded-[2.5rem] overflow-hidden shadow-2xl"
                    >
                        {/* Vista Previa de la Tarjeta Elegante (Horizontal) */}
                        <div className="relative p-1 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">

                            <div className="flex flex-col md:flex-row items-center p-8 md:p-12 gap-8 relative z-10">
                                {/* Zona QR */}
                                <div className="bg-white p-6 rounded-[2rem] shadow-2xl transform -rotate-2 hover:rotate-0 transition-transform duration-500">
                                    <QRCodeCanvas value={qrValue} size={180} level="H" />
                                </div>

                                {/* Info Trabajador */}
                                <div className="text-center md:text-left flex-1 space-y-4">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Credencial Digital</p>
                                        <h3 className="text-3xl font-black text-white leading-tight tracking-tighter">
                                            {qrEmployee?.full_name}
                                        </h3>
                                        <p className="text-lg font-mono text-slate-400">{qrEmployee?.rut}</p>
                                    </div>

                                    <div className="h-1 w-12 bg-blue-500 rounded-full mx-auto md:mx-0"></div>

                                    <div>
                                        <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">SoundMix SpA</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Asistencia Biométrica</p>
                                    </div>
                                </div>
                            </div>

                            {/* Elementos decorativos de fondo */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                            <div className="absolute bottom-0 left-0 w-48 h-48 bg-slate-700/20 rounded-full blur-2xl -ml-24 -mb-24"></div>
                        </div>

                        {/* Botones de acción */}
                        <div className="p-8 bg-slate-50 flex flex-wrap justify-center gap-4 border-t border-slate-100">
                            <button
                                onClick={handlePrint}
                                className="bg-white border border-slate-200 text-slate-700 px-8 py-3.5 rounded-2xl text-sm font-black hover:bg-slate-100 transition-all flex items-center gap-3 shadow-sm"
                            >
                                <QRIcon size={20} /> IMPRIMIR FÍSICO
                            </button>
                            <button
                                onClick={shareToWhatsApp}
                                className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl text-sm font-black hover:bg-black transition-all flex items-center gap-3 shadow-xl"
                            >
                                <MessageSquare size={20} /> COMPARTIR WHATSAPP
                            </button>
                            <button
                                onClick={() => { setQrValue(null); setQrEmployee(null); }}
                                className="px-8 py-3.5 rounded-2xl text-sm font-black text-slate-400 hover:text-slate-600 transition-all"
                            >
                                CERRAR
                            </button>
                        </div>

                        {/* QR Oculto con mayor resolución para exportar */}
                        <div className="qr-canvas-hidden hidden">
                            <QRCodeCanvas value={qrValue} size={1000} level="H" includeMargin={true} />
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default Employees;
