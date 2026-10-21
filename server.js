const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use(async (req, res, next) => {
  try {
    await db.ready;
    next();
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    res.status(503).json({ error: 'Database is not ready.' });
  }
});

// Helper to get local network IP
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Simple CSV parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Regex to split comma outside quotes
    const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      let val = values[idx] || '';
      val = val.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      obj[h] = val;
    });
    rows.push(obj);
  }
  return rows;
}

// Helper to generate CSV string
function toCSV(headers, rows) {
  const headerLine = headers.map(h => `"${h.label}"`).join(',');
  const rowLines = rows.map(r => {
    return headers.map(h => {
      const val = r[h.key] ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',');
  });
  return [headerLine, ...rowLines].join('\n');
}

// -------------------------------------------------------------
// SSE REAL-TIME BROADCAST (Requirement #6)
// -------------------------------------------------------------
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, id: Date.now() + Math.random() };
  sseClients.add(client);

  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
  });
});

// Broadcast changes to all open tabs and devices
db.subscribe(event => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
});

// -------------------------------------------------------------
// BOOTSTRAP ENDPOINT (Sync all state on load or switch)
// -------------------------------------------------------------
app.get('/api/bootstrap', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.role || null;
    const uid = req.headers['x-user-id'] || req.query.uid || null;

    const data = {
      departments: db.getDepartments(),
      students: db.getStudents(),
      faculty: db.getFaculty(),
      reasons: db.getReasons(),
      timetable: db.getTimetable(),
      availability: db.getAvailability(),
      appointments: db.getAppointments(role, uid),
      reports: db.data.reports || [],
      ratings: db.data.ratings || [],
      notifications: (role && uid) ? db.getNotifications(role, uid) : [],
      stats: db.getStats(),
      network: {
        ips: getNetworkIps(),
        port: PORT
      }
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// STUDENTS MANAGEMENT (Requirement #1)
// -------------------------------------------------------------
app.get('/api/students', (req, res) => {
  try {
    const students = db.getStudents(req.query);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', (req, res) => {
  try {
    const student = db.addStudent(req.body);
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/students/:id', (req, res) => {
  try {
    const student = db.updateStudent(req.params.id, req.body);
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const result = db.deleteOrArchiveStudent(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/students/import-csv', (req, res) => {
  try {
    const csvContent = req.body.csv;
    if (!csvContent) return res.status(400).json({ error: 'CSV content is required' });

    const rows = parseCSV(csvContent);
    if (!rows.length) return res.status(400).json({ error: 'No data rows found in CSV' });

    let createdCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        db.addStudent({
          student_name: row.student_name || row.Name || row.name,
          usn: row.usn || row.USN,
          dob: row.dob || row.DOB || '2005-01-01',
          department_id: row.department_id || row.department || 'DEPT001',
          semester: row.semester || row.sem || 3,
          section: row.section || row.sec || 'A',
          account_status: row.account_status || 'active'
        });
        createdCount++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    res.json({ success: true, createdCount, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/students/export-csv', (req, res) => {
  try {
    const students = db.getStudents();
    const headers = [
      { key: 'student_id', label: 'student_id' },
      { key: 'student_name', label: 'student_name' },
      { key: 'usn', label: 'usn' },
      { key: 'dob', label: 'dob' },
      { key: 'department_id', label: 'department_id' },
      { key: 'semester', label: 'semester' },
      { key: 'section', label: 'section' },
      { key: 'account_status', label: 'account_status' }
    ];
    const csv = toCSV(headers, students);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// FACULTY MANAGEMENT (Requirement #1)
// -------------------------------------------------------------
app.get('/api/faculty', (req, res) => {
  try {
    const faculty = db.getFaculty(req.query);
    res.json(faculty);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faculty', (req, res) => {
  try {
    const faculty = db.addFaculty(req.body);
    res.status(201).json(faculty);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/faculty/:id', (req, res) => {
  try {
    const faculty = db.updateFaculty(req.params.id, req.body);
    res.json(faculty);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/faculty/:id', (req, res) => {
  try {
    const result = db.deleteOrArchiveFaculty(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/faculty/import-csv', (req, res) => {
  try {
    const csvContent = req.body.csv;
    if (!csvContent) return res.status(400).json({ error: 'CSV content is required' });

    const rows = parseCSV(csvContent);
    if (!rows.length) return res.status(400).json({ error: 'No data rows found in CSV' });

    let createdCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        db.addFaculty({
          faculty_name: row.faculty_name || row.Name || row.name,
          department_id: row.department_id || row.department || 'DEPT001',
          designation: row.designation || 'Assistant Professor',
          cabin_location: row.cabin_location || row.cabin || 'A Block, Room 101',
          email: row.email,
          office_hours: row.office_hours,
          account_status: row.account_status || 'active'
        });
        createdCount++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    res.json({ success: true, createdCount, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/faculty/export-csv', (req, res) => {
  try {
    const faculty = db.getFaculty();
    const headers = [
      { key: 'faculty_id', label: 'faculty_id' },
      { key: 'faculty_name', label: 'faculty_name' },
      { key: 'department_id', label: 'department_id' },
      { key: 'designation', label: 'designation' },
      { key: 'cabin_location', label: 'cabin_location' },
      { key: 'email', label: 'email' },
      { key: 'office_hours', label: 'office_hours' },
      { key: 'account_status', label: 'account_status' }
    ];
    const csv = toCSV(headers, faculty);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="faculty.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// DEPARTMENTS MANAGEMENT
// -------------------------------------------------------------
app.get('/api/departments', (req, res) => {
  res.json(db.getDepartments());
});

app.post('/api/departments', (req, res) => {
  try {
    const dept = db.addDepartment(req.body);
    res.status(201).json(dept);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/departments/:id', (req, res) => {
  try {
    const dept = db.updateDepartment(req.params.id, req.body);
    res.json(dept);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// TIMETABLE & AVAILABILITY
// -------------------------------------------------------------
app.get('/api/timetable', (req, res) => {
  res.json(db.getTimetable(req.query.faculty_id));
});

app.post('/api/timetable', (req, res) => {
  try {
    const entry = db.addTimetableEntry(req.body);
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/timetable/:id', (req, res) => {
  try {
    const result = db.deleteTimetableEntry(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/availability', (req, res) => {
  res.json(db.getAvailability(req.query.faculty_id));
});

app.post('/api/availability', (req, res) => {
  try {
    const slot = db.addAvailabilitySlot(req.body);
    res.status(201).json(slot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/availability/:id', (req, res) => {
  try {
    const result = db.deleteAvailabilitySlot(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/slots', (req, res) => {
  try {
    const { faculty_id, date, student_id } = req.query;
    if (!faculty_id || !date) return res.status(400).json({ error: 'faculty_id and date are required' });
    const slots = db.computeFacultySlots(faculty_id, date, student_id);
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// APPOINTMENTS WORKFLOW (Requirements #2, #3, #5, #7, #8)
// -------------------------------------------------------------
app.get('/api/appointments', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.role;
    const uid = req.headers['x-user-id'] || req.query.uid;
    const appointments = db.getAppointments(role, uid, req.query);
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student books appointment
app.post('/api/appointments/book', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.body.role;
    const uid = req.headers['x-user-id'] || req.body.student_id;
    if (role !== 'student' && role !== 'admin') {
      return res.status(403).json({ error: 'Only students can book student consultations' });
    }

    const apt = db.bookAppointmentByStudent({
      student_id: uid,
      faculty_id: req.body.faculty_id,
      reason_id: req.body.reason_id,
      appointment_date: req.body.appointment_date,
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      student_message: req.body.student_message
    });
    res.status(201).json(apt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Faculty schedules meeting with student (Requirement #2)
app.post('/api/appointments/schedule-meeting', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.body.role;
    const uid = req.headers['x-user-id'] || req.body.faculty_id;
    if (role !== 'faculty' && role !== 'admin') {
      return res.status(403).json({ error: 'Only faculty members can schedule meetings with students' });
    }

    const apt = db.scheduleMeetingByFaculty({
      faculty_id: uid,
      student_id: req.body.student_id,
      reason_id: req.body.reason_id,
      custom_reason: req.body.custom_reason,
      appointment_date: req.body.appointment_date,
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      message: req.body.message
    });
    res.status(201).json(apt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Student accepts faculty invitation (Requirement #2)
app.post('/api/appointments/:id/accept', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.body.role;
    const uid = req.headers['x-user-id'] || req.body.student_id;
    if (role !== 'student') {
      return res.status(403).json({ error: 'Only the invited student can accept this meeting' });
    }

    const apt = db.acceptMeetingInvitation(req.params.id, uid);
    res.json(apt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Student declines faculty invitation (Requirement #2)
app.post('/api/appointments/:id/decline', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.body.role;
    const uid = req.headers['x-user-id'] || req.body.student_id;
    if (role !== 'student') {
      return res.status(403).json({ error: 'Only the invited student can decline this meeting' });
    }

    const apt = db.declineMeetingInvitation(req.params.id, uid, req.body.reason);
    res.json(apt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Appointment Cancellation (Requirement #3)
app.post('/api/appointments/:id/cancel', (req, res) => {
  try {
    const actor_role = req.headers['x-user-role'] || req.body.role;
    const actor_id = req.headers['x-user-id'] || req.body.uid;

    if (!actor_role || !actor_id) {
      return res.status(401).json({ error: 'Authentication required to cancel appointment' });
    }

    const apt = db.cancelAppointment(req.params.id, {
      actor_role,
      actor_id,
      reason: req.body.reason
    });
    res.json(apt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Outcome Reporting
app.post('/api/appointments/:id/report', (req, res) => {
  try {
    const actor_role = req.headers['x-user-role'] || req.body.role;
    const actor_id = req.headers['x-user-id'] || req.body.uid;
    const { outcome } = req.body;

    const result = db.reportOutcome(req.params.id, {
      actor_role,
      actor_id,
      outcome
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Meeting Rating
app.post('/api/appointments/:id/rate', (req, res) => {
  try {
    const actor_role = req.headers['x-user-role'] || req.body.role;
    const actor_id = req.headers['x-user-id'] || req.body.uid;
    const { rating } = req.body;

    const result = db.rateMeeting(req.params.id, {
      actor_role,
      actor_id,
      rating
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Dispute Resolution
app.post('/api/appointments/:id/resolve', (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.body.role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Administrative privilege required to resolve disputes' });
    }

    const apt = db.resolveDispute(req.params.id, {
      outcome: req.body.outcome,
      admin_id: req.headers['x-user-id'] || req.body.uid || 'ADM0001'
    });
    res.json(apt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Appointments Export CSV
app.get('/api/appointments/export-csv', (req, res) => {
  try {
    const apts = db.getAppointments();
    const studentsMap = Object.fromEntries(db.getStudents().map(s => [s.student_id, s]));
    const facultyMap = Object.fromEntries(db.getFaculty().map(f => [f.faculty_id, f]));
    const deptMap = Object.fromEntries(db.getDepartments().map(d => [d.department_id, d.department_name]));
    const reasonsMap = Object.fromEntries(db.getReasons().map(r => [r.reason_id, r.reason_name]));

    const rows = apts.map(a => ({
      appointment_id: a.appointment_id,
      appointment_date: a.appointment_date,
      start_time: a.start_time,
      end_time: a.end_time,
      faculty_name: facultyMap[a.faculty_id]?.faculty_name || a.faculty_id,
      department: deptMap[facultyMap[a.faculty_id]?.department_id] || '',
      student_name: studentsMap[a.student_id]?.student_name || a.student_id,
      student_usn: studentsMap[a.student_id]?.usn || '',
      reason: a.custom_reason || reasonsMap[a.reason_id] || a.reason_id,
      initiated_by: a.initiated_by || 'student',
      status: a.appointment_status,
      outcome: a.meeting_outcome || '',
      cabin_location: a.cabin_location_snapshot || ''
    }));

    const headers = [
      { key: 'appointment_id', label: 'appointment_id' },
      { key: 'appointment_date', label: 'date' },
      { key: 'start_time', label: 'start_time' },
      { key: 'end_time', label: 'end_time' },
      { key: 'faculty_name', label: 'faculty' },
      { key: 'department', label: 'department' },
      { key: 'student_name', label: 'student' },
      { key: 'student_usn', label: 'usn' },
      { key: 'reason', label: 'reason' },
      { key: 'initiated_by', label: 'initiated_by' },
      { key: 'status', label: 'status' },
      { key: 'outcome', label: 'outcome' },
      { key: 'cabin_location', label: 'cabin_location' }
    ];

    const csv = toCSV(headers, rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fac-con-appointments.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// NOTIFICATIONS
// -------------------------------------------------------------
app.get('/api/notifications', (req, res) => {
  const role = req.headers['x-user-role'] || req.query.role;
  const uid = req.headers['x-user-id'] || req.query.uid;
  if (!role || !uid) return res.json([]);
  res.json(db.getNotifications(role, uid));
});

app.post('/api/notifications/:id/read', (req, res) => {
  const n = db.markNotificationRead(req.params.id);
  res.json(n || { success: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const role = req.headers['x-user-role'] || req.body.role;
  const uid = req.headers['x-user-id'] || req.body.uid;
  res.json(db.markAllNotificationsRead(role, uid));
});

// -------------------------------------------------------------
// AUDIT & STATS
// -------------------------------------------------------------
app.get('/api/audit', (req, res) => {
  res.json(db.getAudit());
});

app.get('/api/stats', (req, res) => {
  res.json(db.getStats());
});

// -------------------------------------------------------------
// STATIC FILES & SPA SERVING
// -------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server listening on 0.0.0.0 for LAN access
const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIps();
  console.log(`====================================================`);
  console.log(`FAC-CON Server running successfully!`);
  console.log(`Local machine URL:   http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log(`LAN / Network URLs (access from other laptops/phones):`);
    ips.forEach(ip => console.log(`  http://${ip}:${PORT}`));
  }
  console.log(`Database storage:    ${path.join(__dirname, 'data', 'db.json')}`);
  console.log(`====================================================`);
});

module.exports = { app, server };
