import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Clock, ShieldCheck, Camera, Maximize, Minimize, Power, Ghost } from 'lucide-react';
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
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [photo, setPhoto] = useState(null);
    const [isSleeping, setIsSleeping] = useState(false);

    const scannerRef = useRef(null);
    const isProcessingRef = useRef(false);
    const lastActivityRef = useRef(Date.now());
    const motionCanvasRef = useRef(null);
    const prevFrameRef = useRef(null);

    // 1. Gestión de Tiempo e Inactividad
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());

            // Si pasan 15s de inactividad, dormir
            if (!isSleeping && status === 'idle' && (Date.now() - lastActivityRef.current > 15000)) {
                setIsSleeping(true);
            }
        }, 1000);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn("GPS no disponible:", err.message)
            );
        }

        startScanner();

        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            clearInterval(timer);
            stopScanner();
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [isSleeping, status]);

    // 2. Detección de Movimiento (Proximidad Visual)
    useEffect(() => {
        let animationFrame;
        const checkMotion = () => {
            if (isSleeping) {
                const video = document.querySelector("#reader video");
                if (video && video.readyState === 4) {
                    const canvas = motionCanvasRef.current;
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });

                    // Dibujar una versión pequeña para ahorrar CPU
                    ctx.drawImage(video, 0, 0, 40, 30);
                    const currentFrame = ctx.getImageData(0, 0, 40, 30).data;

                    if (prevFrameRef.current) {
                        let diff = 0;
                        for (let i = 0; i < currentFrame.length; i += 4) {
                            // Comparar brillo de cada píxel
                            diff += Math.abs(currentFrame[i] - prevFrameRef.current[i]);
                        }

                        // Si el cambio es significativo (alguien se acercó)
                        if (diff > 120000) { // Umbral de movimiento
                            wakeUp();
                        }
                    }
                    prevFrameRef.current = currentFrame;
                }
            }
            animationFrame = requestAnimationFrame(checkMotion);
        };

        if (isSleeping) {
            animationFrame = requestAnimationFrame(checkMotion);
        }
        return () => cancelAnimationFrame(animationFrame);
    }, [isSleeping]);

    const wakeUp = () => {
        setIsSleeping(false);
        lastActivityRef.current = Date.now();
    };

    const startScanner = async () => {
        if (scannerRef.current?.isScanning) return;
        try {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;
            const config = { fps: 15, qrbox: { width: 250, height: 250 } };
            await html5QrCode.start({ facingMode: "user" }, config, (msg) => {
                if (!isProcessingRef.current && !isSleeping) processScan(msg);
            }, () => { });
        } catch (err) {
            setError("Error de cámara");
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current?.isScanning) {
            try { await scannerRef.current.stop(); } catch (e) { }
        }
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
    };

    const processScan = async (employeeId) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setStatus('scanning');
        try {
            const { data, error: empError } = await supabase.from('employees').select('id, full_name, rut').eq('id', employeeId).single();
            if (empError || !data) throw new Error("No reconocido");

            const today = new Date().toISOString().split('T')[0];
            const { data: logs } = await supabase.from('attendance_logs').select('event_type').eq('employee_id', employeeId).gte('timestamp', `${today}T00:00:00Z`).order('timestamp', { ascending: true });

            const events = ['ENTRADA', 'INICIO COLACIÓN', 'TÉRMINO COLACIÓN', 'SALIDA'];
            if ((logs?.length || 0) >= 4) throw new Error("Jornada completa");

            setScannedData({ id: employeeId, name: data.full_name, rut: data.rut, nextEvent: events[logs?.length || 0] });
            setStatus('capturing');
        } catch (err) {
            setError(err.message);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    const capturePhoto = () => {
        const video = document.querySelector("#reader video");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        setPhoto(canvas.toDataURL("image/jpeg", 0.7));
        setStatus('confirming');
    };

    const confirmMarking = async () => {
        setStatus('submitting');
        try {
            await axios.post('https://twyndowkjummyjoouqnf.supabase.co/functions/v1/process-attendance', {
                employeeId: scannedData.id, lat: location?.lat, lng: location?.lng, timestamp: new Date().toISOString(), photo
            }, { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } });
            setStatus('success');
            setTimeout(() => { setStatus('idle'); wakeUp(); }, 5000);
        } catch (err) {
            setError("Error al registrar");
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    return (
        <div
            className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 md:p-8 font-sans overflow-hidden relative"
            onMouseMove={wakeUp}
            onTouchStart={wakeUp}
            onClick={wakeUp}
        >
            <canvas ref={motionCanvasRef} width="40" height="30" className="hidden" />

            {/* Overlay de Sueño */}
            <AnimatePresence>
                {isSleeping && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center cursor-pointer"
                    >
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="flex flex-col items-center space-y-6"
                        >
                            <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                                <Power className="text-blue-500/40" size={40} />
                            </div>
                            <div className="text-center">
                                <h2 className="text-slate-500 font-medium tracking-[.3em] uppercase text-sm mb-2">Modo Eco - Ahorro de Energía</h2>
                                <p className="text-slate-600 text-xs uppercase tracking-widest font-mono italic">Activación por proximidad lista</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* UI del Kiosko normal ... */}
            <button onClick={toggleFullscreen} className="fixed bottom-20 right-4 z-50 bg-white/5 p-3 rounded-full border border-white/10">
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>

            <style>{`
                #reader__scan_region video { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 1rem !important; }
                #reader { border: none !important; }
                #reader__scan_region { aspect-ratio: 1/1; }
            `}</style>

            <header className="w-full max-w-4xl flex justify-between items-center relative z-10 mb-4 px-2">
                <div className="flex items-center space-x-3">
                    <img src={logo} alt="SounMix" className="h-8 w-auto opacity-80" />
                    <div className="h-4 w-[1px] bg-white/20" />
                    <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">SOUNMIX</h1>
                </div>
                <div className="flex items-center space-x-2 text-xl font-mono text-blue-500/80">
                    <Clock size={18} className="animate-pulse" />
                    <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl relative z-10 py-4">
                <div className={`transition-all duration-1000 transform ${(status === 'idle' || status === 'capturing' || status === 'scanning') ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none h-0 overflow-hidden'}`}>
                    <div className="text-center w-full">
                        <div className="relative w-[75vw] h-[75vw] max-w-[300px] max-h-[300px] mx-auto mb-8">
                            <div id="reader" className={`w-full h-full overflow-hidden rounded-[2rem] border-4 transition-all duration-500 ${status === 'capturing' ? 'border-amber-500/50' : 'border-blue-500/30'} bg-black`}></div>
                            {status === 'idle' && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-[2px] bg-blue-500/30 blur-[1px] shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-[bounce_3s_infinite]" />
                            )}
                        </div>

                        <div className="min-h-[100px]">
                            <AnimatePresence mode="wait">
                                {status === 'idle' && (
                                    <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                                        <h2 className="text-2xl font-black tracking-tight uppercase">Acerque su Código QR</h2>
                                        <p className="text-slate-500 text-sm tracking-wide">Terminal SounMix lista para registro</p>
                                    </motion.div>
                                )}
                                {status === 'capturing' && scannedData && (
                                    <motion.div key="cap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                        <div className="py-2">
                                            <h2 className="text-xl font-bold text-amber-500 uppercase">{scannedData.name}</h2>
                                            <p className="text-slate-400 text-xs">Mire a la cámara para validación</p>
                                        </div>
                                        <button onClick={capturePhoto} className="px-8 py-4 bg-amber-500 hover:bg-amber-600 rounded-2xl font-black text-lg flex items-center space-x-3 mx-auto shadow-lg shadow-amber-500/20 active:scale-95 transition-transform">
                                            <Camera size={22} />
                                            <span>CAPTURAR ROSTRO</span>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {status === 'confirming' && scannedData && photo && (
                        <motion.div key="conf" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm bg-white/5 backdrop-blur-3xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl text-center">
                            <div className="w-28 h-28 rounded-3xl overflow-hidden border-2 border-blue-500/50 mx-auto mb-6 rotate-2 shadow-2xl">
                                <img src={photo} alt="Validación" className="w-full h-full object-cover scale-110" />
                            </div>
                            <div className="space-y-2 mb-8">
                                <h2 className="text-2xl font-black tracking-tighter truncate">{scannedData.name}</h2>
                                <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
                                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Próximo Evento</p>
                                    <p className="text-xl font-black text-white">{scannedData.nextEvent}</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setStatus('idle')} className="flex-1 py-4 bg-white/5 rounded-2xl font-bold text-sm">REHACER</button>
                                <button onClick={confirmMarking} className="flex-[2] py-4 bg-blue-600 rounded-2xl font-black text-lg shadow-lg shadow-blue-500/30 uppercase tracking-tighter">CONFIRMAR</button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="win" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-500/40 animate-bounce">
                                <CheckCircle className="text-white" size={40} />
                            </div>
                            <h2 className="text-4xl font-black tracking-tighter mb-2">¡ÉXITO!</h2>
                            <p className="text-green-500 font-medium">Registro SounMix completado ✅</p>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center max-w-xs px-4">
                            <AlertTriangle className="text-red-500 mx-auto mb-4" size={50} />
                            <h2 className="text-2xl font-black mb-1">INTENTE OTRA VEZ</h2>
                            <p className="text-red-400/80 text-sm mb-6 font-medium">{error}</p>
                            <button onClick={() => setStatus('idle')} className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl font-bold border border-red-500/20">REINTENTAR</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <footer className="w-full max-w-4xl flex justify-between items-center opacity-40 text-[9px] font-mono tracking-widest px-2 pb-2">
                <div className="flex items-center space-x-2">
                    <div className={`w-1 h-1 rounded-full ${location ? 'bg-green-500' : 'bg-red-500 animate-ping'}`} />
                    <span>GEOLOCALIZACIÓN: {location ? 'ACTIVA' : '...'}</span>
                </div>
                <span>VALIDACIÓN DT v2.7.0</span>
            </footer>
        </div>
    );
};

export default Kiosk;
