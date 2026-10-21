# FAC-CON: Faculty Appointment and Consultation Management System

A full-stack, enterprise-grade academic appointment management platform built with an authoritative shared persistent database, role-based access control, real-time synchronization, and multi-device LAN access.

---

## 1. System Architecture & Problem Root Cause

### What was broken in the prototype:
1. **No Real Persistent Shared Database**:
   - The initial prototype relied on Claude Artifact sandbox mock calls (`claude.use('db')`) that failed in real browsers (`catch(e){}`), falling back to in-memory state (`S.mem = true`).
   - All institutional master records (students, faculty, departments, timetables) were hardcoded in JavaScript arrays (`const D = {...}`).
   - Any modifications disappeared upon page refresh, browser restart, or switching tabs.
2. **Cancellation Button Broken**:
   - The button only mutated a local client array in memory. No server endpoint existed, no authorization check was enforced, no lock was released centrally, and changes did not persist or reflect in other sessions.
3. **Faculty-Initiated Appointments Missing**:
   - Faculty members had no capability to initiate or schedule consultations with students for attendance discussions, project reviews, or academic guidance.
4. **Admin Portal Daily Data Management Missing**:
   - The admin view was read-only with hardcoded mock tables. Admins could not add or edit students, change departments or sections, update faculty cabin numbers, validate USN uniqueness, or manage timetables.
5. **Limited Test Data**:
   - Only 10 appointments existed, missing faculty-initiated invitations, pending states, declines, cancellations, ratings, and outcome disputes.

### How it is fixed:
- **Centralized Persistent Backend**: An Express server backed by an ACID file-backed atomic store (`data/db.json` with write-ahead temp-replacement) preserving internal IDs and historical appointment audit trails.
- **Single Canonical Source of Truth**: Admin, faculty, and student portals read and write the exact same centralized database.
- **Real-Time Synchronization**: Implemented via Server-Sent Events (`GET /api/events`). When an admin updates a student department or faculty cabin, or when an appointment is booked or cancelled, all open browser tabs on all connected devices update instantaneously.
- **Multi-Device / LAN Deployment Ready**: Server listens on `0.0.0.0:3000` and automatically detects the local machine's LAN IP address (e.g. `http://192.168.1.5:3000`), allowing students and faculty to access the platform from their own phones or laptops.

---

## 2. Key Features by Role

### Institutional Administrator
- **Student Management**: Add student, edit profile, change department (CSE &rarr; AIML propagates everywhere without duplicates), update USN with uniqueness validation, change semester/section, upload/replace profile pictures, toggle active/inactive status, safe archival/deactivation with history preservation, CSV import and export.
- **Faculty Management**: Add faculty, edit names, change department, change designation, update cabin location (e.g. `C Block 208` &rarr; `A Block 115` immediately reflects in faculty directory and booking screens), official email, active/inactive status, safe archival, CSV import and export.
- **Timetables & Departments**: Add/edit departments, manage weekly faculty teaching timetables with conflict validation (rejects schedules overlapping with confirmed consultations), and manage consultation availability blocks.
- **Dispute Resolution**: Review conflicted meeting outcomes and record authoritative administrative resolution.
- **Audit Log**: Chronological institutional audit trail for every action.

### Faculty Portal
- **Consultation Overview**: View upcoming appointments, consultations scheduled for today, and pending student responses.
- **Schedule Meeting with Student**:
  1. Search student by name or USN.
  2. Select reason (Academic Performance, Attendance Discussion, Academic Doubts, Project Guidance, Personal Guidance, AICTE Points, Internship and Placement, Examination and Results, Course Registration, or Other with custom description).
  3. Enter meeting message.
  4. Select date and open consultation slot.
  5. Send invitation &bull; Student receives in-app notification &bull; Status set to `pending_student_confirmation`.
- **Review Student Responses**: Track accepted and declined invitations.
- **Timetable & Availability**: Review weekly teaching schedule and consultation hours.
- **Cancellation**: Cancel eligible future appointments with mandatory reason; counterpart is notified and slot is released.
- **Outcome Reporting**: Report whether meetings occurred or students were unavailable.

### Student Portal
- **Find Faculty**: Search faculty directory by name, designation, or department, view live cabin locations, and check next available consultation slot.
- **Book Consultation**: Select date, pick slot, specify reason and message, and confirm. Double-booking prevention and clash detection enforced.
- **Faculty-Initiated Invitations**: Dedicated section displaying invitations from teachers. Students can **Accept** (revalidates slot and confirms) or **Decline** (releases slot and notifies teacher).
- **Appointment Cancellation**: Cancel future eligible appointments with reason input; releases slot immediately and notifies faculty.
- **Outcome & Ratings**: Confirm attendance and rate completed consultations (1 to 5).

---

## 3. How to Run the Application

### Prerequisites
- Node.js (v18+ or v20+)

### Start the Server
```bash
npm start
```
The server will output:
```
====================================================
FAC-CON Server running successfully!
Local machine URL:   http://localhost:3000
LAN / Network URLs (access from other laptops/phones):
  http://192.168.1.5:3000
Database storage:    ...\data\db.json
====================================================
```

Open `http://localhost:3000` in your web browser.

### Multi-Device Access on LAN
To access FAC-CON from other devices on the same Wi-Fi or local network:
1. Ensure the laptop running the server is connected to Wi-Fi.
2. Note the LAN URL displayed on startup and in the application footer (e.g., `http://192.168.1.5:3000`).
3. Open any web browser on another laptop, tablet, or mobile phone and navigate to that URL.

---

## 4. Automated Verification Suite
Run the 26-point end-to-end test suite:
```bash
npm test
```

### Verified Test Categories:
- **Admin Tests (8)**: Add student, persistent check, edit department (CSE &rarr; AIML), verify reflection without duplicates, add faculty, update cabin location, verify directory reflection, deactivate account and verify booking blocked.
- **Student Tests (6)**: Book available faculty slot, verify in student list, verify in faculty list, cancel appointment, verify cancellation in history for both parties.
- **Faculty Tests (7)**: Faculty schedules meeting with student, in-app notification delivered, student accepts, confirmed meeting on both dashboards, student declines invitation, faculty cancels appointment.
- **Conflict Tests (5)**: Attempt to book occupied slot (rejected), simultaneous booking race condition (one succeeds, one rejected), booking during teaching period (rejected), cancelling another user's appointment (forbidden), accessing another student's private appointments (forbidden/filtered).
- **Persistence Tests (5)**: All records survive server restarts and browser reloads.
