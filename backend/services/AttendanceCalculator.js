const supabase = require('../config/supabase');
const { differenceInMinutes, parseISO } = require('date-fns');

class AttendanceCalculator {
    /**
     * Recalculates the working_day record for a specific date and employee.
     */
    static async recalculateDay(employeeId, date) {
        // Get all logs for this employee on this date
        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('employee_id', employeeId)
            .gte('timestamp', `${date}T00:00:00Z`)
            .lte('timestamp', `${date}T23:59:59Z`)
            .order('timestamp', { ascending: true });

        if (logsError) throw logsError;

        let entry = null;
        let lunchStart = null;
        let lunchEnd = null;
        let exit = null;

        logs.forEach(log => {
            switch (log.event_type) {
                case 'ENTRY': entry = log.timestamp; break;
                case 'LUNCH_START': lunchStart = log.timestamp; break;
                case 'LUNCH_END': lunchEnd = log.timestamp; break;
                case 'EXIT': exit = log.timestamp; break;
            }
        });

        let lunchMinutes = 0;
        if (lunchStart && lunchEnd) {
            lunchMinutes = differenceInMinutes(parseISO(lunchEnd), parseISO(lunchStart));
        }

        let totalMinutes = 0;
        if (entry && exit) {
            totalMinutes = differenceInMinutes(parseISO(exit), parseISO(entry)) - lunchMinutes;
        }

        // Chilean law: 40 hours is the standard. Daily ordinary is usually around 8-9 hours depending on the distribution.
        // For simplicity, we cap daily ordinary at 9 hours (540 min) and the rest is overtime.
        const ordinaryMinutes = Math.min(totalMinutes, 540);
        const overtimeMinutes = Math.max(0, totalMinutes - ordinaryMinutes);

        const { error: upsertError } = await supabase
            .from('working_days')
            .upsert({
                employee_id: employeeId,
                date: date,
                actual_entry_time: entry,
                actual_exit_time: exit,
                lunch_minutes: lunchMinutes,
                ordinary_minutes: ordinaryMinutes,
                overtime_minutes: overtimeMinutes,
                status: 'PRESENT'
            }, {
                onConflict: 'employee_id, date'
            });

        if (upsertError) throw upsertError;
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
