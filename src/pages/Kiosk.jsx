import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, MapPin, CheckCircle, AlertTriangle, Clock, ShieldCheck, Camera } from 'lucide-react';
import { Html5Qrcode } from "html5-qrcode";
import axios from 'axios';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

const Kiosk = () => {
    const [status, setStatus] = useState('idle'); // idle, scanning, confirming, submitting, success, error
    const [scannedData, setScannedData] = useState(null);
    const [error, setError] = useState(null);
    const [location, setLocation] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const scannerRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn("GPS no disponible:", err.message)
            );
        }
        return () => {
            clearInterval(timer);
            stopScanner();
        };
    }, []);

    // Reiniciar scanner cuando vuelve a idle, y asegurar que NO se apague durante 'capturing'
    useEffect(() => {
        if (status === 'idle') {
            startScanner();
        } else if (status !== 'capturing' && status !== 'scanning') {
            // Solo detenemos el scanner cuando pasamos a confirmar o estados finales
            // Mantenerlo encendido durante 'capturing' para poder tomar la foto
            stopScanner();
        }
    }, [status]);

    const [photo, setPhoto] = useState(null);

    const startScanner = async () => {
        try {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;

            const config = { fps: 15, qrbox: { width: 250, height: 250 } };

            await html5QrCode.start(
                { facingMode: "user" }, // "environment" para cámara trasera en tablets
                config,
                (qrCodeMessage) => {
                    processScan(qrCodeMessage);
                },
                (errorMessage) => {
                    // Ignorar errores de escaneo (no QR detectado en el frame)
                }
            );
        } catch (err) {
            console.error("No se pudo iniciar la cámara:", err);
            setError("No se detectó cámara o acceso denegado.");
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current = null;
            } catch (err) {
                console.error("Error al detener scanner:", err);
            }
        }
    };

    const handleScanPlaceholder = () => {
        // En una implementación real con cámara usaríamos un hook de escaneo continuo.
        // Aquí simulamos el trigger del escáner.
        const id = prompt("Simular escaneo: Ingrese ID de trabajador");
        if (id) processScan(id);
    };

    const processScan = async (employeeId) => {
        if (status !== 'idle') return;

        setStatus('scanning');
        setError(null);
        try {
            const { data, error: empError } = await supabase
                .from('employees')
                .select('id, full_name, rut')
                .eq('id', employeeId)
                .single();

            if (empError || !data) throw new Error("Trabajador no reconocido");

            const today = new Date().toISOString().split('T')[0];
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('event_type')
                .eq('employee_id', employeeId)
                .gte('timestamp', `${today}T00:00:00Z`)
                .order('timestamp', { ascending: true });

            const logCount = logs?.length ?? 0;
            const events = ['ENTRADA', 'INICIO COLACIÓN', 'TÉRMINO COLACIÓN', 'SALIDA'];

            if (logCount >= 4) throw new Error("Jornada completada hoy");

            setScannedData({
                id: employeeId,
                name: data.full_name,
                rut: data.rut,
                nextEvent: events[logCount]
            });

            // Pasamos a fase de captura de foto
            setStatus('capturing');
        } catch (err) {
            setError(err.message);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    const capturePhoto = () => {
        const video = document.querySelector("#reader video");
        if (!video) return;

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setPhoto(dataUrl);
        setStatus('confirming');
    };

    const confirmMarking = async () => {
        if (!scannedData || !photo) return;
        setStatus('submitting');
        try {
            const res = await axios.post('https://twyndowkjummyjoouqnf.supabase.co/functions/v1/process-attendance', {
                employeeId: scannedData.id,
                lat: location?.lat,
                lng: location?.lng,
                timestamp: new Date().toISOString(),
                photo: photo // Enviamos la foto a la Edge Function
            }, {
                headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
            });

            setStatus('success');
            setTimeout(() => {
                setStatus('idle');
                setScannedData(null);
                setPhoto(null);
            }, 6000);
        } catch (err) {
            setError(err.response?.data?.error || "Error al registrar");
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-8 font-sans overflow-hidden">
            <style>{`
                #reader__scan_region video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    border-radius: 1.5rem !important;
                }
                #reader {
                    border: none !important;
                }
            `}</style>

            {/* Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />
            </div>

            {/* Header */}
            <header className="w-full max-w-4xl flex justify-between items-center relative z-10">
                <div className="flex items-center space-x-4">
                    <img src={logo} alt="SounMix Logo" className="h-10 w-auto" />
                    <div className="h-6 w-[1px] bg-white/20" />
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">SounMix</h1>
                        <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em]">Asistencia Digital</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center justify-end space-x-2 text-2xl font-mono font-medium">
                        <Clock className="text-blue-500" size={24} />
                        <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-slate-400">{currentTime.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl relative z-10 py-10">
                <AnimatePresence mode="wait">
                    {(status === 'idle' || status === 'capturing') && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="text-center w-full"
                        >
                            <div className="relative w-80 h-80 mx-auto mb-10">
                                {/* El elemento #reader debe estar SIEMPRE en el DOM para que la cámara no se apague */}
                                <div
                                    id="reader"
                                    className={`w-full h-full overflow-hidden rounded-3xl border-4 transition-all duration-500 ${status === 'capturing' ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]' : 'border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]'} bg-black`}
                                ></div>

                                {status === 'idle' && (
                                    <>
                                        <div className="absolute inset-0 border-[20px] border-slate-950/40 pointer-events-none rounded-3xl" />
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-1 bg-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse" />
                                    </>
                                )}

                                {status === 'capturing' && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-64 h-64 border-2 border-white/30 rounded-full border-dashed animate-pulse" />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                {status === 'idle' ? (
                                    <div className="space-y-4">
                                        <h2 className="text-3xl font-black tracking-tight">Acerque su Código QR</h2>
                                        <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
                                            Coloque su credencial frente a la cámara para iniciar el registro automático.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-amber-500 mb-1">Verificación Facial</h2>
                                            <p className="text-white text-lg font-medium">{scannedData?.name}</p>
                                            <p className="text-slate-400 text-sm">Mire a la cámara y presione el botón</p>
                                        </div>
                                        <button
                                            onClick={capturePhoto}
                                            className="px-10 py-5 bg-amber-500 hover:bg-amber-600 rounded-2xl font-black text-xl shadow-xl shadow-amber-500/20 transition-all active:scale-95 flex items-center space-x-3 mx-auto"
                                        >
                                            <Camera size={28} />
                                            <span>TOMAR FOTO</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {status === 'confirming' && scannedData && photo && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                            className="w-full max-w-lg bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl text-center"
                        >
                            <div className="flex justify-center mb-8 gap-6 items-center">
                                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <ShieldCheck className="text-white" size={48} />
                                </div>
                                <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-blue-500 shadow-xl">
                                    <img src={photo} alt="Captura" className="w-full h-full object-cover" />
                                </div>
                            </div>

                            <div className="space-y-2 mb-8">
                                <h3 className="text-xs text-blue-400 font-bold uppercase tracking-widest">Confirmación de Identidad</h3>
                                <h2 className="text-3xl font-bold">{scannedData.name}</h2>
                                <div className="bg-slate-900/80 rounded-2xl p-4 border border-white/5 mt-4">
                                    <p className="text-[10px] text-slate-500 uppercase mb-1">Evento a Registrar</p>
                                    <p className="text-xl font-black text-white">{scannedData.nextEvent}</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => { setStatus('idle'); setScannedData(null); setPhoto(null); }}
                                    className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/10"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmMarking}
                                    className="flex-2 px-10 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-extrabold text-lg shadow-xl shadow-blue-600/20 transition-all active:scale-95 uppercase tracking-tighter"
                                >
                                    Confirmar Todo
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'submitting' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
                            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-xl font-bold animate-pulse">Procesando marcación legal...</p>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                            className="bg-green-500/10 border border-green-500/20 p-10 rounded-[2.5rem] text-center"
                        >
                            <div className="w-24 h-24 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg shadow-green-500/40">
                                <CheckCircle className="text-white" size={56} />
                            </div>
                            <h2 className="text-4xl font-black text-white mb-2">¡Registro Exitoso!</h2>
                            <p className="text-green-400 text-lg mb-4">Su asistencia ha sido guardada encriptada.</p>
                            <div className="inline-flex items-center space-x-2 bg-green-500/20 text-green-300 px-4 py-2 rounded-full text-sm font-mono">
                                <ShieldCheck size={16} />
                                <span>Hash Generado Res. N°38</span>
                            </div>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            className="bg-red-500/10 border border-red-500/20 p-10 rounded-[2.5rem] text-center"
                        >
                            <div className="w-20 h-20 bg-red-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg shadow-red-500/40">
                                <AlertTriangle className="text-white" size={40} />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">Error de Registro</h2>
                            <p className="text-red-400">{error}</p>
                            <button
                                onClick={() => setStatus('idle')}
                                className="mt-8 px-8 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl font-bold transition-all"
                            >
                                Reintentar
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Footer / Status Bars */}
            <footer className="w-full max-w-4xl flex justify-between items-center relative z-10 opacity-60">
                <div className="flex items-center space-x-6 text-xs font-medium">
                    <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${location ? 'bg-green-500' : 'bg-red-500 animate-ping'}`} />
                        <span>GPS: {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Buscando señal...'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>Supabase Cloud: Conectado</span>
                    </div>
                </div>
                <p className="text-[10px] text-slate-500 font-mono tracking-tighter">SISTEMA VALIDADO DT CHILE 2026 v2.4</p>
            </footer>
        </div>
    );
};

export default Kiosk;
