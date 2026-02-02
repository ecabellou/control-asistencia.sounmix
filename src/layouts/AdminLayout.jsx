import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Users, LayoutDashboard, FileText, QrCode, Bell, Settings } from 'lucide-react';

import logo from '../assets/logo.png';

const AdminLayout = () => {
    const navItems = [
        { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
        { name: 'Trabajadores', path: '/trabajadores', icon: <Users size={20} /> },
        { name: 'Reportes DT', path: '/reportes', icon: <FileText size={20} /> },
        { name: 'Escáner QR', path: '/escaner', icon: <QrCode size={20} /> },
    ];

    return (
        <div className="flex h-screen bg-slate-50 font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
                <div className="p-6 flex items-center gap-3 bg-gradient-to-br from-blue-700 to-indigo-900 text-white shadow-inner">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center p-2 backdrop-blur-md border border-white/10 shadow-lg">
                        <img src={logo} alt="SoundMix" className="w-full h-full object-contain brightness-0 invert" />
                    </div>
                    <div className="flex flex-col">
                        <p className="text-[9px] font-black text-blue-200 uppercase tracking-[0.3em] leading-none mb-1.5 opacity-80">
                            Registro Control
                        </p>
                        <h1 className="text-base font-black text-white uppercase tracking-tighter leading-none">
                            SOUNDMIX
                        </h1>
                    </div>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `
                                flex items-center space-x-3 p-3 rounded-lg transition-all
                                ${isActive
                                    ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100'
                                    : 'text-slate-600 hover:bg-slate-50'}
                            `}
                        >
                            {item.icon}
                            <span className="font-medium">{item.name}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="p-4 border-t border-slate-200 space-y-2">
                    <button
                        onClick={() => {
                            localStorage.clear();
                            window.location.href = '/login';
                        }}
                        className="flex items-center space-x-3 w-full p-3 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                        <Settings size={20} className="rotate-90" />
                        <span className="font-medium">Cerrar Sesión</span>
                    </button>
                    <button className="flex items-center space-x-3 w-full p-3 text-slate-600 hover:bg-slate-50 rounded-lg transition-all">
                        <Settings size={20} />
                        <span className="font-medium">Configuración</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto p-8">
                <header className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">
                        Sistema de Asistencia Legal
                    </h2>
                    <div className="flex items-center space-x-4">
                        <button className="p-2 text-slate-400 hover:text-slate-600 transition-all relative">
                            <Bell size={22} />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        <div className="flex items-center space-x-3 pl-4 border-l border-slate-200">
                            <div className="text-right">
                                <p className="text-sm font-medium text-slate-900">Administrador</p>
                                <p className="text-xs text-slate-500">Admin General</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
                                AD
                            </div>
                        </div>
                    </div>
                </header>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 min-h-[calc(100vh-12rem)]">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
