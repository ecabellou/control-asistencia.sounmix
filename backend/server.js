const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(morgan('dev'));

// Static files for tickets/reports if needed
app.use('/public', express.static('public'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));

app.get('/', (req, res) => {
    res.send('Attendance API is running');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} (Network accessible)`);
});
