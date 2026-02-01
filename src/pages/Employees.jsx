import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, Edit2, Trash2, QrCode as QRIcon, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const API_URL = 'http://localhost:3001/api';

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

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const res = await axios.get(`${API_URL}/employees`);
            setEmployees(res.data);
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
                await axios.put(`${API_URL}/employees/${editingEmployee.id}`, formData);
            } else {
                await axios.post(`${API_URL}/employees`, formData);
            }
            setShowModal(false);
            setEditingEmployee(null);
            fetchEmployees();
        } catch (err) {
            alert('Error al guardar trabajador');
        }
    };

    const handleEdit = (emp) => {
        setEditingEmployee(emp);
        setFormData(emp);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Estás seguro de eliminar a este trabajador?')) {
            await axios.delete(`${API_URL}/employees/${id}`);
            fetchEmployees();
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
                        setShowModal(true); setEditingEmployee(null); setFormData({
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
                                            onClick={() => setQrValue(emp.id)}
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
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center">
                        <h3 className="text-xl font-bold text-slate-800 mb-6 uppercase tracking-tight">QR Identificador Único</h3>
                        <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-inner">
                            <QRCodeCanvas value={qrValue} size={250} level="H" />
                        </div>
                        <p className="mt-6 text-slate-500 text-sm mb-4">ID: {qrValue}</p>
                        <div className="flex space-x-4">
                            <button
                                onClick={() => window.print()}
                                className="bg-slate-800 text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-slate-900 transition-all"
                            >
                                Imprimir Credencial
                            </button>
                            <button
                                onClick={() => setQrValue(null)}
                                className="bg-slate-100 text-slate-600 px-6 py-2 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Employees;
