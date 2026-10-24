// ============ DATA LAYER (Schemas & Mock Data) ============

const USERS = [
  { id: 'U001', name: 'Admin User', email: 'admin@sportcircle.com', phone: '+66 812 345 001', role: 'admin' },
  { id: 'U002', name: 'Pimchanok S.', email: 'staff@sportcircle.com', phone: '+66 812 345 002', role: 'staff' },
  { id: 'U003', name: 'Somchai P.', email: 'somchai@email.com', phone: '+66 812 345 003', role: 'user' },
  { id: 'U004', name: 'Nattaya K.', email: 'nattaya@email.com', phone: '+66 812 345 004', role: 'user' },
  { id: 'U005', name: 'Arthit W.', email: 'arthit@email.com', phone: '+66 812 345 005', role: 'user' },
];

// 🟢 เปลี่ยนเป็น let และเคลียร์เป็น Array ว่าง เพื่อให้ Supabase เอาข้อมูลมาใส่ได้
let FACILITIES = [];

const BOOKINGS = [
  { id: 'BK001', userId: 'U003', facilityId: 'F001', date: '2026-07-15', startTime: '10:00', endTime: '12:00', totalPrice: 1000, paymentStatus: 'approved', slipImage: true, qrToken: 'BK-2026-0715-FA01', verification: 'pending' },
  { id: 'BK002', userId: 'U004', facilityId: 'F003', date: '2026-07-15', startTime: '14:00', endTime: '16:00', totalPrice: 400, paymentStatus: 'pending', slipImage: true, qrToken: 'BK-2026-0715-BC01', verification: 'pending' },
  { id: 'BK003', userId: 'U005', facilityId: 'F005', date: '2026-07-14', startTime: '18:00', endTime: '20:00', totalPrice: 1200, paymentStatus: 'pending', slipImage: true, qrToken: 'BK-2026-0714-BK01', verification: 'pending' },
  { id: 'BK004', userId: 'U003', facilityId: 'F006', date: '2026-07-16', startTime: '09:00', endTime: '11:00', totalPrice: 1400, paymentStatus: 'approved', slipImage: true, qrToken: 'BK-2026-0716-FS01', verification: 'pending' },
  { id: 'BK005', userId: 'U004', facilityId: 'F001', date: '2026-07-10', startTime: '16:00', endTime: '18:00', totalPrice: 1000, paymentStatus: 'approved', slipImage: true, qrToken: 'BK-2026-0710-FA01', verification: 'checked-in' },
  { id: 'BK006', userId: 'U005', facilityId: 'F007', date: '2026-07-08', startTime: '08:00', endTime: '10:00', totalPrice: 600, paymentStatus: 'rejected', slipImage: true, qrToken: null, verification: 'pending' },
];

const TIME_BLOCKS = [
  { id: 'TB001', facilityId: 'F001', date: '2026-07-14', blockedStart: '10:00', blockedEnd: '12:00', reason: 'maintenance' },
  { id: 'TB002', facilityId: 'F005', date: '2026-07-14', blockedStart: '14:00', blockedEnd: '15:00', reason: 'event' },
];