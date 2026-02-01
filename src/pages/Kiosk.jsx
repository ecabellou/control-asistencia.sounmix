import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Clock, ShieldCheck, Camera } from 'lucide-react';
import { Html5Qrcode } from "html5-qrcode";
import axios from 'axios';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

const Kiosk = () => {
    const [status, setStatus] = useState('idle'); // idle, scanning, capturing, confirming, submitting, success, error
    const [scannedData, setScannedData] = useState(null);
    const [error, setError] = useState(null);
    const [location, setLocation] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [photo, setPhoto] = useState(null);
    const scannerRef = useRef(null);
    const isProcessingRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn("GPS no disponible:", err.message)
            );
        }

        startScanner();

        return () => {
            clearInterval(timer);
            stopScanner();
        };
    }, []);

    useEffect(() => {
        if (status === 'idle') {
            isProcessingRef.current = false;
            setPhoto(null);
            setScannedData(null);
            if (!scannerRef.current?.isScanning) {
                startScanner();
            }
        } else if (status === 'confirming' || status === 'success' || status === 'error') {
            stopScanner();
        }
    }, [status]);

    const startScanner = async () => {
        if (scannerRef.current?.isScanning) return;

        try {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;
            const config = { fps: 15, qrbox: { width: 250, height: 250 } };

            await html5QrCode.start(
                { facingMode: "user" },
                config,
                (qrCodeMessage) => {
                    if (!isProcessingRef.current) {
                        processScan(qrCodeMessage);
                    }
                },
                () => { }
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
            } catch (err) {
                console.error("Error al detener scanner:", err);
            }
        }
    };

    const processScan = async (employeeId) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

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
            await axios.post('https://twyndowkjummyjoouqnf.supabase.co/functions/v1/process-attendance', {
                employeeId: scannedData.id,
                lat: location?.lat,
                lng: location?.lng,
                timestamp: new Date().toISOString(),
                photo: photo
            }, {
                headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
            });

            setStatus('success');
            setTimeout(() => {
                setStatus('idle');
            }, 6000);
        } catch (err) {
            setError(err.response?.data?.error || "Error al registrar");
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 md:p-8 font-sans overflow-y-auto overflow-x-hidden">
            <style>{`
                #reader__scan_region video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    border-radius: 1rem !important;
                }
                #reader { border: none !important; }
                #reader__scan_region { aspect-ratio: 1/1; }
            `}</style>

            {/* Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[80px] md:blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[80px] md:blur-[120px]" />
            </div>

            {/* Header */}
            <header className="w-full max-w-4xl flex justify-between items-center relative z-10 mb-4">
                <div className="flex items-center space-x-3 md:space-x-4">
                    <img src={logo} alt="SounMix Logo" className="h-8 md:h-10 w-auto" />
                    <div className="h-5 md:h-6 w-[1px] bg-white/20" />
                    <div>
                        <h1 className="text-lg md:text-xl font-bold tracking-tight">SounMix</h1>
                        <p className="text-[8px] md:text-[10px] text-slate-400 uppercase tracking-[0.2em]">Asistencia</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center justify-end space-x-2 text-xl md:text-2xl font-mono font-medium">
                        <Clock className="text-blue-500" size={18} />
                        <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl relative z-10 py-4 md:py-10">

                {/* PERSISTENT CAMERA VIEW */}
                <div className={`transition-all duration-700 transform ${(status === 'idle' || status === 'capturing' || status === 'scanning') ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none h-0 overflow-hidden'}`}>
                    <div className="text-center w-full">
                        <div className="relative w-[70vw] h-[70vw] max-w-[320px] max-h-[320px] mx-auto mb-6 md:mb-10">
                            <div
                                id="reader"
                                className={`w-full h-full overflow-hidden rounded-2xl md:rounded-3xl border-4 transition-all duration-500 ${status === 'capturing' ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]' : 'border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]'} bg-black`}
                            ></div>

                            {status === 'idle' && (
                                <>
                                    <div className="absolute inset-0 border-[15px] md:border-[20px] border-slate-950/40 pointer-events-none rounded-2xl md:rounded-3xl" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 md:w-48 h-1 bg-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse" />
                                </>
                            )}
                        </div>

                        <div className="min-h-[100px] md:min-h-[160px]">
                            <AnimatePresence mode="wait">
                                {status === 'idle' && (
                                    <motion.div key="idle-txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                                        <h2 className="text-2xl md:text-3xl font-black tracking-tight">Escanee Código QR</h2>
                                        <p className="text-slate-400 text-xs md:text-sm">Posicione su credencial frente a la cámara.</p>
                                    </motion.div>
                                )}
                                {status === 'scanning' && (
                                    <motion.div key="scan-txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h2 className="text-xl font-bold animate-pulse">Identificando...</h2>
                                    </motion.div>
                                )}
                                {status === 'capturing' && scannedData && (
                                    <motion.div key="cap-txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                                        <div>
                                            <h2 className="text-xl font-bold text-amber-500">{scannedData.name}</h2>
                                            <p className="text-slate-400 text-xs">Mire a la cámara para la verificación facial</p>
                                        </div>
                                        <button
                                            onClick={capturePhoto}
                                            className="px-8 py-4 bg-amber-500 hover:bg-amber-600 rounded-xl font-black text-lg flex items-center space-x-2 mx-auto uppercase"
                                        >
                                            <Camera size={24} />
                                            <span>TOMAR FOTO</span>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* OVERLAYS */}
                <AnimatePresence mode="wait">
                    {status === 'confirming' && scannedData && photo && (
                        <motion.div
                            key="confirm" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-sm bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-2xl shadow-2xl text-center"
                        >
                            <div className="flex justify-center mb-6 gap-4 items-center">
                                <ShieldCheck className="text-blue-500" size={40} />
                                <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-blue-500 shadow-xl">
                                    <img src={photo} alt="Captura" className="w-full h-full object-cover" />
                                </div>
                            </div>
                            <div className="space-y-1 mb-6">
                                <h3 className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Confirmación</h3>
                                <h2 className="text-2xl font-black truncate">{scannedData.name}</h2>
                                <div className="bg-slate-900/90 rounded-xl p-3 border border-white/5 mt-4">
                                    <p className="text-[8px] text-slate-500 uppercase font-bold">Tipo de Registro</p>
                                    <p className="text-xl font-black">{scannedData.nextEvent}</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setStatus('idle')} className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-sm">Cancelar</button>
                                <button onClick={confirmMarking} className="flex-[2] py-3 bg-blue-600 rounded-xl font-black text-lg uppercase">Confirmar</button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'submitting' && (
                        <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-lg font-bold animate-pulse text-blue-400">Procesando...</p>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-green-500/10 p-8 rounded-3xl border border-green-500/20">
                            <CheckCircle className="text-green-500 mx-auto mb-4" size={56} />
                            <h2 className="text-3xl font-black mb-2">¡LISTO!</h2>
                            <p className="text-green-400">Asistencia registrada con éxito.</p>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center bg-red-500/10 p-8 rounded-3xl border border-red-500/20 max-w-sm">
                            <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
                            <h2 className="text-2xl font-black mb-2">ERROR</h2>
                            <p className="text-red-400 text-sm mb-6">{error}</p>
                            <button onClick={() => setStatus('idle')} className="w-full py-3 bg-red-500/20 text-red-500 rounded-xl font-bold">Reintentar</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <footer className="w-full max-w-4xl flex justify-between items-center opacity-60 text-[10px] font-mono mt-4">
                <div className="flex items-center space-x-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${location ? 'bg-green-500' : 'bg-red-500 animate-ping'}`} />
                    <span>GPS: {location ? 'ACTIVO' : 'BUSCANDO...'}</span>
                </div>
                <span>SounMix v2.6.2</span>
            </footer>
        </div>
    );
};

export default Kiosk;
