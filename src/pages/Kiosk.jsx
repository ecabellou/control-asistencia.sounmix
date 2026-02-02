import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Clock, ShieldCheck, Camera, Maximize, Minimize, Power, Ghost, QrCode } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
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

    // 1. Reloj y Geolocalización
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn("GPS no disponible:", err.message)
            );
        }

        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            clearInterval(timer);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    // 2. Control de Inactividad (Modo Eco)
    useEffect(() => {
        const idleCheck = setInterval(() => {
            if (!isSleeping && status === 'idle' && (Date.now() - lastActivityRef.current > 15000)) {
                setIsSleeping(true);
            }
        }, 2000);
        return () => clearInterval(idleCheck);
    }, [isSleeping, status]);

    // 3. Control del Scanner QR
    useEffect(() => {
        const manageScanner = async () => {
            if (status === 'idle') {
                if (!scannerRef.current?.isScanning) {
                    await startScanner();
                }
            } else {
                await stopScanner();
            }
        };
        manageScanner();
    }, [status]);

    useEffect(() => {
        return () => {
            stopScanner();
        };
    }, []);

    const startScanner = async () => {
        if (scannerRef.current?.isScanning) return;
        try {
            const container = document.getElementById("reader");
            if (!container) return;

            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;
            const config = { fps: 15, qrbox: { width: 250, height: 250 } };

            await html5QrCode.start(
                { facingMode: "user" },
                config,
                (msg) => {
                    if (isSleeping) {
                        wakeUp();
                        setTimeout(() => processScan(msg), 100);
                    } else if (!isProcessingRef.current) {
                        processScan(msg);
                    }
                },
                () => { }
            );
        } catch (err) {
            console.error("Error iniciando scanner:", err);
            setError("Error de cámara");
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current = null;
            } catch (e) {
                console.error("Error deteniendo scanner:", e);
            }
        }
    };

    const wakeUp = () => {
        setIsSleeping(false);
        lastActivityRef.current = Date.now();
    };

    // 4. Detección de Movimiento (Proximidad)
    useEffect(() => {
        let animationFrame;
        const checkMotion = () => {
            if (isSleeping) {
                const video = document.querySelector("#reader video");
                if (video && video.readyState === 4) {
                    const canvas = motionCanvasRef.current;
                    if (canvas) {
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(video, 0, 0, 40, 30);
                        const currentFrame = ctx.getImageData(0, 0, 40, 30).data;
                        if (prevFrameRef.current) {
                            let diff = 0;
                            for (let i = 0; i < currentFrame.length; i += 4) {
                                diff += Math.abs(currentFrame[i] - prevFrameRef.current[i]);
                            }
                            if (diff > 120000) wakeUp();
                        }
                        prevFrameRef.current = currentFrame;
                    }
                }
            }
            animationFrame = requestAnimationFrame(checkMotion);
        };
        animationFrame = requestAnimationFrame(checkMotion);
        return () => cancelAnimationFrame(animationFrame);
    }, [isSleeping]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
    };

    const processScan = async (employeeId) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setStatus('scanning');
        setError(null);
        try {
            const { data, error: empError } = await supabase.from('employees').select('id, full_name, rut').eq('id', employeeId).single();
            if (empError || !data) throw new Error("Trabajador no reconocido");

            const today = new Date().toISOString().split('T')[0];
            const { data: logs } = await supabase.from('attendance_logs').select('event_type').eq('employee_id', employeeId).gte('timestamp', `${today}T00:00:00Z`).order('timestamp', { ascending: true });

            const events = ['ENTRADA', 'INICIO COLACIÓN', 'TÉRMINO COLACIÓN', 'SALIDA'];
            if ((logs?.length || 0) >= 4) throw new Error("Jornada completada hoy");

            setScannedData({ id: employeeId, name: data.full_name, rut: data.rut, nextEvent: events[logs?.length || 0] });
            setStatus('capturing');
        } catch (err) {
            setError(err.message);
            setStatus('error');
            setTimeout(() => {
                setStatus('idle');
                isProcessingRef.current = false;
            }, 4000);
        }
    };

    const capturePhoto = () => {
        const video = document.querySelector("#reader video");
        if (!video) return;
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
            setTimeout(() => {
                setStatus('idle');
                isProcessingRef.current = false;
                wakeUp();
            }, 6000);
        } catch (err) {
            setError("Error al registrar");
            setStatus('error');
            setTimeout(() => {
                setStatus('idle');
                isProcessingRef.current = false;
            }, 4000);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 md:p-8 font-sans overflow-hidden relative"
            onMouseMove={wakeUp} onTouchStart={wakeUp} onClick={wakeUp}>

            <canvas ref={motionCanvasRef} width="40" height="30" className="hidden" />

            <AnimatePresence>
                {isSleeping && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center pointer-events-auto">
                        <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity }}
                            className="flex flex-col items-center space-y-6">
                            <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.1)]">
                                <Power className="text-blue-500/40" size={40} />
                            </div>
                            <div className="text-center">
                                <h2 className="text-slate-500 font-medium tracking-[.3em] uppercase text-sm mb-2">Modo Ahorro Activado</h2>
                                <p className="text-slate-600 text-[10px] uppercase tracking-widest font-mono italic">Acerque su código para despertar</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <button onClick={toggleFullscreen} className="fixed bottom-20 right-4 z-[60] bg-white/5 p-3 rounded-full border border-white/10 active:scale-95 transition-transform backdrop-blur-md">
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>

            <style>{`
                #reader__scan_region video { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 1rem !important; }
                #reader { border: none !important; }
                #reader__scan_region { aspect-ratio: 1/1; }
            `}</style>

            <header className="w-full max-w-5xl flex justify-between items-start relative z-10 px-4 md:px-6 pt-2">
                <div className="flex items-center space-x-3 mt-1">
                    <img src={logo} alt="SounMix" className="h-7 md:h-9 w-auto opacity-90" />
                    <div className="h-5 w-[1px] bg-white/10" />
                    <div className="flex flex-col">
                        <h1 className="text-base md:text-lg font-black tracking-tighter leading-none text-white">SOUNMIX</h1>
                        <span className="text-[8px] text-blue-500 font-bold tracking-[.2em] uppercase">Terminal</span>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="text-3xl md:text-4xl font-light tracking-tighter tabular-nums text-white leading-none">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                    <div className="text-[9px] md:text-[10px] text-slate-500 font-medium uppercase tracking-[.1em] mt-1">
                        {currentTime.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')}
                    </div>
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
                                {status === 'scanning' && (
                                    <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                                        <div className="flex justify-center mb-2">
                                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                        <h2 className="text-xl font-bold animate-pulse text-blue-400">IDENTIFICANDO...</h2>
                                    </motion.div>
                                )}
                                {status === 'capturing' && scannedData && (
                                    <motion.div key="cap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 px-4 text-center">
                                        <div className="py-2">
                                            <h2 className="text-xl md:text-2xl font-black text-amber-500 uppercase truncate max-w-xs mx-auto">{scannedData.name}</h2>
                                            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-bold">Mire a la cámara para validación</p>
                                        </div>
                                        <button onClick={capturePhoto} className="px-8 py-4 bg-gradient-to-tr from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 rounded-2xl font-black text-lg flex items-center space-x-3 mx-auto shadow-xl shadow-amber-900/20 active:scale-95 transition-all uppercase tracking-tighter">
                                            <Camera size={24} />
                                            <span>CAPTURAR FOTO</span>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {status === 'confirming' && scannedData && photo && (
                        <motion.div key="conf" initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="w-full max-w-[340px] md:max-w-md bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-6 md:p-8 rounded-[2.5rem] shadow-2xl text-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 blur-[40px] rounded-full -mr-10 -mt-10" />
                            <div className="flex justify-center items-center gap-4 md:gap-6 mb-8 relative z-10">
                                <div className="relative group">
                                    <div className="relative bg-white p-2 rounded-2xl shadow-xl">
                                        <QRCodeCanvas value={scannedData.id} size={80} level="H" />
                                    </div>
                                    <p className="text-[7px] text-slate-500 mt-1 uppercase font-bold tracking-tighter">ID ÚNICO</p>
                                </div>
                                <div className="h-10 w-[1px] bg-white/10 rotate-12" />
                                <div className="relative group">
                                    <div className="relative w-24 h-24 rounded-[2rem] overflow-hidden border-2 border-blue-500/50 shadow-2xl">
                                        <img src={photo} alt="Validación" className="w-full h-full object-cover scale-110" />
                                    </div>
                                    <p className="text-[7px] text-blue-400 mt-1 uppercase font-bold tracking-tighter">BIOMETRÍA</p>
                                </div>
                            </div>
                            <div className="space-y-2 mb-8 relative z-10 text-center">
                                <div className="inline-flex items-center space-x-2 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 mb-2">
                                    <ShieldCheck size={12} className="text-blue-500" />
                                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-[.2em]">Identidad Verificada</span>
                                </div>
                                <h2 className="text-2xl md:text-3xl font-black tracking-tighter truncate text-white uppercase px-2">{scannedData.name}</h2>
                                <p className="text-slate-500 text-[10px] font-mono tracking-widest">{scannedData.rut}</p>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 mt-6 shadow-inner relative overflow-hidden group">
                                    <p className="text-[9px] text-slate-500 uppercase font-black tracking-[.2em] mb-1 relative z-10">Acción Detectada</p>
                                    <p className="text-xl md:text-2xl font-black text-white relative z-10">{scannedData.nextEvent}</p>
                                </div>
                            </div>
                            <div className="flex gap-4 relative z-10">
                                <button onClick={() => { setStatus('idle'); isProcessingRef.current = false; }}
                                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-xs tracking-widest transition-all border border-white/5 uppercase">
                                    REHACER
                                </button>
                                <button onClick={confirmMarking}
                                    className="flex-[2] py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-2xl font-black text-lg shadow-xl shadow-blue-900/40 uppercase tracking-tighter active:scale-95 transition-all">
                                    REGISTRAR
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'submitting' && (
                        <motion.div key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                            <p className="text-xl font-bold animate-pulse text-blue-400 tracking-widest uppercase">PROCESANDO...</p>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="win" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center px-4">
                            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(34,197,94,0.4)] animate-bounce text-white">
                                <CheckCircle size={40} />
                            </div>
                            <h2 className="text-4xl font-black tracking-tighter mb-2 uppercase">¡ÉXITO!</h2>
                            <p className="text-green-500 font-medium tracking-wide">Registro SounMix completado con éxito ✅</p>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center max-w-xs px-6">
                            <AlertTriangle className="text-red-500 mx-auto mb-4" size={56} />
                            <h2 className="text-2xl font-black mb-1 text-white uppercase">REINTENTAR</h2>
                            <p className="text-red-400/80 text-sm mb-6 font-medium leading-relaxed">{error}</p>
                            <button onClick={() => { setStatus('idle'); isProcessingRef.current = false; }}
                                className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl font-bold border border-red-500/20 active:scale-95 transition-transform uppercase tracking-widest">
                                VOLVER
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <footer className="w-full max-w-4xl flex justify-between items-center opacity-40 text-[9px] font-mono tracking-widest px-4 pb-2">
                <div className="flex items-center space-x-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${location ? 'bg-green-500' : 'bg-red-500 animate-ping'}`} />
                    <span>GEOLOCALIZACIÓN: {location ? 'ACTIVA' : '...'}</span>
                </div>
                <span>SounMix v2.7.5</span>
            </footer>
        </div>
    );
};

export default Kiosk;
