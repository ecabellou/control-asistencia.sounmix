const supabase = require('../config/supabase');

exports.checkStatus = async (req, res) => {
    const { employeeId } = req.params;

    const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', employeeId)
        .single();

    if (empError || !employee) return res.status(404).json({ error: 'Trabajador no encontrado' });

    const today = new Date().toISOString().split('T')[0];

    const { data: logs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('event_type')
        .eq('employee_id', employeeId)
        .gte('timestamp', `${today}T00:00:00Z`)
        .lte('timestamp', `${today}T23:59:59Z`)
        .order('timestamp', { ascending: true });

    if (logsError) return res.status(500).json({ error: 'Error al consultar logs' });

    const logCount = logs.length;
    let nextEvent = '';
    let isComplete = false;

    const events = ['ENTRADA', 'INICIO COLACIÓN', 'TÉRMINO COLACIÓN', 'SALIDA'];

    if (logCount < 4) {
        nextEvent = events[logCount];
    } else {
        nextEvent = 'JORNADA COMPLETA';
        isComplete = true;
    }

    res.json({
        name: employee.full_name,
        nextEvent,
        isComplete
    });
};
