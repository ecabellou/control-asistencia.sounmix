require('dotenv').config({ path: './.env' });
const supabase = require('./backend/config/supabase');

async function debugLogin() {
    const email = 'admin@audiomix.cl';
    const password = 'Admin12345!';

    console.log(`Intentando login directo en el backend para: ${email}...`);

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        console.error('❌ Error en login:', error.message);
        if (error.message.includes('Email not confirmed')) {
            console.log('💡 El usuario existe pero requiere confirmación manual en el panel de Supabase.');
        } else if (error.message.includes('Invalid login credentials')) {
            console.log('💡 Clave o email incorrectos. O el usuario no existe.');
        }
    } else {
        console.log('✅ Login exitoso en el backend!');
        console.log('User ID:', data.user.id);
    }
}

debugLogin();
