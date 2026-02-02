const supabase = require('../../backend/config/supabase');
const TicketGenerator = require('../../backend/services/TicketGenerator');
const AttendanceCalculator = require('../../backend/services/AttendanceCalculator');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { employeeId, lat, lng, timestamp } = req.body;

    try {
        // 1. Get Employee Data
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (empError || !employee) return res.status(404).json({ error: 'Trabajador no encontrado' });

        // 2. Determine Event Type (State Machine)
        const { data: lastLogs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('event_type, timestamp')
            .eq('employee_id', employeeId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (logsError) return res.status(500).json({ error: 'Error al consultar historial' });

        const lastLog = lastLogs?.[0];
        let eventType = 'ENTRY';

        if (lastLog) {
            const lastTimestamp = new Date(lastLog.timestamp);
            const currentTimestamp = new Date(timestamp);
            const hoursSinceLast = (currentTimestamp - lastTimestamp) / (1000 * 60 * 60);

            if (hoursSinceLast < 16) {
                switch (lastLog.event_type) {
                    case 'ENTRY': eventType = 'LUNCH_START'; break;
                    case 'LUNCH_START': eventType = 'LUNCH_END'; break;
                    case 'LUNCH_END': eventType = 'EXIT'; break;
                    case 'EXIT': eventType = 'ENTRY'; break;
                }
            }
        }

        // 3. Generate Security Hash
        const hash = TicketGenerator.generateHash(employee.rut, timestamp, lat, lng);

        // 4. Save Raw Log
        const { data: newLog, error: saveError } = await supabase
            .from('attendance_logs')
            .insert([{
                employee_id: employeeId,
                event_type: eventType,
                timestamp,
                lat,
                lng,
                hash
            }])
            .select()
            .single();

        if (saveError) return res.status(500).json({ error: 'Error al guardar la marca' });

        // 5. Trigger Calculation
        await AttendanceCalculator.recalculateDay(employeeId);

        // 6. Generate Ticket Response
        const companyInfo = { name: 'SoundMix SpA', rut: '76.123.456-K' };
        const workerInfo = { fullName: employee.full_name, rut: employee.rut };
        const logInfo = { id: newLog.id, eventType, timestamp, lat, lng, hash };

        const ticketText = TicketGenerator.formatTicket(companyInfo, workerInfo, logInfo);

        res.json({
            message: `Evento ${eventType} registrado con éxito`,
            ticket: ticketText,
            hash: hash
        });
    } catch (error) {
        console.error('Error in scan endpoint:', error);
        res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
};
