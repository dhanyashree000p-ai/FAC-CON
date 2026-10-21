require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;


const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SAMPLE_DATA_DIR = path.resolve(__dirname, '..', 'sample-data');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeToMin(t) {
  if (!t || typeof t !== 'string') return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function overlaps(s1, e1, s2, e2) {
  return timeToMin(s1) < timeToMin(e2) && timeToMin(s2) < timeToMin(e1);
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAY_NAMES[d.getUTCDay()];
}

function addDays(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function uid(prefix = 'ID') {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

class Database {
  
  constructor() {
    this.data = null;
    this.listeners = new Set();
    this.pendingSave = Promise.resolve();
    this.initializing = false;
    this.ready = this.init();
  }

  async init() {
    // Keep JSON storage for local development without Neon.
    if (!pool) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'DATABASE_URL is required in production.'
        );
      }

      if (fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf8');
          this.data = JSON.parse(raw);
          return;
        } catch (err) {
          console.error(
            'Error reading existing db.json, re-seeding:',
            err
          );
        }
      }

      this.seed();
      return;
    }

    this.initializing = true;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS fac_con_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const result = await pool.query(
        'SELECT data FROM fac_con_state WHERE id = 1'
      );

      if (result.rows.length > 0) {
        this.data = result.rows[0].data;
        return;
      }

      // First connection: preserve existing JSON data.
      if (fs.existsSync(DB_FILE)) {
        try {
          this.data = JSON.parse(
            fs.readFileSync(DB_FILE, 'utf8')
          );
        } catch (err) {
          console.error(
            'Could not read db.json; creating seed data:',
            err.message
          );
          this.data = null;
          this.seed();
        }
      } else {
        this.data = null;
        this.seed();
      }

      await pool.query(
        `INSERT INTO fac_con_state (id, data)
         VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(this.data)]
      );

      // Use the database's saved copy as the source of truth.
      const saved = await pool.query(
        'SELECT data FROM fac_con_state WHERE id = 1'
      );

      
      this.data = saved.rows[0].data;
    } finally {
      this.initializing = false;
    }
  }

  seed() {

    

    this.seed();
  }

  seed() {
    console.log('Seeding database from sample-data...');
    const readJson = (name, fallback) => {
      const p = path.join(SAMPLE_DATA_DIR, name);
      if (fs.existsSync(p)) {
        try {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (e) {
          console.warn('Failed to parse ' + name, e);
        }
      }
      return fallback;
    };

    const departments = readJson('departments.json', [
      { department_id: 'DEPT001', department_name: 'Computer Science and Engineering' },
      { department_id: 'DEPT002', department_name: 'Artificial Intelligence and Machine Learning' },
      { department_id: 'DEPT003', department_name: 'Information Science and Engineering' },
      { department_id: 'DEPT004', department_name: 'Electronics and Communication Engineering' }
    ]);

    const students = readJson('students.json', []);
    const faculty = readJson('faculty.json', []);
    const faculty_timetable = readJson('faculty_timetable.json', []);
    const faculty_availability = readJson('faculty_availability.json', []);
    const appointment_reasons = readJson('appointment_reasons.json', []);
    const initialAppointments = readJson('appointments.json', []);
    const initialNotifications = readJson('notifications.json', []);

    // Generate relative dates based on current day
    const today = new Date();
    const dMinus8 = addDays(today, -8);
    const dMinus6 = addDays(today, -6);
    const dMinus3 = addDays(today, -3);
    const dMinus1 = addDays(today, -1);
    const dPlus1 = addDays(today, 1);
    const dPlus2 = addDays(today, 2);
    const dPlus5 = addDays(today, 5);
    const dPlus7 = addDays(today, 7);
    const dPlus10 = addDays(today, 10);
    const dPlus14 = addDays(today, 14);

    const appointments = [
      // 1. Upcoming confirmed (student booked)
      {
        appointment_id: 'APT0001',
        student_id: 'STU0001',
        faculty_id: 'FAC0001',
        reason_id: 'RSN001',
        appointment_date: dPlus2,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Clarification on linked-list concepts and memory layout.',
        appointment_status: 'confirmed',
        initiated_by: 'student',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, Ground Floor, Room 208',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        demo_account: true
      },
      // 2. Upcoming confirmed (student booked)
      {
        appointment_id: 'APT0002',
        student_id: 'STU0002',
        faculty_id: 'FAC0001',
        reason_id: 'RSN003',
        appointment_date: dPlus2,
        start_time: '13:15',
        end_time: '13:30',
        student_message: 'I would like to verify my lab attendance record for last week.',
        appointment_status: 'confirmed',
        initiated_by: 'student',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, Ground Floor, Room 208',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        demo_account: true
      },
      // 3. Upcoming confirmed (student booked)
      {
        appointment_id: 'APT0003',
        student_id: 'STU0011',
        faculty_id: 'FAC0003',
        reason_id: 'RSN006',
        appointment_date: dPlus5,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Need feedback on my AI project proposal draft.',
        appointment_status: 'confirmed',
        initiated_by: 'student',
        meeting_outcome: '',
        cabin_location_snapshot: 'A Block, Second Floor, Room 214',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        demo_account: true
      },
      // 4. Upcoming confirmed (student booked)
      {
        appointment_id: 'APT0004',
        student_id: 'STU0012',
        faculty_id: 'FAC0005',
        reason_id: 'RSN007',
        appointment_date: dPlus7,
        start_time: '14:30',
        end_time: '15:00',
        student_message: 'Advice regarding summer research internship application.',
        appointment_status: 'confirmed',
        initiated_by: 'student',
        meeting_outcome: '',
        cabin_location_snapshot: 'A Block, First Floor, Room 108',
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        demo_account: true
      },
      // 5. Faculty-initiated meeting invitation: awaiting student confirmation
      {
        appointment_id: 'APT0005',
        student_id: 'STU0001',
        faculty_id: 'FAC0002',
        reason_id: 'RSN003',
        custom_reason: 'Attendance Discussion',
        appointment_date: dPlus5,
        start_time: '14:30',
        end_time: '15:00',
        student_message: 'Faculty message: Please meet me regarding continuous evaluation attendance deficit.',
        appointment_status: 'pending_student_confirmation',
        initiated_by: 'faculty',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, First Floor, Room 115',
        created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
        demo_account: true
      },
      // 6. Faculty-initiated meeting invitation: awaiting student confirmation (for STU0003)
      {
        appointment_id: 'APT0006',
        student_id: 'STU0003',
        faculty_id: 'FAC0001',
        reason_id: 'RSN006',
        custom_reason: 'Project Guidance',
        appointment_date: dPlus7,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Faculty message: Review phase 1 milestones and code submission.',
        appointment_status: 'pending_student_confirmation',
        initiated_by: 'faculty',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, Ground Floor, Room 208',
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
        demo_account: true
      },
      // 7. Faculty-initiated meeting: accepted by student (confirmed)
      {
        appointment_id: 'APT0007',
        student_id: 'STU0004',
        faculty_id: 'FAC0002',
        reason_id: 'RSN004',
        custom_reason: 'Academic Performance',
        appointment_date: dPlus10,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Faculty message: Midterm marks review and improvement strategy.',
        appointment_status: 'confirmed',
        initiated_by: 'faculty',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, First Floor, Room 115',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        demo_account: true
      },
      // 8. Faculty-initiated meeting: declined by student
      {
        appointment_id: 'APT0008',
        student_id: 'STU0005',
        faculty_id: 'FAC0001',
        reason_id: 'RSN010',
        custom_reason: 'Elective counseling',
        appointment_date: dPlus2,
        start_time: '14:30',
        end_time: '15:00',
        student_message: 'Faculty message: Please attend elective counseling session.',
        appointment_status: 'declined_by_student',
        initiated_by: 'faculty',
        meeting_outcome: '',
        decline_reason: 'Clashing with external certified examination.',
        cabin_location_snapshot: 'C Block, Ground Floor, Room 208',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        demo_account: true
      },
      // 9. Student-cancelled appointment
      {
        appointment_id: 'APT0009',
        student_id: 'STU0006',
        faculty_id: 'FAC0001',
        reason_id: 'RSN001',
        appointment_date: dPlus5,
        start_time: '13:15',
        end_time: '13:30',
        student_message: 'Doubt in binary search trees.',
        appointment_status: 'cancelled_by_student',
        initiated_by: 'student',
        cancelled_at: new Date(Date.now() - 3600000 * 8).toISOString(),
        cancelled_by: 'student:STU0006',
        cancellation_reason: 'Doubt resolved during lab session.',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, Ground Floor, Room 208',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        demo_account: true
      },
      // 10. Faculty-cancelled appointment
      {
        appointment_id: 'APT0010',
        student_id: 'STU0007',
        faculty_id: 'FAC0002',
        reason_id: 'RSN008',
        appointment_date: dPlus7,
        start_time: '13:15',
        end_time: '13:30',
        student_message: 'Question on semester revaluation.',
        appointment_status: 'cancelled_by_faculty',
        initiated_by: 'student',
        cancelled_at: new Date(Date.now() - 3600000 * 18).toISOString(),
        cancelled_by: 'faculty:FAC0002',
        cancellation_reason: 'Emergency department council meeting scheduled.',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, First Floor, Room 115',
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        demo_account: true
      },
      // 11. Completed meeting with ratings (both 5/5)
      {
        appointment_id: 'APT0011',
        student_id: 'STU0026',
        faculty_id: 'FAC0008',
        reason_id: 'RSN008',
        appointment_date: dMinus8,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Question about exam evaluation and script recheck.',
        appointment_status: 'completed',
        initiated_by: 'student',
        meeting_outcome: 'meeting_happened',
        student_rating: 5,
        faculty_rating: 4,
        cabin_location_snapshot: 'D Block, Second Floor, Room 207',
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        demo_account: true
      },
      // 12. Completed meeting without ratings
      {
        appointment_id: 'APT0012',
        student_id: 'STU0030',
        faculty_id: 'FAC0009',
        reason_id: 'RSN005',
        appointment_date: dMinus6,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Understanding fee payment clearance process.',
        appointment_status: 'completed',
        initiated_by: 'student',
        meeting_outcome: 'meeting_happened',
        student_rating: null,
        faculty_rating: null,
        cabin_location_snapshot: 'D Block, First Floor, Room 119',
        created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
        demo_account: true
      },
      // 13. Past meeting awaiting outcome report (outcome due)
      {
        appointment_id: 'APT0013',
        student_id: 'STU0001',
        faculty_id: 'FAC0001',
        reason_id: 'RSN002',
        appointment_date: dMinus1,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Review of AICTE activity certificate points.',
        appointment_status: 'confirmed',
        initiated_by: 'student',
        meeting_outcome: '',
        cabin_location_snapshot: 'C Block, Ground Floor, Room 208',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        demo_account: true
      },
      // 14. Past meeting awaiting confirmation (student reported, faculty pending)
      {
        appointment_id: 'APT0014',
        student_id: 'STU0002',
        faculty_id: 'FAC0002',
        reason_id: 'RSN001',
        appointment_date: dMinus3,
        start_time: '13:00',
        end_time: '13:15',
        student_message: 'Clarification on algorithm complexity analysis.',
        appointment_status: 'awaiting_confirmation',
        initiated_by: 'student',
        meeting_outcome: 'awaiting_confirmation',
        cabin_location_snapshot: 'C Block, First Floor, Room 115',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        demo_account: true
      },
      // 15. Disputed meeting outcome (reports differ)
      {
        appointment_id: 'APT0015',
        student_id: 'STU0024',
        faculty_id: 'FAC0007',
        reason_id: 'RSN003',
        appointment_date: dMinus6,
        start_time: '14:30',
        end_time: '15:00',
        student_message: 'Review attendance discrepancy for internal test.',
        appointment_status: 'disputed',
        initiated_by: 'student',
        meeting_outcome: 'disputed',
        cabin_location_snapshot: 'B Block, First Floor, Room 126',
        created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
        demo_account: true
      },
      // 16. Disputed meeting resolved by admin
      {
        appointment_id: 'APT0016',
        student_id: 'STU0015',
        faculty_id: 'FAC0004',
        reason_id: 'RSN004',
        appointment_date: dMinus8,
        start_time: '14:30',
        end_time: '15:00',
        student_message: 'Personal academic guidance.',
        appointment_status: 'completed',
        initiated_by: 'student',
        meeting_outcome: 'meeting_happened',
        resolved_by: 'ADM0001',
        cabin_location_snapshot: 'A Block, Second Floor, Room 219',
        created_at: new Date(Date.now() - 86400000 * 11).toISOString(),
        demo_account: true
      }
    ];

    const reports = [
      { id: 'APT0011_student', apt: 'APT0011', role: 'student', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 7).toISOString() },
      { id: 'APT0011_faculty', apt: 'APT0011', role: 'faculty', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 7).toISOString() },
      { id: 'APT0012_student', apt: 'APT0012', role: 'student', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'APT0012_faculty', apt: 'APT0012', role: 'faculty', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'APT0014_student', apt: 'APT0014', role: 'student', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: 'APT0015_student', apt: 'APT0015', role: 'student', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'APT0015_faculty', apt: 'APT0015', role: 'faculty', v: 'student_unavailable', at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'APT0016_student', apt: 'APT0016', role: 'student', v: 'meeting_happened', at: new Date(Date.now() - 86400000 * 7).toISOString() },
      { id: 'APT0016_faculty', apt: 'APT0016', role: 'faculty', v: 'faculty_unavailable', at: new Date(Date.now() - 86400000 * 7).toISOString() }
    ];

    const ratings = [
      { id: 'APT0011_student', apt: 'APT0011', role: 'student', v: 5 },
      { id: 'APT0011_faculty', apt: 'APT0011', role: 'faculty', v: 4 }
    ];

    const notifications = [
      {
        id: 'NOT0001',
        to_role: 'student',
        to_id: 'STU0001',
        apt: 'APT0001',
        type: 'appointment_confirmed',
        msg: 'Your appointment with Dr. Kavitha Rao is confirmed.',
        at: new Date(Date.now() - 86400000 * 2).toISOString(),
        read: false
      },
      {
        id: 'NOT0002',
        to_role: 'faculty',
        to_id: 'FAC0001',
        apt: 'APT0001',
        type: 'appointment_booked',
        msg: 'Aarav Sharma booked a consultation slot on ' + dPlus2 + ' at 13:00.',
        at: new Date(Date.now() - 86400000 * 2).toISOString(),
        read: false
      },
      {
        id: 'NOT0003',
        to_role: 'student',
        to_id: 'STU0001',
        apt: 'APT0005',
        type: 'faculty_invitation',
        msg: 'Prof. Arvind Shetty invited you for a meeting regarding Attendance Discussion on ' + dPlus5 + ' at 14:30. Please accept or decline.',
        at: new Date(Date.now() - 3600000 * 5).toISOString(),
        read: false
      },
      {
        id: 'NOT0004',
        to_role: 'student',
        to_id: 'STU0003',
        apt: 'APT0006',
        type: 'faculty_invitation',
        msg: 'Dr. Kavitha Rao invited you for a meeting regarding Project Guidance on ' + dPlus7 + ' at 13:00. Please accept or decline.',
        at: new Date(Date.now() - 3600000 * 12).toISOString(),
        read: false
      },
      {
        id: 'NOT0005',
        to_role: 'faculty',
        to_id: 'FAC0002',
        apt: 'APT0007',
        type: 'invitation_accepted',
        msg: 'Diya Nair accepted your meeting request for ' + dPlus10 + ' at 13:00.',
        at: new Date(Date.now() - 86400000 * 1).toISOString(),
        read: false
      },
      {
        id: 'NOT0006',
        to_role: 'faculty',
        to_id: 'FAC0001',
        apt: 'APT0008',
        type: 'invitation_declined',
        msg: 'Ishaan Reddy declined your meeting request for ' + dPlus2 + ' at 14:30.',
        at: new Date(Date.now() - 86400000 * 2).toISOString(),
        read: true
      },
      {
        id: 'NOT0007',
        to_role: 'faculty',
        to_id: 'FAC0001',
        apt: 'APT0009',
        type: 'appointment_cancelled',
        msg: 'The appointment on ' + dPlus5 + ' at 13:15 was cancelled by Meera Iyer.',
        at: new Date(Date.now() - 3600000 * 8).toISOString(),
        read: false
      },
      {
        id: 'NOT0008',
        to_role: 'student',
        to_id: 'STU0007',
        apt: 'APT0010',
        type: 'appointment_cancelled',
        msg: 'The appointment on ' + dPlus7 + ' at 13:15 was cancelled by Prof. Arvind Shetty.',
        at: new Date(Date.now() - 3600000 * 18).toISOString(),
        read: false
      },
      {
        id: 'NOT0009',
        to_role: 'admin',
        to_id: 'ADM0001',
        apt: 'APT0015',
        type: 'outcome_disputed',
        msg: 'Meeting outcome on ' + dMinus6 + ' (Ref: APT0015) is disputed and requires administrative review.',
        at: new Date(Date.now() - 86400000 * 5).toISOString(),
        read: false
      }
    ];

    const audit = [
      { id: 'AUD0001', at: new Date(Date.now() - 86400000 * 10).toISOString(), actor: 'system', action: 'database_initialized', apt: null, meta: { status: 'ok' } },
      { id: 'AUD0002', at: new Date(Date.now() - 86400000 * 2).toISOString(), actor: 'student:STU0001', action: 'appointment_created', apt: 'APT0001', meta: { faculty: 'FAC0001' } },
      { id: 'AUD0003', at: new Date(Date.now() - 3600000 * 5).toISOString(), actor: 'faculty:FAC0002', action: 'meeting_invitation_created', apt: 'APT0005', meta: { student: 'STU0001' } },
      { id: 'AUD0004', at: new Date(Date.now() - 3600000 * 8).toISOString(), actor: 'student:STU0006', action: 'appointment_cancelled', apt: 'APT0009', meta: { by: 'student' } },
      { id: 'AUD0005', at: new Date(Date.now() - 3600000 * 18).toISOString(), actor: 'faculty:FAC0002', action: 'appointment_cancelled', apt: 'APT0010', meta: { by: 'faculty' } }
    ];

    this.data = {
      departments,
      students,
      faculty,
      faculty_timetable,
      faculty_availability,
      appointment_reasons,
      appointments,
      reports,
      ratings,
      notifications,
      audit
    };

    this.save();
    console.log('Database seeded successfully.');
  }

  

 
save() {
  if (this.initializing) return;

  const snapshot = JSON.stringify(this.data);

  // Always keep the local JSON file synchronized.
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const tmp = path.join(
      DATA_DIR,
      `db.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
    );

    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (error) {
    console.error('Local database save failed:', error.message);
    throw error;
  }

  // Also save to Neon when configured.
  if (pool) {
    this.pendingSave = (this.pendingSave || Promise.resolve())
      .catch(() => {})
      .then(() =>
        pool.query(
          `INSERT INTO fac_con_state (id, data, updated_at)
           VALUES (1, $1::jsonb, NOW())
           ON CONFLICT (id)
           DO UPDATE SET data = EXCLUDED.data,
                         updated_at = NOW()`,
          [snapshot]
        )
      );

    this.pendingSave.catch((error) => {
      console.error('Neon save failed:', error.message);
    });
  }

  this.broadcast({
    type: 'mutation',
    timestamp: new Date().toISOString()
  });
}


async flush() {
  if (this.pendingSave) {
    await this.pendingSave;
  }
}


  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  broadcast(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error broadcasting to listener:', err);
      }
    }
  }

  // -------------------------------------------------------------
  // DEPARTMENTS
  // -------------------------------------------------------------
  getDepartments() {
    return this.data.departments;
  }

  addDepartment({ department_name }) {
    if (!department_name || !department_name.trim()) throw new Error('Department name is required');
    const existing = this.data.departments.find(d => d.department_name.toLowerCase() === department_name.trim().toLowerCase());
    if (existing) throw new Error('Department with this name already exists');

    const nextNum = this.data.departments.reduce((max, d) => {
      const num = parseInt(d.department_id.replace('DEPT', ''), 10) || 0;
      return Math.max(max, num);
    }, 0) + 1;
    const department_id = `DEPT${String(nextNum).padStart(3, '0')}`;
    const newDept = { department_id, department_name: department_name.trim() };
    this.data.departments.push(newDept);
    this.save();
    return newDept;
  }

  updateDepartment(id, { department_name }) {
    const dept = this.data.departments.find(d => d.department_id === id);
    if (!dept) throw new Error('Department not found');
    if (!department_name || !department_name.trim()) throw new Error('Department name is required');

    const duplicate = this.data.departments.find(d => d.department_id !== id && d.department_name.toLowerCase() === department_name.trim().toLowerCase());
    if (duplicate) throw new Error('Another department with this name already exists');

    dept.department_name = department_name.trim();
    this.save();
    return dept;
  }

  // -------------------------------------------------------------
  // STUDENTS
  // -------------------------------------------------------------
  getStudents(filters = {}) {
    let list = [...this.data.students];
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(s => (s.student_name || '').toLowerCase().includes(q) || (s.usn || '').toLowerCase().includes(q));
    }
    if (filters.department_id) {
      list = list.filter(s => s.department_id === filters.department_id);
    }
    if (filters.semester) {
      list = list.filter(s => String(s.semester) === String(filters.semester));
    }
    if (filters.section) {
      list = list.filter(s => (s.section || '').toUpperCase() === filters.section.toUpperCase());
    }
    if (filters.account_status) {
      list = list.filter(s => s.account_status === filters.account_status);
    }
    return list;
  }

  getStudentById(id) {
    return this.data.students.find(s => s.student_id === id) || null;
  }

  addStudent(studentData) {
    const { student_name, usn, dob, department_id, semester, section, account_status, profile_pic } = studentData;
    if (!student_name || !student_name.trim()) throw new Error('Student name is required');
    if (!usn || !usn.trim()) throw new Error('USN is required');
    if (!department_id) throw new Error('Department is required');

    const cleanUsn = usn.trim().toUpperCase();
    if (this.data.students.some(s => s.usn.toUpperCase() === cleanUsn)) {
      throw new Error(`USN '${cleanUsn}' is already in use by another student`);
    }
    if (!this.data.departments.some(d => d.department_id === department_id)) {
      throw new Error(`Department '${department_id}' does not exist`);
    }

    const nextNum = this.data.students.reduce((max, s) => {
      const num = parseInt(s.student_id.replace('STU', ''), 10) || 0;
      return Math.max(max, num);
    }, 0) + 1;
    const student_id = `STU${String(nextNum).padStart(4, '0')}`;

    const newStudent = {
      student_id,
      student_name: student_name.trim(),
      usn: cleanUsn,
      dob: dob || '2005-01-01',
      department_id,
      semester: parseInt(semester, 10) || 1,
      section: (section || 'A').toUpperCase().trim(),
      profile_pic: profile_pic || '/avatars/placeholder.png',
      account_status: account_status || 'active',
      demo_account: false,
      created_at: new Date().toISOString()
    };

    this.data.students.push(newStudent);
    this.addAudit('admin:ADM0001', 'student_created', student_id, { usn: cleanUsn });
    this.save();
    return newStudent;
  }

  updateStudent(student_id, updateData) {
    const student = this.data.students.find(s => s.student_id === student_id);
    if (!student) throw new Error('Student not found');

    if (updateData.usn) {
      const cleanUsn = updateData.usn.trim().toUpperCase();
      const conflict = this.data.students.find(s => s.student_id !== student_id && s.usn.toUpperCase() === cleanUsn);
      if (conflict) {
        throw new Error(`USN '${cleanUsn}' is already registered to another student (${conflict.student_name})`);
      }
      student.usn = cleanUsn;
    }

    if (updateData.department_id) {
      if (!this.data.departments.some(d => d.department_id === updateData.department_id)) {
        throw new Error(`Department '${updateData.department_id}' does not exist`);
      }
      student.department_id = updateData.department_id;
    }

    if (updateData.student_name !== undefined) student.student_name = updateData.student_name.trim();
    if (updateData.dob !== undefined) student.dob = updateData.dob;
    if (updateData.semester !== undefined) student.semester = parseInt(updateData.semester, 10) || student.semester;
    if (updateData.section !== undefined) student.section = (updateData.section || '').toUpperCase().trim();
    if (updateData.profile_pic !== undefined) student.profile_pic = updateData.profile_pic;
    if (updateData.account_status !== undefined) student.account_status = updateData.account_status;

    student.updated_at = new Date().toISOString();
    this.addAudit('admin:ADM0001', 'student_updated', student_id, { changes: Object.keys(updateData) });
    this.save();
    return student;
  }

  deleteOrArchiveStudent(student_id) {
    const student = this.data.students.find(s => s.student_id === student_id);
    if (!student) throw new Error('Student not found');

    const hasAppointments = this.data.appointments.some(a => a.student_id === student_id);
    if (hasAppointments) {
      // Safe archival / deactivation to preserve institutional audit and appointment history
      student.account_status = 'inactive';
      student.archived_at = new Date().toISOString();
      this.addAudit('admin:ADM0001', 'student_archived', student_id, { reason: 'Has appointment history' });
      this.save();
      return { action: 'archived', student };
    } else {
      this.data.students = this.data.students.filter(s => s.student_id !== student_id);
      this.addAudit('admin:ADM0001', 'student_deleted', student_id, {});
      this.save();
      return { action: 'deleted' };
    }
  }

  // -------------------------------------------------------------
  // FACULTY
  // -------------------------------------------------------------
  getFaculty(filters = {}) {
    let list = [...this.data.faculty];
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(f => (f.faculty_name || '').toLowerCase().includes(q) || (f.designation || '').toLowerCase().includes(q));
    }
    if (filters.department_id) {
      list = list.filter(f => f.department_id === filters.department_id);
    }
    if (filters.account_status) {
      list = list.filter(f => f.account_status === filters.account_status);
    }
    return list;
  }

  getFacultyById(id) {
    return this.data.faculty.find(f => f.faculty_id === id) || null;
  }

  addFaculty(facultyData) {
    const { faculty_name, department_id, designation, cabin_location, email, office_hours, account_status, profile_pic } = facultyData;
    if (!faculty_name || !faculty_name.trim()) throw new Error('Faculty name is required');
    if (!department_id) throw new Error('Department is required');
    if (!designation) throw new Error('Designation is required');
    if (!cabin_location) throw new Error('Cabin location is required');

    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (this.data.faculty.some(f => (f.email || '').toLowerCase() === cleanEmail)) {
        throw new Error(`Email '${cleanEmail}' is already assigned to another faculty member`);
      }
    }

    const nextNum = this.data.faculty.reduce((max, f) => {
      const num = parseInt(f.faculty_id.replace('FAC', ''), 10) || 0;
      return Math.max(max, num);
    }, 0) + 1;
    const faculty_id = `FAC${String(nextNum).padStart(4, '0')}`;

    const newFaculty = {
      faculty_id,
      faculty_name: faculty_name.trim(),
      department_id,
      designation: designation.trim(),
      cabin_location: cabin_location.trim(),
      email: email ? email.trim().toLowerCase() : `faculty${String(nextNum).padStart(4, '0')}@example.com`,
      office_hours: office_hours || '09:00-10:00, 14:00-15:00',
      profile_pic: profile_pic || '/avatars/placeholder.png',
      account_status: account_status || 'active',
      demo_account: false,
      created_at: new Date().toISOString()
    };

    this.data.faculty.push(newFaculty);
    this.addAudit('admin:ADM0001', 'faculty_created', faculty_id, { name: faculty_name.trim() });
    this.save();
    return newFaculty;
  }

  updateFaculty(faculty_id, updateData) {
    const faculty = this.data.faculty.find(f => f.faculty_id === faculty_id);
    if (!faculty) throw new Error('Faculty member not found');

    if (updateData.email) {
      const cleanEmail = updateData.email.trim().toLowerCase();
      const conflict = this.data.faculty.find(f => f.faculty_id !== faculty_id && (f.email || '').toLowerCase() === cleanEmail);
      if (conflict) {
        throw new Error(`Email '${cleanEmail}' is already registered to another faculty member`);
      }
      faculty.email = cleanEmail;
    }

    if (updateData.department_id) {
      if (!this.data.departments.some(d => d.department_id === updateData.department_id)) {
        throw new Error(`Department '${updateData.department_id}' does not exist`);
      }
      faculty.department_id = updateData.department_id;
    }

    if (updateData.faculty_name !== undefined) faculty.faculty_name = updateData.faculty_name.trim();
    if (updateData.designation !== undefined) faculty.designation = updateData.designation.trim();
    if (updateData.cabin_location !== undefined) {
      faculty.cabin_location = updateData.cabin_location.trim();
      // Update future availability slots default location
      this.data.faculty_availability
        .filter(a => a.faculty_id === faculty_id)
        .forEach(a => { a.location = faculty.cabin_location; });
    }
    if (updateData.office_hours !== undefined) faculty.office_hours = updateData.office_hours;
    if (updateData.profile_pic !== undefined) faculty.profile_pic = updateData.profile_pic;
    if (updateData.account_status !== undefined) faculty.account_status = updateData.account_status;

    faculty.updated_at = new Date().toISOString();
    this.addAudit('admin:ADM0001', 'faculty_updated', faculty_id, { changes: Object.keys(updateData) });
    this.save();
    return faculty;
  }

  deleteOrArchiveFaculty(faculty_id) {
    const faculty = this.data.faculty.find(f => f.faculty_id === faculty_id);
    if (!faculty) throw new Error('Faculty not found');

    const hasAppointments = this.data.appointments.some(a => a.faculty_id === faculty_id);
    if (hasAppointments) {
      // Safe archival to preserve institutional audit and history
      faculty.account_status = 'inactive';
      faculty.archived_at = new Date().toISOString();
      this.addAudit('admin:ADM0001', 'faculty_archived', faculty_id, { reason: 'Has appointment history' });
      this.save();
      return { action: 'archived', faculty };
    } else {
      this.data.faculty = this.data.faculty.filter(f => f.faculty_id !== faculty_id);
      this.data.faculty_timetable = this.data.faculty_timetable.filter(t => t.faculty_id !== faculty_id);
      this.data.faculty_availability = this.data.faculty_availability.filter(a => a.faculty_id !== faculty_id);
      this.addAudit('admin:ADM0001', 'faculty_deleted', faculty_id, {});
      this.save();
      return { action: 'deleted' };
    }
  }

  // -------------------------------------------------------------
  // TIMETABLE & AVAILABILITY
  // -------------------------------------------------------------
  getTimetable(faculty_id = null) {
    if (faculty_id) return this.data.faculty_timetable.filter(t => t.faculty_id === faculty_id);
    return this.data.faculty_timetable;
  }

  addTimetableEntry(entry) {
    const { faculty_id, day_of_week, start_time, end_time, course_name, classroom, section } = entry;
    if (!faculty_id || !day_of_week || !start_time || !end_time || !course_name) {
      throw new Error('All schedule fields are required');
    }
    // Conflict check with existing teaching
    const clash = this.data.faculty_timetable.find(t =>
      t.faculty_id === faculty_id &&
      t.day_of_week === day_of_week &&
      overlaps(start_time, end_time, t.start_time, t.end_time)
    );
    if (clash) {
      throw new Error(`Teaching conflict: Faculty already has '${clash.course_name}' on ${day_of_week} at ${clash.start_time}-${clash.end_time}`);
    }

    // Conflict check with existing confirmed appointments on that day of week in the future
    const conflictingApts = this.data.appointments.filter(a => {
      if (a.faculty_id !== faculty_id) return false;
      if (!['confirmed', 'pending_student_confirmation'].includes(a.appointment_status)) return false;
      const aptDay = getDayOfWeek(a.appointment_date);
      if (aptDay !== day_of_week) return false;
      return overlaps(start_time, end_time, a.start_time, a.end_time);
    });

    if (conflictingApts.length > 0) {
      const dates = conflictingApts.map(a => `${a.appointment_date} (${a.start_time}-${a.end_time})`).join(', ');
      throw new Error(`Cannot add teaching block: Conflicts with existing active appointment(s) on ${dates}`);
    }

    const schedule_id = `SCH${uid()}`;
    const newEntry = {
      schedule_id,
      faculty_id,
      day_of_week,
      start_time,
      end_time,
      course_name: course_name.trim(),
      classroom: classroom ? classroom.trim() : 'Room 101',
      section: section ? section.trim().toUpperCase() : 'A',
      schedule_type: 'class'
    };
    this.data.faculty_timetable.push(newEntry);
    this.save();
    return newEntry;
  }

  deleteTimetableEntry(schedule_id) {
    this.data.faculty_timetable = this.data.faculty_timetable.filter(t => t.schedule_id !== schedule_id);
    this.save();
    return { success: true };
  }

  getAvailability(faculty_id = null) {
    if (faculty_id) return this.data.faculty_availability.filter(a => a.faculty_id === faculty_id);
    return this.data.faculty_availability;
  }

  addAvailabilitySlot(slot) {
    const { faculty_id, day_of_week, start_time, end_time, slot_duration_minutes, location } = slot;
    if (!faculty_id || !day_of_week || !start_time || !end_time) throw new Error('Missing required slot fields');

    // Check conflict with teaching timetable
    const teachClash = this.data.faculty_timetable.find(t =>
      t.faculty_id === faculty_id &&
      t.day_of_week === day_of_week &&
      overlaps(start_time, end_time, t.start_time, t.end_time)
    );
    if (teachClash) {
      throw new Error(`Availability cannot overlap with teaching class '${teachClash.course_name}' (${teachClash.start_time}-${teachClash.end_time})`);
    }

    const availability_id = `AVL${uid()}`;
    const newSlot = {
      availability_id,
      faculty_id,
      day_of_week,
      start_time,
      end_time,
      slot_duration_minutes: parseInt(slot_duration_minutes, 10) || 15,
      location: location || 'Faculty Cabin',
      availability_status: 'available'
    };
    this.data.faculty_availability.push(newSlot);
    this.save();
    return newSlot;
  }

  deleteAvailabilitySlot(availability_id) {
    this.data.faculty_availability = this.data.faculty_availability.filter(a => a.availability_id !== availability_id);
    this.save();
    return { success: true };
  }

  // -------------------------------------------------------------
  // REASONS
  // -------------------------------------------------------------
  getReasons() {
    return this.data.appointment_reasons;
  }

  // -------------------------------------------------------------
  // APPOINTMENTS ENGINE & CONFLICT VALIDATION
  // -------------------------------------------------------------
  getAppointments(role = null, uid = null, filters = {}) {
    let list = [...this.data.appointments];
    if (role === 'student' && uid) {
      list = list.filter(a => a.student_id === uid);
    } else if (role === 'faculty' && uid) {
      list = list.filter(a => a.faculty_id === uid);
    }
    // Admins see all appointments
    if (filters.status) {
      if (filters.status === 'upcoming') {
        const now = new Date();
        list = list.filter(a => a.appointment_status === 'confirmed' && new Date(`${a.appointment_date}T${a.end_time}:00+05:30`) > now);
      } else if (filters.status === 'cancelled') {
        list = list.filter(a => a.appointment_status.startsWith('cancelled'));
      } else {
        list = list.filter(a => a.appointment_status === filters.status);
      }
    }
    if (filters.faculty_id) {
      list = list.filter(a => a.faculty_id === filters.faculty_id);
    }
    if (filters.student_id) {
      list = list.filter(a => a.student_id === filters.student_id);
    }
    return list;
  }

  getAppointmentById(id) {
    return this.data.appointments.find(a => a.appointment_id === id) || null;
  }

  // Compute live available slots for a faculty member on a specific date
  computeFacultySlots(faculty_id, dateStr, currentStudentId = null) {
    const day = getDayOfWeek(dateStr);
    const facultyAvail = this.data.faculty_availability.filter(a => a.faculty_id === faculty_id && a.day_of_week === day);
    const facultyTimetable = this.data.faculty_timetable.filter(t => t.faculty_id === faculty_id && t.day_of_week === day);
    const activeAppointments = this.data.appointments.filter(a =>
      a.appointment_date === dateStr &&
      ['confirmed', 'pending_student_confirmation', 'awaiting_confirmation', 'completed', 'disputed'].includes(a.appointment_status)
    );

    const now = new Date();
    const result = [];

    facultyAvail.forEach(block => {
      const duration = block.slot_duration_minutes || 15;
      const startMin = timeToMin(block.start_time);
      const endMin = timeToMin(block.end_time);

      for (let m = startMin; m + duration <= endMin; m += duration) {
        const s = minToTime(m);
        const e = minToTime(m + duration);
        const slotDate = new Date(`${dateStr}T${s}:00+05:30`);

        let st = 'open';
        if (slotDate <= now) {
          st = 'past';
        } else if (facultyTimetable.some(t => overlaps(s, e, t.start_time, t.end_time))) {
          st = 'teaching';
        } else if (activeAppointments.some(a => a.faculty_id === faculty_id && overlaps(s, e, a.start_time, a.end_time))) {
          const bookedApt = activeAppointments.find(a => a.faculty_id === faculty_id && overlaps(s, e, a.start_time, a.end_time));
          st = bookedApt.appointment_status === 'pending_student_confirmation' ? 'tentative' : 'booked';
        } else if (currentStudentId && activeAppointments.some(a => a.student_id === currentStudentId && overlaps(s, e, a.start_time, a.end_time))) {
          st = 'clash';
        }

        result.push({
          s,
          e,
          n: duration,
          l: block.location || 'Faculty Cabin',
          st
        });
      }
    });

    return result;
  }

  // Workflow: Student books faculty
  bookAppointmentByStudent({ student_id, faculty_id, reason_id, appointment_date, start_time, end_time, student_message }) {
    const student = this.getStudentById(student_id);
    if (!student) throw new Error('Student record not found');
    if (student.account_status !== 'active') throw new Error('Student account is not active');

    const faculty = this.getFacultyById(faculty_id);
    if (!faculty) throw new Error('Faculty member not found');
    if (faculty.account_status !== 'active') throw new Error('Faculty account is not active');

    // Date validation
    const slotDate = new Date(`${appointment_date}T${start_time}:00+05:30`);
    if (slotDate <= new Date()) throw new Error('Cannot book appointments in the past');

    // Slot validation
    const availableSlots = this.computeFacultySlots(faculty_id, appointment_date, student_id);
    const chosenSlot = availableSlots.find(s => s.s === start_time && s.e === end_time);
    if (!chosenSlot) throw new Error('Invalid consultation slot requested');
    if (chosenSlot.st !== 'open') {
      if (chosenSlot.st === 'teaching') throw new Error('This slot conflicts with faculty teaching hours');
      if (chosenSlot.st === 'clash') throw new Error('You already have another active appointment at this time');
      if (chosenSlot.st === 'tentative') throw new Error('This slot is currently tentatively reserved for another meeting');
      throw new Error('This slot is no longer available. Please select another slot.');
    }

    const appointment_id = `APT${uid()}`;
    const newApt = {
      appointment_id,
      student_id,
      faculty_id,
      reason_id: reason_id || 'RSN001',
      appointment_date,
      start_time,
      end_time,
      student_message: (student_message || '').trim().slice(0, 300),
      appointment_status: 'confirmed',
      initiated_by: 'student',
      meeting_outcome: '',
      cabin_location_snapshot: faculty.cabin_location,
      created_at: new Date().toISOString()
    };

    this.data.appointments.push(newApt);

    // Create notifications for both parties
    this.addNotification({
      to_role: 'student',
      to_id: student_id,
      apt: appointment_id,
      type: 'appointment_confirmed',
      msg: `Your appointment with ${faculty.faculty_name} on ${appointment_date} at ${start_time} is confirmed.`
    });

    this.addNotification({
      to_role: 'faculty',
      to_id: faculty_id,
      apt: appointment_id,
      type: 'appointment_booked',
      msg: `${student.student_name} (${student.usn}) booked a consultation slot on ${appointment_date} at ${start_time}.`
    });

    this.addAudit(`student:${student_id}`, 'appointment_created', appointment_id, { faculty_id, appointment_date, start_time });
    this.save();
    return newApt;
  }

  // Workflow: Faculty schedules meeting with student (Requirement #2)
  scheduleMeetingByFaculty({ faculty_id, student_id, reason_id, custom_reason, appointment_date, start_time, end_time, message }) {
    const faculty = this.getFacultyById(faculty_id);
    if (!faculty) throw new Error('Faculty record not found');
    if (faculty.account_status !== 'active') throw new Error('Faculty account is not active');

    const student = this.getStudentById(student_id);
    if (!student) throw new Error('Selected student not found in directory');
    if (student.account_status !== 'active') throw new Error('Student account is not active');

    // Date validation
    const slotDate = new Date(`${appointment_date}T${start_time}:00+05:30`);
    if (slotDate <= new Date()) throw new Error('Cannot schedule meetings in the past');

    // Slot validation - make sure slot is open and does not clash with faculty teaching or active appointments
    const day = getDayOfWeek(appointment_date);
    const teachClash = this.data.faculty_timetable.find(t =>
      t.faculty_id === faculty_id &&
      t.day_of_week === day &&
      overlaps(start_time, end_time, t.start_time, t.end_time)
    );
    if (teachClash) {
      throw new Error(`Cannot schedule meeting: You have a scheduled class '${teachClash.course_name}' at this time`);
    }

    const aptClash = this.data.appointments.find(a =>
      a.faculty_id === faculty_id &&
      a.appointment_date === appointment_date &&
      ['confirmed', 'pending_student_confirmation'].includes(a.appointment_status) &&
      overlaps(start_time, end_time, a.start_time, a.end_time)
    );
    if (aptClash) {
      throw new Error(`Cannot schedule meeting: You already have another appointment at this time (${aptClash.appointment_id})`);
    }

    const appointment_id = `APT${uid()}`;
    const reasonText = custom_reason || (this.data.appointment_reasons.find(r => r.reason_id === reason_id) || {}).reason_name || 'Academic Consultation';

    const newApt = {
      appointment_id,
      student_id,
      faculty_id,
      reason_id: reason_id || 'RSN010',
      custom_reason: custom_reason || '',
      appointment_date,
      start_time,
      end_time,
      student_message: `Faculty message: ${(message || '').trim().slice(0, 300)}`,
      appointment_status: 'pending_student_confirmation',
      initiated_by: 'faculty',
      meeting_outcome: '',
      cabin_location_snapshot: faculty.cabin_location,
      created_at: new Date().toISOString()
    };

    this.data.appointments.push(newApt);

    // In-app notification to the student
    this.addNotification({
      to_role: 'student',
      to_id: student_id,
      apt: appointment_id,
      type: 'faculty_invitation',
      msg: `${faculty.faculty_name} has invited you to a meeting regarding '${reasonText}' on ${appointment_date} at ${start_time}. Please review and respond.`
    });

    this.addAudit(`faculty:${faculty_id}`, 'meeting_invitation_created', appointment_id, { student_id, appointment_date, start_time });
    this.save();
    return newApt;
  }

  // Student accepts faculty invitation
  acceptMeetingInvitation(appointment_id, student_id) {
    const apt = this.getAppointmentById(appointment_id);
    if (!apt) throw new Error('Meeting invitation not found');
    if (apt.student_id !== student_id) throw new Error('Unauthorized to respond to this invitation');
    if (apt.appointment_status !== 'pending_student_confirmation') {
      throw new Error(`Invitation cannot be accepted in status '${apt.appointment_status}'`);
    }

    // Revalidate slot availability at moment of acceptance
    const slotDate = new Date(`${apt.appointment_date}T${apt.start_time}:00+05:30`);
    if (slotDate <= new Date()) throw new Error('This meeting invitation has expired because the start time has passed');

    // Verify faculty has no other confirmed booking at this time
    const clash = this.data.appointments.find(a =>
      a.appointment_id !== appointment_id &&
      a.faculty_id === apt.faculty_id &&
      a.appointment_date === apt.appointment_date &&
      a.appointment_status === 'confirmed' &&
      overlaps(apt.start_time, apt.end_time, a.start_time, a.end_time)
    );
    if (clash) {
      apt.appointment_status = 'cancelled';
      apt.cancelled_at = new Date().toISOString();
      apt.cancellation_reason = 'Slot was taken before confirmation';
      this.save();
      throw new Error('This slot is no longer available. The meeting invitation has been cancelled.');
    }

    apt.appointment_status = 'confirmed';
    apt.confirmed_at = new Date().toISOString();

    const student = this.getStudentById(student_id);
    const faculty = this.getFacultyById(apt.faculty_id);

    // Notify faculty
    this.addNotification({
      to_role: 'faculty',
      to_id: apt.faculty_id,
      apt: appointment_id,
      type: 'invitation_accepted',
      msg: `${student.student_name} (${student.usn}) accepted your meeting invitation for ${apt.appointment_date} at ${apt.start_time}.`
    });

    // Notify student
    this.addNotification({
      to_role: 'student',
      to_id: student_id,
      apt: appointment_id,
      type: 'appointment_confirmed',
      msg: `You confirmed the meeting with ${faculty.faculty_name} on ${apt.appointment_date} at ${apt.start_time}.`
    });

    this.addAudit(`student:${student_id}`, 'invitation_accepted', appointment_id, {});
    this.save();
    return apt;
  }

  // Student declines faculty invitation
  declineMeetingInvitation(appointment_id, student_id, reason = '') {
    const apt = this.getAppointmentById(appointment_id);
    if (!apt) throw new Error('Meeting invitation not found');
    if (apt.student_id !== student_id) throw new Error('Unauthorized to respond to this invitation');
    if (apt.appointment_status !== 'pending_student_confirmation') {
      throw new Error(`Invitation cannot be declined in status '${apt.appointment_status}'`);
    }

    apt.appointment_status = 'declined_by_student';
    apt.declined_at = new Date().toISOString();
    apt.decline_reason = (reason || '').trim().slice(0, 300);

    const student = this.getStudentById(student_id);
    this.addNotification({
      to_role: 'faculty',
      to_id: apt.faculty_id,
      apt: appointment_id,
      type: 'invitation_declined',
      msg: `${student.student_name} (${student.usn}) declined your meeting invitation for ${apt.appointment_date} at ${apt.start_time}.${reason ? ` Reason: ${reason}` : ''}`
    });

    this.addAudit(`student:${student_id}`, 'invitation_declined', appointment_id, { reason });
    this.save();
    return apt;
  }

  // Cancellation Engine (Requirement #3)
  cancelAppointment(appointment_id, { actor_role, actor_id, reason }) {
    const apt = this.getAppointmentById(appointment_id);
    if (!apt) throw new Error('Appointment not found');

    // Authorization check
    if (actor_role === 'student' && apt.student_id !== actor_id) {
      throw new Error('Forbidden: You can only cancel your own appointments');
    }
    if (actor_role === 'faculty' && apt.faculty_id !== actor_id) {
      throw new Error('Forbidden: You can only cancel appointments scheduled with you');
    }

    // Cancellation policy: Cannot cancel if appointment is already completed, disputed, or already cancelled
    if (['completed', 'disputed', 'cancelled_by_student', 'cancelled_by_faculty', 'declined_by_student'].includes(apt.appointment_status)) {
      throw new Error(`Appointment cannot be cancelled because it is in '${apt.appointment_status}' status`);
    }

    // Policy: Cannot cancel after the appointment start time has passed
    const startTime = new Date(`${apt.appointment_date}T${apt.start_time}:00+05:30`);
    if (startTime <= new Date()) {
      throw new Error('Policy violation: Past or in-progress appointments cannot be cancelled. Please report the meeting outcome instead.');
    }

    const newStatus = actor_role === 'student' ? 'cancelled_by_student' : (actor_role === 'faculty' ? 'cancelled_by_faculty' : 'cancelled');
    apt.appointment_status = newStatus;
    apt.cancelled_at = new Date().toISOString();
    apt.cancelled_by = `${actor_role}:${actor_id}`;
    apt.cancellation_reason = (reason || '').trim().slice(0, 300);

    const student = this.getStudentById(apt.student_id);
    const faculty = this.getFacultyById(apt.faculty_id);

    // Notify counterpart
    if (actor_role === 'student') {
      this.addNotification({
        to_role: 'faculty',
        to_id: apt.faculty_id,
        apt: appointment_id,
        type: 'appointment_cancelled',
        msg: `Appointment on ${apt.appointment_date} at ${apt.start_time} was cancelled by ${student ? student.student_name : 'the student'}.${reason ? ` Reason: ${reason}` : ''}`
      });
    } else if (actor_role === 'faculty') {
      this.addNotification({
        to_role: 'student',
        to_id: apt.student_id,
        apt: appointment_id,
        type: 'appointment_cancelled',
        msg: `Appointment on ${apt.appointment_date} at ${apt.start_time} was cancelled by ${faculty ? faculty.faculty_name : 'the faculty'}.${reason ? ` Reason: ${reason}` : ''}`
      });
    } else {
      // Admin cancelled
      if (student) {
        this.addNotification({
          to_role: 'student',
          to_id: apt.student_id,
          apt: appointment_id,
          type: 'appointment_cancelled',
          msg: `Appointment on ${apt.appointment_date} at ${apt.start_time} was cancelled by an institutional administrator.`
        });
      }
      if (faculty) {
        this.addNotification({
          to_role: 'faculty',
          to_id: apt.faculty_id,
          apt: appointment_id,
          type: 'appointment_cancelled',
          msg: `Appointment on ${apt.appointment_date} at ${apt.start_time} was cancelled by an institutional administrator.`
        });
      }
    }

    this.addAudit(`${actor_role}:${actor_id}`, 'appointment_cancelled', appointment_id, { newStatus, reason });
    this.save();
    return apt;
  }

  // Outcome reporting
  reportOutcome(appointment_id, { actor_role, actor_id, outcome }) {
    const apt = this.getAppointmentById(appointment_id);
    if (!apt) throw new Error('Appointment not found');

    if (actor_role === 'student' && apt.student_id !== actor_id) throw new Error('Forbidden');
    if (actor_role === 'faculty' && apt.faculty_id !== actor_id) throw new Error('Forbidden');

    const repId = `${appointment_id}_${actor_role}`;
    let existingRep = this.data.reports.find(r => r.id === repId);
    if (existingRep) {
      throw new Error('You have already submitted an attendance report for this meeting');
    }

    const newRep = {
      id: repId,
      apt: appointment_id,
      role: actor_role,
      v: outcome,
      at: new Date().toISOString()
    };
    this.data.reports.push(newRep);

    const allReports = this.data.reports.filter(r => r.apt === appointment_id);
    if (allReports.length >= 2) {
      const bothHappened = allReports.every(r => r.v === 'meeting_happened');
      if (bothHappened) {
        apt.appointment_status = 'completed';
        apt.meeting_outcome = 'meeting_happened';
      } else {
        apt.appointment_status = 'disputed';
        apt.meeting_outcome = 'disputed';
        // Alert admin
        this.addNotification({
          to_role: 'admin',
          to_id: 'ADM0001',
          apt: appointment_id,
          type: 'outcome_disputed',
          msg: `Meeting reports differ on appointment Ref: ${appointment_id}. Administrative review required.`
        });
      }
    } else {
      apt.appointment_status = 'awaiting_confirmation';
      apt.meeting_outcome = 'awaiting_confirmation';
      const counterpart = actor_role === 'student' ? ['faculty', apt.faculty_id] : ['student', apt.student_id];
      this.addNotification({
        to_role: counterpart[0],
        to_id: counterpart[1],
        apt: appointment_id,
        type: 'outcome_submitted',
        msg: `The other party submitted an outcome for the meeting on ${apt.appointment_date}. Please submit your attendance report.`
      });
    }

    this.addAudit(`${actor_role}:${actor_id}`, 'outcome_reported', appointment_id, { outcome });
    this.save();
    return { apt, report: newRep };
  }

  // Meeting rating
  rateMeeting(appointment_id, { actor_role, actor_id, rating }) {
    const apt = this.getAppointmentById(appointment_id);
    if (!apt) throw new Error('Appointment not found');

    const score = parseInt(rating, 10);
    if (score < 1 || score > 5) throw new Error('Rating must be between 1 and 5');

    const ratId = `${appointment_id}_${actor_role}`;
    let existingRat = this.data.ratings.find(r => r.id === ratId);
    if (existingRat) {
      existingRat.v = score;
    } else {
      this.data.ratings.push({ id: ratId, apt: appointment_id, role: actor_role, v: score });
    }

    if (actor_role === 'student') apt.student_rating = score;
    if (actor_role === 'faculty') apt.faculty_rating = score;

    this.addAudit(`${actor_role}:${actor_id}`, 'rating_submitted', appointment_id, { rating: score });
    this.save();
    return { success: true };
  }

  // Admin Dispute Resolution
  resolveDispute(appointment_id, { outcome, admin_id }) {
    const apt = this.getAppointmentById(appointment_id);
    if (!apt) throw new Error('Appointment not found');
    if (apt.appointment_status !== 'disputed') throw new Error('Appointment is not in disputed status');

    apt.appointment_status = 'completed';
    apt.meeting_outcome = outcome; // e.g. 'meeting_happened' or 'no_meeting'
    apt.resolved_by = admin_id || 'ADM0001';
    apt.resolved_at = new Date().toISOString();

    this.addNotification({
      to_role: 'student',
      to_id: apt.student_id,
      apt: appointment_id,
      type: 'dispute_resolved',
      msg: `An administrator reviewed and resolved the attendance dispute for appointment Ref: ${appointment_id}.`
    });

    this.addNotification({
      to_role: 'faculty',
      to_id: apt.faculty_id,
      apt: appointment_id,
      type: 'dispute_resolved',
      msg: `An administrator reviewed and resolved the attendance dispute for appointment Ref: ${appointment_id}.`
    });

    this.addAudit(`admin:${admin_id || 'ADM0001'}`, 'dispute_resolved', appointment_id, { outcome });
    this.save();
    return apt;
  }

  // -------------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------------
  getNotifications(to_role, to_id) {
    return this.data.notifications.filter(n => n.to_role === to_role && n.to_id === to_id);
  }

  addNotification({ to_role, to_id, apt, type, msg }) {
    const id = `NOT${uid()}`;
    const notification = {
      id,
      to_role,
      to_id,
      apt: apt || null,
      type: type || 'info',
      msg: msg || '',
      at: new Date().toISOString(),
      read: false
    };
    this.data.notifications.push(notification);
    return notification;
  }

  markNotificationRead(id) {
    const n = this.data.notifications.find(x => x.id === id);
    if (n) {
      n.read = true;
      this.save();
    }
    return n;
  }

  markAllNotificationsRead(to_role, to_id) {
    this.data.notifications
      .filter(n => n.to_role === to_role && n.to_id === to_id)
      .forEach(n => { n.read = true; });
    this.save();
    return { success: true };
  }

  // -------------------------------------------------------------
  // AUDIT
  // -------------------------------------------------------------
  getAudit() {
    return this.data.audit;
  }

  addAudit(actor, action, apt = null, meta = {}) {
    const auditRecord = {
      id: `AUD${uid()}`,
      at: new Date().toISOString(),
      actor,
      action,
      apt: apt || null,
      meta: meta || null
    };
    this.data.audit.push(auditRecord);
    return auditRecord;
  }

  // -------------------------------------------------------------
  // STATS FOR ADMIN OVERVIEW
  // -------------------------------------------------------------
  getStats() {
    const apts = this.data.appointments;
    const now = new Date();
    return {
      registered_students: this.data.students.length,
      active_students: this.data.students.filter(s => s.account_status === 'active').length,
      active_faculty: this.data.faculty.filter(f => f.account_status === 'active').length,
      total_faculty: this.data.faculty.length,
      departments_count: this.data.departments.length,
      upcoming_appointments: apts.filter(a => a.appointment_status === 'confirmed' && new Date(`${a.appointment_date}T${a.end_time}:00+05:30`) > now).length,
      meetings_held: apts.filter(a => a.meeting_outcome === 'meeting_happened').length,
      cancelled_appointments: apts.filter(a => a.appointment_status.startsWith('cancelled')).length,
      disputed_outcomes: apts.filter(a => a.appointment_status === 'disputed').length,
      awaiting_outcome: apts.filter(a => a.appointment_status === 'awaiting_confirmation' || (a.appointment_status === 'confirmed' && new Date(`${a.appointment_date}T${a.end_time}:00+05:30`) <= now)).length,
      pending_invitations: apts.filter(a => a.appointment_status === 'pending_student_confirmation').length
    };
  }
}

module.exports = new Database();
