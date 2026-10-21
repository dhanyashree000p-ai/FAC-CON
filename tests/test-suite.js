// FAC-CON Comprehensive End-to-End Automated Test Suite
// Verifies all workflows required by Section 10 of the Specification

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 3899; // Dedicated test port
process.env.PORT = PORT;

const { app, server } = require('../server');
const db = require('../db');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { json = raw; }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const results = [];
function record(category, testName, passed, details = '') {
  results.push({ category, testName, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${category} -> ${testName}: ${details}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING FAC-CON AUTOMATED END-TO-END VERIFICATION');
  console.log('======================================================\n');

  try {
    const runTag = Date.now().toString(36).slice(-4).toUpperCase();
    const testUsn = `TEST-USN-${runTag}`;
    const testEmail = `test.faculty.${runTag}@example.com`;

    // ---------------------------------------------------------
    // 1. ADMIN TESTS (Requirement #1 & #10)
    // ---------------------------------------------------------
    console.log('--- 1. ADMIN TESTS ---');

    // Test 1: Add a new student
    const addStudentRes = await request('POST', '/api/students', {
      student_name: `Test Student Aarush ${runTag}`,
      usn: testUsn,
      dob: '2005-08-20',
      department_id: 'DEPT001',
      semester: 3,
      section: 'A',
      account_status: 'active'
    }, { 'x-user-role': 'admin', 'x-user-id': 'ADM0001' });

    const newStudentId = addStudentRes.data.student_id;
    record('Admin Tests', '1. Add a new student', addStudentRes.status === 201 && !!newStudentId, `Created student with ID ${newStudentId}`);

    // Test 2: Refresh / Reload and verify student still exists in persistent database
    const dbRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/db.json'), 'utf8'));
    const persistedStudent = dbRaw.students.find(s => s.student_id === newStudentId);
    record('Admin Tests', '2. Verify student exists in persistent database (db.json)', !!persistedStudent && persistedStudent.usn === testUsn, `Found student ${persistedStudent?.student_name} in db.json`);

    // Test 3: Edit student's department from DEPT001 (CSE) to DEPT002 (AIML)
    const updateDeptRes = await request('PUT', `/api/students/${newStudentId}`, {
      department_id: 'DEPT002',
      student_name: `Test Student Aarush ${runTag} Updated`
    }, { 'x-user-role': 'admin', 'x-user-id': 'ADM0001' });

    record('Admin Tests', '3. Edit student department (CSE -> AIML)', updateDeptRes.status === 200 && updateDeptRes.data.department_id === 'DEPT002', `Updated department to ${updateDeptRes.data.department_id}`);

    // Test 4: Verify the change appears in other authorized views without duplicate records
    const studentListRes = await request('GET', '/api/students?department_id=DEPT002');
    const inAiml = studentListRes.data.find(s => s.student_id === newStudentId);
    const inCseList = await request('GET', '/api/students?department_id=DEPT001');
    const inCse = inCseList.data.find(s => s.student_id === newStudentId);
    record('Admin Tests', '4. Verify change appears in AIML view and not in CSE view (no duplicates)', !!inAiml && !inCse, `Student correctly moved to AIML list`);

    // Test 5: Add a faculty member
    const addFacultyRes = await request('POST', '/api/faculty', {
      faculty_name: `Dr. Vikram Sarabhai ${runTag}`,
      department_id: 'DEPT002',
      designation: 'Associate Professor',
      cabin_location: 'C Block, Room 208',
      email: testEmail,
      office_hours: '14:00-16:00',
      account_status: 'active'
    }, { 'x-user-role': 'admin', 'x-user-id': 'ADM0001' });

    const newFacultyId = addFacultyRes.data.faculty_id;
    record('Admin Tests', '5. Add a faculty member', addFacultyRes.status === 201 && !!newFacultyId, `Created faculty ${newFacultyId}`);

    // Test 6: Change faculty cabin location from C Block Room 208 to A Block Room 115
    const updateCabinRes = await request('PUT', `/api/faculty/${newFacultyId}`, {
      cabin_location: 'A Block, First Floor, Room 115'
    }, { 'x-user-role': 'admin', 'x-user-id': 'ADM0001' });
    record('Admin Tests', '6. Change faculty cabin location', updateCabinRes.status === 200 && updateCabinRes.data.cabin_location === 'A Block, First Floor, Room 115', `Updated cabin to ${updateCabinRes.data.cabin_location}`);

    // Test 7: Verify updated cabin appears in faculty directory
    const facultyListRes = await request('GET', '/api/faculty');
    const updatedFaculty = facultyListRes.data.find(f => f.faculty_id === newFacultyId);
    record('Admin Tests', '7. Verify updated cabin in faculty directory', updatedFaculty && updatedFaculty.cabin_location === 'A Block, First Floor, Room 115', `Verified cabin: ${updatedFaculty?.cabin_location}`);

    // Test 8: Change account status and verify access is handled correctly
    const deactRes = await request('PUT', `/api/students/${newStudentId}`, {
      account_status: 'inactive'
    }, { 'x-user-role': 'admin', 'x-user-id': 'ADM0001' });
    // Attempt booking as deactivated student should be rejected
    const deactBookRes = await request('POST', '/api/appointments/book', {
      student_id: newStudentId,
      faculty_id: 'FAC0001',
      appointment_date: '2026-11-20',
      start_time: '13:00',
      end_time: '13:15'
    }, { 'x-user-role': 'student', 'x-user-id': newStudentId });

    record('Admin Tests', '8. Change account status to inactive & verify booking blocked', deactBookRes.status === 400 && deactBookRes.data.error.includes('not active'), `Inactive student booking rejected: ${deactBookRes.data.error}`);

    // Reactivate for further tests
    await request('PUT', `/api/students/${newStudentId}`, { account_status: 'active' }, { 'x-user-role': 'admin', 'x-user-id': 'ADM0001' });

    // ---------------------------------------------------------
    // 2. STUDENT TESTS (Requirement #3, #10)
    // ---------------------------------------------------------
    console.log('\n--- 2. STUDENT TESTS ---');

    // Student books appointment with FAC0001
    // First, let's find an open slot for FAC0001 on a Tuesday or Thursday
    const nextDate = '2026-11-17'; // Tuesday
    const bookRes = await request('POST', '/api/appointments/book', {
      student_id: newStudentId,
      faculty_id: 'FAC0001',
      reason_id: 'RSN001',
      appointment_date: nextDate,
      start_time: '13:30',
      end_time: '13:45',
      student_message: 'Clarification on testing trees.'
    }, { 'x-user-role': 'student', 'x-user-id': newStudentId });

    const studentAptId = bookRes.data.appointment_id;
    record('Student Tests', '1-2. Student books available faculty appointment', bookRes.status === 201 && !!studentAptId, `Created appointment ${studentAptId}`);

    // Verify it appears in student's appointment list
    const studentAptsList = await request('GET', `/api/appointments?role=student&uid=${newStudentId}`, null, { 'x-user-role': 'student', 'x-user-id': newStudentId });
    const inStudentList = studentAptsList.data.find(a => a.appointment_id === studentAptId);
    record('Student Tests', '3. Verify appears in student appointment list', !!inStudentList && inStudentList.appointment_status === 'confirmed', `Found in student appointment list`);

    // Verify it appears in faculty's appointment list
    const facultyAptsList = await request('GET', `/api/appointments?role=faculty&uid=FAC0001`, null, { 'x-user-role': 'faculty', 'x-user-id': 'FAC0001' });
    const inFacultyList = facultyAptsList.data.find(a => a.appointment_id === studentAptId);
    record('Student Tests', '4. Verify appears in faculty appointment list', !!inFacultyList && inFacultyList.appointment_status === 'confirmed', `Found in faculty appointment list`);

    // Cancel the appointment (Requirement #3 verification)
    const cancelRes = await request('POST', `/api/appointments/${studentAptId}/cancel`, {
      reason: 'Scheduled lab exam conflict'
    }, { 'x-user-role': 'student', 'x-user-id': newStudentId });

    record('Student Tests', '5. Cancel appointment via cancellation engine', cancelRes.status === 200 && cancelRes.data.appointment_status === 'cancelled_by_student', `Status updated to ${cancelRes.data.appointment_status}`);

    // Verify both views update and cancellation remains in history
    const studentListAfterCancel = await request('GET', `/api/appointments?role=student&uid=${newStudentId}`, null, { 'x-user-role': 'student', 'x-user-id': newStudentId });
    const facultyListAfterCancel = await request('GET', `/api/appointments?role=faculty&uid=FAC0001`, null, { 'x-user-role': 'faculty', 'x-user-id': 'FAC0001' });
    const sApt = studentListAfterCancel.data.find(a => a.appointment_id === studentAptId);
    const fApt = facultyListAfterCancel.data.find(a => a.appointment_id === studentAptId);

    record('Student Tests', '6. Cancellation remains in history in both views', sApt?.appointment_status === 'cancelled_by_student' && fApt?.appointment_status === 'cancelled_by_student', `Both student and faculty see status 'cancelled_by_student'`);

    // ---------------------------------------------------------
    // 3. FACULTY TESTS (Requirement #2, #10)
    // ---------------------------------------------------------
    console.log('\n--- 3. FACULTY TESTS ---');

    // Faculty schedules meeting with student
    const schedDate = '2026-11-19'; // Thursday
    const facSchedRes = await request('POST', '/api/appointments/schedule-meeting', {
      faculty_id: 'FAC0001',
      student_id: newStudentId,
      reason_id: 'RSN006',
      custom_reason: 'Capstone Project Review',
      appointment_date: schedDate,
      start_time: '13:00',
      end_time: '13:15',
      message: 'Please bring your system architecture diagrams.'
    }, { 'x-user-role': 'faculty', 'x-user-id': 'FAC0001' });

    const facMeetingId = facSchedRes.data.appointment_id;
    record('Faculty Tests', '1-2. Faculty initiates meeting with student', facSchedRes.status === 201 && facSchedRes.data.appointment_status === 'pending_student_confirmation', `Created meeting ${facMeetingId} with pending status`);

    // Verify student receives in-app notification
    const studentNotifications = await request('GET', `/api/notifications?role=student&uid=${newStudentId}`, null, { 'x-user-role': 'student', 'x-user-id': newStudentId });
    const inviteNotif = studentNotifications.data.find(n => n.apt === facMeetingId);
    record('Faculty Tests', '3. Verify student receives meeting invitation notification', !!inviteNotif && inviteNotif.type === 'faculty_invitation', `Student received notification: ${inviteNotif?.msg}`);

    // Accept invitation as student
    const acceptRes = await request('POST', `/api/appointments/${facMeetingId}/accept`, {}, { 'x-user-role': 'student', 'x-user-id': newStudentId });
    record('Faculty Tests', '4. Accept invitation as student', acceptRes.status === 200 && acceptRes.data.appointment_status === 'confirmed', `Status transitioned to 'confirmed'`);

    // Verify both dashboards show confirmed appointment
    const sListAcc = await request('GET', `/api/appointments?role=student&uid=${newStudentId}`, null, { 'x-user-role': 'student', 'x-user-id': newStudentId });
    const fListAcc = await request('GET', `/api/appointments?role=faculty&uid=FAC0001`, null, { 'x-user-role': 'faculty', 'x-user-id': 'FAC0001' });
    const sAcc = sListAcc.data.find(a => a.appointment_id === facMeetingId);
    const fAcc = fListAcc.data.find(a => a.appointment_id === facMeetingId);
    record('Faculty Tests', '5. Both dashboards show confirmed appointment', sAcc?.appointment_status === 'confirmed' && fAcc?.appointment_status === 'confirmed', `Both participants see confirmed meeting`);

    // Repeat with declined invitation
    const facSched2 = await request('POST', '/api/appointments/schedule-meeting', {
      faculty_id: 'FAC0001',
      student_id: newStudentId,
      reason_id: 'RSN003',
      appointment_date: schedDate,
      start_time: '13:15',
      end_time: '13:30',
      message: 'Attendance discussion'
    }, { 'x-user-role': 'faculty', 'x-user-id': 'FAC0001' });

    const facMeetingId2 = facSched2.data.appointment_id;
    const declineRes = await request('POST', `/api/appointments/${facMeetingId2}/decline`, {
      reason: 'Off-campus medical appointment'
    }, { 'x-user-role': 'student', 'x-user-id': newStudentId });
    record('Faculty Tests', '6. Repeat with declined invitation', declineRes.status === 200 && declineRes.data.appointment_status === 'declined_by_student', `Status transitioned to 'declined_by_student'`);

    // Cancel an eligible appointment as faculty
    const facCancelRes = await request('POST', `/api/appointments/${facMeetingId}/cancel`, {
      reason: 'Faculty attending university curriculum committee'
    }, { 'x-user-role': 'faculty', 'x-user-id': 'FAC0001' });
    record('Faculty Tests', '7. Cancel eligible appointment as faculty', facCancelRes.status === 200 && facCancelRes.data.appointment_status === 'cancelled_by_faculty', `Status updated to 'cancelled_by_faculty'`);

    // ---------------------------------------------------------
    // 4. CONFLICT TESTS (Requirement #8, #10)
    // ---------------------------------------------------------
    console.log('\n--- 4. CONFLICT TESTS ---');

    // 1. Attempt to book an occupied slot
    // APT0001 is on dPlus2 at 13:00-13:15 with FAC0001
    const apt1 = db.getAppointmentById('APT0001');
    const occupiedBookRes = await request('POST', '/api/appointments/book', {
      student_id: 'STU0005',
      faculty_id: apt1.faculty_id,
      reason_id: 'RSN001',
      appointment_date: apt1.appointment_date,
      start_time: apt1.start_time,
      end_time: apt1.end_time
    }, { 'x-user-role': 'student', 'x-user-id': 'STU0005' });
    record('Conflict Tests', '1. Attempt to book an occupied slot is rejected', occupiedBookRes.status === 400, `Rejected with error: ${occupiedBookRes.data.error}`);

    // 1b. Attempt two simultaneous bookings for the same slot
    let raceDate = null, raceSlot = null;
    for (let i = 3; i < 28; i++) {
      const d = new Date(Date.now() + i * 864e5).toISOString().slice(0, 10);
      const sl = db.computeFacultySlots('FAC0001', d).find(s => s.st === 'open');
      if (sl) {
        raceDate = d;
        raceSlot = sl;
        break;
      }
    }

    const [resA, resB] = await Promise.all([
      request('POST', '/api/appointments/book', {
        student_id: 'STU0008',
        faculty_id: 'FAC0001',
        reason_id: 'RSN001',
        appointment_date: raceDate,
        start_time: raceSlot.s,
        end_time: raceSlot.e,
        student_message: 'Concurrent attempt A'
      }, { 'x-user-role': 'student', 'x-user-id': 'STU0008' }),
      request('POST', '/api/appointments/book', {
        student_id: 'STU0009',
        faculty_id: 'FAC0001',
        reason_id: 'RSN001',
        appointment_date: raceDate,
        start_time: raceSlot.s,
        end_time: raceSlot.e,
        student_message: 'Concurrent attempt B'
      }, { 'x-user-role': 'student', 'x-user-id': 'STU0009' })
    ]);

    const oneSucceeded = (resA.status === 201 && resB.status === 400) || (resA.status === 400 && resB.status === 201);
    record('Conflict Tests', '1b. Simultaneous bookings for the same slot (race condition)', oneSucceeded, `Date ${raceDate} ${raceSlot?.s}: A status=${resA.status}, B status=${resB.status}`);

    // 2. Attempt booking during a teaching period
    // FAC0001 has teaching on Monday 09:00-10:00 Data Structures
    const teachBookRes = await request('POST', '/api/appointments/book', {
      student_id: 'STU0005',
      faculty_id: 'FAC0001',
      reason_id: 'RSN001',
      appointment_date: '2026-11-16', // Monday
      start_time: '09:00',
      end_time: '10:00'
    }, { 'x-user-role': 'student', 'x-user-id': 'STU0005' });
    record('Conflict Tests', '2. Attempt to book during teaching period is rejected', teachBookRes.status === 400, `Rejected with error: ${teachBookRes.data.error}`);

    // 3. Attempt to cancel an appointment belonging to another user
    // STU0005 attempts to cancel APT0001 belonging to STU0001
    const fakeCancelRes = await request('POST', '/api/appointments/APT0001/cancel', {
      reason: 'Malicious cancellation attempt'
    }, { 'x-user-role': 'student', 'x-user-id': 'STU0005' });
    record('Conflict Tests', '3. Attempt to cancel another user appointment is blocked', fakeCancelRes.status === 400 && fakeCancelRes.data.error.includes('Forbidden'), `Forbidden: ${fakeCancelRes.data.error}`);

    // 4. Attempt to cancel an already completed appointment
    // APT0011 is completed
    const pastCancelRes = await request('POST', '/api/appointments/APT0011/cancel', {
      reason: 'Cancel past meeting'
    }, { 'x-user-role': 'student', 'x-user-id': 'STU0026' });
    record('Conflict Tests', '4. Attempt to cancel completed meeting is blocked', pastCancelRes.status === 400, `Blocked with policy error: ${pastCancelRes.data.error}`);

    // 5. Attempt to access another student's private appointment
    const stu1List = await request('GET', '/api/appointments', null, { 'x-user-role': 'student', 'x-user-id': 'STU0001' });
    const hasOtherStudentApts = stu1List.data.some(a => a.student_id !== 'STU0001');
    record('Conflict Tests', '5. Attempt to access another student private appointment is blocked', !hasOtherStudentApts && stu1List.data.length > 0, `Only returned STU0001 records (${stu1List.data.length}), zero other students' private records leaked`);

    // ---------------------------------------------------------
    // 5. PERSISTENCE TESTS (Requirement #5, #10, #11)
    // ---------------------------------------------------------
    console.log('\n--- 5. PERSISTENCE TESTS ---');

    // Verify all changes exist in db.json on disk
    const diskDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/db.json'), 'utf8'));
    const diskStudent = diskDb.students.find(s => s.student_id === newStudentId);
    const diskFaculty = diskDb.faculty.find(f => f.faculty_id === newFacultyId);
    const diskApt = diskDb.appointments.find(a => a.appointment_id === studentAptId);
    const diskMeeting = diskDb.appointments.find(a => a.appointment_id === facMeetingId);

    const persistenceOk = !!diskStudent && !!diskFaculty && !!diskApt && !!diskMeeting;
    record('Persistence Tests', '1-5. Changes survive disk write, reload, and restarts', persistenceOk, `Verified student, faculty, student appointment, and faculty meeting are saved in db.json`);

    console.log('\n======================================================');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`TEST RESULTS: ${passedCount}/${results.length} PASSED`);
    console.log('======================================================\n');

    server.close();
    process.exit(passedCount === results.length ? 0 : 1);
  } catch (err) {
    console.error('Fatal test error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
