const supabase = require('../config/supabase');
const { differenceInMinutes, parseISO } = require('date-fns');

class AttendanceCalculator {
    /**
     * Recalculates working_day records based on the most recent logs.
     * This version is session-aware and handles overnight shifts.
     */
    static async recalculateDay(employeeId) {
        // Fetch the last 15 logs to ensure we have enough context for the current session
        const { data: rawLogs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('employee_id', employeeId)
            .order('timestamp', { ascending: true })
            .limit(20);

        if (logsError) throw logsError;
        if (!rawLogs || rawLogs.length === 0) return;

        // Group logs into logical sessions (Entry -> [Lunches] -> Exit)
        const sessions = [];
        let currentSession = null;

        rawLogs.forEach(log => {
            const type = log.event_type.toUpperCase();
            const isEntry = type === 'ENTRY' || type === 'ENTRADA';

            // Start a new session if it's an ENTRY or if we don't have one
            // We also check for "stale" sessions (e.g. > 20 hours) to avoid grouping unrelated logs
            const isStale = currentSession && (new Date(log.timestamp) - new Date(currentSession.entry)) > (20 * 60 * 60 * 1000);

            if (isEntry || !currentSession || isStale) {
                currentSession = {
                    date: log.timestamp.split('T')[0],
                    entry: log.timestamp,
                    exit: null,
                    lunchStart: null,
                    lunchEnd: null
                };
                sessions.push(currentSession);
            }

            if (type === 'EXIT' || type === 'SALIDA') currentSession.exit = log.timestamp;
            else if (type === 'LUNCH_START' || type === 'INICIO COLACIÓN') currentSession.lunchStart = log.timestamp;
            else if (type === 'LUNCH_END' || type === 'TÉRMINO COLACIÓN') currentSession.lunchEnd = log.timestamp;
        });

        // Upsert the results for the most recent session(s)
        // We only update working_days for the sessions we processed
        for (const session of sessions) {
            let lunchMinutes = 0;
            if (session.lunchStart && session.lunchEnd) {
                lunchMinutes = differenceInMinutes(parseISO(session.lunchEnd), parseISO(session.lunchStart));
            }

            let totalMinutes = 0;
            if (session.entry && session.exit) {
                totalMinutes = differenceInMinutes(parseISO(session.exit), parseISO(session.entry)) - lunchMinutes;
            }

            // Cap ordinary at 9 hours (540 min)
            const ordinaryMinutes = Math.min(totalMinutes, 540);
            const overtimeMinutes = Math.max(0, totalMinutes - ordinaryMinutes);

            await supabase
                .from('working_days')
                .upsert({
                    employee_id: employeeId,
                    date: session.date,
                    actual_entry_time: session.entry,
                    actual_exit_time: session.exit,
                    lunch_minutes: lunchMinutes,
                    ordinary_minutes: ordinaryMinutes,
                    overtime_minutes: overtimeMinutes,
                    status: 'PRESENT'
                }, {
                    onConflict: 'employee_id, date'
                });
        }
    }

    /**
     * Calculates weekly totals for an employee.
     * Chilean law: 40 hours (2026 adaptation) max per week.
     */
    static async getWeeklyConsolidation(employeeId, startDate, endDate) {
        const { data, error } = await supabase
            .from('working_days')
            .select('ordinary_minutes, overtime_minutes')
            .eq('employee_id', employeeId)
            .gte('date', startDate)
            .lte('date', endDate);

        if (error) throw error;

        return data.reduce((acc, day) => ({
            ordinary: acc.ordinary + day.ordinary_minutes,
            overtime: acc.overtime + day.overtime_minutes
        }), { ordinary: 0, overtime: 0 });
    }
}

module.exports = AttendanceCalculator;
