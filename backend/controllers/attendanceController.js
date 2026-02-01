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
    const today = timestamp.split('T')[0];
    const { data: logs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('event_type')
        .eq('employee_id', employeeId)
        .gte('timestamp', `${today}T00:00:00Z`)
        .lte('timestamp', `${today}T23:59:59Z`)
        .order('timestamp', { ascending: true });

    if (logsError) return res.status(500).json({ error: 'Error al consultar historial' });

    const logCount = logs.length;
    let eventType = '';

    switch (logCount) {
        case 0: eventType = 'ENTRY'; break;
        case 1: eventType = 'LUNCH_START'; break;
        case 2: eventType = 'LUNCH_END'; break;
        case 3: eventType = 'EXIT'; break;
        default:
            return res.status(400).json({
                error: 'Jornada ya completada para hoy. Ya se registraron las 4 marcas obligatorias.'
            });
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
    await AttendanceCalculator.recalculateDay(employeeId, today);

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
