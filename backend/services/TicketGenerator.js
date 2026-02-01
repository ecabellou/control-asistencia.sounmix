const crypto = require('crypto');
const { format } = require('date-fns');

class TicketGenerator {
    /**
     * Generates a security hash for the attendance log.
     * Rule: RUT + ISO + LAT + LONG
     */
    static generateHash(rut, timestamp, lat, lng) {
        const data = `${rut}|${timestamp}|${lat || '0'}|${lng || '0'}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Formats the ticket text as required by the DT.
     */
    static formatTicket(companyInfo, workerInfo, logInfo) {
        return `
COMPROBANTE DE REGISTRO DE ASISTENCIA

Información del Empleador:
Razón Social: ${companyInfo.name}
RUT: ${companyInfo.rut}

Información del Trabajador:
Nombre: ${workerInfo.fullName}
RUT: ${workerInfo.rut}

Detalle de la Marcación:
Tipo de Evento: ${logInfo.eventType}
Fecha: ${format(new Date(logInfo.timestamp), 'dd/MM/yyyy')}
Hora: ${format(new Date(logInfo.timestamp), 'HH:mm:ss')}
Ubicación: ${logInfo.lat && logInfo.lng ? `${logInfo.lat}, ${logInfo.lng}` : 'No disponible'}

Seguridad y Validación:
ID de Marcación: ${logInfo.id}
Hash de Integridad: ${logInfo.hash}

Este comprobante se emite en cumplimiento con la normativa vigente de la Dirección del Trabajo (Res. Ex. N°38).
        `.trim();
    }
}

module.exports = TicketGenerator;
