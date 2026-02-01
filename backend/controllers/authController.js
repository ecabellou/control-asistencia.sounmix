const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerAdmin = async (req, res) => {
    const { email, password, full_name } = req.body;

    // Check if user exists in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name }
        }
    });

    if (authError) return res.status(400).json({ error: authError.message });

    res.json({ message: 'Administrador registrado. Por favor verifica tu email.', user: authData.user });
};

exports.loginAdmin = async (req, res) => {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) return res.status(401).json({ error: 'Credenciales inválidas' });

    // Generate our own JWT if we want to add custom claims or use it for our legacy middleware
    const token = jwt.sign(
        { id: data.user.id, email: data.user.email },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.json({
        token,
        user: {
            id: data.user.id,
            email: data.user.email,
            full_name: data.user.user_metadata.full_name
        }
    });
};
