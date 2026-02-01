const supabase = require('../config/supabase');

exports.getEmployees = async (req, res) => {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('active', true)
        .order('full_name');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

exports.createEmployee = async (req, res) => {
    const { rut, full_name, email, phone, weekly_hours_agreed, shift_start, shift_end, is_telework } = req.body;

    const { data, error } = await supabase
        .from('employees')
        .insert([{
            rut,
            full_name,
            email,
            phone,
            weekly_hours_agreed: weekly_hours_agreed || 40,
            shift_start,
            shift_end,
            is_telework: !!is_telework
        }])
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id, message: 'Trabajador creado con éxito' });
};

exports.updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { rut, full_name, email, phone, weekly_hours_agreed, shift_start, shift_end, is_telework } = req.body;

    const { error } = await supabase
        .from('employees')
        .update({
            rut,
            full_name,
            email,
            phone,
            weekly_hours_agreed,
            shift_start,
            shift_end,
            is_telework: !!is_telework
        })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Trabajador actualizado con éxito' });
};

exports.deleteEmployee = async (req, res) => {
    const { id } = req.params;
    // We soft delete by setting active to false for history reasons
    const { error } = await supabase
        .from('employees')
        .update({ active: false })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Trabajador desactivado con éxito' });
};
