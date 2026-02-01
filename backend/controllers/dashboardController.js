const supabase = require('../config/supabase');

exports.getStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Total Workers
        const { count: totalWorkers, error: error1 } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true })
            .eq('active', true);

        // 2. Present Today
        const { count: presentToday, error: error2 } = await supabase
            .from('working_days')
            .select('*', { count: 'exact', head: true })
            .eq('date', today)
            .eq('status', 'PRESENT');

        // 3. Pending Notifications
        const { count: pendingAlerts, error: error3 } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('read', false);

        // 4. Latest Notifications for the list
        const { data: recentAlerts, error: error4 } = await supabase
            .from('notifications')
            .select(`
                *,
                employees (full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error1 || error2 || error3 || error4) throw new Error('Error fetching stats');

        // Compliance calculation
        const compliance = totalWorkers > 0 ? Math.round((presentToday / totalWorkers) * 100) : 0;

        res.json({
            stats: [
                { label: 'Total Trabajadores', value: totalWorkers || 0, color: 'blue' },
                { label: 'Presentes Hoy', value: presentToday || 0, color: 'green' },
                { label: 'Alertas Pendientes', value: pendingAlerts || 0, color: 'red' },
                { label: 'Cumplimiento', value: `${compliance}%`, color: 'indigo' },
            ],
            recentAlerts: recentAlerts.map(a => ({
                user: a.employees.full_name,
                msg: a.message,
                time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: a.type === 'OVERTIME' ? 'warning' : a.type === 'SYSTEM' ? 'info' : 'error'
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
