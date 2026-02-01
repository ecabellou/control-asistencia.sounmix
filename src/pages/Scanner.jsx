import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import axios from 'axios';
import { QrCode, MapPin, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

const API_URL = 'http://localhost:3001/api';

const Scanner = () => {
    const videoRef = useRef(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [location, setLocation] = useState(null);
    const [ticket, setTicket] = useState(null);
    const [status, setStatus] = useState('idle'); // idle, scanning, success, error

    useEffect(() => {
        const codeReader = new BrowserMultiFormatReader();

        // Get Geolocation
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.error("Geolocation denied", err)
            );
        }

        const startScanner = async () => {
            try {
                const videoInputDevices = await codeReader.listVideoInputDevices();
                const frontCamera = videoInputDevices.find(device => device.label.toLowerCase().includes('front')) || videoInputDevices[0];

                codeReader.decodeFromVideoDevice(frontCamera.deviceId, videoRef.current, async (result) => {
                    if (result && status === 'idle') {
                        handleScan(result.getText());
                    }
                });
            } catch (err) {
                setError("No se pudo acceder a la cámara");
            }
        };

        startScanner();

        return () => codeReader.reset();
    }, [status]);

    const [scannedData, setScannedData] = useState(null);

    const handleScan = async (employeeId) => {
        setStatus('scanning');
        try {
            // Consulta directa a Supabase para el estado del trabajador
            const { data, error } = await supabase
                .from('employees')
                .select('full_name')
                .eq('id', employeeId)
                .single();

            if (error || !data) throw new Error("Trabajador no encontrado");

            // Para el evento siguiente, consultamos logs de hoy
            const today = new Date().toISOString().split('T')[0];
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('event_type')
                .eq('employee_id', employeeId)
                .gte('timestamp', `${today}T00:00:00Z`)
                .order('timestamp', { ascending: true });

            const logCount = logs?.length ?? 0;
            const events = ['ENTRADA', 'INICIO COLACIÓN', 'TÉRMINO COLACIÓN', 'SALIDA'];

            setScannedData({
                id: employeeId,
                name: data.full_name,
                nextEvent: logCount < 4 ? events[logCount] : 'JORNADA COMPLETA',
                isComplete: logCount >= 4
            });
            setStatus('confirming');
        } catch (err) {
            setError(err.message || "Error al identificar QR");
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    const confirmMarking = async () => {
        if (!scannedData || scannedData.isComplete) return;

        setStatus('submitting');
        try {
            const timestamp = new Date().toISOString();
            // Usando Edge Function para procesar la asistencia
            const res = await axios.post('https://twyndowkjummyjoouqnf.supabase.co/functions/v1/process-attendance', {
                employeeId: scannedData.id,
                lat: location?.lat,
                lng: location?.lng,
                timestamp
            }, {
                headers: {
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                }
            });

            // Reutilizamos el formateador de tickets local para el feedback visual
            // (Podríamos moverlo a la edge function también luego)
            setTicket(`Registro Exitoso: ${res.data.eventType}\nHash: ${res.data.hash}\nFecha: ${new Date().toLocaleString()}`);
            setStatus('success');
            setScannedData(null);
            setTimeout(() => {
                setStatus('idle');
                setTicket(null);
            }, 8000);
        } catch (err) {
            setError(err.response?.data?.error || "Error al registrar");
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 min-h-[600px] relative overflow-hidden">
            <h2 className="text-2xl font-bold text-slate-800 mb-8 flex items-center space-x-2">
                <QrCode className="text-blue-600" />
                <span>Punto de Marcación</span>
            </h2>

            {/* Video Container */}
            <div className="relative w-full max-w-sm aspect-square bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
                <video ref={videoRef} className="w-full h-full object-cover" />

                {/* Overlay Scanning UI */}
                <div className="absolute inset-0 border-2 border-blue-500/30">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-blue-400 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                        <motion.div
                            animate={{ top: ['0%', '100%', '0%'] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,1)]"
                        />
                    </div>
                </div>

                {/* Status Overlays */}
                <AnimatePresence>
                    {(status === 'scanning' || status === 'submitting') && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-blue-600/20 backdrop-blur-sm flex items-center justify-center z-10"
                        >
                            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
                        </motion.div>
                    )}

                    {status === 'confirming' && scannedData && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute inset-0 bg-white/95 backdrop-blur-md p-8 flex flex-col items-center justify-center text-center z-20"
                        >
                            {scannedData.isComplete ? (
                                <>
                                    <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red-100 ring-4 ring-white">
                                        <X size={40} strokeWidth={3} />
                                    </div>
                                    <h3 className="text-xl font-bold text-red-600 mb-2 uppercase tracking-tight">JORNADA COMPLETA</h3>
                                    <p className="text-slate-600 font-medium mb-8">
                                        Hola <span className="text-slate-900 font-bold">{scannedData.name}</span>, ya has registrado todas las marcas legales de hoy.
                                    </p>
                                    <button
                                        onClick={() => { setStatus('idle'); setScannedData(null); }}
                                        className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
                                    >
                                        Cerrar
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p className="text-slate-500 font-medium text-sm mb-1 uppercase tracking-widest">Confirmación de Acceso</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mb-6">{scannedData.name}</h3>

                                    <div className="w-full bg-blue-50 border border-blue-100 rounded-3xl p-6 mb-8 group overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                            <QrCode size={60} />
                                        </div>
                                        <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">Evento Siguiente:</p>
                                        <p className="text-xl font-black text-blue-700 uppercase tracking-tight">{scannedData.nextEvent}</p>
                                    </div>

                                    <div className="flex flex-col w-full space-y-3">
                                        <button
                                            onClick={confirmMarking}
                                            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-200 active:scale-95 transition-all hover:bg-blue-700"
                                        >
                                            Confirmar Marcación
                                        </button>
                                        <button
                                            onClick={() => { setStatus('idle'); setScannedData(null); }}
                                            className="w-full bg-slate-100 text-slate-500 py-3 rounded-2xl font-semibold hover:bg-slate-200 transition-all text-sm"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="mt-8 flex items-center space-x-4 text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-full">
                <MapPin size={16} className={location ? "text-green-500" : "text-amber-500"} />
                <span>{location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Obteniendo ubicación..."}</span>
            </div>

            {/* Ticket Modal */}
            <AnimatePresence>
                {ticket && (
                    <motion.div
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-6 overflow-hidden"
                    >
                        <div className="flex items-center space-x-3 text-green-600 mb-4 font-bold">
                            <CheckCircle size={24} />
                            <span>¡Marcación Exitosa!</span>
                        </div>
                        <pre className="text-[10px] sm:text-xs leading-relaxed font-mono bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap overflow-auto max-h-60">
                            {ticket}
                        </pre>
                        <button
                            onClick={() => { setTicket(null); setStatus('idle'); }}
                            className="mt-4 w-full bg-slate-800 text-white py-2 rounded-xl text-sm font-bold hover:bg-slate-900 transition-all"
                        >
                            Listo
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error Message */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="mt-6 flex items-center space-x-3 bg-red-100 text-red-700 px-6 py-3 rounded-2xl border border-red-200 shadow-lg shadow-red-100"
                    >
                        <AlertTriangle size={20} />
                        <span className="font-semibold">{error}</span>
                        <button onClick={() => setError(null)}><X size={16} /></button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Scanner;
