const supabase = require('../config/supabase');
const TicketGenerator = require('../services/TicketGenerator');
const AttendanceCalculator = require('../services/AttendanceCalculator');

exports.scanQR = async (req, res) => {
    const { employeeId, lat, lng, timestamp } = req.body;

    // 1. Get Employee Data
    const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single();

    if (empError || !employee) return res.status(404).json({ error: 'Trabajador no encontrado' });

    // 2. Determine Event Type (State Machine)
    // Instead of looking at today's logs only, we look at the last log to support overnight shifts.
    const { data: lastLogs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('event_type, timestamp')
        .eq('employee_id', employeeId)
        .order('timestamp', { ascending: false })
        .limit(1);

    if (logsError) return res.status(500).json({ error: 'Error al consultar historial' });

    const lastLog = lastLogs?.[0];
    let eventType = 'ENTRY'; // Default if no logs or session closed/expired

    if (lastLog) {
        const lastTimestamp = new Date(lastLog.timestamp);
        const currentTimestamp = new Date(timestamp);
        const hoursSinceLast = (currentTimestamp - lastTimestamp) / (1000 * 60 * 60);

        // If the last log was more than 16 hours ago, we assume it's a new day/shift
        // regardless of if they forgot to check out.
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
    const companyInfo = { name: 'Empresa Demo S.A.', rut: '76.123.456-K' };
    const workerInfo = { fullName: employee.full_name, rut: employee.rut };
    const logInfo = { id: newLog.id, eventType, timestamp, lat, lng, hash };

    const ticketText = TicketGenerator.formatTicket(companyInfo, workerInfo, logInfo);

    res.json({
        message: `Evento ${eventType} registrado con éxito`,
        ticket: ticketText,
        hash: hash
    });
};

exports.getReports = async (req, res) => {
    const { startDate, endDate, employeeId } = req.query;

    let query = supabase
        .from('working_days')
        .select(`
            *,
            employees (
                full_name,
                rut
            )
        `)
        .gte('date', startDate)
        .lte('date', endDate);

    if (employeeId) {
        query = query.eq('employee_id', employeeId);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: 'Error al obtener reportes' });

    // Flatten the data to maintain previous structure if needed
    const formattedData = data.map(row => ({
        ...row,
        full_name: row.employees.full_name,
        rut: row.employees.rut
    }));

    res.json(formattedData);
};
