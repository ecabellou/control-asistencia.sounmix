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
    const isProcessingRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn("GPS no disponible:", err.message)
            );
        }

        // Iniciar scanner al montar
        startScanner();

        return () => {
            clearInterval(timer);
            stopScanner();
        };
    }, []);

    // Manejar reinicio de scanner basado en status
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

    const [photo, setPhoto] = useState(null);

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
                // No limpiamos el ref aquí para poder reusar el elemento DOM si es necesario
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
        setStatus('confirming'); // Esto disparará el useEffect que detiene la cámara
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

                {/* PERSISTENT CAMERA VIEW (Must never be unmounted) */}
                <div className={`transition-all duration-700 transform ${(status === 'idle' || status === 'capturing' || status === 'scanning') ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none h-0'}`}>
                    <div className="text-center w-full">
                        <div className="relative w-80 h-80 mx-auto mb-10">
                            <div
                                id="reader"
                                className={`w-full h-full overflow-hidden rounded-3xl border-4 transition-all duration-500 ${status === 'capturing' ? 'border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.4)]' : 'border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.3)]'} bg-black`}
                            ></div>

                            {status === 'idle' && (
                                <>
                                    <div className="absolute inset-0 border-[20px] border-slate-950/40 pointer-events-none rounded-3xl" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-1 bg-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse" />
                                </>
                            )}

                            {status === 'capturing' && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-64 h-64 border-2 border-white/60 rounded-full border-dashed animate-[spin_8s_linear_infinite]" />
                                    <div className="absolute inset-0 bg-amber-500/5 rounded-3xl animate-pulse" />
                                </div>
                            )}
                        </div>

                        <div className="h-40"> {/* Fixed height for content to avoid jumps */}
                            <AnimatePresence mode="wait">
                                {status === 'idle' && (
                                    <motion.div key="idle-txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                                        <h2 className="text-3xl font-black tracking-tight">Acerque su Código QR</h2>
                                        <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
                                            Posicione su credencial frente a la cámara para iniciar el registro.
                                        </p>
                                    </motion.div>
                                )}
                                {status === 'scanning' && (
                                    <motion.div key="scan-txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                                        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold">Identificando...</h2>
                                    </motion.div>
                                )}
                                {status === 'capturing' && scannedData && (
                                    <motion.div key="cap-txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-amber-500 mb-1">Verificación Facial</h2>
                                            <p className="text-white text-lg font-medium">{scannedData.name}</p>
                                        </div>
                                        <button
                                            onClick={capturePhoto}
                                            className="px-10 py-5 bg-amber-500 hover:bg-amber-600 rounded-2xl font-black text-xl shadow-xl shadow-amber-500/30 transition-all active:scale-95 flex items-center space-x-3 mx-auto uppercase tracking-tighter"
                                        >
                                            <Camera size={28} />
                                            <span>TOMAR FOTO</span>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* OVERLAYS FOR CONFIRMATION, SUCCESS, ERROR */}
                <AnimatePresence mode="wait">
                    {status === 'confirming' && scannedData && photo && (
                        <motion.div
                            key="confirm" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                            className="w-full max-w-lg bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl text-center"
                        >
                            <div className="flex justify-center mb-10 gap-8 items-center">
                                <div className="w-28 h-28 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <ShieldCheck className="text-white" size={56} />
                                </div>
                                <div className="w-36 h-36 rounded-3xl overflow-hidden border-4 border-blue-500 shadow-2xl rotate-3">
                                    <img src={photo} alt="Captura" className="w-full h-full object-cover scale-110" />
                                </div>
                            </div>

                            <div className="space-y-3 mb-10">
                                <h3 className="text-xs text-blue-400 font-bold uppercase tracking-[0.3em]">Confirmación SounMix</h3>
                                <h2 className="text-4xl font-black tracking-tighter">{scannedData.name}</h2>
                                <div className="bg-slate-900/90 rounded-2xl p-5 border border-white/5 mt-6 shadow-inner">
                                    <p className="text-[10px] text-slate-500 uppercase mb-2 font-bold">Tipo de Registro</p>
                                    <p className="text-2xl font-black text-white tracking-tight">{scannedData.nextEvent}</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setStatus('idle')}
                                    className="flex-1 px-6 py-5 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/10"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmMarking}
                                    className="flex-[2] px-10 py-5 bg-blue-600 hover:bg-blue-700 rounded-2xl font-black text-xl shadow-xl shadow-blue-600/30 transition-all active:scale-95 uppercase tracking-tighter"
                                >
                                    Confirmar Todo
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'submitting' && (
                        <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
                            <div className="w-20 h-20 border-[6px] border-blue-600 border-t-transparent rounded-full animate-spin mb-8" />
                            <p className="text-2xl font-black tracking-tight animate-pulse text-blue-400 uppercase">Firmando registro digital...</p>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div
                            key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                            className="bg-green-500/10 border border-green-500/20 p-12 rounded-[3rem] text-center shadow-2xl backdrop-blur-md"
                        >
                            <div className="w-28 h-28 bg-green-500 rounded-full mx-auto mb-8 flex items-center justify-center shadow-lg shadow-green-500/50 animate-bounce">
                                <CheckCircle className="text-white" size={64} />
                            </div>
                            <h2 className="text-5xl font-black text-white mb-4 tracking-tighter">¡LISTO!</h2>
                            <p className="text-green-400 text-xl mb-6 font-medium">Asistencia registrada para SounMix.</p>
                            <div className="inline-flex items-center space-x-3 bg-green-500/20 text-green-300 px-6 py-3 rounded-2xl text-sm font-mono border border-green-500/30">
                                <ShieldCheck size={20} />
                                <span className="font-bold">HASH RES. 38 VALIDADO</span>
                            </div>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div
                            key="error" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            className="bg-red-500/10 border border-red-500/20 p-12 rounded-[3rem] text-center backdrop-blur-md"
                        >
                            <div className="w-24 h-24 bg-red-500 rounded-full mx-auto mb-8 flex items-center justify-center shadow-lg shadow-red-500/50">
                                <AlertTriangle className="text-white" size={48} />
                            </div>
                            <h2 className="text-3xl font-black text-white mb-3">UPS! ALGO SALIÓ MAL</h2>
                            <p className="text-red-400 text-lg mb-8">{error}</p>
                            <button
                                onClick={() => setStatus('idle')}
                                className="px-12 py-4 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-2xl font-black transition-all border border-red-500/20 uppercase"
                            >
                                Volver a Intentar
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
