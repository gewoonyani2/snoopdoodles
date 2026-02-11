const express = require('express');
const mysql = require('mysql2/promise');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Google Calendar Setup
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-key.json'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });

let db;

async function init() {
    db = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    // API: Vrije slots ophalen
    app.get('/api/slots', async (req, res) => {
        const [rows] = await db.execute('SELECT id, start_time FROM time_slots WHERE is_booked = FALSE AND start_time > NOW() ORDER BY start_time');
        res.json(rows);
    });

    // API: Boeking verwerken
    app.post('/api/book', async (req, res) => {
        const { slot_id, first_name, dog_name, phone, email } = req.body;
        try {
            const [slot] = await db.execute('SELECT start_time FROM time_slots WHERE id = ? AND is_booked = FALSE', [slot_id]);
            if (slot.length === 0) return res.status(400).send("Slot niet beschikbaar");

            // Google Calendar Event
            await calendar.events.insert({
                calendarId: process.env.MOTHER_CALENDAR_ID,
                resource: {
                    summary: `Trimbeurt: ${dog_name} (${first_name})`,
                    description: `Tel: ${phone}\nEmail: ${email}`,
                    start: { dateTime: slot[0].start_time, timeZone: 'Europe/Brussels' },
                    end: { dateTime: new Date(new Date(slot[0].start_time).getTime() + 90 * 60000), timeZone: 'Europe/Brussels' },
                },
            });

            await db.execute('INSERT INTO bookings (slot_id, first_name, dog_name, phone, email) VALUES (?,?,?,?,?)', [slot_id, first_name, dog_name, phone, email]);
            await db.execute('UPDATE time_slots SET is_booked = TRUE WHERE id = ?', [slot_id]);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.listen(80, () => console.log('🚀 Booking systeem op http://localhost:3000'));
}
init();