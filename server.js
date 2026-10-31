// College Fee System - simple Node.js server (no npm packages needed)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- data (saved in data.json) ----
let db = { students: [], payments: [] };
if (fs.existsSync(DATA_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* start fresh */ }
}
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
const nextId = list => list.reduce((max, x) => Math.max(max, x.id), 0) + 1;

// ---- helpers ----
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
    });
  });
}

// add paid / due / status to a student
function withFees(s) {
  const paid = db.payments.filter(p => p.studentId === s.id).reduce((sum, p) => sum + p.amount, 0);
  const due = s.totalFee - paid;
  return { ...s, paid, due, status: due <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid' };
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const idMatch = url.pathname.match(/^\/api\/students\/(\d+)$/);

  try {
    // all students (with paid and due)
    if (url.pathname === '/api/students' && req.method === 'GET') {
      return send(res, 200, db.students.map(withFees));
    }

    // add student
    if (url.pathname === '/api/students' && req.method === 'POST') {
      const b = await readBody(req);
      const name = String(b.name || '').trim();
      const rollNo = String(b.rollNo || '').trim();
      const course = String(b.course || '').trim();
      const totalFee = Number(b.totalFee);
      if (!name) return send(res, 400, { error: 'Student name is required' });
      if (!rollNo) return send(res, 400, { error: 'Roll number is required' });
      if (!course) return send(res, 400, { error: 'Course is required' });
      if (!(totalFee > 0)) return send(res, 400, { error: 'Total fee must be more than 0' });
      if (db.students.some(s => s.rollNo.toLowerCase() === rollNo.toLowerCase())) {
        return send(res, 400, { error: 'This roll number already exists' });
      }
      const student = { id: nextId(db.students), name, rollNo, course, totalFee };
      db.students.push(student);
      save();
      return send(res, 201, withFees(student));
    }

    // delete student (and their payments)
    if (idMatch && req.method === 'DELETE') {
      const id = Number(idMatch[1]);
      if (!db.students.some(s => s.id === id)) return send(res, 404, { error: 'Student not found' });
      db.students = db.students.filter(s => s.id !== id);
      db.payments = db.payments.filter(p => p.studentId !== id);
      save();
      return send(res, 200, { ok: true });
    }

    // all payments (latest first)
    if (url.pathname === '/api/payments' && req.method === 'GET') {
      return send(res, 200, db.payments.slice().reverse());
    }

    // collect fee
    if (url.pathname === '/api/payments' && req.method === 'POST') {
      const b = await readBody(req);
      const student = db.students.find(s => s.id === Number(b.studentId));
      const amount = Number(b.amount);
      if (!student) return send(res, 400, { error: 'Please choose a student' });
      if (!(amount > 0)) return send(res, 400, { error: 'Enter a valid amount' });
      const due = withFees(student).due;
      if (amount > due) return send(res, 400, { error: 'Amount is more than the due fee (' + due + ')' });
      const payment = {
        id: nextId(db.payments),
        studentId: student.id,
        studentName: student.name,
        rollNo: student.rollNo,
        amount,
        date: new Date().toLocaleString('en-IN')
      };
      db.payments.push(payment);
      save();
      return send(res, 201, payment);
    }

    // website files from the public folder
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
      res.end(data);
    });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => console.log('College Fee System running at http://localhost:' + PORT));
