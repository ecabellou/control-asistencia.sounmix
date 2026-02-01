require('dotenv').config({ path: './backend/.env' });
const supabase = require('../config/supabase');

async function createAdmin() {
    const email = 'admin@audiomix.cl';
    const password = 'Admin12345!';
    const full_name = 'Administrador Sistema';

    console.log(`Intentando crear admin: ${email}...`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name }
        }
    });

    if (error) {
        console.error('Error al crear admin:', error.message);
        return;
    }

    console.log('--- ADMIN CREADO EXITOSAMENTE ---');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('---------------------------------');
    console.log('NOTA: Si el proyecto tiene confirmación de email activada, deberás revisar el correo o confirmarlo manualmente en el panel de Supabase.');
}

createAdmin();
