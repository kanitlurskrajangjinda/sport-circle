// ============ SUPABASE INITIALIZATION ============
const SUPABASE_URL = 'https://jffykhzehgqlanmzdddk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZnlraHplaGdxbGFubXpkZGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTQzMTAsImV4cCI6MjEwMDA5MDMxMH0.Sn9io7u0nrFmFBFr4QnwbjwBhAzgFg0MNBNC87BEf8k';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ APP STATE ============
let selectedFacilityImages = []; // เก็บไฟล์รูปที่ Admin เลือก
let currentSlideIndex = 0; // ควบคุมสไลด์โชว์ว่าอยู่รูปที่เท่าไหร่
let currentUser = null;
let currentRole = 'user';
let currentView = 'facilities';
let selectedFacility = null;
let selectedDate = new Date();
let selectedSlots = [];
let calendarMonth = new Date();

// ============ AUTH & NAVIGATION ============

function switchLoginTab(btn, tab) {
  document.querySelectorAll('.login-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
}

// 1. ฟังก์ชันเข้าสู่ระบบ (Sign In)
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!email || !password) {
    alert('กรุณากรอก Email และ Password');
    return;
  }

  // ยิง Auth Sign In ไปยัง Supabase
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    alert('เข้าสู่ระบบไม่สำเร็จ: ' + error.message);
    return;
  }

  currentUser = data.user;
  await fetchUserProfile(currentUser.id);
}

// ===== รูปโปรไฟล์ (Avatar) =====
const AVATAR_BUCKET = 'avatars';
let signUpAvatarBlob = null;

// แสดงรูปในวงกลม ถ้าไม่มีรูปให้แสดงตัวอักษรย่อแทน
function applyAvatar(el, url, initials) {
  if (!el) return;
  if (url) {
    el.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = initials || '';
  }
}

// ย่อ + ครอปรูปเป็นสี่เหลี่ยมจัตุรัส 400x400 แล้วแปลงเป็น JPEG (ลดขนาดไฟล์ก่อนอัปโหลด)
function resizeImageToJpeg(file, size = 400) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(objUrl);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ')), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('ไม่สามารถอ่านไฟล์รูปนี้ได้ กรุณาใช้ไฟล์ JPG / PNG / WEBP')); };
    img.src = objUrl;
  });
}

function validateAvatarFile(file) {
  if (!file) return false;
  if (!file.type || !file.type.startsWith('image/')) { alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น'); return false; }
  if (file.size > 15 * 1024 * 1024) { alert('ไฟล์รูปต้องมีขนาดไม่เกิน 15 MB'); return false; }
  return true;
}

// อัปโหลดรูปขึ้น Supabase Storage (bucket: avatars) แล้วคืน public URL
async function uploadAvatarBlob(userId, blob) {
  const path = userId + '/avatar.jpg';
  const { error } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl + '?v=' + Date.now(); // ใส่ ?v= เพื่อไม่ให้เบราว์เซอร์จำรูปเก่า
}

// --- เลือกวิธีใส่รูป: ถ่ายรูป / เลือกจากอัลบั้ม ---
function closeAvatarPicker() {
  const el = document.getElementById('avatarPickerSheet');
  if (el) el.classList.remove('open');
}

function openAvatarPicker(target) {
  let sheet = document.getElementById('avatarPickerSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'avatarPickerSheet';
    sheet.className = 'avatar-sheet-overlay';
    sheet.innerHTML = `
      <div class="avatar-sheet" role="dialog" aria-label="เลือกรูปโปรไฟล์">
        <div class="avatar-sheet-title">รูปโปรไฟล์</div>
        <button type="button" class="avatar-sheet-btn" id="avatarSheetCamera">📷 ถ่ายรูป</button>
        <button type="button" class="avatar-sheet-btn" id="avatarSheetGallery">🖼️ เลือกจากอัลบั้ม / ไฟล์</button>
        <button type="button" class="avatar-sheet-btn cancel" onclick="closeAvatarPicker()">ยกเลิก</button>
      </div>`;
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeAvatarPicker(); });
    document.body.appendChild(sheet);
  }
  const ids = target === 'signup'
    ? { camera: 'signUpAvatarCamera', gallery: 'signUpAvatar' }
    : { camera: 'profileAvatarCamera', gallery: 'profileAvatarInput' };
  document.getElementById('avatarSheetCamera').onclick = () => { closeAvatarPicker(); document.getElementById(ids.camera).click(); };
  document.getElementById('avatarSheetGallery').onclick = () => { closeAvatarPicker(); document.getElementById(ids.gallery).click(); };
  sheet.classList.add('open');
}

// --- หน้าสมัครสมาชิก ---
async function previewSignUpAvatar(input) {
  const file = input.files && input.files[0];
  if (!validateAvatarFile(file)) { input.value = ''; return; }
  try {
    signUpAvatarBlob = await resizeImageToJpeg(file);
    const box = document.getElementById('signUpAvatarPreview');
    box.style.backgroundImage = 'url("' + URL.createObjectURL(signUpAvatarBlob) + '")';
    box.classList.add('has-image');
    document.getElementById('signUpAvatarClear').style.display = 'inline-block';
  } catch (err) {
    signUpAvatarBlob = null;
    input.value = '';
    alert(err.message);
  }
}

function clearSignUpAvatar() {
  signUpAvatarBlob = null;
  const input = document.getElementById('signUpAvatar');
  if (input) input.value = '';
  const camInput = document.getElementById('signUpAvatarCamera');
  if (camInput) camInput.value = '';
  const box = document.getElementById('signUpAvatarPreview');
  if (box) { box.style.backgroundImage = ''; box.classList.remove('has-image'); }
  const btn = document.getElementById('signUpAvatarClear');
  if (btn) btn.style.display = 'none';
}

// --- หน้าโปรไฟล์: เปลี่ยน / ลบรูป ---
async function handleProfileAvatarChange(input) {
  const file = input.files && input.files[0];
  if (!file || !currentUser) return;
  if (!validateAvatarFile(file)) { input.value = ''; return; }
  const camBtn = document.querySelector('.avatar-edit-btn');
  if (camBtn) camBtn.disabled = true;
  try {
    const blob = await resizeImageToJpeg(file);
    const url = await uploadAvatarBlob(currentUser.id, blob);
    const { error } = await supabaseClient.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
    if (error) throw error;
    currentUser.profile = { ...(currentUser.profile || {}), avatar_url: url };
    setupNav();
    await loadUserProfileView();
    alert('✅ เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว!');
  } catch (err) {
    alert('เปลี่ยนรูปโปรไฟล์ไม่สำเร็จ: ' + (err.message || err));
  } finally {
    input.value = '';
    if (camBtn) camBtn.disabled = false;
  }
}

async function removeProfileAvatar() {
  if (!currentUser || !confirm('ต้องการลบรูปโปรไฟล์ใช่หรือไม่?')) return;
  try {
    const { error } = await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', currentUser.id);
    if (error) throw error;
    await supabaseClient.storage.from(AVATAR_BUCKET).remove([currentUser.id + '/avatar.jpg']);
    currentUser.profile = { ...(currentUser.profile || {}), avatar_url: null };
    setupNav();
    await loadUserProfileView();
  } catch (err) {
    alert('ลบรูปโปรไฟล์ไม่สำเร็จ: ' + (err.message || err));
  }
}

// ===== แสดง/ซ่อนรหัสผ่าน =====
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('showing', show);
  btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
  btn.title = show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน';
  input.focus();
}

// ===== ตรวจความแข็งแรงของรหัสผ่าน =====
function checkPasswordRules(pw) {
  return {
    len:   pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    num:   /[0-9]/.test(pw),
    sym:   /[^A-Za-z0-9\s]/.test(pw)
  };
}

function getPasswordStrength(pw) {
  const rules = checkPasswordRules(pw);
  const passed = Object.values(rules).filter(Boolean).length;
  const percent = passed * 25;
  let level = 'none', text = 'ยังไม่ได้กรอก';
  if (pw.length > 0) {
    if (percent <= 25)       { level = 'weak';   text = 'อ่อนมาก'; }
    else if (percent === 50) { level = 'fair';   text = 'อ่อน'; }
    else if (percent === 75) { level = 'good';   text = 'ปานกลาง'; }
    else                     { level = 'strong'; text = 'แข็งแรง'; }
  }
  return { rules, percent, level, text, ok: percent === 100 };
}

function updatePasswordStrength(pw) {
  const s = getPasswordStrength(pw);
  const fill = document.getElementById('pwBarFill');
  const label = document.getElementById('pwStrengthLabel');
  const box = document.getElementById('pwStrength');
  if (!fill || !label || !box) return;
  fill.style.width = s.percent + '%';
  box.dataset.level = s.level;
  label.textContent = s.percent + '% - ' + s.text;
  const map = { pwRuleLen: 'len', pwRuleUpper: 'upper', pwRuleNum: 'num', pwRuleSym: 'sym' };
  Object.keys(map).forEach(id => {
    document.getElementById(id).classList.toggle('met', s.rules[map[id]]);
  });
}

// 2. ฟังก์ชันสมัครสมาชิก (Sign Up)
async function handleSignUp() {
  const name = document.getElementById('signUpName').value.trim();
  const email = document.getElementById('signUpEmail').value.trim();
  const phone = document.getElementById('signUpPhone').value.trim();
  const password = document.getElementById('signUpPassword').value.trim();

  if (!name || !email || !password) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    return;
  }

  // ตรวจความแข็งแรงของรหัสผ่านก่อนสร้างบัญชี
  if (!getPasswordStrength(password).ok) {
    alert('รหัสผ่านยังไม่แข็งแรงพอ กรุณาตั้งให้ครบทุกเงื่อนไข (ความแข็งแรง 100%)');
    return;
  }

  // สร้าง User ใน Supabase Auth
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password
  });

  if (error) {
    alert('สมัครสมาชิกไม่สำเร็จ: ' + error.message);
    return;
  }

  if (data.user) {
    // อัปโหลดรูปโปรไฟล์ (ถ้าผู้ใช้เลือกไว้) ถ้าอัปโหลดไม่สำเร็จก็ยังสมัครต่อได้
    let avatarUrl = null;
    let avatarNote = '';
    if (signUpAvatarBlob) {
      if (data.session) {
        try {
          avatarUrl = await uploadAvatarBlob(data.user.id, signUpAvatarBlob);
        } catch (avatarErr) {
          console.error('Error uploading avatar:', avatarErr.message);
          avatarNote = '\n(อัปโหลดรูปโปรไฟล์ไม่สำเร็จ คุณสามารถเพิ่มรูปได้ภายหลังที่หน้าโปรไฟล์)';
        }
      } else {
        avatarNote = '\n(คุณสามารถเพิ่มรูปโปรไฟล์ได้ที่หน้าโปรไฟล์หลังยืนยันอีเมลและเข้าสู่ระบบ)';
      }
    }

    // บันทึกข้อมูลเพิ่มลงในตาราง profiles
    const profileRow = {
      id: data.user.id,
      name: name,
      phone: phone,
      role: 'user' // Default เป็น user
    };
    if (avatarUrl) profileRow.avatar_url = avatarUrl;

    const { error: profileError } = await supabaseClient
      .from('profiles')
      .insert([profileRow]);

    if (profileError) {
      console.error('Error creating profile:', profileError.message);
    }

    alert('สมัครสมาชิกสำเร็จแล้ว! ระบบกำลังเข้าสู่ระบบให้อัตโนมัติ' + avatarNote);
    clearSignUpAvatar();
    currentUser = data.user;
    await fetchUserProfile(currentUser.id);
  }
}

// 1. ปรับ fetchUserProfile ให้รอโหลดข้อมูลสนามให้เสร็จก่อน
async function fetchUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching profile:', error);
    currentRole = 'user';
  } else {
    currentRole = data.role || 'user';
    currentUser.profile = data;
  }

  // ปิดหน้า Login แล้วเปิด App Shell
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appShell').style.display = 'grid';
  
  setupNav();

  // สลับ View ตาม Role และโหลดข้อมูล
  if (currentRole === 'admin') {
    await switchView('dashboard');
  } else if (currentRole === 'staff') {
    await switchView('scanner');
  } else {
    await switchView('facilities');
  }

  if (window.lucide) lucide.createIcons();
}

// 2. อัปเดต switchView ให้จำหมวดหมู่กีฬาที่ลูกค้าเลือกค้างไว้ตอนกดย้อนกลับ
async function switchView(view) {
  currentView = view;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + view);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    if (a.dataset.view === view) a.classList.add('active');
    else a.classList.remove('active');
  });

  // 💡 ใช้ currentSportFilter แทน 'all' เพื่อให้พอกด Back กลับมาแล้วยังแสดงเฉพาะหมวดกีฬาที่เลือกไว้
  if (view === 'facilities') await fetchFacilities(currentSportFilter || 'all');
  if (view === 'my-bookings') await renderMyBookings();
  if (view === 'history') await renderHistory();
  if (view === 'manage-facilities') {
    await fetchFacilities('all');
    renderFacilitiesTable();
  }
  if (view === 'payments') await renderPaymentsTable();
  if (view === 'slots') await initSlotManagement();
  if (view === 'dashboard') await renderDashboardStats();
  if (view === 'profile') await loadUserProfileView();

  if (window.lucide) lucide.createIcons();
}

function setupNav() {
  const userName = currentUser?.profile?.name || currentUser?.email || 'User';
  const avatarInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('userName').textContent = userName;
  document.getElementById('userRole').textContent = currentRole;
  applyAvatar(document.getElementById('userAvatar'), currentUser?.profile?.avatar_url, avatarInitials);

  // ควบคุมการแสดงผลเมนู Sidebar ตาม Role
  document.getElementById('navUser').style.display = 'block';
  document.getElementById('navUserLinks').style.display = 'block';
  
  const isAdmin = (currentRole === 'admin');
  const isStaff = (currentRole === 'staff');

  document.getElementById('navAdmin').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('navAdminLinks').style.display = isAdmin ? 'block' : 'none';
  
  document.getElementById('navStaff').style.display = isStaff ? 'block' : 'none';
  document.getElementById('navStaffLinks').style.display = isStaff ? 'block' : 'none';
}

// ฟังก์ชันออกจากระบบ (Logout)
async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentRole = 'user';
  
  // เคลียร์ค่า Email และ Password ในช่อง Sign In
  if (document.getElementById('loginEmail')) document.getElementById('loginEmail').value = '';
  if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';
  
  // เคลียร์ค่าในช่อง Sign Up
  if (document.getElementById('signUpName')) document.getElementById('signUpName').value = '';
  if (document.getElementById('signUpEmail')) document.getElementById('signUpEmail').value = '';
  if (document.getElementById('signUpPhone')) document.getElementById('signUpPhone').value = '';
  if (notifPollingInterval) {
    clearInterval(notifPollingInterval);
    notifPollingInterval = null;
  }
  toggleNotificationDrawer(false);
  currentNotifications = [];
  updateNotificationBadges();

  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginScreen').classList.add('active');
}

// ============ FACILITIES BROWSE ============

function filterFacilities(btn, sport) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  fetchFacilities(sport);
}

// ============ BOOKING PROCESS ============
// โหลดอุปกรณ์ รูปภาพ แผนที่ และรายละเอียดทั้งหมดมาโชว์ในหน้าจองสนาม
async function openBooking(facilityId) {
  selectedFacility = FACILITIES.find(f => f.id === facilityId);
  if (!selectedFacility) return;

  selectedSlots = [];
  selectedAddons = {}; 
  resetSlipUploadUI();

  // ดึงเบอร์และชื่อลูกค้า
  const customerNameInput = document.getElementById('bookingCustomerName');
  const customerPhoneInput = document.getElementById('bookingCustomerPhone');
  if (currentUser && (!currentUser.profile || !currentUser.profile.phone)) {
    const { data: prof } = await supabaseClient.from('profiles').select('name, phone').eq('id', currentUser.id).single();
    if (prof) currentUser.profile = { ...(currentUser.profile || {}), ...prof };
  }
  if (customerNameInput) customerNameInput.value = currentUser?.profile?.name || '';
  if (customerPhoneInput) customerPhoneInput.value = currentUser?.profile?.phone || '';

  document.getElementById('bookingTitle').textContent = selectedFacility.name;
  const sportName = selectedFacility.sport ? selectedFacility.sport.charAt(0).toUpperCase() + selectedFacility.sport.slice(1) : '-';
  const provinceName = (selectedFacility.province && selectedFacility.province.trim() !== '') ? selectedFacility.province.trim() : 'ไม่ระบุจังหวัด';
  
  const metaEl = document.getElementById('bookingMeta');
  if (metaEl) {
    metaEl.innerHTML = `
      <span style="background: var(--primary); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.02em;">
        ⚽ ${sportName}
      </span>
      <span style="background: #fef2f2; color: var(--primary); border: 1px solid #fecaca; padding: 6px 14px; border-radius: 20px; font-size: 1rem; font-weight: 800;">
        ฿${Number(selectedFacility.price || 0).toLocaleString()} / ชม.
      </span>
      <span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 14px; border-radius: 20px; font-size: 0.95rem; font-weight: 700;">
        📍 จ.${provinceName}
      </span>
    `;
  }
  const sumFac = document.getElementById('sumFacility');
  if (sumFac) sumFac.textContent = selectedFacility.name;

  // --- ระบบรูปภาพสไลด์โชว์ ---
  const slider = document.getElementById('bookingImageSlider');
  const dotsContainer = document.getElementById('sliderDots');
  if (slider && dotsContainer) {
    slider.innerHTML = '';
    dotsContainer.innerHTML = '';
    currentSlideIndex = 0;
    slider.style.transform = 'translateX(0%)';

    let imgs = [];
    try {
      if (selectedFacility.images) {
        if (Array.isArray(selectedFacility.images)) {
          imgs = selectedFacility.images;
        } else if (typeof selectedFacility.images === 'string') {
          imgs = JSON.parse(selectedFacility.images);
        }
      }
    } catch (e) {
      console.log('Image parse error:', e);
      imgs = [];
    }

    if (!Array.isArray(imgs)) imgs = [];
    
    // กรองเอาเฉพาะ URL ที่ใช้งานได้จริง
    imgs = imgs.map(u => String(u).replace(/^"|"\$/g, '').trim()).filter(u => u && u.startsWith('http'));

    // 💡 ซ่อน/แสดงปุ่มลูกศรเลื่อนซ้าย-ขวา ถ้าไม่มีรูป หรือมีรูปเดียว ปุ่มจะหายไป
    const sliderContainer = slider.parentElement;
    const navButtons = sliderContainer.querySelectorAll('button');
    if (imgs.length <= 1) {
      navButtons.forEach(btn => btn.style.display = 'none');
    } else {
      navButtons.forEach(btn => btn.style.display = 'flex');
    }

    if (imgs.length > 0) {
      slider.innerHTML = imgs.map(url => `
        <div class="slide-item" style="min-width: 100%; height: 100%; flex-shrink: 0; background: #000;">
          <img src="${url}" alt="Facility Image" style="width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.9;">
        </div>
      `).join('');

      if (imgs.length > 1) {
        dotsContainer.innerHTML = imgs.map((_, idx) => `
          <div class="slider-dot ${idx === 0 ? 'active' : ''}" onclick="setSlide(${idx})"></div>
        `).join('');
      }
    } else {
      const defaultColor = selectedFacility.color || 'oklch(45% 0.12 140)';
      slider.innerHTML = `
        <div class="slide-item" style="min-width: 100%; height: 100%; flex-shrink: 0; background: linear-gradient(135deg, ${defaultColor}, #222); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.7); font-size: 1rem; font-weight: 500;">
          ไม่มีรูปภาพเพิ่มเติม
        </div>
      `;
    }
  }

  // --- รายละเอียดสนาม ---
  const descEl = document.getElementById('bookingDescription');
  if (descEl) {
    descEl.textContent = selectedFacility.description || 'ไม่มีข้อมูลรายละเอียดเพิ่มเติมสำหรับสนามนี้';
  }

  // --- สิ่งอำนวยความสะดวก ---
  const amenitiesEl = document.getElementById('bookingAmenities');
  if (amenitiesEl) {
    let currentAmenities = [];
    try {
      if (Array.isArray(selectedFacility.amenities)) {
        currentAmenities = selectedFacility.amenities;
      } else if (typeof selectedFacility.amenities === 'string') {
        currentAmenities = JSON.parse(selectedFacility.amenities);
      }
    } catch (e) {
      currentAmenities = [];
    }
    
    amenitiesEl.innerHTML = currentAmenities.length > 0
      ? currentAmenities.map(am => `<span style="padding:4px 12px; background:#e8f5e9; color:#1b5e20; border-radius:20px; font-size:0.8rem; font-weight:600; border:1px solid #c8e6c9;">✓ ${am}</span>`).join('')
      : '<span style="color:var(--text-tertiary); font-size:0.85rem">ไม่มีข้อมูลสิ่งอำนวยความสะดวก</span>';
  }

  // --- แผนที่ Google Maps ---
  const mapContainer = document.getElementById('bookingMapContainer');
  if (mapContainer) {
    const mapUrl = (selectedFacility.map_url || '').trim();
    if (mapUrl) {
      mapContainer.style.display = 'block';
      mapContainer.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span style="font-size:0.88rem; font-weight:600; color:#334155;">📍 พิกัดและการเดินทาง (${provinceName}):</span>
          <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:6px 14px; border-radius:8px; font-size:0.84rem; font-weight:600; text-decoration:none;">
            🗺️ เปิดดูแผนที่ Google Maps ↗
          </a>
        </div>
      `;
    } else {
      mapContainer.style.display = 'none';
    }
  }

  // --- บัญชีธนาคาร ---
  const bankNameEl = document.getElementById('displayBankName');
  const bankAccEl = document.getElementById('displayBankAccount');
  const accNameEl = document.getElementById('displayAccountName');
  if (bankNameEl) bankNameEl.textContent = selectedFacility.bank_name || 'ยังไม่ระบุธนาคาร';
  if (bankAccEl) bankAccEl.textContent = selectedFacility.bank_account || '-';
  if (accNameEl) accNameEl.textContent = selectedFacility.account_name || '-';

  // --- โหลดอุปกรณ์เสริม ---
  const addonsSec = document.getElementById('bookingAddonsSection');
  const addonsList = document.getElementById('bookingAddonsList');
  if (addonsSec && addonsList) {
    const { data: eqData } = await supabaseClient.from('equipment').select('*').eq('facility_id', facilityId).gt('stock', 0);
    currentFacilityEquipment = eqData || [];
    
    if (currentFacilityEquipment.length > 0) {
      addonsSec.style.display = 'block';
      addonsList.innerHTML = currentFacilityEquipment.map(eq => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
          <div>
            <div style="font-size:0.85rem; font-weight:600;">${eq.name}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">฿${eq.price} | ประเภท: ${eq.type}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px; background:#f8fafc; border-radius:6px; padding:2px;">
            <button type="button" onclick="updateAddonQty('${eq.id}', -1, ${eq.stock})" style="width:28px; height:28px; border:none; background:#fff; border-radius:4px; font-weight:bold; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1);">-</button>
            <span id="qty_${eq.id}" style="width:16px; text-align:center; font-size:0.85rem; font-weight:700;">0</span>
            <button type="button" onclick="updateAddonQty('${eq.id}', 1, ${eq.stock})" style="width:28px; height:28px; border:none; background:var(--primary); color:white; border-radius:4px; font-weight:bold; cursor:pointer;">+</button>
          </div>
        </div>
      `).join('');
    } else {
      addonsSec.style.display = 'none';
    }
  }

  selectedDate = new Date();
  calendarMonth = new Date();
  renderCalendar();
  await renderTimeSlots();
  updateSummary();
  switchView('booking');
}
// ฟังก์ชันเลื่อนสไลด์ซ้าย-ขวา
function moveFacilitySlider(direction) {
  if (!selectedFacility || !selectedFacility.images || selectedFacility.images.length <= 1) return;
  
  const totalSlides = selectedFacility.images.length;
  currentSlideIndex = (currentSlideIndex + direction + totalSlides) % totalSlides;
  updateSliderPosition();
}

// ฟังก์ชันกดเลือกรูปจากจุด (Dots)
function setSlide(index) {
  currentSlideIndex = index;
  updateSliderPosition();
}

// อัปเดตตำแหน่งและการแสดงผล (ขยับแกน X)
function updateSliderPosition() {
  const slider = document.getElementById('bookingImageSlider');
  if (!slider) return;
  // เลื่อนตำแหน่งด้วย translateX ทีละ 100%
  slider.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  
  // อัปเดตสถานะของจุด (Dots)
  const dots = document.querySelectorAll('#sliderDots .slider-dot');
  dots.forEach((dot, index) => {
    if (index === currentSlideIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  
  document.getElementById('calendarMonth').textContent = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = days.map(d => `<div class="day-label">${d}</div>`).join('');
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0); // รีเซตเวลาเพื่อเปรียบเทียบเฉพาะวัน
  
  for (let i = 0; i < firstDay; i++) html += '<div class="day-cell disabled"></div>';
  
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isPast = date < today;
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = date.toDateString() === selectedDate.toDateString();
    let cls = 'day-cell';
    if (isPast) cls += ' disabled';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    html += `<div class="${cls}" onclick="${isPast ? '' : `selectDate(${year},${month},${d})`}">${d}</div>`;
  }
  grid.innerHTML = html;
}

async function selectDate(y, m, d) {
  selectedDate = new Date(y, m, d);
  selectedSlots = [];
  renderCalendar();
  await renderTimeSlots();
  updateSummary();
}

function changeMonth(dir) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + dir, 1);
  renderCalendar();
}

// 2. คำนวณ Slot เวลาว่างจาก Supabase จริง (Heart of Slot Management)
async function renderTimeSlots() {
  const grid = document.getElementById('timeSlotsGrid');
  if (!grid || !selectedFacility) return;

  grid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-tertiary); grid-column:1/-1;">กำลังโหลดช่วงเวลาว่าง...</p>';

  // Format วันที่ในรูปแบบ YYYY-MM-DD
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(selectedDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  // ดึงข้อมูลการจองจริงจากตาราง bookings
  const { data: bookingsData, error: bookingErr } = await supabaseClient
    .from('bookings')
    .select('start_time, end_time, payment_status')
    .eq('facility_id', selectedFacility.id)
    .eq('date', dateStr)
    .neq('payment_status', 'rejected'); // ไม่นับรายการที่โดนปฏิเสธ

  // ดึงข้อมูลการบล็อกเวลาจากตาราง time_blocks
  const { data: blocksData, error: blockErr } = await supabaseClient
    .from('time_blocks')
    .select('blocked_start, blocked_end')
    .eq('facility_id', selectedFacility.id)
    .eq('date', dateStr);

  const bookings = bookingsData || [];
  const blocks = blocksData || [];

  // สร้างช่วงเวลา 06:00 - 22:00
  const hours = [];
  for (let h = 6; h <= 21; h++) {
    hours.push(`${h.toString().padStart(2, '0')}:00`);
  }

  // --- เพิ่มโค้ดที่นี่ ---
  const now = new Date();
  const isToday = selectedDate.toDateString() === now.toDateString();
  // ---------------------

grid.innerHTML = hours.map(h => {
    const hourNum = parseInt(h);

    // เช็กว่าเวลานี้ซ้อนทับกับการจองในตาราง bookings หรือไม่
    const isBooked = bookings.some(b => {
      const start = parseInt(b.start_time);
      const end = parseInt(b.end_time);
      return hourNum >= start && hourNum < end;
    });

    // เช็กว่าเวลานี้ถูกแอดมินบล็อกในตาราง time_blocks หรือไม่
    const isBlockedByAdmin = blocks.some(b => {
      const start = parseInt(b.blocked_start);
      const end = parseInt(b.blocked_end);
      return hourNum >= start && hourNum < end;
    });

    const isPastHour = isToday && hourNum <= now.getHours();
    const isUnavailable = isBooked || isBlockedByAdmin || isPastHour;
    const isSelected = selectedSlots.includes(h);

    let cls = 'time-slot';
    if (isUnavailable) cls += ' blocked';
    else if (isSelected) cls += ' selected';

    const clickAttr = isUnavailable ? '' : `onclick="toggleSlot('${h}')"`;

    // 💡 แยกข้อความและสีพื้นหลังระหว่าง "ปิดปรับปรุง (แอดมินล็อก)" กับ "ไม่ว่าง (ลูกค้าจองแล้ว)"
    let statusLabel = '';
    let customStyle = '';

    if (isBlockedByAdmin) {
      statusLabel = '<br><span style="font-size:0.68rem; color:#d97706; font-weight:700; display:inline-block; text-decoration:none;">(ปิดปรับปรุง)</span>';
      customStyle = 'style="background:#fefce8; border-color:#fde047; color:#a16207;"';
    } else if (isUnavailable) {
      statusLabel = '<br><span style="font-size:0.65rem; color:var(--error);">(ไม่ว่าง)</span>';
    }

    return `
      <div class="${cls}" ${customStyle} ${clickAttr}>
        ${h} - ${(hourNum + 1).toString().padStart(2, '0')}:00
        ${statusLabel}
      </div>
    `;
  }).join('');
}

// เมื่อลูกค้าคลิกเลือก หรือ ยกเลิกช่วงเวลา
async function toggleSlot(time) {
  const idx = selectedSlots.indexOf(time);
  if (idx > -1) {
    selectedSlots.splice(idx, 1);
  } else {
    selectedSlots.push(time);
  }
  selectedSlots.sort();
  renderTimeSlots();
  
  // 💡 หัวใจสำคัญ: เมื่อเปลี่ยนสล็อตเวลา ต้องคำนวณสต็อกของเช่าใหม่!
  await checkLiveEquipmentStock(); 
  updateSummary();
}

// 💡 ฟังก์ชันคำนวณสต็อกเช่าและซื้อแบบ Real-time (อัปเกรดป้องกันการนับเบิ้ลเวลากดหลายชั่วโมง)
async function checkLiveEquipmentStock() {
  if (currentFacilityEquipment.length === 0) return;

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  // 1. ดึงข้อมูลการจอง "ทั้งหมด" ของสนามนี้ใน "วันนี้"
  const { data: todayBookings } = await supabaseClient
    .from('bookings')
    .select('start_time, end_time, addons, payment_status')
    .eq('facility_id', selectedFacility.id)
    .eq('date', dateStr)
    .in('payment_status', ['approved', 'completed', 'pending']); 

  // 2. คำนวณสต็อกที่ถูก "เช่า" สูงสุด ในช่วงชั่วโมงที่ลูกค้าเลือก
  let maxRentedInSelectedSlots = {}; 

  if (todayBookings && selectedSlots.length > 0) {
    selectedSlots.forEach(slotHour => {
      const slotStartNum = parseInt(slotHour);
      let rentedThisHour = {}; // เก็บสถิติว่าชั่วโมงนี้ถูกเช่าไปเท่าไหร่
      
      const overlappingBookings = todayBookings.filter(b => {
        const start = parseInt(b.start_time);
        const end = parseInt(b.end_time);
        return slotStartNum >= start && slotStartNum < end; 
      });

      overlappingBookings.forEach(b => {
        // ดักจับและแปลง JSON เผื่อกรณี Supabase ส่งกลับมาเป็น String
        let addonsData = b.addons;
        if (typeof addonsData === 'string') {
          try { addonsData = JSON.parse(addonsData); } catch(e) { addonsData = []; }
        }

        if (addonsData && Array.isArray(addonsData)) {
          addonsData.forEach(addon => {
            if (addon.type === 'เช่า') {
              if (!rentedThisHour[addon.id]) rentedThisHour[addon.id] = 0;
              rentedThisHour[addon.id] += Number(addon.qty);
            }
          });
        }
      });

      // เทียบเพื่อหาว่าในบรรดาชั่วโมงที่ลูกค้ากดเลือกทั้งหมด มีการเช่าของชิ้นนี้ออกไปสูงสุดกี่ชิ้น
      for (const [eqId, qty] of Object.entries(rentedThisHour)) {
        if (!maxRentedInSelectedSlots[eqId] || qty > maxRentedInSelectedSlots[eqId]) {
          maxRentedInSelectedSlots[eqId] = qty;
        }
      }
    });
  }

  // 3. วาดรายการอุปกรณ์และแสดงสต็อกสุทธิ
  const addonsListEl = document.getElementById('bookingAddonsList');
  if (!addonsListEl) return;

  let html = '';
  currentFacilityEquipment.forEach(eq => {
    let availableStock = eq.stock; 

    // ถ้าเป็นของ "เช่า" ให้หักลบจำนวนสูงสุดที่มีคนเช่าไปแล้วในช่วงเวลานั้นๆ
    if (eq.type === 'เช่า' && selectedSlots.length > 0) {
      const rentedQty = maxRentedInSelectedSlots[eq.id] || 0;
      availableStock = Math.max(0, eq.stock - rentedQty); 
    } 

    if (selectedAddons[eq.id] && selectedAddons[eq.id] > availableStock) {
      selectedAddons[eq.id] = availableStock; 
    }

    const currentQtyInCart = selectedAddons[eq.id] || 0;
    const isOutOfStock = availableStock === 0;

    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border:1px solid #e2e8f0; border-radius:8px; opacity: ${isOutOfStock ? '0.6' : '1'};">
        <div>
          <div style="font-size:0.85rem; font-weight:600; text-decoration: ${isOutOfStock ? 'line-through' : 'none'};">${eq.name}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">฿${eq.price} | ${eq.type} 
            <strong style="color:${isOutOfStock ? 'var(--error)' : '#d97706'}; margin-left:4px;">(ว่าง ${availableStock})</strong>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; background:#f8fafc; border-radius:6px; padding:2px;">
          <button type="button" onclick="updateAddonQty('${eq.id}', -1, ${availableStock})" style="width:28px; height:28px; border:none; background:#fff; border-radius:4px; font-weight:bold; cursor:${isOutOfStock ? 'not-allowed' : 'pointer'}; box-shadow:0 1px 2px rgba(0,0,0,0.1);" ${isOutOfStock ? 'disabled' : ''}>-</button>
          <span id="qty_${eq.id}" style="width:16px; text-align:center; font-size:0.85rem; font-weight:700;">${currentQtyInCart}</span>
          <button type="button" onclick="updateAddonQty('${eq.id}', 1, ${availableStock})" style="width:28px; height:28px; border:none; background:var(--primary); color:white; border-radius:4px; font-weight:bold; cursor:${isOutOfStock ? 'not-allowed' : 'pointer'};" ${isOutOfStock ? 'disabled' : ''}>+</button>
        </div>
      </div>
    `;
  });

  addonsListEl.innerHTML = html;
}

function updateSummary() {
  const dateStr = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('sumDate').textContent = dateStr;
  
  let addonTotal = 0;
  for (const [eqId, qty] of Object.entries(selectedAddons)) {
    if (qty > 0) {
      const eq = currentFacilityEquipment.find(e => e.id === eqId);
      if (eq) addonTotal += (eq.price * qty);
    }
  }

  if (selectedSlots.length > 0) {
    const start = selectedSlots[0];
    const lastHour = parseInt(selectedSlots[selectedSlots.length - 1]) + 1;
    const end = lastHour.toString().padStart(2, '0') + ':00';
    document.getElementById('sumTime').textContent = `${start} - ${end}`;
    document.getElementById('sumDuration').textContent = `${selectedSlots.length} hour${selectedSlots.length > 1 ? 's' : ''}`;
    
    const facilityTotal = selectedSlots.length * (selectedFacility?.price || 0);
    const grandTotal = facilityTotal + addonTotal;
    document.getElementById('sumTotal').textContent = `฿${grandTotal.toLocaleString()}`;
  } else {
    document.getElementById('sumTime').textContent = 'Select slots';
    document.getElementById('sumDuration').textContent = '-';
    document.getElementById('sumTotal').textContent = `฿${addonTotal > 0 ? addonTotal.toLocaleString() : '0'}`;
  }
  
  const transferAmountEl = document.getElementById('displayTransferAmount');
  if (transferAmountEl) transferAmountEl.textContent = document.getElementById('sumTotal').textContent;
}

// ============ SLIP UPLOAD & BOOKING SUBMISSION ============

let selectedSlipFile = null;

// ฟังก์ชันดักจับการเลือกไฟล์สลิป
function handleSlipSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('ไฟล์ภาพมีขนาดใหญ่เกิน 5MB กรุณาเลือกไฟล์อื่นครับ');
    return;
  }

  selectedSlipFile = file;
  const previewBox = document.getElementById('slipUploadBox');
  if (previewBox) {
    previewBox.innerHTML = `
      <div style="text-align:center;">
        <i data-lucide="check-circle" style="color:var(--success); width:32px; height:32px;"></i>
        <p style="margin-top:8px; font-weight:600; font-size:0.85rem;">แนบไฟล์สลิปเรียบร้อยแล้ว</p>
        <span style="font-size:0.75rem; color:var(--text-tertiary);">${file.name}</span>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
}
function resetSlipUploadUI() {
    selectedSlipFile = null;
    const slipInput = document.getElementById('slipUpload');
    if (slipInput) slipInput.value = '';

    const uploadArea = document.getElementById('slipUploadBox');
    if (uploadArea) {
        uploadArea.innerHTML = `
            <i data-lucide="upload-cloud" width="28" height="28"></i>
            <p>Click to upload bank transfer slip</p>
            <p style="font-size:0.72rem; color:var(--text-tertiary); margin-top:4px">PNG, JPG up to 5MB</p>
        `;
        if (window.lucide) lucide.createIcons();
    }
    
    // 💡 เพิ่มการล้างข้อมูล ชื่อ-นามสกุล และ เบอร์โทรศัพท์
    const customerNameInput = document.getElementById('bookingCustomerName');
    const customerPhoneInput = document.getElementById('bookingCustomerPhone');
    if(customerNameInput) customerNameInput.value = '';
    if(customerPhoneInput) customerPhoneInput.value = '';
}

// ---------- USER DASHBOARD, GROUPED BILLS & TICKET POPUP ----------

let groupedBookingsCache = {};

// ฟังก์ชันรวมสล็อตที่จองพร้อมกัน (บิลเดียวกัน) พร้อมคำนวณสถานะแยกรายชั่วโมง
function groupBookingsIntoBills(rawBookings) {
  const groups = {};
  (rawBookings || []).forEach(b => {
    const timeKey = b.created_at ? b.created_at.slice(0, 19) : '';
    const key = (b.slip_url && b.slip_url !== 'walk-in')
      ? `slip_${b.slip_url}_${b.facility_id}_${b.date}`
      : `group_${b.user_id}_${b.facility_id}_${b.date}_${b.customer_name || ''}_${b.customer_phone || ''}_${timeKey}`;

    if (!groups[key]) {
      groups[key] = {
        groupId: b.id,
        bookingIds: [],
        facility_id: b.facility_id,
        user_id: b.user_id,
        date: b.date,
        slots: [],
        total_price: 0,
        payment_status: b.payment_status,
        slip_url: b.slip_url,
        customer_name: b.customer_name || '-',
        customer_phone: b.customer_phone || '-',
        created_at: b.created_at
      };
    }
    groups[key].bookingIds.push(b.id);
    groups[key].slots.push({
      id: b.id,
      start: (b.start_time || '').slice(0, 5),
      end: (b.end_time || '').slice(0, 5),
      status: (b.payment_status || 'pending').toLowerCase() // 💡 เก็บสถานะแยกของแต่ละช่วงเวลา
    });
    groups[key].total_price += Number(b.total_price || 0);
  });

  return Object.values(groups).map(g => {
    g.slots.sort((a, b) => a.start.localeCompare(b.start));

    // 💡 คำนวณความคืบหน้าการเช็คอินในบิล
    const completedCount = g.slots.filter(s => s.status === 'completed').length;
    const approvedCount = g.slots.filter(s => s.status === 'approved').length;
    const pendingCount = g.slots.filter(s => s.status === 'pending').length;
    const rejectedCount = g.slots.filter(s => s.status === 'rejected').length;

    g.completedCount = completedCount;
    g.totalSlots = g.slots.length;
    g.isAllCompleted = (completedCount === g.slots.length && g.slots.length > 0);
    g.isPartiallyCheckedIn = (completedCount > 0 && completedCount < g.slots.length);

    // กำหนดสถานะภาพรวมของบิล
    if (g.isAllCompleted) {
      g.payment_status = 'completed';
    } else if (rejectedCount === g.slots.length) {
      g.payment_status = 'rejected';
    } else if (pendingCount > 0) {
      g.payment_status = 'pending';
    } else if (approvedCount > 0 || completedCount > 0) {
      g.payment_status = 'approved'; // ถ้ายังเช็คอินไม่ครบทุกสล็อต ให้บิลยังถือเป็น approved อยู่
    }

    groupedBookingsCache[g.groupId] = g;
    return g;
  });
}

// 1. หน้า My Bookings ของลูกค้า (บิลจะยังอยู่หน้านี้จนกว่าจะเช็คอินครบทุกช่วงเวลา!)
async function renderMyBookings() {
  const list = document.getElementById('myBookingsList');
  if (!list) return;

  const qrSection = document.getElementById('qrSection');
  if (qrSection) qrSection.style.display = 'none';

  let userId = currentUser?.id || currentUser?.user_id;
  if (!userId) {
    list.innerHTML = '<p style="color:var(--text-tertiary);">กรุณาเข้าสู่ระบบ</p>';
    return;
  }

  // 💡 ดึงทั้ง pending, approved และ completed มาเข้ากลุ่มก่อน เพื่อให้เห็นสล็อตที่เช็คอินไปแล้วในบิลเดียวกัน
  const { data: bookings, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .in('payment_status', ['pending', 'PENDING', 'approved', 'APPROVED', 'completed', 'COMPLETED'])
    .order('created_at', { ascending: false });

  if (error || !bookings || bookings.length === 0) {
    list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">ไม่มีรายการจองที่กำลังจะมาถึง</p>';
    return;
  }

  // กรองเอาเฉพาะบิลที่ "ยังเช็คอินไม่ครบทุกสล็อต" มาแสดงในหน้า My Bookings
  const allBills = groupBookingsIntoBills(bookings);
  // 💡 กรองรายการที่แอดมินจองให้ลูกค้า (walkin_) ออก ไม่ให้แสดงในหน้า My Bookings
  const activeBills = allBills.filter(b => 
    !b.isAllCompleted && 
    b.payment_status !== 'rejected' && 
    !String(b.slip_url || '').startsWith('walkin_')
  );

  if (activeBills.length === 0) {
    list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">ไม่มีรายการจองที่กำลังจะมาถึง</p>';
    return;
  }

  list.innerHTML = activeBills.map(bill => {
    const facility = (typeof FACILITIES !== 'undefined' ? FACILITIES.find(f => f.id === bill.facility_id) : null) || { name: 'สนามกีฬา' };
    const statusLower = (bill.payment_status || 'pending').toLowerCase();

    // แสดงป้ายสล็อตแยกสีตามสถานะของแต่ละช่วงเวลา
    const slotBadges = bill.slots.map(s => {
      if (s.status === 'completed') {
        return `<span style="display:inline-block; background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid #93c5fd; margin-right:6px; margin-top:4px;">✓ ${s.start} - ${s.end} (ใช้แล้ว)</span>`;
      } else if (s.status === 'approved') {
        return `<span style="display:inline-block; background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid #86efac; margin-right:6px; margin-top:4px;">⏰ ${s.start} - ${s.end} (รอเช็คอิน)</span>`;
      } else {
        return `<span style="display:inline-block; background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid #fde047; margin-right:6px; margin-top:4px;">⏳ ${s.start} - ${s.end} (รออนุมัติ)</span>`;
      }
    }).join('');

    const progressBadge = bill.isPartiallyCheckedIn
      ? `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 10px; border-radius:20px; font-size:0.74rem; font-weight:700;">เช็คอินแล้ว ${bill.completedCount}/${bill.totalSlots} ช่วงเวลา</span>`
      : `<span class="status-badge ${statusLower}">${statusLower.toUpperCase()}</span>`;

    return `
      <div class="booking-card" onclick="openBookingTicketModal('${bill.groupId}', false)" style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <h4 style="margin:0; font-size:1.05rem;">${facility.name}</h4>
            <span style="font-size:0.78rem; color:var(--primary); font-weight:600;">(${bill.slots.length} ชั่วโมง · ฿${bill.total_price.toLocaleString()})</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 6px 0;">
            📅 วันที่: <strong>${bill.date}</strong> | 👤 ผู้จอง: ${bill.customer_name} (${bill.customer_phone})
          </p>
          <div>${slotBadges}</div>
          <div style="margin-top:10px; font-size:0.8rem; color:var(--primary); font-weight:600;">
            🎫 คลิกเพื่อเปิดตั๋วยืนยันการจอง (ดูสถานะรายชั่วโมง) →
          </div>
        </div>
        <div>${progressBadge}</div>
      </div>
    `;
  }).join('');
}

// 💡 ฟังก์ชันเปิดดูรูปสลิปแบบป๊อปอัปซ้อนบนหน้าเดิม (มีปุ่มกากบาท X กดปิดได้ทันที)
function previewSlipModal(slipUrl) {
  if (!slipUrl || slipUrl === 'walk-in' || slipUrl === '#') {
    alert('ไม่พบรูปสลิปสำหรับรายการนี้');
    return;
  }

  let viewer = document.getElementById('slipImageViewerOverlay');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'slipImageViewerOverlay';
    viewer.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:30000; display:flex; align-items:center; justify-content:center; padding:20px;';
    document.body.appendChild(viewer);
  }

  viewer.innerHTML =
    '<div style="position:relative; background:#fff; padding:16px; border-radius:14px; max-width:420px; width:100%; max-height:90vh; display:flex; flex-direction:column; align-items:center; box-shadow:0 12px 32px rgba(0,0,0,0.4);">' +
      '<button type="button" onclick="closeSlipModal()" style="position:absolute; top:-12px; right:-12px; width:34px; height:34px; border-radius:50%; background:#ef4444; color:#fff; border:2px solid #fff; font-size:18px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.3);">✕</button>' +
      '<h4 style="margin:0 0 12px 0; font-size:0.95rem; color:#1e293b;">หลักฐานการโอนเงิน (Payment Slip)</h4>' +
      '<div style="width:100%; max-height:72vh; overflow-y:auto; text-align:center; background:#f8fafc; border-radius:8px; padding:8px; border:1px solid #e2e8f0;">' +
        '<img src="' + slipUrl + '" alt="Payment Slip" style="max-width:100%; height:auto; border-radius:6px; display:block; margin:0 auto;" />' +
      '</div>' +
    '</div>';

  viewer.style.display = 'flex';
}

function closeSlipModal() {
  const viewer = document.getElementById('slipImageViewerOverlay');
  if (viewer) viewer.style.display = 'none';
}

// 2. ฟังก์ชันเปิดป๊อปอัปตั๋วยืนยันการจอง (แสดงสถานะแยกแต่ละช่วงเวลา + ปุ่มเปิดดูรูปสลิปแบบป๊อปอัป)
function openBookingTicketModal(groupId, isAdminView = false) {
  const bill = groupedBookingsCache[groupId];
  if (!bill) return;

  const facility = (typeof FACILITIES !== 'undefined' ? FACILITIES.find(f => f.id === bill.facility_id) : null) || { name: 'สนามกีฬา' };
  const statusLower = (bill.payment_status || 'pending').toLowerCase();
  const canManage = (currentRole === 'admin' || currentRole === 'staff' || isAdminView);

  const badge = document.getElementById('ticketStatusBadge');
  if (badge) {
    badge.textContent = bill.isPartiallyCheckedIn
      ? `CHECKED-IN ${bill.completedCount}/${bill.totalSlots}`
      : statusLower.toUpperCase();
  }

  const slotsListHtml = bill.slots.map((s, idx) => {
    let slotStatusHtml = '';
    if (s.status === 'completed') {
      slotStatusHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">✓ เข้าใช้งานแล้ว</span>`;
    } else if (s.status === 'approved') {
      if (canManage) {
        slotStatusHtml =
          '<div style="display:flex; align-items:center; gap:6px;">' +
            '<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:600;">รอเช็คอิน</span>' +
            '<button class="btn" style="background:#22c55e; color:white; padding:3px 8px; font-size:0.72rem; border-radius:6px;" onclick="checkInSingleSlot(\'' + s.id + '\', \'' + bill.groupId + '\')">✅ เช็คอินช่วงนี้</button>' +
          '</div>';
      } else {
        slotStatusHtml = `<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">⏳ รอเช็คอิน</span>`;
      }
    } else {
      slotStatusHtml = `<span style="background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">รออนุมัติสลิป</span>`;
    }

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; font-size:0.85rem;">
        <div>
          <span style="color:var(--text-secondary); font-size:0.78rem;">ช่วงที่ ${idx + 1}:</span>
          <strong style="color:var(--text); margin-left:4px;">${s.start} - ${s.end} น.</strong>
        </div>
        ${slotStatusHtml}
      </div>
    `;
  }).join('');

  const body = document.getElementById('bookingTicketBody');
  if (body) {
    body.innerHTML = `
      <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px dashed #cbd5e1;">
        <div style="font-size:0.78rem; color:var(--text-tertiary);">รหัสอ้างอิงบิล (Booking Ref)</div>
        <div style="font-size:0.9rem; font-weight:700; word-break:break-all;">#${bill.groupId}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">สนามกีฬา (Facility)</div>
          <div style="font-size:0.95rem; font-weight:700;">${facility.name}</div>
        </div>
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">วันที่เข้าใช้งาน (Date)</div>
          <div style="font-size:0.95rem; font-weight:700;">${bill.date}</div>
        </div>
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">ชื่อผู้จอง (Customer)</div>
          <div style="font-size:0.92rem; font-weight:600;">${bill.customer_name}</div>
        </div>
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">เบอร์โทรศัพท์ (Phone)</div>
          <div style="font-size:0.92rem; font-weight:600;">${bill.customer_phone}</div>
        </div>
      </div>

      <div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.82rem; font-weight:600; color:#334155;">สถานะแต่ละช่วงเวลา (${bill.slots.length} ชั่วโมง)</span>
          <span style="font-size:0.76rem; color:#2563eb; font-weight:600;">ใช้แล้ว ${bill.completedCount}/${bill.totalSlots}</span>
        </div>
        ${slotsListHtml}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:2px solid #f1f5f9;">
        <span style="font-size:0.95rem; font-weight:600;">ยอดชำระรวมทั้งสิ้น</span>
        <span style="font-size:1.35rem; font-weight:800; color:var(--primary);">฿${bill.total_price.toLocaleString()}</span>
      </div>
    `;

    // 💡 ปุ่มเปิดดูรูปสลิปโอนเงินในป๊อปอัปหน้าเดิม
    if (bill.slip_url && bill.slip_url !== 'walk-in') {
      const safeSlipUrl = String(bill.slip_url).trim();
      body.innerHTML +=
        '<div style="margin-top:14px; text-align:right;">' +
          '<button type="button" class="btn" style="background:#fef2f2; color:var(--primary); border:1px solid #fecaca; padding:6px 12px; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer;" onclick="previewSlipModal(\'' + safeSlipUrl + '\')">' +
            '🖼️ เปิดดูรูปสลิปโอนเงิน' +
          '</button>' +
        '</div>';
    }
  }

  const footer = document.getElementById('bookingTicketFooter');
  if (footer) {
    const remainingSlots = bill.slots.filter(s => s.status === 'approved').length;
    let adminActions = '';
    if (canManage && remainingSlots > 0) {
      adminActions =
        '<button class="btn" style="flex:1.5; background:#2563eb; color:white;" onclick="confirmGroupCheckIn(\'' + bill.groupId + '\')">' +
          '✅ เช็คอินรวบทั้งบิล (' + remainingSlots + ' ชม. ที่เหลือ)' +
        '</button>';
    }
    footer.innerHTML = `
      <button class="btn btn-secondary" style="flex:1;" onclick="closeModal('bookingTicketModal')">ปิดหน้าต่าง</button>
      ${adminActions}
    `;
  }

  document.getElementById('bookingTicketModal').classList.add('active');
}

// 3. หน้า History (แสดงเฉพาะบิลที่เช็คอินครบทุกช่วงเวลาในบิลนั้นเรียบร้อยแล้วเท่านั้น!)
async function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;

  list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">กำลังโหลดประวัติ...</p>';

  let userId = currentUser?.id || currentUser?.user_id;
  if (!userId) {
    list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">กรุณาเข้าสู่ระบบ</p>';
    return;
  }

  // ดึงรายการทั้งหมดของลูกค้ามาจัดกลุ่ม เพื่อเช็คว่าบิลไหนเช็คอินครบทุกสล็อตแล้วบ้าง
  const { data: userBookings, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !userBookings || userBookings.length === 0) {
    list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">ยังไม่มีประวัติการเข้าใช้งานสนาม</p>';
    return;
  }

  const allBills = groupBookingsIntoBills(userBookings);
  // 💡 กรองรายการที่แอดมินจองให้ลูกค้า (walkin_) ออก ไม่ให้ปนในหน้า History ของผู้ใช้งาน
  const completedBills = allBills.filter(b => 
    b.isAllCompleted && 
    !String(b.slip_url || '').startsWith('walkin_')
  );

  if (completedBills.length === 0) {
    list.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:32px;">ยังไม่มีประวัติการเข้าใช้งานสนาม</p>';
    return;
  }

  list.innerHTML = completedBills.map(bill => {
    const facility = (typeof FACILITIES !== 'undefined' ? FACILITIES.find(f => f.id === bill.facility_id) : null) || { name: 'สนามกีฬา' };
    const slotBadges = bill.slots.map(s =>
      `<span style="display:inline-block; background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; margin-right:6px; margin-top:4px;">✓ ${s.start} - ${s.end}</span>`
    ).join('');

    return `
      <div class="booking-card" onclick="openBookingTicketModal('${bill.groupId}', false)" style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <div>
          <h4 style="margin:0 0 4px 0;">${facility.name} <span style="font-size:0.8rem; color:var(--text-secondary);">(${bill.slots.length} ชั่วโมง · ฿${bill.total_price.toLocaleString()})</span></h4>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 4px 0;">
            📅 ${bill.date || '-'} | 👤 ${bill.customer_name} (${bill.customer_phone})
          </p>
          <div>${slotBadges}</div>
        </div>
        <span class="status-badge completed" style="background:#dcfce7; color:#15803d; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600;">
          COMPLETED
        </span>
      </div>
    `;
  }).join('');
}

// ============ ADMIN DASHBOARD & PAYMENTS (GROUPED BILLS) ============

function renderFacilitiesTable() {
  const tbody = document.getElementById('facilitiesTable');
  if (!tbody) return;
  tbody.innerHTML = FACILITIES.map(f => `
    <tr>
      <td><strong>${f.name}</strong></td>
      <td>${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</td>
      <td>฿${f.price}</td>
      <td><span class="status-badge ${f.status === 'available' ? 'approved' : 'pending'}">${f.status}</span></td>
      <td>
        <div class="table-actions">
          <button class="approve-btn" onclick="openEditFacilityModal('${f.id}')">Edit</button>
          <button class="reject-btn" onclick="deleteFacility('${f.id}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');
}

let currentPaymentFilter = 'pending';

function filterPayments(status) {
  currentPaymentFilter = status;
  // อัปเดตสีปุ่มแท็บ
  ['pending', 'approved', 'rejected'].forEach(s => {
    const btn = document.getElementById(`tab-${s}`);
    if (btn) {
      if (s === status) {
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        btn.style.border = 'none';
      } else {
        btn.style.background = 'var(--bg-surface)';
        btn.style.color = 'var(--text)';
        btn.style.border = '1px solid var(--border)';
      }
    }
  });

  // แสดง/ซ่อน เมนูตัวกรองย่อยสำหรับแท็บ "อนุมัติเรียบร้อย"
  const subFilterWrapper = document.getElementById('approvedSubFilter');
  if (subFilterWrapper) {
    subFilterWrapper.style.display = (status === 'approved') ? 'flex' : 'none';
    if (status !== 'approved') {
       const sub = document.getElementById('paymentSubFilterStatus');
       if (sub) sub.value = 'all'; // รีเซ็ตตัวกรองย่อยเมื่อเปลี่ยนแท็บ
    }
  }

  renderPaymentsTable();
}

// ตารางตรวจสอบสลิปและอนุมัติของแอดมิน (อัปเกรดระบบตัวกรองย่อย + รองรับตัวพิมพ์ใหญ่)
async function renderPaymentsTable() {
  const tbody = document.getElementById('paymentsTable');
  if (!tbody) return;

  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const myFacilities = getMyManagedFacilities();
  const myFacilityIds = myFacilities.map(f => String(f.id));

  const facSelect = document.getElementById('paymentFilterFacility');
  if (facSelect) {
    const prevVal = facSelect.value || 'all';
    facSelect.innerHTML = '<option value="all">🏟️ แสดงทุกสนามในความดูแล</option>' +
      myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    if (prevVal === 'all' || myFacilityIds.includes(String(prevVal))) {
      facSelect.value = prevVal;
    } else {
      facSelect.value = 'all';
    }
  }
  const selectedFacId = facSelect ? facSelect.value : 'all';

  // อ่านค่าตัวกรองย่อย (เฉพาะเวลาอยู่แท็บ Approved)
  const subFilterStatus = document.getElementById('paymentSubFilterStatus') 
                          ? document.getElementById('paymentSubFilterStatus').value 
                          : 'all';

  if (myFacilityIds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-tertiary);">คุณยังไม่มีสนามกีฬาในความดูแล</td></tr>`;
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px;">กำลังโหลดรายการ...</td></tr>';

  // 💡 กวาดสถานะทั้งตัวพิมพ์เล็ก, ตัวพิมพ์ใหญ่ และตัวพิมพ์ใหญ่เฉพาะอักษรแรก (Capitalized)
  let dbStatusFilter = [
    currentPaymentFilter, 
    currentPaymentFilter.toUpperCase(),
    currentPaymentFilter.charAt(0).toUpperCase() + currentPaymentFilter.slice(1)
  ];

  if (currentPaymentFilter === 'approved') {
    dbStatusFilter = [
      'approved', 'APPROVED', 'Approved', 
      'completed', 'COMPLETED', 'Completed'
    ];
  }

  const { data: allBookings, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .in('facility_id', myFacilityIds)
    .in('payment_status', dbStatusFilter)
    .order('created_at', { ascending: false });

  if (error || !allBookings || allBookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่มีรายการในหมวดหมู่นี้</td></tr>`;
    return;
  }

  const allBills = groupBookingsIntoBills(allBookings);
  
  // 💡 กรองบิลตามเงื่อนไข แท็บหลัก + ตัวกรองสนาม + ตัวกรองย่อย
  const bills = allBills.filter(b => {
    const matchFacility = (selectedFacId === 'all') || (String(b.facility_id) === String(selectedFacId));
    if (!matchFacility) return false;

    const bStatus = String(b.payment_status).toLowerCase();

    // ถ้าอยู่แท็บ Approved ให้เช็ค Sub-filter
    if (currentPaymentFilter === 'approved') {
       // ต้องเป็นบิลที่อยู่ในสถานะ approved หรือ completed เท่านั้น
       if (bStatus !== 'approved' && bStatus !== 'completed') return false;

       // เช็คเงื่อนไขตัวกรองย่อย
       if (subFilterStatus === 'completed') {
          // ถ้ากรองเฉพาะ "เข้าใช้งานแล้ว" (completed) แต่บิลนี้ยังเช็คอินไม่ครบทุกสล็อต ให้ซ่อน
          return b.isAllCompleted;
       }
       if (subFilterStatus === 'waiting_checkin') {
          // ถ้ากรองเฉพาะ "รอเช็คอิน" (waiting_checkin) แต่บิลนี้เช็คอินครบไปแล้ว ให้ซ่อน
          return !b.isAllCompleted;
       }
       return true; // กรณีเลือก "แสดงทั้งหมด" (all)
    }
    
    // สำหรับแท็บ Pending / Rejected
    return bStatus === currentPaymentFilter; 
  });

  if (bills.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่มีรายการสำหรับเงื่อนไขที่เลือก</td></tr>`;
    return;
  }

  tbody.innerHTML = bills.map(bill => {
    const facility = FACILITIES.find(f => f.id === bill.facility_id) || { name: 'สนามกีฬา' };
    const statusLower = (bill.payment_status || '').toLowerCase();

    const slotListHtml = bill.slots.map(s => {
      const isDone = s.status === 'completed';
      return `<span style="display:inline-block; background:${isDone ? '#dbeafe' : '#f1f5f9'}; color:${isDone ? '#1d4ed8' : '#334155'}; padding:2px 6px; border-radius:4px; font-size:0.74rem; font-weight:600; margin:2px 4px 2px 0;">${isDone ? '✓ ' : ''}${s.start}-${s.end}</span>`;
    }).join('');

    let actionButtons =
      '<button onclick="openBookingTicketModal(\'' + bill.groupId + '\', true)" class="btn" style="background:#e2e8f0; color:#1e293b; padding:5px 10px; border-radius:4px; font-size:0.76rem;">ดูบิล / เช็คอินแยกช่วง</button>';

    if (statusLower === 'pending') {
      actionButtons +=
        '<button onclick="processGroupBookingStatus(\'' + bill.groupId + '\', \'approved\')" class="btn" style="background:#22c55e; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">อนุมัติสลิป</button>' +
        '<button onclick="processGroupBookingStatus(\'' + bill.groupId + '\', \'rejected\')" class="btn" style="background:#ef4444; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">ปฏิเสธ</button>';
    } else if (statusLower === 'approved') {
      const remaining = bill.slots.filter(s => s.status === 'approved').length;
      if (remaining > 0) {
        actionButtons +=
          '<button onclick="confirmGroupCheckIn(\'' + bill.groupId + '\')" class="btn" style="background:#2563eb; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">✅ เช็คอินเข้าสนาม (' + remaining + ' ชม.)</button>';
      }
    }

    let statusBadgeHtml = '';
    if (statusLower === 'completed') {
       statusBadgeHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">เข้าใช้งานแล้ว</span>`;
    } else if (bill.isPartiallyCheckedIn) {
       statusBadgeHtml = `<span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">ใช้แล้ว ${bill.completedCount}/${bill.totalSlots}</span>`;
    } else if (statusLower === 'approved') {
       statusBadgeHtml = `<span class="status-badge approved">รอเช็คอิน</span>`;
    } else {
       statusBadgeHtml = `<span class="status-badge ${statusLower}">${getThaiStatusText(statusLower)}</span>`;
    }

    const slipCellHtml = (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_'))
      ? `<button type="button" onclick="previewSlipModal('${String(bill.slip_url).trim()}')" style="background:none; border:none; color:var(--primary); text-decoration:underline; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.85rem;">🖼️ ดูสลิป</button>`
      : '<span style="color:var(--text-tertiary); font-size:0.78rem;">จองผ่านแอดมิน</span>';

    return `
      <tr>
        <td>
          <strong style="cursor:pointer; color:var(--primary);" onclick="openBookingTicketModal('${bill.groupId}', true)">#${String(bill.groupId).slice(0, 8)}</strong>
          <div style="font-size:0.72rem; color:var(--text-tertiary);">${bill.slots.length} ช่วงเวลา</div>
        </td>
        <td>
          <strong>${bill.customer_name}</strong>
          <div style="font-size:0.78rem; color:var(--text-secondary);">📞 ${bill.customer_phone}</div>
        </td>
        <td>
          <strong>${facility.name}</strong>
          <div style="font-size:0.78rem; color:var(--text-secondary);">📅 ${bill.date}</div>
          <div style="margin-top:2px;">${slotListHtml}</div>
        </td>
        <td><strong style="color:var(--primary);">฿${bill.total_price.toLocaleString()}</strong></td>
        <td>${slipCellHtml}</td>
        <td>${statusBadgeHtml}</td>
        <td><div style="display:flex; gap:6px; flex-wrap:wrap;">${actionButtons}</div></td>
      </tr>
    `;
  }).join('');
}

// อนุมัติหรือปฏิเสธครั้งเดียว อัปเดตครบทุกช่วงเวลาในบิลนั้นทันที
async function processGroupBookingStatus(groupId, status) {
  const bill = groupedBookingsCache[groupId];
  if (!bill) return;

  const actionText = status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ';
  if (!confirm(`ยืนยันที่จะ "${actionText}" การจองของ ${bill.customer_name} (รวม ${bill.slots.length} ชั่วโมง ยอด ฿${bill.total_price.toLocaleString()}) ใช่หรือไม่?`)) return;

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ payment_status: status })
      .in('id', bill.bookingIds);

    if (error) throw error;

    // 💡 อัปเดตสถานะและเวลาตรวจสอบในตารางหลักฐาน payments ด้วย
    await supabaseClient
      .from('payments')
      .update({ 
        status: status,
        verified_at: new Date().toISOString()
      })
      .in('booking_id', bill.bookingIds);

    alert(`ทำรายการ ${actionText} สำเร็จเรียบร้อยแล้ว!`);
    renderPaymentsTable();
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + err.message);
  }
}

// 💡 ฟังก์ชันเช็คอินทีละ 1 ช่วงเวลา (เช็คอินเฉพาะชั่วโมงที่เลือก)
async function checkInSingleSlot(bookingId, groupId = null) {
  const cleanId = String(bookingId).trim();
  if (!confirm('ยืนยันการเช็คอินเข้าสนามเฉพาะช่วงเวลานี้ใช่หรือไม่?')) return;

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ payment_status: 'completed' })
      .eq('id', cleanId);

    if (error) throw error;

    // ตรวจสอบว่าในบิลนี้เช็คอินครบทุกช่วงเวลาหรือยัง
    const group = groupId
      ? groupedBookingsCache[groupId]
      : Object.values(groupedBookingsCache).find(g => g.bookingIds.map(String).includes(cleanId));

    if (group) {
      const remaining = group.slots.filter(s => String(s.id) !== cleanId && s.status !== 'completed').length;
      if (remaining > 0) {
        alert(`✅ เช็คอินช่วงเวลานี้สำเร็จ! (ในบิลนี้ยังเหลืออีก ${remaining} ช่วงเวลาที่รอเช็คอิน)`);
      } else {
        alert('🎉 เช็คอินครบทุกช่วงเวลาในบิลนี้แล้ว! ระบบย้ายบิลเข้าสู่ History เรียบร้อยครับ');
        closeModal('bookingTicketModal');
      }
    } else {
      alert('✅ เช็คอินช่วงเวลานี้เรียบร้อยแล้ว!');
    }

    if (currentView === 'slots') await loadSlotManagementData();
    if (currentView === 'payments') await renderPaymentsTable();
    if (currentView === 'my-bookings') await renderMyBookings();

    // ถ้าเปิดป๊อปอัปตั๋วค้างไว้และยังเช็คอินไม่ครบ ให้รีเฟรชเนื้อหาในป๊อปอัปอัตโนมัติ
    if (group && document.getElementById('bookingTicketModal')?.classList.contains('active')) {
      const { data: refreshed } = await supabaseClient.from('bookings').select('*').in('id', group.bookingIds);
      if (refreshed) {
        const updatedBills = groupBookingsIntoBills(refreshed);
        if (updatedBills[0] && !updatedBills[0].isAllCompleted) {
          openBookingTicketModal(updatedBills[0].groupId, true);
        } else {
          closeModal('bookingTicketModal');
        }
      }
    }
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดในการเช็คอิน: ' + err.message);
  }
}

// 💡 ฟังก์ชันเช็คอินรวบทั้งบิล (เช็คอินทุกช่วงเวลาที่เหลือในบิลนั้นพร้อมกัน)
async function confirmGroupCheckIn(groupId) {
  const bill = groupedBookingsCache[groupId];
  if (!bill) return;

  const remainingSlots = bill.slots.filter(s => s.status !== 'completed');
  if (!confirm(`ยืนยันการเช็คอินรวบทั้งบิลของ "${bill.customer_name}" (จำนวน ${remainingSlots.length} ชั่วโมง) ใช่หรือไม่?\n\nเมื่อเช็คอินครบแล้ว บิลนี้จะย้ายไปอยู่ในหน้า History ทันที`)) return;

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ payment_status: 'completed' })
      .in('id', bill.bookingIds);

    if (error) throw error;

    alert('✅ เช็คอินครบทุกช่วงเวลาสำเร็จ! ย้ายบิลเข้าสู่ประวัติการใช้งาน (History) เรียบร้อยแล้ว');
    closeModal('bookingTicketModal');

    if (currentView === 'payments') renderPaymentsTable();
    if (currentView === 'slots') loadSlotManagementData();
    if (currentView === 'my-bookings') renderMyBookings();
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดในการเช็คอิน: ' + err.message);
  }
}

// ============ SLOT MANAGEMENT, WALK-IN BOOKING & TIME BLOCKING ============

async function initSlotManagement() {
  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const facSelect = document.getElementById('slotManageFacility');
  if (facSelect && FACILITIES.length > 0) {
    const currentVal = facSelect.value;
    facSelect.innerHTML = FACILITIES.map(f => `<option value="${f.id}">${f.name} (฿${f.price}/ชม.)</option>`).join('');
    if (currentVal && FACILITIES.some(f => f.id === currentVal)) {
      facSelect.value = currentVal;
    }
  }

  const dateInput = document.getElementById('slotManageDate');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const startSelectors = ['walkinStartTime', 'blockStartTime'];
  const endSelectors = ['walkinEndTime', 'blockEndTime'];

  startSelectors.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length === 0) {
      let opts = '';
      for (let h = 6; h <= 21; h++) {
        const t = `${h.toString().padStart(2, '0')}:00`;
        opts += `<option value="${t}">${t}</option>`;
      }
      el.innerHTML = opts;
    }
  });

  endSelectors.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length === 0) {
      let opts = '';
      for (let h = 7; h <= 22; h++) {
        const t = `${h.toString().padStart(2, '0')}:00`;
        opts += `<option value="${t}">${t}</option>`;
      }
      el.innerHTML = opts;
    }
  });

  await loadSlotManagementData();
}

// โหลดตารางเวลาประจำวัน (มีปุ่มให้เลือกทั้ง "เช็คอินเฉพาะชม.นี้" และ "เช็คอินรวบทั้งบิล")
async function loadSlotManagementData() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const container = document.getElementById('adminDailyScheduleList');
  if (!container || !facilityId || !dateStr) return;

  container.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:20px;">กำลังโหลดตารางเวลา...</p>';

  const { data: bookingsData } = await supabaseClient
    .from('bookings')
    .select('*')
    .eq('facility_id', facilityId)
    .eq('date', dateStr)
    .neq('payment_status', 'rejected');

  const { data: blocksData } = await supabaseClient
    .from('time_blocks')
    .select('*')
    .eq('facility_id', facilityId)
    .eq('date', dateStr);

  const bookings = bookingsData || [];
  const blocks = blocksData || [];

  groupBookingsIntoBills(bookings);

  let html = '';
  for (let h = 6; h <= 21; h++) {
    const slotStart = `${h.toString().padStart(2, '0')}:00`;
    const slotEnd = `${(h + 1).toString().padStart(2, '0')}:00`;

    const matchedBooking = bookings.find(b => {
      const s = parseInt(b.start_time);
      const e = parseInt(b.end_time);
      return h >= s && h < e;
    });

    const matchedBlock = blocks.find(bl => {
      const s = parseInt(bl.blocked_start);
      const e = parseInt(bl.blocked_end);
      return h >= s && h < e;
    });

    if (matchedBooking) {
      const bookingId = String(matchedBooking.id);
      const statusLower = (matchedBooking.payment_status || 'pending').toLowerCase();
      const parentGroup = Object.values(groupedBookingsCache).find(g => g.bookingIds.map(String).includes(bookingId));
      const remainingInBill = parentGroup ? parentGroup.slots.filter(s => s.status === 'approved').length : 1;

      let badgeColor = '#eab308';
      let bgRow = '#fefce8';
      if (statusLower === 'approved') { badgeColor = '#16a34a'; bgRow = '#f0fdf4'; }
      if (statusLower === 'completed') { badgeColor = '#2563eb'; bgRow = '#eff6ff'; }

      let actionBtnHtml = '';
      if (statusLower === 'approved') {
        // ปุ่มเช็คอินเฉพาะชั่วโมงนี้
        actionBtnHtml += '<button class="btn" style="background:#22c55e; color:white; padding:5px 10px; font-size:0.74rem;" onclick="checkInSingleSlot(\'' + bookingId + '\')">✅ เช็คอินชม.นี้</button>';
        // ถ้าในบิลเดียวกันมีมากกว่า 1 ชั่วโมงที่รอเช็คอิน ให้มีปุ่ม "เช็คอินทั้งบิล" เพิ่มขึ้นมาด้วย!
        if (parentGroup && remainingInBill > 1) {
          actionBtnHtml += '<button class="btn" style="background:#2563eb; color:white; padding:5px 10px; font-size:0.74rem;" onclick="confirmGroupCheckIn(\'' + parentGroup.groupId + '\')">✅ เช็คอินทั้งบิล (' + remainingInBill + ' ชม.)</button>';
        }
      } else if (statusLower === 'pending') {
        actionBtnHtml += '<button class="btn" style="background:#eab308; color:white; padding:5px 10px; font-size:0.74rem;" onclick="switchView(\'payments\')">ไปหน้าอนุมัติสลิป</button>';
      }

      if (statusLower !== 'completed') {
        actionBtnHtml += '<button class="btn" style="background:#ef4444; color:white; padding:5px 10px; font-size:0.74rem;" onclick="cancelSlotBooking(\'' + bookingId + '\')">ยกเลิกคิว</button>';
      } else {
        actionBtnHtml += '<span style="font-size:0.78rem; color:#2563eb; font-weight:700;">✓ เช็คอินเข้าสนามแล้ว</span>';
      }

      const groupHint = (parentGroup && parentGroup.totalSlots > 1)
        ? `<span style="font-size:0.72rem; color:#475569; background:#e2e8f0; padding:1px 6px; border-radius:4px; margin-left:6px;">บิลรวม ${parentGroup.completedCount}/${parentGroup.totalSlots} ชม.</span>`
        : '';

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:${bgRow}; border:1px solid #cbd5e1; border-radius:8px; flex-wrap:wrap; gap:8px;">
          <div>
            <strong style="font-size:0.9rem;">⏰ ${slotStart} - ${slotEnd}</strong>
            <span style="margin-left:8px; font-size:0.72rem; font-weight:700; color:white; background:${badgeColor}; padding:2px 8px; border-radius:12px;">${statusLower.toUpperCase()}</span>
            ${groupHint}
            <div style="font-size:0.82rem; color:#334155; margin-top:3px;">
              👤 <strong>${matchedBooking.customer_name || 'ลูกค้าทั่วไป'}</strong> | 📞 ${matchedBooking.customer_phone || '-'}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${actionBtnHtml}
          </div>
        </div>
      `;
    } else if (matchedBlock) {
      const blockId = String(matchedBlock.id);
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">
          <div>
            <strong style="font-size:0.9rem; color:#c2410c;">🔒 ${slotStart} - ${slotEnd} (ล็อกเวลา)</strong>
            <div style="font-size:0.8rem; color:#9a3412;">สาเหตุ: ${matchedBlock.reason || 'ปิดปรับปรุง'}</div>
          </div>
          <button class="btn" style="background:#f97316; color:white; padding:5px 10px; font-size:0.75rem;" onclick="removeTimeBlock('${blockId}')">ปลดล็อก</button>
        </div>
      `;
    } else {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:var(--bg); border:1px dashed var(--border); border-radius:8px;">
          <div>
            <span style="font-size:0.88rem; font-weight:600; color:var(--text-secondary);">🟢 ${slotStart} - ${slotEnd}</span>
            <span style="font-size:0.8rem; color:var(--success); margin-left:8px;">ว่าง (Available)</span>
          </div>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="quickFillWalkinTime('${slotStart}', '${slotEnd}')">เลือกเวลานี้</button>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

// ฟังก์ชันสำรองกรณีถูกเรียกจากจุดอื่น
async function checkInSingleOrGroupBooking(bookingId) {
  await checkInSingleSlot(bookingId);
}

// ยกเลิกคิวจองจากหน้าตาราง
async function cancelSlotBooking(bookingId) {
  if (!confirm('ต้องการยกเลิกคิวจองของชั่วโมงนี้ เพื่อให้สล็อตกลับมาว่างใช่หรือไม่?')) return;
  const { error } = await supabaseClient.from('bookings').update({ payment_status: 'rejected' }).eq('id', bookingId);
  if (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message);
  } else {
    loadSlotManagementData();
  }
}

// บันทึกการจองให้ลูกค้ากรณีโทรมาจอง / Walk-in
async function submitAdminWalkinBooking() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const customerName = document.getElementById('walkinCustomerName')?.value.trim();
  const customerPhone = document.getElementById('walkinCustomerPhone')?.value.trim();
  const startStr = document.getElementById('walkinStartTime')?.value;
  const endStr = document.getElementById('walkinEndTime')?.value;

  if (!customerName || !customerPhone) {
    alert('กรุณากรอกชื่อและเบอร์โทรลูกค้าให้ครบถ้วนครับ');
    return;
  }

  const startHour = parseInt(startStr);
  const endHour = parseInt(endStr);
  if (endHour <= startHour) {
    alert('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้นครับ');
    return;
  }

  const facility = FACILITIES.find(f => f.id === facilityId);
  const pricePerHour = facility?.price || 0;
  const batchMarker = `walkin_${Date.now()}`;

  const inserts = [];
  for (let h = startHour; h < endHour; h++) {
    inserts.push({
      user_id: currentUser?.id || 'admin',
      facility_id: facilityId,
      date: dateStr,
      start_time: `${h.toString().padStart(2, '0')}:00`,
      end_time: `${(h + 1).toString().padStart(2, '0')}:00`,
      total_price: pricePerHour,
      payment_status: 'approved',
      slip_url: batchMarker,
      customer_name: customerName,
      customer_phone: customerPhone
    });
  }

  try {
    const { error } = await supabaseClient.from('bookings').insert(inserts);
    if (error) throw error;

    alert(`✅ ลงคิวจองให้คุณ "${customerName}" (${startStr} - ${endStr}) เรียบร้อยแล้ว!`);
    document.getElementById('walkinCustomerName').value = '';
    document.getElementById('walkinCustomerPhone').value = '';
    await loadSlotManagementData();
  } catch (err) {
    alert('บันทึกการจองไม่สำเร็จ: ' + err.message);
  }
}

// บันทึกการล็อกเวลาสนาม (Block Time Slots) ลงตาราง time_blocks
async function submitTimeBlock() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const startStr = document.getElementById('blockStartTime')?.value;
  const endStr = document.getElementById('blockEndTime')?.value;
  const reason = document.getElementById('blockReason')?.value;

  const startHour = parseInt(startStr);
  const endHour = parseInt(endStr);
  if (endHour <= startHour) {
    alert('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้นครับ');
    return;
  }

  try {
    const { error } = await supabaseClient.from('time_blocks').insert([{
      facility_id: facilityId,
      date: dateStr,
      blocked_start: startStr,
      blocked_end: endStr,
      reason: reason
    }]);

    if (error) throw error;

    alert(`🔒 ล็อกเวลาสนามช่วง ${startStr} - ${endStr} เรียบร้อยแล้ว!`);
    await loadSlotManagementData();
  } catch (err) {
    alert('ล็อกเวลาไม่สำเร็จ: ' + err.message);
  }
}

// ปลดล็อกเวลาสนาม
async function removeTimeBlock(blockId) {
  if (!confirm('ต้องการปลดล็อกช่วงเวลานี้ เพื่อให้ลูกค้ากลับมาจองได้ตามปกติใช่หรือไม่?')) return;
  const { error } = await supabaseClient.from('time_blocks').delete().eq('id', blockId);
  if (error) {
    alert('ปลดล็อกไม่สำเร็จ: ' + error.message);
  } else {
    await loadSlotManagementData();
  }
}

// ============ STATS & CHARTS ============

// ตัวแปรสำหรับเก็บ Instance ของกราฟ ป้องกันการสร้างซ้ำ
let bookingsChartInstance = null;
let peakChartInstance = null;
let revenueChartInstance = null;

async function renderCharts() {
  // 1. ดึงข้อมูลสถิติจาก Supabase มาแสดงบนการ์ด
  const elRevenue = document.getElementById('dashTotalRevenue');
  const elTotal = document.getElementById('dashTotalBookings');
  const elPending = document.getElementById('dashPendingBookings');
  const elCompleted = document.getElementById('dashCompletedBookings');

  if (elRevenue) {
    const { data: bookings } = await supabaseClient.from('bookings').select('*');
    if (bookings) {
      let totalRevenue = 0;
      let pendingCount = 0;
      let completedCount = 0;

      bookings.forEach(b => {
        const status = (b.payment_status || '').toLowerCase();
        if (status === 'approved' || status === 'completed') {
          totalRevenue += (b.total_price || 0);
        }
        if (status === 'pending') pendingCount++;
        if (status === 'completed') completedCount++;
      });

      elRevenue.textContent = `฿${totalRevenue.toLocaleString()}`;
      if (elTotal) elTotal.textContent = bookings.length.toLocaleString();
      if (elPending) elPending.textContent = pendingCount.toLocaleString();
      if (elCompleted) elCompleted.textContent = completedCount.toLocaleString();
    }
  }

  // 2. แสดงผล Chart เดิม
  setTimeout(() => {
    const ctx3 = document.getElementById('revenueChart');
    if (ctx3 && typeof Chart !== 'undefined') {
      if (window.revenueChartInstance) window.revenueChartInstance.destroy();

      window.revenueChartInstance = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: ['Football', 'Badminton', 'Basketball', 'Futsal', 'Volleyball'],
          datasets: [{
            label: 'Revenue (฿)',
            data: [45000, 28000, 22000, 35000, 18000],
            backgroundColor: ['oklch(45% 0.12 140)', 'oklch(50% 0.14 250)', 'oklch(52% 0.16 35)', 'oklch(42% 0.15 300)', 'oklch(55% 0.13 180)'],
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, grid: { color: 'oklch(90% 0.01 50)' } },
            y: { grid: { display: false } }
          }
        }
      });
    }
  }, 100);
}

// ============ FRONT-DESK FUNCTIONS ============

function simulateScan() {
  document.getElementById('scanResult').classList.add('visible');
}

// ============ MODALS MANAGEMENT ============

function openAddFacilityModal() {
  document.getElementById('addFacilityModal').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ============ SYSTEM INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

// ============ SUPABASE INTERACTION FUNCTIONS ============

// 1. ฟังก์ชันดึงข้อมูลสนามกีฬาจาก Supabase จริง
async function fetchFacilities(filter = 'all') {
  let query = supabaseClient.from('facilities').select('*');
  
  if (filter !== 'all') {
    query = query.eq('sport', filter);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching facilities:', error.message);
    return;
  }
  
  FACILITIES = data;
  
const grid = document.getElementById('facilitiesGrid');
  if (grid) {
    grid.innerHTML = FACILITIES.map(f => {
// 💡 ดึงรูปแรกมาใช้งานแบบตรงไปตรงมา
      let coverImg = '';
      if (f.images) {
        let imgs = [];
        if (Array.isArray(f.images)) {
          imgs = f.images;
        } else if (typeof f.images === 'string') {
          try {
            imgs = JSON.parse(f.images);
          } catch (e) {
            imgs = f.images.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"\vert{}"$/g, '').trim()).filter(Boolean);
          }
        }
        if (imgs.length > 0 && imgs[0]) {
          coverImg = imgs[0].replace(/^"|"\$/g, '').trim(); // ตัดเครื่องหมายคำพูดส่วนเกินออก
        }
      }

      // 💡 กำหนดสไตล์พื้นหลังการ์ด
      const bgStyle = coverImg 
        ? `background: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.4)), url('${coverImg}'); background-size: cover; background-position: center;`
        : `background: linear-gradient(135deg, ${f.color || 'oklch(45% 0.12 140)'}, ${f.color ? f.color.replace('45%', '60%') : 'oklch(55% 0.12 140)'});`;
      // 💡 เช็คสถานะสนามแบบยืดหยุ่น (รองรับทั้งตัวพิมพ์เล็ก/ใหญ่ และคำว่า available)
// 💡 เช็คสถานะสนาม
      const statusStr = (f.status || '').toLowerCase();
      const isAvailable = statusStr === 'available' || statusStr.includes('available');
      const cardClick = isAvailable ? `onclick="openBooking('${f.id}')"` : '';
      const cardCursor = isAvailable ? 'cursor:pointer;' : 'cursor:not-allowed; opacity:0.85;';

      // 💡 สร้าง HTML สำหรับรูปภาพปกแบบใช้ Tag <img> ตรงๆ เพื่อให้แสดงผลชัวร์ 100%
      let cardMediaHTML = '';
      if (coverImg) {
        cardMediaHTML = `
          <div class="card-image" style="position: relative; overflow: hidden; background: #000;">
            <img src="${coverImg}" alt="${f.name}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;" />
            <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.4)); pointer-events: none;"></div>
            <span class="badge">${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</span>
            <span class="price-badge">฿${f.price}/hr</span>
          </div>
        `;
      } else {
        const defaultColor = f.color || 'oklch(45% 0.12 140)';
        cardMediaHTML = `
          <div class="card-image" style="background: linear-gradient(135deg, ${defaultColor}, ${defaultColor.replace(/\d+%/, m => parseInt(m)+15+'%')});">
            <span class="badge">${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</span>
            <span class="price-badge">฿${f.price}/hr</span>
          </div>
        `;
      }

      return `
        <div class="facility-card" style="${cardCursor}" ${cardClick}>
          ${cardMediaHTML}
          <div class="card-body">
            <h3>${f.name}</h3>
            <div class="meta">
              <span><i data-lucide="map-pin" width="13" height="13"></i> Zone ${f.id.slice(-1)}</span>
              <span><i data-lucide="clock" width="13" height="13"></i> 06:00 - 22:00</span>
            </div>
            <div class="status status-${f.status}">
              <span class="dot"></span>
              ${f.status === 'available' ? 'Available Now' : 'Under Maintenance'}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    lucide.createIcons();
  }

  renderFacilitiesTable();
}

// 2. ฟังก์ชันส่งข้อมูลสนามใหม่ขึ้น Supabase 
// ฟังก์ชันเมื่อ Admin เลือกรูปภาพสนาม
function handleFacilityImagesSelect(event) {
  const files = Array.from(event.target.files);
  
  // เช็คว่าถ้ารวมกับของเดิมแล้วเกิน 4 รูปไหม
  if (selectedFacilityImages.length + files.length > 4) {
    alert('สามารถอัปโหลดรูปภาพได้สูงสุด 4 รูปเท่านั้นครับ');
    return;
  }

  // เอาไฟล์ใส่เข้าไปใน Array
  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) {
      alert(`ไฟล์ ${file.name} มีขนาดเกิน 5MB`);
      return;
    }
    selectedFacilityImages.push(file);
  });
  
  // ล้างค่า input เพื่อให้สามารถกดเลือกไฟล์เดิมซ้ำได้ (กรณีที่ลบรูปไปแล้วอยากเลือกใหม่)
  event.target.value = '';
  
  // เรียกฟังก์ชันวาดรูปและกล่องอัปโหลด
  renderFacilityImagePreview();
}

// ฟังก์ชันใหม่: ทำหน้าที่วาดรูปโชว์, สร้างปุ่มกากบาท(X)ลบรูป, และซ่อนกล่องอัปโหลด
function renderFacilityImagePreview() {
  const previewList = document.getElementById('facilityImagePreviewList');
  const uploadBox = document.getElementById('facilityImageUploadBox');
  const uploadBoxText = document.querySelector('#facilityImageUploadBox p');
  
  if (!previewList || !uploadBox) return;

  previewList.innerHTML = ''; // ล้างรูปที่โชว์ของเก่าออก เพื่อวาดใหม่
  
  selectedFacilityImages.forEach((file, index) => {
    // 3.1 สร้างกล่องคลุมรูปภาพ
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    
    // 3.2 สร้างรูปภาพพรีวิว
    const img = document.createElement('img');
    img.className = 'facility-preview-img'; // ดึง CSS ที่เราเคยเขียนไว้มาใช้
    img.style.width = '80px';
    img.style.height = '80px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '6px';
    img.style.border = '2px solid var(--border-light)';
    
    const reader = new FileReader();
    reader.onload = function(e) {
      img.src = e.target.result;
    }
    reader.readAsDataURL(file);
    
    // 3.3 สร้างปุ่ม (X) สีแดง สำหรับกดลบรูป
    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '×';
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '-6px';
    removeBtn.style.right = '-6px';
    removeBtn.style.background = 'var(--error)';
    removeBtn.style.color = 'white';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '50%';
    removeBtn.style.width = '20px';
    removeBtn.style.height = '20px';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.fontSize = '14px';
    removeBtn.style.display = 'flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    
    // คำสั่งเมื่อกดปุ่ม (X) ให้ลบรูปออกจากระบบ
    removeBtn.onclick = function(e) {
      e.stopPropagation(); // กันไม่ให้ไปเผลอกดโดนกล่องอัปโหลดด้านล่าง
      selectedFacilityImages.splice(index, 1); // ลบไฟล์นี้ออกจาก Array
      renderFacilityImagePreview(); // สั่งให้วาด UI ใหม่อีกรอบ (รูปจะหายไปเอง)
    };
    
    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    previewList.appendChild(wrapper);
  });
  
  // 3.4 ควบคุมการซ่อน/แสดง กล่องอัปโหลด
  if (selectedFacilityImages.length >= 4) {
    uploadBox.style.display = 'none'; // ถ้าครบ 4 รูปแล้ว ซ่อนกล่องอัปโหลดไปเลย
  } else {
    uploadBox.style.display = 'block'; // ถ้ายีงไม่ครบ 4 รูป ให้กล่องยังอยู่
    if (uploadBoxText) {
      if (selectedFacilityImages.length > 0) {
        uploadBoxText.innerText = `เลือกแล้ว ${selectedFacilityImages.length} รูป (อัปโหลดเพิ่มได้อีก ${4 - selectedFacilityImages.length} รูป)`;
      } else {
        uploadBoxText.innerText = `Click to upload photos`;
      }
    }
  }
}


// 2. ฟังก์ชันส่งข้อมูลสนามใหม่ขึ้น Supabase (อัปเดตให้อัปโหลดรูปได้)
async function submitNewFacility() {
  const nameInput = document.getElementById('addFieldName');
  const sportInput = document.getElementById('addFieldSport');
  const priceInput = document.getElementById('addFieldPrice');
  const statusInput = document.getElementById('addFieldStatus');

  const name = nameInput.value.trim();
  const sport = sportInput.value;
  const price = parseInt(priceInput.value);
  const status = statusInput.value;

  const bankName = document.getElementById('addFieldBankName').value;
  const bankAccount = document.getElementById('addFieldBankAccount').value;
  const accountName = document.getElementById('addFieldAccountName').value;
  
  const description = document.getElementById('newFacilityDesc').value;
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="facilityAmenity"]:checked')).map(cb => cb.value);

// ส่งข้อมูลเข้าไปเพิ่มใน .insert([{ ..., description: description, amenities: selectedAmenities }])
  if (!name || !price) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วนครับ');
    return;
  }

  // เปลี่ยนปุ่มเป็นสถานะกำลังโหลด
  const btn = document.querySelector('#addFacilityModal .btn-primary');
  const originalBtnText = btn ? btn.textContent : 'Add Facility';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังอัปโหลดรูปภาพ...';
  }

  try {
    const newId = 'F' + Math.floor(100 + Math.random() * 900);
    const uploadedImageUrls = [];

    // 1. วนลูปอัปโหลดรูปภาพทีละไฟล์ไปยัง Bucket 'facility-images'
    if (selectedFacilityImages.length > 0) {
      for (let i = 0; i < selectedFacilityImages.length; i++) {
        const file = selectedFacilityImages[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${newId}_${Date.now()}_${i}.${fileExt}`; // ตั้งชื่อไฟล์ไม่ให้ซ้ำ
        const filePath = `facilities/${fileName}`;

        const { error: uploadErr } = await supabaseClient
          .storage
          .from('facility-images')
          .upload(filePath, file);

        if (uploadErr) throw uploadErr;

        // ดึง Public URL ของรูปที่เพิ่งอัปโหลดเสร็จ
        const { data: urlData } = supabaseClient
          .storage
          .from('facility-images')
          .getPublicUrl(filePath);

        uploadedImageUrls.push(urlData.publicUrl);
      }
    }

    // 2. บันทึกข้อมูลสนาม (พร้อม Array ของ URL รูปภาพ) ลงตาราง facilities
    if (btn) btn.textContent = 'กำลังบันทึกข้อมูลสนาม...';
    
    // หากมีสี default อยู่แล้ว
    const randomColor = `oklch(${Math.floor(45 + Math.random() * 15)}% 0.12 ${Math.floor(Math.random() * 360)})`;

    const { error: insertErr } = await supabaseClient.from('facilities').insert([{
      id: newId,
      name: name,
      sport: sport,
      price: price,
      status: status,
      color: randomColor,
      images: uploadedImageUrls,
      description: description,
      amenities: selectedAmenities,
      bank_name: bankName,
      bank_account: bankAccount,
      account_name: accountName,
    }]);

    if (insertErr) throw insertErr;

    alert('เพิ่มสนามกีฬาและรูปภาพสำเร็จแล้ว!');
    
    // เคลียร์ฟอร์ม
    nameInput.value = '';
    priceInput.value = '';
    selectedFacilityImages = []; // เคลียร์ array รูป
    renderFacilityImagePreview(); // อัปเดต UI ให้กลับมาว่างๆ
    
    closeModal('addFacilityModal');
    await fetchFacilities('all');

  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalBtnText;
    }
  }
}

// ตัวแปรเก็บรูปภาพปัจจุบันของสนามที่กำลัง Edit
let editingFacilityImages = [];

// ฟังก์ชันเรนเดอร์รูปภาพพรีวิว พร้อมปุ่มกากบาทลบรูป
function renderEditImagePreview() {
  const container = document.getElementById('editFacilityImagePreviewList');
  const uploadBox = document.getElementById('editFacilityImageUploadBox');
  if (!container) return;
  container.innerHTML = '';

  // ซ่อนกล่องอัปโหลดเมื่อมีรูปครบ 4 รูป และแสดงกลับมาเมื่อเหลือน้อยกว่า 4 รูป
  if (uploadBox) {
    uploadBox.style.display = editingFacilityImages.length >= 4 ? 'none' : 'block';
  }

  editingFacilityImages.forEach((imgItem, idx) => {
    const isFile = imgItem instanceof File;
    const src = isFile ? URL.createObjectURL(imgItem) : imgItem;

    const div = document.createElement('div');
    div.style.cssText = 'position: relative; width: 68px; height: 68px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;';
    div.innerHTML = `
      <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;">
      <button type="button" onclick="removeEditImage(${idx})" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; line-height: 1;">✕</button>
    `;
    container.appendChild(div);
  });
}

// ฟังก์ชันลบรูปรายชิ้น
function removeEditImage(index) {
  editingFacilityImages.splice(index, 1);
  renderEditImagePreview();
}

// ฟังก์ชันรับรูปใหม่ที่อัปโหลดเพิ่ม
function handleEditFacilityImages(event) {
  const files = Array.from(event.target.files);
  for (const f of files) {
    if (editingFacilityImages.length >= 4) break;
    editingFacilityImages.push(f);
  }
  renderEditImagePreview();
  event.target.value = ''; // รีเซ็ต input
}
// 3. ฟังก์ชันดึงข้อมูลสนามเดิมมาใส่ป๊อปอัพ Edit
function openEditFacilityModal(facilityId) {
  const facility = FACILITIES.find(f => f.id === facilityId);
  if (!facility) return;

  document.getElementById('editFacilityId').value = facility.id;
  document.getElementById('editFieldName').value = facility.name;
  document.getElementById('editFieldSport').value = facility.sport;
  document.getElementById('editFieldPrice').value = facility.price;
  document.getElementById('editFieldStatus').value = facility.status;
  document.getElementById('editFieldBankName').value = facility.bank_name || '';
  document.getElementById('editFieldBankAccount').value = facility.bank_account || '';
  document.getElementById('editFieldAccountName').value = facility.account_name || '';
  // 💡 ดึงค่า Description เดิมมาใส่ในฟอร์ม
const editDescInput = document.getElementById('editFieldDesc');
if (editDescInput) {
  editDescInput.value = facility.description || '';
}

// 💡 ดึงค่า Amenities เดิมมาติ๊กถูกใน Checkbox
let currentAmenities = [];
if (facility.amenities) {
  if (Array.isArray(facility.amenities)) {
    currentAmenities = facility.amenities;
  } else if (typeof facility.amenities === 'string') {
    try {
      currentAmenities = JSON.parse(facility.amenities);
    } catch (e) {
      currentAmenities = facility.amenities.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"|"$/g, '').trim());
    }
  }
}
document.querySelectorAll('input[name="editFacilityAmenity"]').forEach(cb => {
  cb.checked = currentAmenities.includes(cb.value);
});
// 💡 โหลดรูปภาพเดิมมาแสดงและเตรียมจัดการ
    editingFacilityImages = [];
    if (facility.images) {
      if (Array.isArray(facility.images)) {
        editingFacilityImages = [...facility.images];
      } else if (typeof facility.images === 'string') {
        try {
          editingFacilityImages = JSON.parse(facility.images);
        } catch (e) {
          editingFacilityImages = facility.images.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
        }
      }
    }
    renderEditImagePreview();
  document.getElementById('editFacilityModal').classList.add('active');

}

// 4. ฟังก์ชันส่งข้อมูลที่แก้ไขขึ้น Supabase
async function submitEditFacility() {
  const id = document.getElementById('editFacilityId').value;
  const name = document.getElementById('editFieldName').value;
  const sport = document.getElementById('editFieldSport').value;
  const price = parseInt(document.getElementById('editFieldPrice').value);
  const status = document.getElementById('editFieldStatus').value;
  const description = document.getElementById('editFieldDesc') ? document.getElementById('editFieldDesc').value : '';
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="editFacilityAmenity"]:checked')).map(cb => cb.value);
  const bankName = document.getElementById('editFieldBankName').value;
  const bankAccount = document.getElementById('editFieldBankAccount').value;
  const accountName = document.getElementById('editFieldAccountName').value;
  if (!name || !price) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วนครับ');
    return;
  }
// ตรวจสอบและอัปโหลดรูปใหม่ (ถ้ามี)
    let finalImageUrls = [];
    for (let item of editingFacilityImages) {
      if (item instanceof File) {
        const fileExt = item.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const { error: uploadErr } = await supabaseClient.storage.from('facility-images').upload(fileName, item);
        if (!uploadErr) {
          const { data: urlData } = supabaseClient.storage.from('facility-images').getPublicUrl(fileName);
          finalImageUrls.push(urlData.publicUrl);
        }
      } else if (typeof item === 'string') {
        // ถ้าเป็น URL รูปเดิมอยู่แล้ว ให้เก็บไว้เหมือนเดิม
        finalImageUrls.push(item);
      }
    }
  const { error } = await supabaseClient
    .from('facilities')
    .update({
      name: name,
      sport: sport,
      price: price,
      status: status,
      description: description,
      amenities: selectedAmenities,
      images: finalImageUrls,
      bank_name: bankName,
      bank_account: bankAccount,
      account_name: accountName,
    })
    .eq('id', id);

  if (error) {
    alert('เกิดข้อผิดพลาดในการแก้ไข: ' + error.message);
  } else {
    alert('แก้ไขข้อมูลสนามกีฬาสำเร็จแล้ว!');
    closeModal('editFacilityModal');
    await fetchFacilities('all');
  }
}

// 5. ฟังก์ชันลบสนามกีฬาออกจาก Supabase
async function deleteFacility(facilityId) {
  const isConfirm = confirm(`คุณต้องการลบสนามกีฬา (ID: ${facilityId}) นี้ใช่หรือไม่?`);
  if (!isConfirm) return;

  const { error } = await supabaseClient
    .from('facilities')
    .delete()
    .eq('id', facilityId);

  if (error) {
    alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message);
  } else {
    alert('ลบสนามกีฬาเรียบร้อยแล้ว!');
    await fetchFacilities('all');
  }
}

// ฟังก์ชันควบคุมการเลื่อนรูปภาพสไลด์โชว์
function moveFacilitySlider(direction) {
  const slider = document.getElementById('bookingImageSlider');
  if (!slider) return;
  
  // 💡 ให้ระบบนับจำนวนรูปที่มีอยู่จริงในสไลด์โชว์บนหน้าจอ
  const totalSlides = slider.querySelectorAll('.slide-item').length;
  
  // ถ้าไม่มีรูป หรือมีแค่รูปเดียว ไม่ต้องเลื่อน
  if (totalSlides <= 1) return;
  
  // คำนวณตำแหน่งรูปถัดไปแบบวนลูป (ถ้าเกินรูปสุดท้ายจะกลับมารูปแรก)
  currentSlideIndex = (currentSlideIndex + direction + totalSlides) % totalSlides;
  updateSliderPosition();
}

function setSlide(index) {
  currentSlideIndex = index;
  updateSliderPosition();
}

function updateSliderPosition() {
  const slider = document.getElementById('bookingImageSlider');
  if (!slider) return;
  slider.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  
  const dots = document.querySelectorAll('#sliderDots .slider-dot');
  dots.forEach((dot, index) => {
    if (index === currentSlideIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  // เช็คว่ามี Supabase Client ไหม
  if (typeof supabaseClient === 'undefined') return;

  // เช็ค Session จาก Supabase
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchUserProfile(currentUser.id);
  } else {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.classList.add('active');
  }
});

// ==========================================
// ฟังก์ชันเสริมสำหรับหน้า Slot Management
// ==========================================

// 1. ปุ่มลัดคลิกที่ช่องว่างในตารางเพื่อเติมเวลาลงฟอร์มทั้ง 2 กล่องทันที
function quickFillWalkinTime(start, end) {
  const sEl = document.getElementById('walkinStartTime');
  const eEl = document.getElementById('walkinEndTime');
  if (sEl) sEl.value = start;
  if (eEl) eEl.value = end;

  const bStart = document.getElementById('blockStartTime');
  const bEnd = document.getElementById('blockEndTime');
  if (bStart) bStart.value = start;
  if (bEnd) bEnd.value = end;

  const nameInput = document.getElementById('walkinCustomerName');
  if (nameInput) nameInput.focus();
}

// 2. ยกเลิกคิวจองจากหน้าตาราง Slot Management
async function cancelSlotBooking(bookingId) {
  if (!confirm('ต้องการยกเลิกคิวจองของชั่วโมงนี้ เพื่อให้สล็อตกลับมาว่างใช่หรือไม่?')) return;
  const { error } = await supabaseClient.from('bookings').update({ payment_status: 'rejected' }).eq('id', String(bookingId).trim());
  if (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message);
  } else {
    await loadSlotManagementData();
  }
}

// 3. บันทึกการจองให้ลูกค้ากรณีโทรมาจอง / Walk-in
async function submitAdminWalkinBooking() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const customerName = document.getElementById('walkinCustomerName')?.value.trim();
  const customerPhone = document.getElementById('walkinCustomerPhone')?.value.trim();
  const startStr = document.getElementById('walkinStartTime')?.value;
  const endStr = document.getElementById('walkinEndTime')?.value;

  if (!customerName || !customerPhone) {
    alert('กรุณากรอกชื่อและเบอร์โทรลูกค้าให้ครบถ้วนครับ');
    return;
  }

  const startHour = parseInt(startStr);
  const endHour = parseInt(endStr);
  if (endHour <= startHour) {
    alert('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้นครับ');
    return;
  }

  const facility = FACILITIES.find(f => f.id === facilityId);
  const pricePerHour = facility?.price || 0;
  const batchMarker = 'walkin_' + Date.now();

  const inserts = [];
  for (let h = startHour; h < endHour; h++) {
    inserts.push({
      user_id: currentUser?.id || 'admin',
      facility_id: facilityId,
      date: dateStr,
      start_time: h.toString().padStart(2, '0') + ':00',
      end_time: (h + 1).toString().padStart(2, '0') + ':00',
      total_price: pricePerHour,
      payment_status: 'approved',
      slip_url: batchMarker,
      customer_name: customerName,
      customer_phone: customerPhone
    });
  }

  try {
    const { error } = await supabaseClient.from('bookings').insert(inserts);
    if (error) throw error;

    alert('✅ ลงคิวจองให้คุณ "' + customerName + '" (' + startStr + ' - ' + endStr + ') เรียบร้อยแล้ว!');
    document.getElementById('walkinCustomerName').value = '';
    document.getElementById('walkinCustomerPhone').value = '';
    await loadSlotManagementData();
  } catch (err) {
    alert('บันทึกการจองไม่สำเร็จ: ' + err.message);
  }
}

// 4. บันทึกการล็อกเวลาสนาม (Block Time Slots)
async function submitTimeBlock() {
  const facilityId = document.getElementById('slotManageFacility')?.value;
  const dateStr = document.getElementById('slotManageDate')?.value;
  const startStr = document.getElementById('blockStartTime')?.value;
  const endStr = document.getElementById('blockEndTime')?.value;
  const reason = document.getElementById('blockReason')?.value;

  const startHour = parseInt(startStr);
  const endHour = parseInt(endStr);
  if (endHour <= startHour) {
    alert('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้นครับ');
    return;
  }

  try {
    const { error } = await supabaseClient.from('time_blocks').insert([{
      facility_id: facilityId,
      date: dateStr,
      blocked_start: startStr,
      blocked_end: endStr,
      reason: reason
    }]);

    if (error) throw error;

    alert('🔒 ล็อกเวลาสนามช่วง ' + startStr + ' - ' + endStr + ' เรียบร้อยแล้ว!');
    await loadSlotManagementData();
  } catch (err) {
    alert('ล็อกเวลาไม่สำเร็จ: ' + err.message);
  }
}

// 5. ปลดล็อกเวลาสนาม
async function removeTimeBlock(blockId) {
  if (!confirm('ต้องการปลดล็อกช่วงเวลานี้ เพื่อให้ลูกค้ากลับมาจองได้ตามปกติใช่หรือไม่?')) return;
  const { error } = await supabaseClient.from('time_blocks').delete().eq('id', String(blockId).trim());
  if (error) {
    alert('ปลดล็อกไม่สำเร็จ: ' + error.message);
  } else {
    await loadSlotManagementData();
  }
}

// (ส่วนคำนวณและแสดงผล Dashboard ได้รับการอัปเกรดเป็น Real-time Multi-Court Matrix ด้านล่างของไฟล์แล้ว)


// ============================================================================
// ระบบจัดการ 77 จังหวัด, พิกัด Google Maps, และการดึงเบอร์โทรจากตาราง profiles อัตโนมัติ
// ============================================================================

const THAI_PROVINCES = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา",
  "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก",
  "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน",
  "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา",
  "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต",
  "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี",
  "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี",
  "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"
];

let currentSportFilter = 'all';
let currentProvinceFilter = 'all';

// เติมรายชื่อ 77 จังหวัดลงใน select ทั้งหน้า Browse, Add Modal และ Edit Modal
function populateProvinceDropdowns() {
  const browseSelect = document.getElementById('browseProvinceFilter');
  if (browseSelect && browseSelect.options.length <= 1) {
    browseSelect.innerHTML = '<option value="all">ทุกจังหวัด (All Provinces)</option>' +
      THAI_PROVINCES.map(p => `<option value="${p}">${p}</option>`).join('');
  }

  const addSelect = document.getElementById('addFieldProvince');
  if (addSelect && addSelect.options.length === 0) {
    addSelect.innerHTML = '<option value="">-- เลือกจังหวัด --</option>' +
      THAI_PROVINCES.map(p => `<option value="${p}">${p}</option>`).join('');
  }

  const editSelect = document.getElementById('editFieldProvince');
  if (editSelect && editSelect.options.length === 0) {
    editSelect.innerHTML = '<option value="">-- เลือกจังหวัด --</option>' +
      THAI_PROVINCES.map(p => `<option value="${p}">${p}</option>`).join('');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  populateProvinceDropdowns();
});

// ตัวกรองประเภทกีฬา ทำงานคู่กับตัวกรองจังหวัด
function filterFacilities(btn, sport) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  currentSportFilter = sport || 'all';
  fetchFacilities(currentSportFilter);
}

// ตัวกรองจังหวัดในหน้า Sports Facilities
function filterByProvince(province) {
  currentProvinceFilter = province || 'all';
  fetchFacilities(currentSportFilter);
}

// 1. ดึงข้อมูลสนามกีฬา + กรองตามประเภทกีฬาและจังหวัด + แสดงจังหวัดบนการ์ดหน้าปกแทน Zone
async function fetchFacilities(filter = 'all') {
  populateProvinceDropdowns();
  currentSportFilter = filter || 'all';
  // 💡 ซิงค์สีปุ่มหมวดหมู่กีฬา (.filter-chip) ให้ตรงกับหมวดที่เลือกค้างไว้
  document.querySelectorAll('.filter-chip').forEach(btn => {
    const clickAttr = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', clickAttr.includes(`'${currentSportFilter}'`));
  });
  
  let query = supabaseClient.from('facilities').select('*');
  if (currentSportFilter !== 'all') {
    query = query.eq('sport', currentSportFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching facilities:', error.message);
    return;
  }

  FACILITIES = data || [];

  // กรองตามจังหวัดที่ลูกค้าเลือก
  const filteredList = FACILITIES.filter(f => {
    if (!currentProvinceFilter || currentProvinceFilter === 'all') return true;
    return (f.province || '').trim() === currentProvinceFilter;
  });

  const grid = document.getElementById('facilitiesGrid');
  if (grid) {
    if (filteredList.length === 0) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-tertiary);">ไม่พบสนามกีฬาในจังหวัดหรือประเภทกีฬาที่เลือก</p>';
    } else {
      grid.innerHTML = filteredList.map(f => {
        let coverImg = '';
        if (f.images) {
          let imgs = [];
          if (Array.isArray(f.images)) {
            imgs = f.images;
          } else if (typeof f.images === 'string') {
            try {
              imgs = JSON.parse(f.images);
            } catch (e) {
              imgs = f.images.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"\vert{}"$/g, '').trim()).filter(Boolean);
            }
          }
          if (imgs.length > 0 && imgs[0]) {
            coverImg = imgs[0].replace(/^"|"\$/g, '').trim();
          }
        }

        const statusStr = (f.status || '').toLowerCase();
        const isAvailable = statusStr === 'available' || statusStr.includes('available');
        const cardClick = isAvailable ? `onclick="openBooking('${f.id}')"` : '';
        const cardCursor = isAvailable ? 'cursor:pointer;' : 'cursor:not-allowed; opacity:0.85;';

        let cardMediaHTML = '';
        if (coverImg) {
          cardMediaHTML = `
            <div class="card-image" style="position: relative; overflow: hidden; background: #000;">
              <img src="${coverImg}" alt="${f.name}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;" />
              <div style="position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.4)); pointer-events: none;"></div>
              <span class="badge">${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</span>
              <span class="price-badge">฿${f.price}/hr</span>
            </div>
          `;
        } else {
          const defaultColor = f.color || 'oklch(45% 0.12 140)';
          cardMediaHTML = `
            <div class="card-image" style="background: linear-gradient(135deg, ${defaultColor}, #222);">
              <span class="badge">${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</span>
              <span class="price-badge">฿${f.price}/hr</span>
            </div>
          `;
        }

        // 💡 แสดงชื่อจังหวัดบนหน้าปกสนาม (ถ้าสนามเก่าไม่ได้ระบุไว้ ให้ขึ้น 'ไม่ระบุจังหวัด')
        const provinceText = f.province && f.province.trim() !== '' ? f.province.trim() : 'ไม่ระบุจังหวัด';

        return `
          <div class="facility-card" style="${cardCursor}" ${cardClick}>
            ${cardMediaHTML}
            <div class="card-body">
              <h3>${f.name}</h3>
              <div class="meta">
                <span><i data-lucide="map-pin" width="13" height="13"></i> ${provinceText}</span>
                <span><i data-lucide="clock" width="13" height="13"></i> 06:00 - 22:00</span>
              </div>
              <div class="status status-${f.status}">
                <span class="dot"></span>
                ${f.status === 'available' ? 'Available Now' : 'Under Maintenance'}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    if (window.lucide) lucide.createIcons();
  }

  renderFacilitiesTable();
}

// 2. ฟังก์ชันรีเซ็ตสลิป + เติมชื่อและเบอร์โทรจากตาราง profiles ลงในช่องกรอกให้อัตโนมัติ (แก้ไข/ลบได้ตามใจลูกค้า)
function resetSlipUploadUI() {
  selectedSlipFile = null;
  const slipInput = document.getElementById('slipUpload');
  if (slipInput) slipInput.value = '';

  const uploadArea = document.getElementById('slipUploadBox');
  if (uploadArea) {
    uploadArea.innerHTML = `
      <i data-lucide="upload-cloud" width="28" height="28"></i>
      <p>Click to upload bank transfer slip</p>
      <p style="font-size:0.72rem; color:var(--text-tertiary); margin-top:4px">PNG, JPG up to 5MB</p>
    `;
    if (window.lucide) lucide.createIcons();
  }

  // 💡 ดึงชื่อและเบอร์โทรจาก currentUser.profile มาใส่รอไว้ให้ทันที (ลูกค้าสามารถลบหรือพิมพ์เปลี่ยนเองได้)
  const customerNameInput = document.getElementById('bookingCustomerName');
  const customerPhoneInput = document.getElementById('bookingCustomerPhone');
  if (customerNameInput) customerNameInput.value = currentUser?.profile?.name || '';
  if (customerPhoneInput) customerPhoneInput.value = currentUser?.profile?.phone || '';
}

// 4. ล้างข้อมูลเก่าทุกช่องในฟอร์ม Add New Facility ทุกครั้งที่กดเปิดป๊อปอัป
function openAddFacilityModal() {
  populateProvinceDropdowns();

  const textFields = [
    'addFieldName',
    'addFieldPrice',
    'addFieldProvince',
    'addFieldMapUrl',
    'addFieldBankName',
    'addFieldBankAccount',
    'addFieldAccountName',
    'newFacilityDesc'
  ];
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const sportEl = document.getElementById('addFieldSport');
  if (sportEl) sportEl.selectedIndex = 0;

  const statusEl = document.getElementById('addFieldStatus');
  if (statusEl) statusEl.value = 'available';

  document.querySelectorAll('input[name="facilityAmenity"]').forEach(cb => {
    cb.checked = false;
  });

  selectedFacilityImages = [];
  if (typeof renderFacilityImagePreview === 'function') {
    renderFacilityImagePreview();
  }

  const modalBox = document.querySelector('#addFacilityModal .modal');
  if (modalBox) modalBox.scrollTop = 0;

  document.getElementById('addFacilityModal').classList.add('active');
}

// 5. บันทึกสนามใหม่พร้อม province และ map_url
async function submitNewFacility() {
  const nameInput = document.getElementById('addFieldName');
  const sportInput = document.getElementById('addFieldSport');
  const priceInput = document.getElementById('addFieldPrice');
  const statusInput = document.getElementById('addFieldStatus');
  const provinceInput = document.getElementById('addFieldProvince');
  const mapUrlInput = document.getElementById('addFieldMapUrl');

  const name = nameInput.value.trim();
  const sport = sportInput.value;
  const price = parseInt(priceInput.value);
  const status = statusInput.value;
  const province = provinceInput ? provinceInput.value.trim() : '';
  const mapUrl = mapUrlInput ? mapUrlInput.value.trim() : '';

  const bankName = document.getElementById('addFieldBankName').value;
  const bankAccount = document.getElementById('addFieldBankAccount').value;
  const accountName = document.getElementById('addFieldAccountName').value;
  const description = document.getElementById('newFacilityDesc').value;
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="facilityAmenity"]:checked')).map(cb => cb.value);

  if (!name || !price) {
    alert('กรุณากรอกชื่อสนามและราคาให้ครบถ้วนครับ');
    return;
  }
  if (!province) {
    alert('กรุณาเลือกจังหวัดที่ตั้งของสนามด้วยครับ');
    return;
  }

  const btn = document.querySelector('#addFacilityModal .btn-primary');
  const originalBtnText = btn ? btn.textContent : 'Add Facility';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึกข้อมูล...';
  }

  try {
    const newId = 'F' + Math.floor(100 + Math.random() * 900);
    const uploadedImageUrls = [];

    if (selectedFacilityImages.length > 0) {
      for (let i = 0; i < selectedFacilityImages.length; i++) {
        const file = selectedFacilityImages[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${newId}_${Date.now()}_${i}.${fileExt}`;
        const filePath = `facilities/${fileName}`;

        const { error: uploadErr } = await supabaseClient
          .storage
          .from('facility-images')
          .upload(filePath, file);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabaseClient
          .storage
          .from('facility-images')
          .getPublicUrl(filePath);

        uploadedImageUrls.push(urlData.publicUrl);
      }
    }

    const randomColor = `oklch(${Math.floor(45 + Math.random() * 15)}% 0.12 ${Math.floor(Math.random() * 360)})`;

    const { error: insertErr } = await supabaseClient.from('facilities').insert([{
      id: newId,
      name: name,
      sport: sport,
      price: price,
      status: status,
      province: province,
      map_url: mapUrl,
      color: randomColor,
      images: uploadedImageUrls,
      description: description,
      amenities: selectedAmenities,
      bank_name: bankName,
      bank_account: bankAccount,
      account_name: accountName,
    }]);

    if (insertErr) throw insertErr;

    alert('เพิ่มสนามกีฬาเรียบร้อยแล้ว!');
    nameInput.value = '';
    priceInput.value = '';
    if (provinceInput) provinceInput.value = '';
    if (mapUrlInput) mapUrlInput.value = '';
    selectedFacilityImages = [];
    renderFacilityImagePreview();

    closeModal('addFacilityModal');
    await fetchFacilities('all');
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalBtnText;
    }
  }
}

// 6. ดึงข้อมูลจังหวัดและลิงก์แผนที่เดิมมาแสดงตอนกด Edit สนาม
function openEditFacilityModal(facilityId) {
  populateProvinceDropdowns();
  const facility = FACILITIES.find(f => f.id === facilityId);
  if (!facility) return;

  document.getElementById('editFacilityId').value = facility.id;
  document.getElementById('editFieldName').value = facility.name;
  document.getElementById('editFieldSport').value = facility.sport;
  document.getElementById('editFieldPrice').value = facility.price;
  document.getElementById('editFieldStatus').value = facility.status;

  const editProv = document.getElementById('editFieldProvince');
  const editMap = document.getElementById('editFieldMapUrl');
  if (editProv) editProv.value = facility.province || '';
  if (editMap) editMap.value = facility.map_url || '';

  document.getElementById('editFieldBankName').value = facility.bank_name || '';
  document.getElementById('editFieldBankAccount').value = facility.bank_account || '';
  document.getElementById('editFieldAccountName').value = facility.account_name || '';

  const editDescInput = document.getElementById('editFieldDesc');
  if (editDescInput) editDescInput.value = facility.description || '';

  let currentAmenities = [];
  if (facility.amenities) {
    if (Array.isArray(facility.amenities)) {
      currentAmenities = facility.amenities;
    } else if (typeof facility.amenities === 'string') {
      try {
        currentAmenities = JSON.parse(facility.amenities);
      } catch (e) {
        currentAmenities = facility.amenities.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"\vert{}"$/g, '').trim());
      }
    }
  }
  document.querySelectorAll('input[name="editFacilityAmenity"]').forEach(cb => {
    cb.checked = currentAmenities.includes(cb.value);
  });

  editingFacilityImages = [];
  if (facility.images) {
    if (Array.isArray(facility.images)) {
      editingFacilityImages = [...facility.images];
    } else if (typeof facility.images === 'string') {
      try {
        editingFacilityImages = JSON.parse(facility.images);
      } catch (e) {
        editingFacilityImages = facility.images.replace(/^{|}$/g, '').split(',').map(s => s.replace(/^"\vert{}"$/g, '').trim()).filter(Boolean);
      }
    }
  }
  renderEditImagePreview();
  document.getElementById('editFacilityModal').classList.add('active');
}

// 7. บันทึกการแก้ไขสนามพร้อมอัปเดต province และ map_url
async function submitEditFacility() {
  const id = document.getElementById('editFacilityId').value;
  const name = document.getElementById('editFieldName').value.trim();
  const sport = document.getElementById('editFieldSport').value;
  const price = parseInt(document.getElementById('editFieldPrice').value);
  const status = document.getElementById('editFieldStatus').value;
  const province = document.getElementById('editFieldProvince') ? document.getElementById('editFieldProvince').value.trim() : '';
  const mapUrl = document.getElementById('editFieldMapUrl') ? document.getElementById('editFieldMapUrl').value.trim() : '';

  const description = document.getElementById('editFieldDesc') ? document.getElementById('editFieldDesc').value : '';
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="editFacilityAmenity"]:checked')).map(cb => cb.value);
  const bankName = document.getElementById('editFieldBankName').value;
  const bankAccount = document.getElementById('editFieldBankAccount').value;
  const accountName = document.getElementById('editFieldAccountName').value;

  if (!name || !price) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วนครับ');
    return;
  }

  let finalImageUrls = [];
  for (let item of editingFacilityImages) {
    if (item instanceof File) {
      const fileExt = item.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadErr } = await supabaseClient.storage.from('facility-images').upload(fileName, item);
      if (!uploadErr) {
        const { data: urlData } = supabaseClient.storage.from('facility-images').getPublicUrl(fileName);
        finalImageUrls.push(urlData.publicUrl);
      }
    } else if (typeof item === 'string') {
      finalImageUrls.push(item);
    }
  }

  const { error } = await supabaseClient
    .from('facilities')
    .update({
      name: name,
      sport: sport,
      price: price,
      status: status,
      province: province,
      map_url: mapUrl,
      description: description,
      amenities: selectedAmenities,
      images: finalImageUrls,
      bank_name: bankName,
      bank_account: bankAccount,
      account_name: accountName,
    })
    .eq('id', id);

  if (error) {
    alert('เกิดข้อผิดพลาดในการแก้ไข: ' + error.message);
  } else {
    alert('แก้ไขข้อมูลสนามกีฬาสำเร็จแล้ว!');
    closeModal('editFacilityModal');
    await fetchFacilities('all');
  }
}

// 8. แสดงจังหวัดและปุ่มนำทาง Google Maps ในตั๋วยืนยันการจอง (E-Ticket Modal) ของลูกค้า
function openBookingTicketModal(groupId, isAdminView = false) {
  const bill = groupedBookingsCache[groupId];
  if (!bill) return;

  const facility = (typeof FACILITIES !== 'undefined' ? FACILITIES.find(f => f.id === bill.facility_id) : null) || { name: 'สนามกีฬา' };
  const statusLower = (bill.payment_status || 'pending').toLowerCase();
  const canManage = (currentRole === 'admin' || currentRole === 'staff' || isAdminView);

  const badge = document.getElementById('ticketStatusBadge');
  if (badge) {
    badge.textContent = bill.isPartiallyCheckedIn
      ? `CHECKED-IN ${bill.completedCount}/${bill.totalSlots}`
      : statusLower.toUpperCase();
  }

  const slotsListHtml = bill.slots.map((s, idx) => {
    let slotStatusHtml = '';
    if (s.status === 'completed') {
      slotStatusHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">✓ เข้าใช้งานแล้ว</span>`;
    } else if (s.status === 'approved') {
      if (canManage) {
        slotStatusHtml =
          '<div style="display:flex; align-items:center; gap:6px;">' +
            '<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-size:0.72rem; font-weight:600;">รอเช็คอิน</span>' +
            '<button class="btn" style="background:#22c55e; color:white; padding:3px 8px; font-size:0.72rem; border-radius:6px;" onclick="checkInSingleSlot(\'' + s.id + '\', \'' + bill.groupId + '\')">✅ เช็คอินช่วงนี้</button>' +
          '</div>';
      } else {
        slotStatusHtml = `<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">⏳ รอเช็คอิน</span>`;
      }
    } else {
      slotStatusHtml = `<span style="background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">รออนุมัติสลิป</span>`;
    }

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; font-size:0.85rem;">
        <div>
          <span style="color:var(--text-secondary); font-size:0.78rem;">ช่วงที่ ${idx + 1}:</span>
          <strong style="color:var(--text); margin-left:4px;">${s.start} - ${s.end} น.</strong>
        </div>
        ${slotStatusHtml}
      </div>
    `;
  }).join('');

  // 💡 สร้างปุ่มลิงก์ Google Maps ในบิลของลูกค้า (ถ้าสนามมีลิงก์แผนที่)
  const mapBtnHtml = (facility.map_url && String(facility.map_url).trim() !== '')
    ? `<div style="margin-bottom:14px;">
         <a href="${String(facility.map_url).trim()}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:6px; width:100%; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:8px 12px; border-radius:8px; font-size:0.84rem; font-weight:600; text-decoration:none;">
           🗺️ เปิดแผนที่นำทางไปสนาม (Google Maps) ↗
         </a>
       </div>`
    : '';

  const provinceSub = facility.province ? `<div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">📍 จ.${facility.province}</div>` : '';

  const body = document.getElementById('bookingTicketBody');
  if (body) {
    body.innerHTML = `
      <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px dashed #cbd5e1;">
        <div style="font-size:0.78rem; color:var(--text-tertiary);">รหัสอ้างอิงบิล (Booking Ref)</div>
        <div style="font-size:0.9rem; font-weight:700; word-break:break-all;">#${bill.groupId}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">สนามกีฬา (Facility)</div>
          <div style="font-size:0.95rem; font-weight:700;">${facility.name}</div>
          ${provinceSub}
        </div>
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">วันที่เข้าใช้งาน (Date)</div>
          <div style="font-size:0.95rem; font-weight:700;">${bill.date}</div>
        </div>
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">ชื่อผู้จอง (Customer)</div>
          <div style="font-size:0.92rem; font-weight:600;">${bill.customer_name}</div>
        </div>
        <div>
          <div style="font-size:0.78rem; color:var(--text-tertiary);">เบอร์โทรศัพท์ (Phone)</div>
          <div style="font-size:0.92rem; font-weight:600;">${bill.customer_phone}</div>
        </div>
      </div>

      ${mapBtnHtml}

      <div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.82rem; font-weight:600; color:#334155;">สถานะแต่ละช่วงเวลา (${bill.slots.length} ชั่วโมง)</span>
          <span style="font-size:0.76rem; color:#2563eb; font-weight:600;">ใช้แล้ว ${bill.completedCount}/${bill.totalSlots}</span>
        </div>
        ${slotsListHtml}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:2px solid #f1f5f9;">
        <span style="font-size:0.95rem; font-weight:600;">ยอดชำระรวมทั้งสิ้น</span>
        <span style="font-size:1.35rem; font-weight:800; color:var(--primary);">฿${bill.total_price.toLocaleString()}</span>
      </div>
    `;

    if (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_')) {
      const safeSlipUrl = String(bill.slip_url).trim();
      body.innerHTML +=
        '<div style="margin-top:14px; text-align:right;">' +
          '<button type="button" class="btn" style="background:#fef2f2; color:var(--primary); border:1px solid #fecaca; padding:6px 12px; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer;" onclick="previewSlipModal(\'' + safeSlipUrl + '\')">' +
            '🖼️ เปิดดูรูปสลิปโอนเงิน' +
          '</button>' +
        '</div>';
    }
  }

  const footer = document.getElementById('bookingTicketFooter');
  if (footer) {
    const remainingSlots = bill.slots.filter(s => s.status === 'approved').length;
    let adminActions = '';
    if (canManage && remainingSlots > 0) {
      adminActions =
        '<button class="btn" style="flex:1.5; background:#2563eb; color:white;" onclick="confirmGroupCheckIn(\'' + bill.groupId + '\')">' +
          '✅ เช็คอินรวบทั้งบิล (' + remainingSlots + ' ชม. ที่เหลือ)' +
        '</button>';
    }
    footer.innerHTML = `
      <button class="btn btn-secondary" style="flex:1;" onclick="closeModal('bookingTicketModal')">ปิดหน้าต่าง</button>
      ${adminActions}
    `;
  }

  document.getElementById('bookingTicketModal').classList.add('active');
}

// ============================================================================
// ระบบแยกสิทธิ์ 3 ระดับ: user (ลูกค้า) | owner (เจ้าของสนาม) | admin (ดูแลทั้งหมด)
// ============================================================================

// ฟังก์ชันเช็กว่าผู้ใช้งานที่ล็อกอินอยู่ มีสิทธิ์จัดการสนามนี้หรือไม่
function isMyManagedFacility(facility) {
  if (!facility) return false;
  if (currentRole === 'admin') return true; // Admin เข้าถึงได้ทุกสนาม
  if (currentRole === 'owner') {
    return String(facility.owner_id || '') === String(currentUser?.id || '');
  }
  return false;
}

// ดึงเฉพาะรายการสนามที่ผู้ใช้งานคนนี้มีสิทธิ์จัดการ (Admin = ทุกสนาม, Owner = เฉพาะสนามที่ตัวเองสร้าง)
function getMyManagedFacilities() {
  if (!FACILITIES || !Array.isArray(FACILITIES)) return [];
  if (currentRole === 'admin') return FACILITIES;
  if (currentRole === 'owner') {
    return FACILITIES.filter(f => String(f.owner_id || '') === String(currentUser?.id || ''));
  }
  return [];
}

// 1. อัปเดตเมนูด้านซ้าย (Sidebar) ให้รองรับทั้ง user, owner และ admin
function setupNav() {
  const userName = currentUser?.profile?.name || currentUser?.email || 'User';
  const avatarInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('userName').textContent = userName;
  
  // แสดงป้ายชื่อ Role ให้เข้าใจง่าย
  const roleLabelMap = {
    admin: 'Admin (ดูแลระบบทั้งหมด)',
    owner: 'Owner (เจ้าของสนาม)',
    staff: 'Staff',
    user: 'User (ลูกค้าทั่วไป)'
  };
  document.getElementById('userRole').textContent = roleLabelMap[currentRole] || currentRole;
  applyAvatar(document.getElementById('userAvatar'), currentUser?.profile?.avatar_url, avatarInitials);

  // เมนูฝั่งลูกค้า (Browse / My Bookings / History) เปิดให้ทุกคนใช้ได้
  document.getElementById('navUser').style.display = 'block';
  document.getElementById('navUserLinks').style.display = 'block';

  // 💡 เปิดเมนู Management ให้ทั้ง 'admin' และ 'owner' (เจ้าของสนาม)
  const canManageSystem = (currentRole === 'admin' || currentRole === 'owner');
  const isStaff = (currentRole === 'staff');

  document.getElementById('navAdmin').style.display = canManageSystem ? 'block' : 'none';
  document.getElementById('navAdminLinks').style.display = canManageSystem ? 'block' : 'none';

  document.getElementById('navStaff').style.display = isStaff ? 'block' : 'none';
  document.getElementById('navStaffLinks').style.display = isStaff ? 'block' : 'none';
}

// 2. เมื่อล็อกอินเสร็จ ให้พาไปหน้าแรกตามสิทธิ์ (admin และ owner ไปหน้า Dashboard ของตัวเอง)
async function fetchUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching profile:', error);
    currentRole = 'user';
  } else {
    currentRole = (data.role || 'user').toLowerCase().trim();
    currentUser.profile = data;
  }

  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appShell').style.display = 'grid';

  setupNav();
  await fetchFacilities('all');

  if (currentRole === 'admin' || currentRole === 'owner') {
    await switchView('dashboard');
  } else if (currentRole === 'staff') {
    await switchView('scanner');
  } else {
    await switchView('facilities');
  }

  if (window.lucide) lucide.createIcons();
}

// 3. ตาราง Manage Facilities: เจ้าของสนาม (owner) จะเห็นและแก้ได้เฉพาะสนามของตัวเอง ส่วน admin เห็นทั้งหมด
function renderFacilitiesTable() {
  const tbody = document.getElementById('facilitiesTable');
  if (!tbody) return;

  const managedList = getMyManagedFacilities();

  if (managedList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:24px; color:var(--text-tertiary);">
          ยังไม่มีสนามกีฬาในความดูแลของคุณ (กดปุ่ม <strong>+ Add Facility</strong> ด้านบนเพื่อเพิ่มสนามของคุณได้เลย)
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = managedList.map(f => `
    <tr>
      <td>
        <strong>${f.name}</strong>
        <div style="font-size:0.75rem; color:var(--text-secondary);">📍 ${f.province || 'ไม่ระบุจังหวัด'}</div>
      </td>
      <td>${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</td>
      <td>฿${Number(f.price || 0).toLocaleString()}</td>
      <td><span class="status-badge ${f.status === 'available' ? 'approved' : 'pending'}">${f.status}</span></td>
      <td>
        <div class="table-actions">
          <button class="approve-btn" onclick="openEditFacilityModal('${f.id}')">Edit</button>
          <button class="reject-btn" onclick="deleteFacility('${f.id}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// 4. ตอนกดเพิ่มสนามใหม่ (submitNewFacility) ให้บันทึก owner_id เป็น ID ของคนที่กดสร้างทันที
async function submitNewFacility() {
  const nameInput = document.getElementById('addFieldName');
  const sportInput = document.getElementById('addFieldSport');
  const priceInput = document.getElementById('addFieldPrice');
  const statusInput = document.getElementById('addFieldStatus');
  const provinceInput = document.getElementById('addFieldProvince');
  const mapUrlInput = document.getElementById('addFieldMapUrl');

  const name = nameInput.value.trim();
  const sport = sportInput.value;
  const price = parseInt(priceInput.value);
  const status = statusInput.value;
  const province = provinceInput ? provinceInput.value.trim() : '';
  const mapUrl = mapUrlInput ? mapUrlInput.value.trim() : '';

  const bankName = document.getElementById('addFieldBankName').value;
  const bankAccount = document.getElementById('addFieldBankAccount').value;
  const accountName = document.getElementById('addFieldAccountName').value;
  const description = document.getElementById('newFacilityDesc').value;
  const selectedAmenities = Array.from(document.querySelectorAll('input[name="facilityAmenity"]:checked')).map(cb => cb.value);

  if (!name || !price) {
    alert('กรุณากรอกชื่อสนามและราคาให้ครบถ้วนครับ');
    return;
  }
  if (!province) {
    alert('กรุณาเลือกจังหวัดที่ตั้งของสนามด้วยครับ');
    return;
  }

  const btn = document.querySelector('#addFacilityModal .btn-primary');
  const originalBtnText = btn ? btn.textContent : 'Add Facility';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึกข้อมูล...';
  }

  try {
    const newId = 'F' + Math.floor(100 + Math.random() * 900);
    const uploadedImageUrls = [];

    if (selectedFacilityImages.length > 0) {
      for (let i = 0; i < selectedFacilityImages.length; i++) {
        const file = selectedFacilityImages[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${newId}_${Date.now()}_${i}.${fileExt}`;
        const filePath = `facilities/${fileName}`;

        const { error: uploadErr } = await supabaseClient
          .storage
          .from('facility-images')
          .upload(filePath, file);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabaseClient
          .storage
          .from('facility-images')
          .getPublicUrl(filePath);

        uploadedImageUrls.push(urlData.publicUrl);
      }
    }

    const randomColor = `oklch(${Math.floor(45 + Math.random() * 15)}% 0.12 ${Math.floor(Math.random() * 360)})`;

    // 💡 บันทึก owner_id ผูกกับบัญชีผู้สร้างสนามทันที
    const { error: insertErr } = await supabaseClient.from('facilities').insert([{
      id: newId,
      owner_id: currentUser?.id || null,
      name: name,
      sport: sport,
      price: price,
      status: status,
      province: province,
      map_url: mapUrl,
      color: randomColor,
      images: uploadedImageUrls,
      description: description,
      amenities: selectedAmenities,
      bank_name: bankName,
      bank_account: bankAccount,
      account_name: accountName,
    }]);

    if (insertErr) throw insertErr;

    alert('เพิ่มสนามกีฬาเรียบร้อยแล้ว!');
    nameInput.value = '';
    priceInput.value = '';
    if (provinceInput) provinceInput.value = '';
    if (mapUrlInput) mapUrlInput.value = '';
    selectedFacilityImages = [];
    renderFacilityImagePreview();

    closeModal('addFacilityModal');
    await fetchFacilities('all');
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalBtnText;
    }
  }
}

// 5. หน้า Payments: เจ้าของสนาม (owner) เห็นและอนุมัติเฉพาะบิลของสนามตัวเอง ส่วน admin เห็นทุกสนาม
async function renderPaymentsTable() {
  const tbody = document.getElementById('paymentsTable');
  if (!tbody) return;

  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const myFacilities = getMyManagedFacilities();
  const myFacilityIds = myFacilities.map(f => String(f.id));

  // อัปเดตดรอปดาวน์ตัวกรองสนามในหน้า Payments ให้แสดงเฉพาะสนามที่ตัวเองมีสิทธิ์ดูแล
  const facSelect = document.getElementById('paymentFilterFacility');
  if (facSelect) {
    const prevVal = facSelect.value || 'all';
    facSelect.innerHTML = '<option value="all">🏟️ แสดงทุกสนามในความดูแล</option>' +
      myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    if (prevVal === 'all' || myFacilityIds.includes(String(prevVal))) {
      facSelect.value = prevVal;
    } else {
      facSelect.value = 'all';
    }
  }
  const selectedFacId = facSelect ? facSelect.value : 'all';

  if (myFacilityIds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-tertiary);">คุณยังไม่มีสนามกีฬาในความดูแล</td></tr>`;
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px;">กำลังโหลดรายการ...</td></tr>';

  const { data: allBookings, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .in('facility_id', myFacilityIds)
    .order('created_at', { ascending: false });

  if (error || !allBookings || allBookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่มีรายการในสถานะ ${currentPaymentFilter.toUpperCase()}</td></tr>`;
    return;
  }

  const allBills = groupBookingsIntoBills(allBookings);
  const bills = allBills.filter(b => {
    const matchStatus = b.payment_status === currentPaymentFilter;
    const matchFacility = (selectedFacId === 'all') || (String(b.facility_id) === String(selectedFacId));
    return matchStatus && matchFacility;
  });

  if (bills.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่มีรายการสำหรับเงื่อนไขที่เลือก</td></tr>`;
    return;
  }

  tbody.innerHTML = bills.map(bill => {
    const facility = (typeof FACILITIES !== 'undefined' ? FACILITIES.find(f => f.id === bill.facility_id) : null) || { name: 'สนามกีฬา' };
    const statusLower = (bill.payment_status || '').toLowerCase();

    const slotListHtml = bill.slots.map(s => {
      const isDone = s.status === 'completed';
      return `<span style="display:inline-block; background:${isDone ? '#dbeafe' : '#f1f5f9'}; color:${isDone ? '#1d4ed8' : '#334155'}; padding:2px 6px; border-radius:4px; font-size:0.74rem; font-weight:600; margin:2px 4px 2px 0;">${isDone ? '✓ ' : ''}${s.start}-${s.end}</span>`;
    }).join('');

    let actionButtons =
      '<button onclick="openBookingTicketModal(\'' + bill.groupId + '\', true)" class="btn" style="background:#e2e8f0; color:#1e293b; padding:5px 10px; border-radius:4px; font-size:0.76rem;">ดูบิล / เช็คอินแยกช่วง</button>';

    if (statusLower === 'pending') {
      actionButtons +=
        '<button onclick="processGroupBookingStatus(\'' + bill.groupId + '\', \'approved\')" class="btn" style="background:#22c55e; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">อนุมัติ (' + bill.slots.length + ' ชม.)</button>' +
        '<button onclick="processGroupBookingStatus(\'' + bill.groupId + '\', \'rejected\')" class="btn" style="background:#ef4444; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">ปฏิเสธ</button>';
    } else if (statusLower === 'approved') {
      const remaining = bill.slots.filter(s => s.status === 'approved').length;
      if (remaining > 0) {
        actionButtons +=
          '<button onclick="confirmGroupCheckIn(\'' + bill.groupId + '\')" class="btn" style="background:#2563eb; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">✅ เช็คอินทั้งหมด (' + remaining + ' ชม.)</button>';
      }
    }

    const statusBadgeHtml = bill.isPartiallyCheckedIn
      ? `<span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:12px; font-size:0.72rem; font-weight:700;">ใช้แล้ว ${bill.completedCount}/${bill.totalSlots}</span>`
      : `<span class="status-badge ${statusLower}">${statusLower.toUpperCase()}</span>`;

    const slipCellHtml = (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_'))
      ? '<button type="button" onclick="previewSlipModal(\'' + String(bill.slip_url).trim() + '\')" style="background:none; border:none; color:var(--primary); text-decoration:underline; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.85rem;">🖼️ ดูสลิป</button>'
      : '<span style="color:var(--text-tertiary); font-size:0.78rem;">จองผ่านแอดมิน</span>';

    return `
      <tr>
        <td>
          <strong style="cursor:pointer; color:var(--primary);" onclick="openBookingTicketModal('${bill.groupId}', true)">#${String(bill.groupId).slice(0, 8)}</strong>
          <div style="font-size:0.72rem; color:var(--text-tertiary);">${bill.slots.length} ช่วงเวลา</div>
        </td>
        <td>
          <strong>${bill.customer_name}</strong>
          <div style="font-size:0.78rem; color:var(--text-secondary);">📞 ${bill.customer_phone}</div>
        </td>
        <td>
          <strong>${facility.name}</strong>
          <div style="font-size:0.78rem; color:var(--text-secondary);">📅 ${bill.date}</div>
          <div style="margin-top:2px;">${slotListHtml}</div>
        </td>
        <td><strong style="color:var(--primary);">฿${bill.total_price.toLocaleString()}</strong></td>
        <td>${slipCellHtml}</td>
        <td>${statusBadgeHtml}</td>
        <td><div style="display:flex; gap:6px; flex-wrap:wrap;">${actionButtons}</div></td>
      </tr>
    `;
  }).join('');
}

// 6. หน้า Slot Management: ให้เลือกจัดการตารางเวลาเฉพาะสนามของตัวเอง (ส่วน admin เลือกได้ทุกสนาม)
async function initSlotManagement() {
  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const myFacilities = getMyManagedFacilities();
  const facSelect = document.getElementById('slotManageFacility');
  const container = document.getElementById('adminDailyScheduleList');

  if (facSelect) {
    if (myFacilities.length === 0) {
      facSelect.innerHTML = '<option value="">-- ยังไม่มีสนามในความดูแล --</option>';
      if (container) {
        container.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:24px;">คุณยังไม่มีสนามกีฬาในความดูแล กรุณาเพิ่มสนามที่เมนู Facilities ก่อนครับ</p>';
      }
      return;
    }
    const currentVal = facSelect.value;
    facSelect.innerHTML = myFacilities.map(f => `<option value="${f.id}">${f.name} (฿${f.price}/ชม.)</option>`).join('');
    if (currentVal && myFacilities.some(f => f.id === currentVal)) {
      facSelect.value = currentVal;
    }
  }

  const dateInput = document.getElementById('slotManageDate');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const startSelectors = ['walkinStartTime', 'blockStartTime'];
  const endSelectors = ['walkinEndTime', 'blockEndTime'];

  startSelectors.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length === 0) {
      let opts = '';
      for (let h = 6; h <= 21; h++) {
        const t = `${h.toString().padStart(2, '0')}:00`;
        opts += `<option value="${t}">${t}</option>`;
      }
      el.innerHTML = opts;
    }
  });

  endSelectors.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length === 0) {
      let opts = '';
      for (let h = 7; h <= 22; h++) {
        const t = `${h.toString().padStart(2, '0')}:00`;
        opts += `<option value="${t}">${t}</option>`;
      }
      el.innerHTML = opts;
    }
  });

  await loadSlotManagementData();
}

// 7. หน้า Dashboard: เจ้าของสนาม (owner) เห็นยอดรายได้เฉพาะสนามของตัวเอง ส่วน admin เห็นยอดรวมทั้งระบบ
// ============================================================================
// ADMIN REAL-TIME MULTI-COURT MATRIX & DASHBOARD STATS
// ============================================================================

let currentMatrixDate = new Date();
let currentMatrixTimeRange = 'evening'; // 'evening' (16:00-22:00), 'morning' (08:00-16:00), 'all' (06:00-23:00)
let currentMatrixCourtFilter = 'all';
let currentMatrixBookingsCache = [];
let currentMatrixBlocksCache = [];

function formatYMD(d) {
  if (!d) return '';
  const dateObj = (d instanceof Date) ? d : new Date(d);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatThaiDateDisplay(d) {
  if (!d) return '';
  const dateObj = (d instanceof Date) ? d : new Date(d);
  const monthsThai = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const day = dateObj.getDate();
  const month = monthsThai[dateObj.getMonth()];
  const yearBE = dateObj.getFullYear() + 543;
  return `${day} ${month} ${yearBE}`;
}

// 1. ตัวควบคุมตัวกรองรายงาน (วัน / เดือน / ปี / กำหนดเอง)
function handleReportPeriodChange() {
  const periodType = document.getElementById('dashReportPeriodType')?.value || 'monthly';
  const dailyWrap = document.getElementById('dashDailyPickerWrap');
  const monthWrap = document.getElementById('dashMonthPickerWrap');
  const yearWrap = document.getElementById('dashYearPickerWrap');
  const customStartWrap = document.getElementById('dashCustomStartWrap');
  const customEndWrap = document.getElementById('dashCustomEndWrap');

  if (dailyWrap) dailyWrap.style.display = (periodType === 'daily') ? 'block' : 'none';
  if (monthWrap) monthWrap.style.display = (periodType === 'monthly') ? 'block' : 'none';
  if (yearWrap) yearWrap.style.display = (periodType === 'monthly' || periodType === 'yearly') ? 'block' : 'none';
  if (customStartWrap) customStartWrap.style.display = (periodType === 'custom') ? 'block' : 'none';
  if (customEndWrap) customEndWrap.style.display = (periodType === 'custom') ? 'block' : 'none';

  if (periodType === 'daily') {
    const dailyInput = document.getElementById('dashRealtimeDate');
    if (dailyInput && !dailyInput.value) dailyInput.value = formatYMD(new Date());
  }

  renderDashboardStats();
}

function resetDashboardFilters() {
  const periodType = document.getElementById('dashReportPeriodType');
  const facSelect = document.getElementById('dashFilterFacility');
  const startInput = document.getElementById('dashFilterStartDate');
  const endInput = document.getElementById('dashFilterEndDate');
  if (periodType) periodType.value = 'monthly';
  if (facSelect) facSelect.value = 'all';
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  handleReportPeriodChange();
}

// 2. ฟังก์ชันหลักสำหรับคำนวณและแสดงผล Dashboard
async function renderDashboardStats() {
  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const myFacilities = getMyManagedFacilities();
  const myFacilityIds = myFacilities.map(f => String(f.id));

  // เติมรายชื่อสนามลงในดรอปดาวน์ของตัวกรองรายงาน
  const facSelect = document.getElementById('dashFilterFacility');
  if (facSelect) {
    const currentVal = facSelect.value || 'all';
    facSelect.innerHTML = '<option value="all">🏟️ รวมทุกสนามในความดูแล</option>' +
      myFacilities.map(f => `<option value="${f.id}">${f.name} (${f.sport || '-'})</option>`).join('');
    if (currentVal === 'all' || myFacilityIds.includes(String(currentVal))) {
      facSelect.value = currentVal;
    } else {
      facSelect.value = 'all';
    }
  }

  const selectedFacId = facSelect ? facSelect.value : 'all';
  const periodType = document.getElementById('dashReportPeriodType')?.value || 'monthly';
  const todayYMD = formatYMD(new Date());

  // คำนวณช่วงวันที่ตามตัวกรองที่เลือก
  let filterStartDate = '';
  let filterEndDate = '';

  if (periodType === 'daily') {
    const dailyVal = document.getElementById('dashRealtimeDate')?.value || todayYMD;
    filterStartDate = dailyVal;
    filterEndDate = dailyVal;
  } else if (periodType === 'monthly') {
    const month = document.getElementById('dashReportMonth')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
    const year = document.getElementById('dashReportYear')?.value || String(new Date().getFullYear());
    filterStartDate = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    filterEndDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  } else if (periodType === 'yearly') {
    const year = document.getElementById('dashReportYear')?.value || String(new Date().getFullYear());
    filterStartDate = `${year}-01-01`;
    filterEndDate = `${year}-12-31`;
  } else if (periodType === 'custom') {
    filterStartDate = document.getElementById('dashFilterStartDate')?.value || '';
    filterEndDate = document.getElementById('dashFilterEndDate')?.value || '';
  }

  // ดึงข้อมูลการจองทั้งหมดที่เกี่ยวข้องจาก Supabase
  let list = [];
  if (myFacilityIds.length > 0) {
    let query = supabaseClient.from('bookings').select('*').in('facility_id', myFacilityIds);

    if (selectedFacId && selectedFacId !== 'all') {
      query = query.eq('facility_id', selectedFacId);
    }
    if (filterStartDate) {
      query = query.gte('date', filterStartDate);
    }
    if (filterEndDate) {
      query = query.lte('date', filterEndDate);
    }

    const { data: bookings, error } = await query;
    if (!error && bookings) {
      list = bookings;
    }
  }

  // คำนวณสถิติ
  let totalRevenue = 0;
  let pendingSlots = 0;
  let completedSlots = 0;
  let activeBookingsCount = 0;
  let cancelledSlotsCount = 0;

  const sportRevenueMap = {
    football: 0,
    badminton: 0,
    basketball: 0,
    futsal: 0,
    volleyball: 0
  };

  const facilityStatMap = {};
  myFacilities.forEach(f => {
    facilityStatMap[f.id] = { name: f.name, approvedCount: 0, cancelCount: 0, revenue: 0 };
  });

  list.forEach(b => {
    const st = (b.payment_status || '').toLowerCase();
    const price = Number(b.total_price || 0);
    const facId = String(b.facility_id);

    if (st === 'rejected') {
      cancelledSlotsCount++;
      if (facilityStatMap[facId]) facilityStatMap[facId].cancelCount++;
    } else {
      activeBookingsCount++;
      if (st === 'pending') pendingSlots++;
      if (st === 'completed') completedSlots++;

      if (st === 'approved' || st === 'completed') {
        totalRevenue += price;
        if (facilityStatMap[facId]) {
          facilityStatMap[facId].approvedCount++;
          facilityStatMap[facId].revenue += price;
        }

        const fac = FACILITIES.find(f => String(f.id) === facId);
        const sportKey = (fac?.sport || '').toLowerCase();
        if (sportRevenueMap[sportKey] !== undefined) {
          sportRevenueMap[sportKey] += price;
        } else if (sportKey) {
          sportRevenueMap[sportKey] = (sportRevenueMap[sportKey] || 0) + price;
        }
      }
    }
  });

  // ดึงข้อมูลสำหรับ "ผู้ใช้บริการวันนี้" แบบ Real-time
  let todayUsersCount = 0;
  let todaySlotsCount = 0;
  try {
    const { data: todayBookings } = await supabaseClient
      .from('bookings')
      .select('customer_name, customer_phone, payment_status')
      .in('facility_id', myFacilityIds)
      .eq('date', todayYMD)
      .neq('payment_status', 'rejected');

    if (todayBookings) {
      todaySlotsCount = todayBookings.length;
      const uniqueNames = new Set(todayBookings.map(b => (b.customer_name || b.customer_phone || '').trim()).filter(Boolean));
      todayUsersCount = uniqueNames.size || todaySlotsCount;
    }
  } catch (e) {
    console.warn('Error fetching today stats:', e);
  }

  // อัปเดตการ์ดสรุปสถิติทั้ง 5 มิติ
  const revEl = document.getElementById('dashTotalRevenue');
  const compSubEl = document.getElementById('dashCompletedSubText');
  const todayUsersEl = document.getElementById('dashTodayUsersCount');
  const todaySlotsSubEl = document.getElementById('dashTodaySlotsSubText');
  const totalEl = document.getElementById('dashTotalBookings');
  const totalBillsSubEl = document.getElementById('dashTotalBillsSubText');
  const pendEl = document.getElementById('dashPendingBookings');
  const compEl = document.getElementById('dashCompletedBookings');
  const cancelEl = document.getElementById('dashCancelledBookings');
  const cancelRateSubEl = document.getElementById('dashCancelRateSubText');

  if (revEl) revEl.textContent = '฿' + totalRevenue.toLocaleString();
  if (compSubEl) compSubEl.textContent = `เข้าใช้งานแล้ว ${completedSlots.toLocaleString()} ชม.`;
  if (todayUsersEl) todayUsersEl.textContent = `${todayUsersCount.toLocaleString()} ราย`;
  if (todaySlotsSubEl) todaySlotsSubEl.textContent = `จองวันนี้รวม ${todaySlotsCount.toLocaleString()} ช่วงเวลา`;
  if (totalEl) totalEl.textContent = `${activeBookingsCount.toLocaleString()} ชม.`;
  if (totalBillsSubEl) totalBillsSubEl.textContent = `จากทั้งหมด ${list.length.toLocaleString()} รายการ`;
  if (pendEl) pendEl.textContent = `${pendingSlots.toLocaleString()} ชม.`;
  if (compEl) compEl.textContent = completedSlots.toLocaleString();
  if (cancelEl) cancelEl.textContent = `${cancelledSlotsCount.toLocaleString()} ครั้ง`;

  const totalAllAttempts = (activeBookingsCount + cancelledSlotsCount);
  const cancelRate = totalAllAttempts > 0 ? ((cancelledSlotsCount / totalAllAttempts) * 100).toFixed(1) : 0;
  if (cancelRateSubEl) cancelRateSubEl.textContent = `อัตราการยกเลิก ${cancelRate}%`;

  // อัปเดตกราฟรายได้แยกตามประเภทกีฬา
  const labels = ['Football', 'Badminton', 'Basketball', 'Futsal', 'Volleyball'];
  const dataPoints = labels.map(l => sportRevenueMap[l.toLowerCase()] || 0);

  const ctx3 = document.getElementById('revenueChart');
  if (ctx3 && typeof Chart !== 'undefined') {
    if (window.revenueChartInstance) {
      window.revenueChartInstance.data.datasets[0].data = dataPoints;
      window.revenueChartInstance.update();
    } else {
      window.revenueChartInstance = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'รายได้ (฿)',
            data: dataPoints,
            backgroundColor: ['#16a34a', '#2563eb', '#f59e0b', '#ec4899', '#8b5cf6'],
            borderRadius: 8,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            y: { grid: { display: false } }
          }
        }
      });
    }
  }

  // อัปเดตตารางสรุปรายงานแยกตามสนามกีฬา
  const summaryTableBody = document.getElementById('dashReportSummaryTable');
  if (summaryTableBody) {
    const rowsHtml = Object.values(facilityStatMap).map(item => `
      <tr>
        <td><strong>${item.name}</strong></td>
        <td><span style="color:#16a34a; font-weight:700;">${item.approvedCount} ชม.</span></td>
        <td><span style="color:#dc2626; font-weight:600;">${item.cancelCount} ครั้ง</span></td>
        <td><strong style="color:var(--primary);">฿${item.revenue.toLocaleString()}</strong></td>
      </tr>
    `).join('');
    summaryTableBody.innerHTML = rowsHtml || '<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่พบข้อมูลสำหรับช่วงเวลานี้</td></tr>';
  }

  // อัปเดตระบบจัดการด่วน (Quick Action Queue)
  const quickListEl = document.getElementById('dashQuickActionsList');
  if (quickListEl) {
    const pendingList = list.filter(b => (b.payment_status || '').toLowerCase() === 'pending').slice(0, 5);
    if (pendingList.length === 0) {
      quickListEl.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-tertiary); background:#f8fafc; border-radius:10px; font-size:0.85rem;">✅ ไม่มีรายการรอตรวจสอบสลิปในขณะนี้ ทุกรายการได้รับการยืนยันเรียบร้อยแล้ว</div>';
    } else {
      quickListEl.innerHTML = pendingList.map(b => {
        const fac = FACILITIES.find(f => String(f.id) === String(b.facility_id));
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#fff; border:1px solid #fed7aa; border-radius:10px; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:700; font-size:0.9rem; color:#1e293b;">${b.customer_name || 'ลูกค้า'} <span style="font-size:0.75rem; background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:10px; margin-left:6px;">รอตรวจสลิป</span></div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">🏟️ ${fac?.name || 'สนามกีฬา'} | 📅 ${b.date} (${b.start_time} - ${b.end_time} น.) | 💰 ฿${Number(b.total_price || 0).toLocaleString()}</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn" style="background:#16a34a; color:white; padding:6px 12px; font-size:0.78rem;" onclick="quickMatrixApprove('${b.id}')">✅ อนุมัติสลิป</button>
              <button type="button" class="btn" style="background:#fee2e2; color:#ef4444; padding:6px 12px; font-size:0.78rem;" onclick="quickMatrixReject('${b.id}')">❌ ปฏิเสธ</button>
              <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:0.78rem;" onclick="openMatrixSlotModal('${b.id}', '${b.facility_id}', '${b.start_time}', '${b.end_time}')">🔍 ดูข้อมูล</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // เรียกแสดงตารางจองและสถานะสนามแบบ Real-time
  await renderMultiCourtMatrix();
}

// ============================================================================
// 3. ฟังก์ชันตารางสถานะทุกสนามแบบ REAL-TIME MATRIX (ตรงตามแบบของ USER)
// ============================================================================

function changeMatrixDate(delta) {
  const current = new Date(currentMatrixDate);
  current.setDate(current.getDate() + delta);
  currentMatrixDate = current;
  renderMultiCourtMatrix();
}

function setMatrixDateToday() {
  currentMatrixDate = new Date();
  renderMultiCourtMatrix();
}

function syncMatrixDate(val) {
  if (!val) return;
  const parts = val.split('-');
  if (parts.length === 3) {
    currentMatrixDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    renderMultiCourtMatrix();
  }
}

function setMatrixTimeRange(range, btn) {
  currentMatrixTimeRange = range;
  document.querySelectorAll('.timerange-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMultiCourtMatrix();
}

function handleMatrixCourtFilterChange(val) {
  currentMatrixCourtFilter = val;
  renderMultiCourtMatrix();
}

function getSportColor(sport) {
  const s = (sport || '').toLowerCase();
  if (s.includes('badminton') || s.includes('แบด')) return '#10b981'; // Green
  if (s.includes('futsal') || s.includes('ฟุตซอล')) return '#3b82f6'; // Blue
  if (s.includes('football') || s.includes('ฟุตบอล')) return '#059669'; // Emerald
  if (s.includes('basket') || s.includes('บาส')) return '#f59e0b'; // Amber
  if (s.includes('volley') || s.includes('วอลเลย์')) return '#ec4899'; // Pink
  return '#10b981';
}

async function renderMultiCourtMatrix() {
  const container = document.getElementById('dashMultiCourtMatrix');
  if (!container) return;

  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const myFacilities = getMyManagedFacilities();
  if (myFacilities.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-tertiary);">ไม่พบสนามกีฬาในความดูแลของคุณ</div>';
    return;
  }

  const targetDateStr = formatYMD(currentMatrixDate);
  const isToday = (targetDateStr === formatYMD(new Date()));

  // อัปเดต Date Picker และหัวเรื่อง
  const dateInput = document.getElementById('dashMatrixDatePicker');
  if (dateInput) dateInput.value = targetDateStr;

  const titleEl = document.getElementById('matrixSectionTitle');
  if (titleEl) {
    titleEl.textContent = isToday
      ? 'ตารางจองและสถานะสนามวันนี้'
      : `ตารางจองและสถานะสนาม (${formatThaiDateDisplay(currentMatrixDate)})`;
  }

  // อัปเดตดรอปดาวน์เลือกสนาม
  const courtFilterSelect = document.getElementById('dashMatrixCourtFilter');
  if (courtFilterSelect) {
    const curFilterVal = currentMatrixCourtFilter || 'all';
    courtFilterSelect.innerHTML = `<option value="all">แสดงสนามทั้งหมด (${myFacilities.length} สนาม)</option>` +
      myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    courtFilterSelect.value = curFilterVal;
  }

  // กรองสนามตามที่ผู้ใช้เลือก
  const displayedFacilities = (currentMatrixCourtFilter === 'all')
    ? myFacilities
    : myFacilities.filter(f => String(f.id) === String(currentMatrixCourtFilter));

  // กำหนดช่วงเวลา (Time Slots)
  let hours = [];
  if (currentMatrixTimeRange === 'evening') {
    // 16:00 - 22:00 (ตรงตามแบบในรูปของ USER 100%)
    hours = [16, 17, 18, 19, 20, 21];
  } else if (currentMatrixTimeRange === 'morning') {
    // 08:00 - 16:00
    hours = [8, 9, 10, 11, 12, 13, 14, 15];
  } else {
    // ทั้งวัน 06:00 - 23:00
    hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  }

  // ดึงข้อมูลการจองจริงของวันนี้จาก Supabase
  let bookings = [];
  let timeBlocks = [];

  try {
    const myFacIds = myFacilities.map(f => String(f.id));
    const [bRes, tbRes] = await Promise.all([
      supabaseClient.from('bookings').select('*').in('facility_id', myFacIds).eq('date', targetDateStr),
      supabaseClient.from('time_blocks').select('*').in('facility_id', myFacIds).eq('date', targetDateStr)
    ]);
    if (bRes.data) bookings = bRes.data;
    if (tbRes.data) timeBlocks = tbRes.data;
  } catch (err) {
    console.warn('Error fetching matrix bookings from Supabase:', err);
  }

  currentMatrixBookingsCache = bookings;
  currentMatrixBlocksCache = timeBlocks;

  // สร้างส่วนหัวตาราง (Table Header)
  let tableHtml = `
    <table class="matrix-table">
      <thead>
        <tr>
          <th class="th-court">สนาม / เวลา</th>
          ${hours.map(h => `<th>${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  // สร้างแถวของแต่ละสนาม
  displayedFacilities.forEach(fac => {
    const dotColor = getSportColor(fac.sport);

    tableHtml += `
      <tr>
        <td class="td-court">
          <span class="court-dot" style="background:${dotColor};"></span>
          <span>${fac.name}</span>
        </td>
    `;

    hours.forEach(hourNum => {
      const startSlotStr = `${String(hourNum).padStart(2, '0')}:00`;
      const endSlotStr = `${String(hourNum + 1).padStart(2, '0')}:00`;

      // ค้นหาว่ามีคนจองเวลานี้หรือไม่
      const matchingBookings = bookings.filter(b => {
        if (String(b.facility_id) !== String(fac.id)) return false;
        const bStart = parseInt(b.start_time);
        const bEnd = parseInt(b.end_time);
        return hourNum >= bStart && hourNum < bEnd;
      });

      // คัดเลือกรายการจองที่แอคทีฟ (ถ้ามีทั้งรายการจองสำเร็จและรายการยกเลิก ให้เอาอันที่แอคทีฟขึ้นก่อน)
      let activeBooking = matchingBookings.find(b => (b.payment_status || '').toLowerCase() !== 'rejected');
      let rejectedBooking = matchingBookings.find(b => (b.payment_status || '').toLowerCase() === 'rejected');
      const targetBooking = activeBooking || rejectedBooking;

      // ค้นหาว่ามีการปิดปรับปรุงหรือไม่
      const isBlocked = timeBlocks.find(tb => {
        if (String(tb.facility_id) !== String(fac.id)) return false;
        const tbStart = parseInt(tb.blocked_start);
        const tbEnd = parseInt(tb.blocked_end);
        return hourNum >= tbStart && hourNum < tbEnd;
      });

      if (targetBooking) {
        const status = (targetBooking.payment_status || 'approved').toLowerCase();
        const custName = (targetBooking.customer_name || 'ลูกค้า').trim();
        const custPhone = targetBooking.customer_phone || '';
        const price = Number(targetBooking.total_price || 0);

        if (status === 'completed') {
          // เช็กอินแล้ว
          tableHtml += `
            <td>
              <button type="button" class="matrix-slot-pill slot-booked" 
                onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')"
                title="${custName} (เช็กอินแล้ว) | โทร: ${custPhone} | ฿${price}">
                ${custName} (เช็กอิน)
              </button>
            </td>
          `;
        } else if (status === 'approved') {
          // จองแล้ว (อนุมัติสลิปแล้ว)
          tableHtml += `
            <td>
              <button type="button" class="matrix-slot-pill slot-booked" 
                onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')"
                title="${custName} (จองแล้ว) | โทร: ${custPhone} | ฿${price}">
                ${custName}
              </button>
            </td>
          `;
        } else if (status === 'pending') {
          // รอตรวจสลิป
          tableHtml += `
            <td>
              <button type="button" class="matrix-slot-pill slot-pending" 
                onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')"
                title="${custName} (รอตรวจสลิป) | โทร: ${custPhone} | ฿${price}">
                ${custName} (รอสลิป)
              </button>
            </td>
          `;
        } else if (status === 'rejected') {
          // ยกเลิก
          tableHtml += `
            <td>
              <button type="button" class="matrix-slot-pill slot-cancelled" 
                onclick="openMatrixSlotModal('${targetBooking.id}', '${fac.id}', '${startSlotStr}', '${endSlotStr}')"
                title="ยกเลิกโดย ${custName} | คลิกเพื่อดูข้อมูลหรือจองแทน">
                ยกเลิก
              </button>
            </td>
          `;
        }
      } else if (isBlocked) {
        // ปิดปรับปรุง
        tableHtml += `
          <td>
            <button type="button" class="matrix-slot-pill slot-blocked" 
              onclick="alert('⛔ สนามนี้ถูกปิดปรับปรุงชั่วคราว: ${(isBlocked.reason || 'ปิดการใช้งาน')}')"
              title="ปิดปรับปรุง: ${(isBlocked.reason || '')}">
              ปิดปรับปรุง
            </button>
          </td>
        `;
      } else {
        // สนามว่าง (สามารถคลิกเพื่อจองหน้างานได้ทันที)
        tableHtml += `
          <td>
            <button type="button" class="matrix-slot-pill slot-available" 
              onclick="openMatrixWalkInModal('${fac.id}', '${startSlotStr}', '${endSlotStr}')"
              title="สนามว่าง - คลิกเพื่อจองหน้างาน (Walk-in)">
              ว่าง
            </button>
          </td>
        `;
      }
    });

    tableHtml += `</tr>`;
  });

  tableHtml += `</tbody></table>`;
  container.innerHTML = tableHtml;
}

// 4. Modal ดูรายละเอียดสล็อตและการจอง (Slot Details Modal)
function openMatrixSlotModal(bookingId, facilityId, startSlotStr, endSlotStr) {
  const booking = (currentMatrixBookingsCache || []).find(b => String(b.id) === String(bookingId));
  const facility = (FACILITIES || []).find(f => String(f.id) === String(facilityId)) || { name: 'สนามกีฬา' };

  if (!booking) {
    alert('ไม่พบข้อมูลการจองนี้');
    return;
  }

  const modal = document.getElementById('slotDetailModal');
  const body = document.getElementById('slotDetailBody');
  const footer = document.getElementById('slotDetailFooter');
  const title = document.getElementById('slotModalTitle');
  if (!modal || !body || !footer) return;

  const status = (booking.payment_status || 'approved').toLowerCase();
  let statusBadgeHtml = '';
  if (status === 'completed') {
    statusBadgeHtml = '<span style="background:#dbeafe; color:#1d4ed8; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">✓ เช็กอินเข้าใช้งานแล้ว</span>';
  } else if (status === 'approved') {
    statusBadgeHtml = '<span style="background:#dcfce7; color:#15803d; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">● จองแล้ว (สลิปผ่านการอนุมัติ)</span>';
  } else if (status === 'pending') {
    statusBadgeHtml = '<span style="background:#fef9c3; color:#a16207; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">⏳ รอตรวจสลิปโอนเงิน</span>';
  } else if (status === 'rejected') {
    statusBadgeHtml = '<span style="background:#fee2e2; color:#ef4444; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.8rem;">✕ ถูกปฏิเสธ / ยกเลิก</span>';
  }

  if (title) title.textContent = `รายละเอียดการจอง: ${facility.name}`;

  const customerName = booking.customer_name || 'ไม่ระบุชื่อ';
  const customerPhone = booking.customer_phone || '-';
  const price = Number(booking.total_price || 0);

  let addonsHtml = '';
  if (booking.addons) {
    let addonsList = booking.addons;
    if (typeof addonsList === 'string') {
      try { addonsList = JSON.parse(addonsList); } catch (e) { addonsList = []; }
    }
    if (Array.isArray(addonsList) && addonsList.length > 0) {
      addonsHtml = `
        <div style="margin-top:12px; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:0.82rem;">
          <strong style="color:#334155;">📦 อุปกรณ์เสริมที่เลือก:</strong>
          <ul style="margin:4px 0 0 18px; padding:0;">
            ${addonsList.map(a => `<li>${a.name} (${a.type}) x ${a.qty} = ฿${(Number(a.price || 0) * Number(a.qty || 1)).toLocaleString()}</li>`).join('')}
          </ul>
        </div>
      `;
    }
  }

  let slipHtml = '';
  if (booking.slip_url && booking.slip_url !== 'walk-in') {
    const safeSlip = String(booking.slip_url).trim();
    slipHtml = `
      <div style="margin-top:14px; padding:12px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
        <div style="font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:8px;">🖼️ หลักฐานการโอนเงิน (สลิป):</div>
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${safeSlip}" alt="Slip" style="width:75px; height:75px; object-fit:cover; border-radius:8px; cursor:pointer; border:1px solid #cbd5e1;" onclick="previewSlipModal('${safeSlip}')">
          <div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">แตะที่รูปเพื่อดูรูปสลิปขนาดเต็ม</div>
            <button type="button" class="btn" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:4px 10px; font-size:0.75rem; border-radius:6px; margin-top:4px;" onclick="previewSlipModal('${safeSlip}')">🔍 เปิดดูสลิปขนาดใหญ่</button>
          </div>
        </div>
      </div>
    `;
  } else if (booking.slip_url === 'walk-in') {
    slipHtml = `<div style="margin-top:10px; font-size:0.8rem; color:#15803d; font-weight:600;">💵 รายการนี้เป็นการจองหน้างาน (Walk-in / ชำระตรงกับสนาม)</div>`;
  }

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px dashed #e2e8f0; padding-bottom:12px;">
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">รหัสการจอง (ID)</div>
        <div style="font-size:0.85rem; font-weight:700; color:#1e293b;">#${booking.id}</div>
      </div>
      <div>${statusBadgeHtml}</div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; font-size:0.88rem;">
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">🏟️ สนามกีฬา</div>
        <div style="font-weight:700; color:#1e293b;">${facility.name}</div>
      </div>
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">📅 วันที่ใช้งาน</div>
        <div style="font-weight:700; color:#1e293b;">${booking.date}</div>
      </div>
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">⏰ ช่วงเวลา</div>
        <div style="font-weight:700; color:#2563eb;">${booking.start_time} - ${booking.end_time} น.</div>
      </div>
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">💰 ยอดชำระสุทธิ</div>
        <div style="font-weight:800; color:#16a34a; font-size:1.05rem;">฿${price.toLocaleString()}</div>
      </div>
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">👤 ชื่อผู้จอง</div>
        <div style="font-weight:700; color:#1e293b;">${customerName}</div>
      </div>
      <div>
        <div style="font-size:0.75rem; color:var(--text-tertiary);">📞 เบอร์โทรศัพท์</div>
        <div style="font-weight:700; display:flex; align-items:center; gap:6px;">
          <a href="tel:${customerPhone}" style="color:#2563eb; text-decoration:none;">${customerPhone}</a>
          ${customerPhone !== '-' ? `<a href="tel:${customerPhone}" class="btn" style="padding:2px 8px; font-size:0.7rem; background:#dbeafe; color:#1d4ed8; border-radius:6px;">📞 โทร</a>` : ''}
        </div>
      </div>
    </div>

    ${addonsHtml}
    ${slipHtml}
  `;

  // ปุ่มคำสั่งในส่วน Footer
  let actionButtonsHtml = '';
  if (status === 'pending') {
    actionButtonsHtml = `
      <button type="button" class="btn" style="background:#16a34a; color:white; padding:8px 16px; font-weight:700;" onclick="quickMatrixApprove('${booking.id}')">✅ ยืนยันสลิปถูกต้อง</button>
      <button type="button" class="btn" style="background:#fee2e2; color:#ef4444; padding:8px 14px; font-weight:600;" onclick="quickMatrixReject('${booking.id}')">❌ ปฏิเสธการจอง</button>
    `;
  } else if (status === 'approved') {
    actionButtonsHtml = `
      <button type="button" class="btn" style="background:#2563eb; color:white; padding:8px 16px; font-weight:700;" onclick="quickMatrixCheckIn('${booking.id}')">📍 เช็กอินลูกค้าเข้าสนาม</button>
      <button type="button" class="btn" style="background:#fee2e2; color:#ef4444; padding:8px 14px; font-weight:600;" onclick="quickMatrixReject('${booking.id}')">❌ ยกเลิกการจอง</button>
    `;
  } else if (status === 'completed') {
    actionButtonsHtml = `
      <span style="color:#16a34a; font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; margin-right:auto;">✓ ลูกค้าเข้าใช้บริการแล้ว</span>
    `;
  }

  footer.innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="closeModal('slotDetailModal')">ปิดหน้าต่าง</button>
    ${actionButtonsHtml}
  `;

  modal.classList.add('active');
}

// 5. Modal สำหรับจองหน้างาน (Walk-in Booking)
function openMatrixWalkInModal(facilityId, startSlotStr, endSlotStr) {
  const facility = (FACILITIES || []).find(f => String(f.id) === String(facilityId));
  if (!facility) return;

  const modal = document.getElementById('walkInModal');
  if (!modal) return;

  const targetDateStr = formatYMD(currentMatrixDate);

  document.getElementById('walkInFacilityId').value = facility.id;
  document.getElementById('walkInDate').value = targetDateStr;
  document.getElementById('walkInStart').value = startSlotStr;
  document.getElementById('walkInEnd').value = endSlotStr;

  document.getElementById('walkInFacilityName').textContent = facility.name;
  document.getElementById('walkInTimeSlot').textContent = `${startSlotStr} - ${endSlotStr} น.`;
  document.getElementById('walkInDateStr').textContent = targetDateStr;

  document.getElementById('walkInPrice').value = facility.price || 0;
  document.getElementById('walkInCustomerName').value = '';
  document.getElementById('walkInCustomerPhone').value = '';
  document.getElementById('walkInPaymentMethod').value = 'cash';
  document.getElementById('walkInCheckInStatus').value = 'completed';

  modal.classList.add('active');
}

async function handleWalkInSubmit(event) {
  event.preventDefault();

  const facId = document.getElementById('walkInFacilityId').value;
  const dateStr = document.getElementById('walkInDate').value;
  const startStr = document.getElementById('walkInStart').value;
  const endStr = document.getElementById('walkInEnd').value;
  const custName = document.getElementById('walkInCustomerName').value.trim();
  const custPhone = document.getElementById('walkInCustomerPhone').value.trim();
  const price = Number(document.getElementById('walkInPrice').value) || 0;
  const checkInStatus = document.getElementById('walkInCheckInStatus').value; // 'completed' or 'approved'

  if (!custName || !custPhone) {
    alert('กรุณากรอกชื่อและเบอร์โทรศัพท์ของลูกค้า');
    return;
  }

  const submitBtn = document.getElementById('walkInSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...'; }

  try {
    const newBooking = {
      user_id: currentUser?.id || 'admin',
      facility_id: facId,
      date: dateStr,
      start_time: startStr,
      end_time: endStr,
      total_price: price,
      payment_status: checkInStatus,
      slip_url: 'walk-in',
      customer_name: custName,
      customer_phone: custPhone,
      addons: []
    };

    const { error } = await supabaseClient.from('bookings').insert([newBooking]);
    if (error) throw error;

    closeModal('walkInModal');
    alert('✅ บันทึกการจองหน้างานสำเร็จเรียบร้อยแล้ว!');
    await renderDashboardStats();
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึกการจอง: ' + err.message);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💾 บันทึกการจอง'; }
  }
}

// 6. ฟังก์ชันจัดการคำสั่งรวดเร็ว (Approve, Reject, Check-in)
async function quickMatrixApprove(bookingId) {
  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ payment_status: 'approved' })
      .eq('id', bookingId);

    if (error) throw error;

    closeModal('slotDetailModal');
    await renderDashboardStats();
  } catch (err) {
    alert('ไม่สามารถอนุมัติได้: ' + err.message);
  }
}

async function quickMatrixCheckIn(bookingId) {
  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ payment_status: 'completed' })
      .eq('id', bookingId);

    if (error) throw error;

    closeModal('slotDetailModal');
    await renderDashboardStats();
  } catch (err) {
    alert('ไม่สามารถเช็กอินได้: ' + err.message);
  }
}

async function quickMatrixReject(bookingId) {
  if (!confirm('ยืนยันที่จะปฏิเสธหรือยกเลิกการจองสล็อตเวลานี้ใช่หรือไม่?')) return;

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ payment_status: 'rejected' })
      .eq('id', bookingId);

    if (error) throw error;

    closeModal('slotDetailModal');
    await renderDashboardStats();
  } catch (err) {
    alert('ไม่สามารถยกเลิกได้: ' + err.message);
  }
}
// ============================================================================
// ระบบอุปกรณ์เสริม (Add-on Equipment) - เช่า/ซื้อ
// ============================================================================

let currentFacilityEquipment = [];
let selectedAddons = {}; // เก็บข้อมูล { id_อุปกรณ์: จำนวนที่เลือก }
let currentManageFacilityId = null;

// 1. เพิ่มปุ่ม "จัดการอุปกรณ์" ในหน้า Manage Facilities
function renderFacilitiesTable() {
  const tbody = document.getElementById('facilitiesTable');
  if (!tbody) return;
  const managedList = getMyManagedFacilities();

  if (managedList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-tertiary);">ยังไม่มีสนามกีฬาในความดูแลของคุณ</td></tr>`;
    return;
  }

  tbody.innerHTML = managedList.map(f => `
    <tr>
      <td>
        <strong>${f.name}</strong>
        <div style="font-size:0.75rem; color:var(--text-secondary);">📍 ${f.province || 'ไม่ระบุจังหวัด'}</div>
      </td>
      <td>${(f.sport || '').charAt(0).toUpperCase() + (f.sport || '').slice(1)}</td>
      <td>฿${Number(f.price || 0).toLocaleString()}</td>
      <td><span class="status-badge ${f.status === 'available' ? 'approved' : 'pending'}">${f.status}</span></td>
      <td>
        <div class="table-actions" style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn" style="background:#0f766e; color:white; padding:5px 8px; font-size:0.7rem;" onclick="openEquipmentModal('${f.id}')">📦 อุปกรณ์</button>
          <button class="approve-btn" onclick="openEditFacilityModal('${f.id}')">Edit</button>
          <button class="reject-btn" onclick="deleteFacility('${f.id}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// 2. เปิดหน้าต่างจัดการอุปกรณ์
async function openEquipmentModal(facilityId) {
  currentManageFacilityId = facilityId;
  const facility = FACILITIES.find(f => f.id === facilityId);
  document.getElementById('eqFacilityName').textContent = `สนาม: ${facility?.name || ''}`;
  
  // รีเซ็ตฟอร์ม
  document.getElementById('eqName').value = '';
  document.getElementById('eqPrice').value = '';
  document.getElementById('eqStock').value = '';
  
  await loadEquipmentList();
  document.getElementById('manageEquipmentModal').classList.add('active');
}

// โหลดรายการอุปกรณ์ของสนามนั้น (เพิ่มปุ่ม Edit)
async function loadEquipmentList() {
  const listEl = document.getElementById('equipmentList');
  listEl.innerHTML = '<div style="text-align:center; padding:16px;">กำลังโหลด...</div>';
  
  const { data, error } = await supabaseClient.from('equipment').select('*').eq('facility_id', currentManageFacilityId).order('created_at', { ascending: false });
  if (error || !data || data.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-tertiary);">ยังไม่มีอุปกรณ์เสริมสำหรับสนามนี้</div>';
    return;
  }
  
  // เก็บ data ไว้ใช้ตอน Edit
  window.currentFacilityEquipmentData = data; 

  listEl.innerHTML = data.map(eq => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #f1f5f9;">
      <div>
        <strong style="font-size:0.88rem;">${eq.name}</strong>
        <span style="font-size:0.7rem; background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:4px; margin-left:6px;">${eq.type}</span>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">฿${eq.price} | คงเหลือสุทธิ: ${eq.stock} ชิ้น</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn" style="background:#e2e8f0; color:#334155; border:none; padding:4px 10px; font-size:0.7rem; border-radius:4px;" onclick="editEquipment('${eq.id}')">แก้ไข</button>
        <button class="btn" style="background:#fee2e2; color:#ef4444; border:none; padding:4px 10px; font-size:0.7rem; border-radius:4px;" onclick="deleteEquipment('${eq.id}')">ลบ</button>
      </div>
    </div>
  `).join('');
}

// ฟังก์ชันใหม่: ดึงข้อมูลขึ้นมาแก้ไข
let isEditingEquipment = false;
let editingEquipmentId = null;

function editEquipment(eqId) {
  const eq = window.currentFacilityEquipmentData.find(e => e.id === eqId);
  if (!eq) return;

  isEditingEquipment = true;
  editingEquipmentId = eqId;

  document.getElementById('eqName').value = eq.name;
  document.getElementById('eqType').value = eq.type;
  document.getElementById('eqPrice').value = eq.price;
  document.getElementById('eqStock').value = eq.stock;

  // เปลี่ยนสีปุ่มบันทึกเป็นสีฟ้า (โหมดแก้ไข)
  const btn = document.querySelector('#manageEquipmentModal .btn-success');
  if(btn) {
      btn.textContent = '💾 บันทึกการแก้ไข';
      btn.style.background = '#2563eb'; 
  }
}

// อัปเกรดฟังก์ชันบันทึกอุปกรณ์ (ให้รองรับทั้ง Add และ Edit แบบสมบูรณ์ 100%)
async function submitNewEquipment() {
  const name = document.getElementById('eqName').value.trim();
  const type = document.getElementById('eqType').value;
  const price = parseInt(document.getElementById('eqPrice').value);
  const stock = parseInt(document.getElementById('eqStock').value);
  
  if (!name || isNaN(price) || isNaN(stock)) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง'); return;
  }
  
  let result;
  if (isEditingEquipment && editingEquipmentId) {
    // 💡 โหมดแก้ไข (Update)
    result = await supabaseClient.from('equipment')
      .update({ name: name, type: type, price: price, stock: stock })
      .eq('id', editingEquipmentId);
  } else {
    // 💡 โหมดเพิ่มใหม่ (Insert)
    result = await supabaseClient.from('equipment').insert([{
      facility_id: currentManageFacilityId,
      owner_id: currentUser?.id,
      name: name, type: type, price: price, stock: stock
    }]);
  }

  if (result && result.error) { 
      alert('เกิดข้อผิดพลาด: ' + result.error.message); 
  } else {
    // ล้างฟอร์มและรีเซ็ตสถานะ
    document.getElementById('eqName').value = '';
    document.getElementById('eqPrice').value = '';
    document.getElementById('eqStock').value = '';
    isEditingEquipment = false;
    editingEquipmentId = null;
    
    // คืนสีปุ่มกลับเป็นสีเขียว
    const btn = document.querySelector('#manageEquipmentModal .btn-success');
    if(btn) { btn.textContent = '+ บันทึกลงแคตตาล็อก'; btn.style.background = '#16a34a'; }

    alert('บันทึกข้อมูลอุปกรณ์สำเร็จ!');
    await loadEquipmentList(); // โหลดรายการใหม่มาแสดง
  }
}

// 5. ลบอุปกรณ์
async function deleteEquipment(eqId) {
  if(!confirm('ยืนยันการลบอุปกรณ์นี้?')) return;
  await supabaseClient.from('equipment').delete().eq('id', eqId);
  await loadEquipmentList();
}


// อัปเดตจำนวนอุปกรณ์ที่ลูกค้ากด + / -
function updateAddonQty(eqId, change, maxStock) {
  if (selectedSlots.length === 0) {
     alert('กรุณาเลือกช่วงเวลา (เวลาที่จะเข้าเล่น) ทางด้านซ้าย ก่อนกดเลือกเช่าอุปกรณ์ครับ');
     return;
  }

  if(!selectedAddons[eqId]) selectedAddons[eqId] = 0;
  const newQty = selectedAddons[eqId] + change;
  if(newQty >= 0 && newQty <= maxStock) {
      selectedAddons[eqId] = newQty;
      document.getElementById(`qty_${eqId}`).textContent = newQty;
      updateSummary(); 
  } else if (newQty > maxStock) {
      alert(`ขออภัยครับ ในช่วงเวลาที่คุณเลือก สินค้านี้มีสต็อกว่างให้เช่า/ซื้อเพียง ${maxStock} ชิ้น`);
  }
}


// 💡 ลิงก์ Webhook ที่คัดลอกมาจาก Make.com
const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/xu9xuayawxmdy066axbrube2rmc3v9a9';

// บันทึกการจอง แนบข้อมูล Addon และส่งตรวจสลิปผ่าน AI อัตโนมัติ
async function confirmBooking() {
  const customerName = document.getElementById('bookingCustomerName')?.value.trim();
  const customerPhone = document.getElementById('bookingCustomerPhone')?.value.trim();
  if (!customerName || !customerPhone) { alert('กรุณากรอกชื่อและเบอร์โทร'); return; }
  if (selectedSlots.length === 0) { alert('กรุณาเลือกช่วงเวลา'); return; }
  if (!selectedSlipFile) { alert('กรุณาอัปโหลดสลิป'); return; }

  const btn = document.querySelector('#view-booking .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังอัปโหลดและให้ AI ตรวจสอบสลิป...'; }

  try {
    const fileExt = selectedSlipFile.name.split('.').pop();
    const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
    const filePath = `slips/${fileName}`;
    const { error: uploadErr } = await supabaseClient.storage.from('payment-slips').upload(filePath, selectedSlipFile);
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabaseClient.storage.from('payment-slips').getPublicUrl(filePath);
    const slipUrl = urlData.publicUrl;

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    // รวบรวมอุปกรณ์ที่ลูกค้าเลือก
    const addonsToSave = [];
    let addonTotal = 0;
    for (const [eqId, qty] of Object.entries(selectedAddons)) {
      if (qty > 0) {
        const eq = currentFacilityEquipment.find(e => e.id === eqId);
        if (eq) {
          addonTotal += eq.price * qty;
          addonsToSave.push({ id: eq.id, name: eq.name, type: eq.type, price: eq.price, qty: qty });
        }
      }
    }

    const bookingInserts = selectedSlots.map((slot, index) => {
      const startHour = parseInt(slot);
      let slotPrice = selectedFacility?.price || 0;
      if (index === 0) slotPrice += addonTotal;

      return {
        user_id: currentUser.id,
        facility_id: selectedFacility.id,
        date: dateStr,
        start_time: `${startHour.toString().padStart(2, '0')}:00`,
        end_time: `${(startHour + 1).toString().padStart(2, '0')}:00`,
        total_price: slotPrice,
        payment_status: 'pending',
        slip_url: slipUrl,
        customer_name: customerName,
        customer_phone: customerPhone,
        addons: addonsToSave
      };
    });

    const { data: bookingData, error: bookingErr } = await supabaseClient.from('bookings').insert(bookingInserts).select();
    if (bookingErr) throw bookingErr;

    // หักสต็อกอุปกรณ์ประเภท 'ซื้อขาด'
    for (const addon of addonsToSave) {
      if (addon.type === 'ซื้อ') {
        const { data: eq } = await supabaseClient.from('equipment').select('stock').eq('id', addon.id).single();
        if (eq) await supabaseClient.from('equipment').update({ stock: eq.stock - addon.qty }).eq('id', addon.id);
      }
    }

    const totalAmount = (selectedSlots.length * (selectedFacility?.price || 0)) + addonTotal;
    if (bookingData && bookingData.length > 0) {
      await supabaseClient.from('payments').insert([{ booking_id: bookingData[0].id, amount: totalAmount, slip_url: slipUrl, status: 'pending' }]);
    }

    // 🤖 ส่งข้อมูลสลิปและยอดเงินไปให้ AI บน Make.com ตรวจสอบอัตโนมัติ
    if (MAKE_WEBHOOK_URL && MAKE_WEBHOOK_URL.startsWith('http')) {
      try {
        await fetch(MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_ids: (bookingData || []).map(b => b.id),
            facility_id: selectedFacility.id,
            facility_name: selectedFacility.name,
            date: dateStr,
            customer_name: customerName,
            customer_phone: customerPhone,
            slip_url: slipUrl,
            expected_amount: totalAmount,
            expected_bank: selectedFacility.bank_name || '',
            expected_account_no: selectedFacility.bank_account || '',
            expected_account_name: selectedFacility.account_name || ''
          })
        });
        // หน่วงเวลาประมาณ 4 วินาทีเพื่อให้ Make ตรวจสลิปเสร็จก่อนเปลี่ยนหน้า
        await new Promise(resolve => setTimeout(resolve, 4000));
      } catch (webhookErr) {
        console.warn('Make AI Webhook error:', webhookErr);
      }
    }

    alert('ส่งรายการจองเรียบร้อยแล้ว!');
    selectedSlots = [];
    resetSlipUploadUI();
    await renderTimeSlots();
    await renderMyBookings();
    switchView('my-bookings');

  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Booking'; }
  }
}

// อัปเกรดตัวจัดกลุ่มบิลให้ดึง Addons มาด้วย
function groupBookingsIntoBills(rawBookings) {
  const groups = {};
  (rawBookings || []).forEach(b => {
    const timeKey = b.created_at ? b.created_at.slice(0, 19) : '';
    const key = (b.slip_url && b.slip_url !== 'walk-in')
      ? `slip_${b.slip_url}_${b.facility_id}_${b.date}`
      : `group_${b.user_id}_${b.facility_id}_${b.date}_${b.customer_name || ''}_${b.customer_phone || ''}_${timeKey}`;

    if (!groups[key]) {
      groups[key] = {
        groupId: b.id, bookingIds: [], facility_id: b.facility_id, user_id: b.user_id, date: b.date,
        slots: [], total_price: 0, payment_status: b.payment_status, slip_url: b.slip_url,
        customer_name: b.customer_name || '-', customer_phone: b.customer_phone || '-',
        addons: b.addons || [] // 💡 ดึงอุปกรณ์ติดมากับบิลด้วย
      };
    }
    groups[key].bookingIds.push(b.id);
    groups[key].slots.push({ id: b.id, start: (b.start_time || '').slice(0, 5), end: (b.end_time || '').slice(0, 5), status: (b.payment_status || 'pending').toLowerCase() });
    groups[key].total_price += Number(b.total_price || 0);
  });

  return Object.values(groups).map(g => {
    g.slots.sort((a, b) => a.start.localeCompare(b.start));
    const completedCount = g.slots.filter(s => s.status === 'completed').length;
    g.completedCount = completedCount;
    g.totalSlots = g.slots.length;
    g.isAllCompleted = (completedCount === g.slots.length && g.slots.length > 0);
    g.isPartiallyCheckedIn = (completedCount > 0 && completedCount < g.slots.length);
    
    if (g.isAllCompleted) g.payment_status = 'completed';
    else if (g.slots.filter(s => s.status === 'rejected').length === g.slots.length) g.payment_status = 'rejected';
    else if (g.slots.filter(s => s.status === 'pending').length > 0) g.payment_status = 'pending';
    else if (g.slots.filter(s => s.status === 'approved').length > 0 || completedCount > 0) g.payment_status = 'approved';
    
    groupedBookingsCache[g.groupId] = g;
    return g;
  });
}

// อัปเกรดหน้าตั๋ว (E-Ticket) ให้โชว์รายการอุปกรณ์ที่ลูกค้าซื้อ
function openBookingTicketModal(groupId, isAdminView = false) {
  const bill = groupedBookingsCache[groupId];
  if (!bill) return;

  const facility = (typeof FACILITIES !== 'undefined' ? FACILITIES.find(f => f.id === bill.facility_id) : null) || { name: 'สนามกีฬา' };
  const statusLower = (bill.payment_status || 'pending').toLowerCase();
  const canManage = (currentRole === 'admin' || currentRole === 'staff' || isAdminView);

  const badge = document.getElementById('ticketStatusBadge');
  if (badge) badge.textContent = bill.isPartiallyCheckedIn ? `CHECKED-IN ${bill.completedCount}/${bill.totalSlots}` : statusLower.toUpperCase();

  const slotsListHtml = bill.slots.map((s, idx) => {
    let slotStatusHtml = '';
    if (s.status === 'completed') slotStatusHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">✓ เข้าใช้งานแล้ว</span>`;
    else if (s.status === 'approved') {
      if (canManage) slotStatusHtml = `<button class="btn" style="background:#22c55e; color:white; padding:3px 8px; font-size:0.72rem; border-radius:6px;" onclick="checkInSingleSlot('${s.id}', '${bill.groupId}')">✅ เช็คอินช่วงนี้</button>`;
      else slotStatusHtml = `<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">⏳ รอเช็คอิน</span>`;
    } else slotStatusHtml = `<span style="background:#fef9c3; color:#a16207; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">รออนุมัติสลิป</span>`;
    
    return `<div style="display:flex; justify-content:space-between; padding:8px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; font-size:0.85rem;">
      <div><span style="color:var(--text-secondary); font-size:0.78rem;">ช่วงที่ ${idx + 1}:</span><strong style="margin-left:4px;">${s.start} - ${s.end} น.</strong></div>
      ${slotStatusHtml}
    </div>`;
  }).join('');

  // 💡 สร้าง HTML แสดงรายการอุปกรณ์ที่แนบมากับบิล (ใช้การต่อ String เพื่อป้องกันบัค Template Literal)
  let addonsHtml = '';
  if (bill.addons && bill.addons.length > 0) {
    let itemsHtml = '';
    bill.addons.forEach(a => {
      itemsHtml += '<div style="display:flex; justify-content:space-between; font-size:0.85rem; border-bottom:1px dashed #fcd34d; padding:6px 0;">' +
                     '<span style="color:#92400e;">' + a.name + ' (' + a.type + ') <strong>x' + a.qty + '</strong></span>' +
                     '<span style="font-weight:700; color:#b45309;">฿' + (a.price * a.qty).toLocaleString() + '</span>' +
                   '</div>';
    });

    addonsHtml = '<div style="background:#fffbeb; padding:12px; border-radius:10px; border:1px solid #fde68a; margin-bottom:16px;">' +
                   '<h4 style="font-size:0.85rem; font-weight:600; color:#b45309; margin:0 0 8px 0;">📦 อุปกรณ์เสริมที่เลือก</h4>' +
                   itemsHtml +
                 '</div>';
  }

  const mapBtnHtml = (facility.map_url && String(facility.map_url).trim() !== '') ? `<div style="margin-bottom:14px;"><a href="${String(facility.map_url).trim()}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:6px; width:100%; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:8px 12px; border-radius:8px; font-size:0.84rem; font-weight:600; text-decoration:none;">🗺️ เปิดแผนที่นำทาง (Google Maps) ↗</a></div>` : '';

  const body = document.getElementById('bookingTicketBody');
  if (body) {
    body.innerHTML = `
      <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px dashed #cbd5e1;">
        <div style="font-size:0.78rem; color:var(--text-tertiary);">รหัสอ้างอิงบิล (Booking Ref)</div>
        <div style="font-size:0.9rem; font-weight:700;">#${bill.groupId}</div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">สนามกีฬา</div><div style="font-size:0.95rem; font-weight:700;">${facility.name}</div></div>
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">วันที่ใช้งาน</div><div style="font-size:0.95rem; font-weight:700;">${bill.date}</div></div>
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">ชื่อผู้จอง</div><div style="font-size:0.92rem; font-weight:600;">${bill.customer_name}</div></div>
        <div><div style="font-size:0.78rem; color:var(--text-tertiary);">เบอร์โทรศัพท์</div><div style="font-size:0.92rem; font-weight:600;">${bill.customer_phone}</div></div>
      </div>
      ${mapBtnHtml}
      ${addonsHtml}  <!-- 💡 แทรกรายการอุปกรณ์ตรงนี้ -->
      <div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:16px;">
        <div style="margin-bottom:8px;"><span style="font-size:0.82rem; font-weight:600;">สถานะเวลาจอง</span></div>
        ${slotsListHtml}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:2px solid #f1f5f9;">
        <span style="font-size:0.95rem; font-weight:600;">ยอดชำระรวมทั้งสิ้น</span>
        <span style="font-size:1.35rem; font-weight:800; color:var(--primary);">฿${bill.total_price.toLocaleString()}</span>
      </div>
    `;
    if (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_')) {
      body.innerHTML += `<div style="margin-top:14px; text-align:right;"><button type="button" class="btn" style="background:#fef2f2; color:var(--primary); border:1px solid #fecaca; padding:6px 12px; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer;" onclick="previewSlipModal('${String(bill.slip_url).trim()}')">🖼️ เปิดดูรูปสลิป</button></div>`;
    }
  }

  const footer = document.getElementById('bookingTicketFooter');
  if (footer) {
    const remainingSlots = bill.slots.filter(s => s.status === 'approved').length;
    let adminActions = '';
    if (canManage && remainingSlots > 0) adminActions = `<button class="btn" style="flex:1.5; background:#2563eb; color:white;" onclick="confirmGroupCheckIn('${bill.groupId}')">✅ เช็คอินทั้งบิล</button>`;
    footer.innerHTML = `<button class="btn btn-secondary" style="flex:1;" onclick="closeModal('bookingTicketModal')">ปิดหน้าต่าง</button>${adminActions}`;
  }

  document.getElementById('bookingTicketModal').classList.add('active');
}

// ============================================================================
// ระบบแยกเมนู User vs Owner เด็ดขาด + พับเก็บเมนูมือถือ + แก้ไขโปรไฟล์ผู้ใช้
// ============================================================================

// 1. แยกเมนูเด็ดขาด:
// - user: เห็นเฉพาะเมนูจองสนาม/ดูตั๋ว (Facilities, My Bookings, History, Profile)
// - owner / admin: เห็นเฉพาะเมนูดูแลสนาม (Dashboard, Manage Facilities, Payments, Slots, Profile)
function setupNav() {
  const userName = currentUser?.profile?.name || currentUser?.email || 'User';
  const avatarInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('userName').textContent = userName;
  const roleLabelMap = {
    admin: 'Admin (ดูแลระบบทั้งหมด)',
    owner: 'Owner (เจ้าของสนาม)',
    staff: 'Staff (พนักงานหน้าสนาม)',
    user: 'User (ลูกค้าทั่วไป)'
  };
  document.getElementById('userRole').textContent = roleLabelMap[currentRole] || currentRole;
  applyAvatar(document.getElementById('userAvatar'), currentUser?.profile?.avatar_url, avatarInitials);

  const isUser = (currentRole === 'user');
  const isOwnerOrAdmin = (currentRole === 'owner' || currentRole === 'admin');
  const isStaff = (currentRole === 'staff');

  const navUser = document.getElementById('navUser');
  const navUserLinks = document.getElementById('navUserLinks');
  const navAdmin = document.getElementById('navAdmin');
  const navAdminLinks = document.getElementById('navAdminLinks');
  const navStaff = document.getElementById('navStaff');
  const navStaffLinks = document.getElementById('navStaffLinks');

  // ล้างคลาส active-role-nav ก่อนกำหนดใหม่
  [navUserLinks, navAdminLinks, navStaffLinks].forEach(el => {
    if (el) el.classList.remove('active-role-nav');
  });

  // แสดงเฉพาะเมนูตามบทบาท ไม่ให้ปนกัน
  if (navUser) navUser.style.display = isUser ? 'block' : 'none';
  if (navUserLinks) {
    navUserLinks.style.display = isUser ? 'block' : 'none';
    if (isUser) navUserLinks.classList.add('active-role-nav');
  }

  if (navAdmin) navAdmin.style.display = isOwnerOrAdmin ? 'block' : 'none';
  if (navAdminLinks) {
    navAdminLinks.style.display = isOwnerOrAdmin ? 'block' : 'none';
    if (isOwnerOrAdmin) navAdminLinks.classList.add('active-role-nav');
  }

  if (navStaff) navStaff.style.display = isStaff ? 'block' : 'none';
  if (navStaffLinks) {
    navStaffLinks.style.display = isStaff ? 'block' : 'none';
    if (isStaff) navStaffLinks.classList.add('active-role-nav');
  }

  // เรียกโหลดและอัปเดตการแจ้งเตือนตาม Role ทันที
  refreshNotifications(false);
  if (!notifPollingInterval) {
    notifPollingInterval = setInterval(() => refreshNotifications(false), 25000);
  }
}

// 2. อัปเดต switchView ให้รองรับหน้า Profile
async function switchView(view) {
  currentView = view;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + view);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    if (a.dataset.view === view) a.classList.add('active');
    else a.classList.remove('active');
  });

  if (view === 'facilities') await fetchFacilities(currentSportFilter || 'all');
  if (view === 'my-bookings') await renderMyBookings();
  if (view === 'history') await renderHistory();
  if (view === 'manage-facilities') {
    await fetchFacilities('all');
    renderFacilitiesTable();
  }
  if (view === 'payments') await renderPaymentsTable();
  if (view === 'slots') await initSlotManagement();
  if (view === 'dashboard') await renderDashboardStats();
  if (view === 'profile') await loadUserProfileView();

  if (window.lucide) lucide.createIcons();
}

// 3. ปุ่มกดซ่อน/แสดงแถบเมนูด้านล่างบนมือถือ
function toggleMobileNav() {
  const sidebar = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('mobileNavToggleBtn');
  const toggleText = document.getElementById('mobileNavToggleText');
  if (!sidebar || !toggleBtn) return;

  const isCollapsed = sidebar.classList.toggle('nav-collapsed');
  toggleBtn.classList.toggle('nav-collapsed', isCollapsed);
  if (toggleText) {
    toggleText.textContent = isCollapsed ? '▲ แสดงเมนู' : '▼ ซ่อนเมนู';
  }
}

// 4. โหลดข้อมูลผู้ใช้ปัจจุบันมาใส่ในหน้า Profile
async function loadUserProfileView() {
  if (!currentUser) return;

  const { data: prof } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (prof) {
    currentUser.profile = prof;
  }

  const name = currentUser?.profile?.name || '';
  const phone = currentUser?.profile?.phone || '';
  const email = currentUser?.email || '';
  const initials = (name || email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const roleLabelMap = {
    admin: 'Admin (ดูแลระบบทั้งหมด)',
    owner: 'Owner (เจ้าของสนาม)',
    staff: 'Staff',
    user: 'User (ลูกค้าทั่วไป)'
  };

  applyAvatar(document.getElementById('profilePageAvatar'), currentUser?.profile?.avatar_url, initials);
  const _rmBtn = document.getElementById('profileAvatarRemoveBtn');
  if (_rmBtn) _rmBtn.style.display = currentUser?.profile?.avatar_url ? 'inline-block' : 'none';
  if (document.getElementById('profilePageNameDisplay')) document.getElementById('profilePageNameDisplay').textContent = name || 'ผู้ใช้งาน';
  if (document.getElementById('profilePageEmailDisplay')) document.getElementById('profilePageEmailDisplay').textContent = email;
  if (document.getElementById('profilePageRoleBadge')) document.getElementById('profilePageRoleBadge').textContent = roleLabelMap[currentRole] || currentRole;

  if (document.getElementById('profileEditName')) document.getElementById('profileEditName').value = name;
  if (document.getElementById('profileEditPhone')) document.getElementById('profileEditPhone').value = phone;
  if (document.getElementById('profileEditEmail')) document.getElementById('profileEditEmail').value = email;
  if (document.getElementById('profileNewPassword')) document.getElementById('profileNewPassword').value = '';
  if (document.getElementById('profileConfirmPassword')) document.getElementById('profileConfirmPassword').value = '';
}

// 5. บันทึกการแก้ไข ชื่อ, เบอร์โทรศัพท์, และอีเมล
async function saveProfileInfo() {
  if (!currentUser) return;

  const newName = document.getElementById('profileEditName')?.value.trim();
  const newPhone = document.getElementById('profileEditPhone')?.value.trim();
  const newEmail = document.getElementById('profileEditEmail')?.value.trim();

  if (!newName) {
    alert('กรุณากรอกชื่อ-นามสกุลครับ');
    return;
  }

  const btn = document.getElementById('saveProfileBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

  try {
    // 1. อัปเดตชื่อและเบอร์โทรในตาราง profiles
    const { error: profErr } = await supabaseClient
      .from('profiles')
      .update({ name: newName, phone: newPhone })
      .eq('id', currentUser.id);

    if (profErr) throw profErr;

    // 2. ถ้ามีการเปลี่ยนอีเมล ให้สั่งอัปเดตใน Supabase Auth ด้วย
    let emailChangedMsg = '';
    if (newEmail && newEmail !== currentUser.email) {
      const { error: emailErr } = await supabaseClient.auth.updateUser({ email: newEmail });
      if (emailErr) throw emailErr;
      currentUser.email = newEmail;
      emailChangedMsg = '\n(ระบบได้ส่งลิงก์ยืนยันอีเมลใหม่ไปยังกล่องข้อความของคุณแล้ว)';
    }

    currentUser.profile = { ...(currentUser.profile || {}), name: newName, phone: newPhone };
    setupNav();
    await loadUserProfileView();

    alert('✅ บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว!' + emailChangedMsg);
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึกโปรไฟล์: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึกข้อมูลโปรไฟล์'; }
  }
}

// 6. เปลี่ยนรหัสผ่านใหม่ (บังคับตรวจสอบรหัสผ่านเดิมกับ Supabase Auth ก่อนเปลี่ยน)
async function changeUserPassword() {
  if (!currentUser || !currentUser.email) {
    alert('ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    return;
  }

  const oldPassEl = document.getElementById('profileOldPassword');
  const newPassEl = document.getElementById('profileNewPassword');
  const confirmPassEl = document.getElementById('profileConfirmPassword');

  const oldPass = oldPassEl ? oldPassEl.value.trim() : '';
  const newPass = newPassEl ? newPassEl.value.trim() : '';
  const confirmPass = confirmPassEl ? confirmPassEl.value.trim() : '';

  if (!oldPass) {
    alert('กรุณากรอก "รหัสผ่านปัจจุบัน (รหัสเก่า)" เพื่อยืนยันตัวตนก่อนครับ');
    if (oldPassEl) oldPassEl.focus();
    return;
  }
  if (!newPass || newPass.length < 6) {
    alert('กรุณากรอกรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษรครับ');
    if (newPassEl) newPassEl.focus();
    return;
  }
  if (newPass !== confirmPass) {
    alert('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกันครับ');
    if (confirmPassEl) confirmPassEl.focus();
    return;
  }
  if (oldPass === newPass) {
    alert('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิมครับ');
    return;
  }

  const btn = document.getElementById('savePasswordBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังตรวจสอบรหัสผ่านเดิม...'; }

  try {
    // 1. ตรวจสอบรหัสผ่านเดิมโดยการยืนยันกับ Supabase Auth
    const { error: verifyErr } = await supabaseClient.auth.signInWithPassword({
      email: currentUser.email,
      password: oldPass
    });

    if (verifyErr) {
      throw new Error('รหัสผ่านปัจจุบัน (รหัสเดิม) ไม่ถูกต้อง กรุณาลองใหม่อีกครั้งครับ');
    }

    // 2. เมื่อรหัสผ่านเดิมถูกต้อง จึงอัปเดตรหัสผ่านใหม่
    if (btn) btn.textContent = 'กำลังบันทึกรหัสผ่านใหม่...';
    const { error: updateErr } = await supabaseClient.auth.updateUser({
      password: newPass
    });

    if (updateErr) throw updateErr;

    if (oldPassEl) oldPassEl.value = '';
    if (newPassEl) newPassEl.value = '';
    if (confirmPassEl) confirmPassEl.value = '';

    alert('🔒 ยืนยันตัวตนและเปลี่ยนรหัสผ่านใหม่สำเร็จเรียบร้อยแล้ว!');
  } catch (err) {
    alert(err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔑 ยืนยันการเปลี่ยนรหัสผ่าน'; }
  }
}
// ============================================================================
// แก้ไขปุ่ม "📦 อุปกรณ์" ของ Owner ให้ทำงาน 100% + ปรับ UX การเลือกอุปกรณ์บนมือถือ
// ============================================================================

// 1. ตรวจสอบและสร้างหน้าต่าง Modal จัดการอุปกรณ์อัตโนมัติ (ป้องกันปัญหา HTML หาย)
function ensureEquipmentModalExists() {
  let modal = document.getElementById('manageEquipmentModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'manageEquipmentModal';
    modal.innerHTML = `
      <div class="modal" style="max-width: 560px; width: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <h3 style="margin:0;">📦 จัดการอุปกรณ์ / สินค้าเสริม</h3>
          <button type="button" onclick="closeModal('manageEquipmentModal')" style="background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--text-secondary);">✕</button>
        </div>
        <p id="eqFacilityName" style="font-size: 0.88rem; color: var(--primary); margin-bottom: 16px; font-weight: 700;"></p>
        
        <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:20px;">
          <h4 id="eqFormTitle" style="margin:0 0 12px 0; font-size:0.95rem;">+ เพิ่มอุปกรณ์ใหม่</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div class="form-group" style="grid-column: 1 / -1; margin:0;">
              <label>ชื่ออุปกรณ์ / สินค้า <span style="color:red">*</span></label>
              <input type="text" id="eqName" placeholder="เช่น ลูกบาส, เสื้อเอี๊ยม, น้ำดื่ม">
            </div>
            <div class="form-group" style="margin:0;">
              <label>ประเภท <span style="color:red">*</span></label>
              <select id="eqType">
                <option value="ซื้อ">ซื้อขาด (Buy)</option>
                <option value="เช่า">เช่า (Rent / ต่อรอบจอง)</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <label>ราคา (฿) <span style="color:red">*</span></label>
              <input type="number" id="eqPrice" placeholder="เช่น 50">
            </div>
            <div class="form-group" style="grid-column: 1 / -1; margin:0;">
              <label>จำนวนสต็อกทั้งหมด (ชิ้น) <span style="color:red">*</span></label>
              <input type="number" id="eqStock" placeholder="เช่น 10">
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button type="button" id="eqSubmitBtn" class="btn btn-success" style="flex:1;" onclick="submitNewEquipment()">+ บันทึกลงแคตตาล็อก</button>
            <button type="button" id="eqCancelEditBtn" class="btn btn-secondary" style="display:none;" onclick="resetEquipmentForm()">ยกเลิกแก้ไข</button>
          </div>
        </div>

        <h4 style="margin:0 0 8px 0; font-size:0.95rem;">รายการอุปกรณ์ปัจจุบัน</h4>
        <div id="equipmentList" style="max-height: 240px; overflow-y: auto; border:1px solid #e2e8f0; border-radius:10px; padding:8px; background: #fff;"></div>

        <div class="flex mt-16">
          <button type="button" class="btn btn-secondary btn-block" onclick="closeModal('manageEquipmentModal')">ปิดหน้าต่าง</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else if (modal.parentElement !== document.body) {
    // ย้ายออกมาไว้ที่ body เพื่อไม่ให้ติดอยู่ในหน้า view อื่นที่ถูกซ่อนอยู่
    document.body.appendChild(modal);
  }
}

function resetEquipmentForm() {
  isEditingEquipment = false;
  editingEquipmentId = null;
  if (document.getElementById('eqName')) document.getElementById('eqName').value = '';
  if (document.getElementById('eqType')) document.getElementById('eqType').value = 'ซื้อ';
  if (document.getElementById('eqPrice')) document.getElementById('eqPrice').value = '';
  if (document.getElementById('eqStock')) document.getElementById('eqStock').value = '';

  const btn = document.getElementById('eqSubmitBtn') || document.querySelector('#manageEquipmentModal .btn-success');
  if (btn) {
    btn.textContent = '+ บันทึกลงแคตตาล็อก';
    btn.style.background = '#16a34a';
  }
  const cancelBtn = document.getElementById('eqCancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// 2. เปิดหน้าต่างจัดการอุปกรณ์เมื่อกดปุ่ม "📦 อุปกรณ์"
async function openEquipmentModal(facilityId) {
  ensureEquipmentModalExists();
  currentManageFacilityId = facilityId;
  const facility = (FACILITIES || []).find(f => String(f.id) === String(facilityId));

  const titleEl = document.getElementById('eqFacilityName');
  if (titleEl) titleEl.textContent = `สนาม: ${facility?.name || facilityId}`;

  resetEquipmentForm();
  document.getElementById('manageEquipmentModal').classList.add('active');
  await loadEquipmentList();
}

// 3. โหลดรายการอุปกรณ์ของสนามนั้นมาแสดงพร้อมปุ่ม แก้ไข / ลบ
async function loadEquipmentList() {
  ensureEquipmentModalExists();
  const listEl = document.getElementById('equipmentList');
  if (!listEl) return;

  listEl.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-secondary);">กำลังโหลดรายการอุปกรณ์...</div>';

  const { data, error } = await supabaseClient
    .from('equipment')
    .select('*')
    .eq('facility_id', currentManageFacilityId)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    window.currentFacilityEquipmentData = [];
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-tertiary);">ยังไม่มีอุปกรณ์เสริมสำหรับสนามนี้</div>';
    return;
  }

  window.currentFacilityEquipmentData = data;

  listEl.innerHTML = data.map(eq => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #f1f5f9; gap:8px; flex-wrap:wrap;">
      <div>
        <strong style="font-size:0.9rem;">${eq.name}</strong>
        <span style="font-size:0.72rem; background:${eq.type === 'เช่า' ? '#eff6ff' : '#fef3c7'}; color:${eq.type === 'เช่า' ? '#1d4ed8' : '#d97706'}; padding:2px 8px; border-radius:10px; margin-left:6px; font-weight:700;">${eq.type}</span>
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">ราคา: <strong>฿${Number(eq.price || 0).toLocaleString()}</strong> | สต็อกรวม: <strong>${eq.stock}</strong> ชิ้น</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn" style="background:#e2e8f0; color:#1e293b; border:none; padding:5px 12px; font-size:0.75rem; border-radius:6px;" onclick="editEquipment('${eq.id}')">แก้ไข</button>
        <button type="button" class="btn" style="background:#fee2e2; color:#ef4444; border:none; padding:5px 12px; font-size:0.75rem; border-radius:6px;" onclick="deleteEquipment('${eq.id}')">ลบ</button>
      </div>
    </div>
  `).join('');
}

// 4. กดปุ่มแก้ไขอุปกรณ์
function editEquipment(eqId) {
  const eq = (window.currentFacilityEquipmentData || []).find(e => String(e.id) === String(eqId));
  if (!eq) return;

  isEditingEquipment = true;
  editingEquipmentId = eq.id;

  if (document.getElementById('eqName')) document.getElementById('eqName').value = eq.name;
  if (document.getElementById('eqType')) document.getElementById('eqType').value = eq.type;
  if (document.getElementById('eqPrice')) document.getElementById('eqPrice').value = eq.price;
  if (document.getElementById('eqStock')) document.getElementById('eqStock').value = eq.stock;

  const btn = document.getElementById('eqSubmitBtn') || document.querySelector('#manageEquipmentModal .btn-success');
  if (btn) {
    btn.textContent = '💾 บันทึกการแก้ไข';
    btn.style.background = '#2563eb';
  }
  const cancelBtn = document.getElementById('eqCancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
}

// 5. บันทึกการเพิ่มหรือแก้ไขอุปกรณ์
async function submitNewEquipment() {
  const name = document.getElementById('eqName')?.value.trim();
  const type = document.getElementById('eqType')?.value || 'ซื้อ';
  const price = parseInt(document.getElementById('eqPrice')?.value);
  const stock = parseInt(document.getElementById('eqStock')?.value);

  if (!name || isNaN(price) || isNaN(stock)) {
    alert('กรุณากรอกชื่ออุปกรณ์ ราคา และจำนวนสต็อกให้ครบถ้วนครับ');
    return;
  }

  const btn = document.getElementById('eqSubmitBtn') || document.querySelector('#manageEquipmentModal .btn-success');
  if (btn) btn.disabled = true;

  try {
    let result;
    if (isEditingEquipment && editingEquipmentId) {
      result = await supabaseClient
        .from('equipment')
        .update({ name, type, price, stock })
        .eq('id', editingEquipmentId);
    } else {
      result = await supabaseClient
        .from('equipment')
        .insert([{
          facility_id: currentManageFacilityId,
          owner_id: currentUser?.id || null,
          name,
          type,
          price,
          stock
        }]);
    }

    if (result?.error) throw result.error;

    resetEquipmentForm();
    await loadEquipmentList();
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึกอุปกรณ์: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 6. ปรับปรุง UX ตอนลูกค้ากด + อุปกรณ์โดยยังไม่ได้เลือกช่วงเวลา (เลื่อนพาไปหาตารางเวลาอัตโนมัติ)
function updateAddonQty(eqId, change, maxStock) {
  if (selectedSlots.length === 0) {
    alert('⏰ กรุณาแตะเลือก "ช่วงเวลา (Available Time Slots)" ที่ต้องการจองก่อนครับ ระบบจะคำนวณสต็อกอุปกรณ์ที่ว่างในเวลานั้นให้ทันที');
    const slotGrid = document.getElementById('timeSlotsGrid');
    if (slotGrid) slotGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!selectedAddons[eqId]) selectedAddons[eqId] = 0;
  const newQty = selectedAddons[eqId] + change;
  if (newQty >= 0 && newQty <= maxStock) {
    selectedAddons[eqId] = newQty;
    const qtyEl = document.getElementById(`qty_${eqId}`);
    if (qtyEl) qtyEl.textContent = newQty;
    updateSummary();
  } else if (newQty > maxStock) {
    alert(`ขออภัยครับ ในช่วงเวลาที่คุณเลือก สินค้านี้มีสต็อกว่างเพียง ${maxStock} ชิ้น`);
  }
}

// ============================================================================
// ระบบการแจ้งเตือนแบบเรียลไทม์ (REAL-TIME NOTIFICATION SYSTEM)
// แยกบทบาทชัดเจนระหว่าง Admin (เจ้าของสนาม) และ User (ลูกค้าทั่วไป)
// ============================================================================

let currentNotifications = [];
let currentNotifFilterTab = 'all'; // 'all' หรือ 'unread'
let notifPollingInterval = null;

// ดึงรหัสการแจ้งเตือนที่กดอ่านแล้วจาก LocalStorage ของผู้ใช้นั้นๆ
function getReadNotifIds() {
  const userId = currentUser?.id || 'guest';
  try {
    const raw = localStorage.getItem(`sportcircle_read_notifs_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// บันทึกรหัสการแจ้งเตือนที่กดอ่านแล้ว
function setReadNotifIds(ids) {
  const userId = currentUser?.id || 'guest';
  try {
    localStorage.setItem(`sportcircle_read_notifs_${userId}`, JSON.stringify(ids));
  } catch (e) {}
}

// เปิด/ปิดลิ้นชักการแจ้งเตือน
function toggleNotificationDrawer(forceOpen) {
  const drawer = document.getElementById('notifDrawer');
  const backdrop = document.getElementById('notifBackdrop');
  if (!drawer || !backdrop) return;

  const isOpen = drawer.classList.contains('active');
  const shouldOpen = (forceOpen !== undefined) ? forceOpen : !isOpen;

  if (shouldOpen) {
    drawer.classList.add('active');
    backdrop.classList.add('active');
    refreshNotifications(false);
  } else {
    drawer.classList.remove('active');
    backdrop.classList.remove('active');
  }
}

// สลับแท็บตัวกรอง: ทั้งหมด / ยังไม่อ่าน
function filterNotifTab(tab) {
  currentNotifFilterTab = tab;
  document.getElementById('tabNotifAll')?.classList.toggle('active', tab === 'all');
  document.getElementById('tabNotifUnread')?.classList.toggle('active', tab === 'unread');
  renderNotificationList();
}

// ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว
function markAllNotificationsAsRead() {
  const allIds = currentNotifications.map(n => n.id);
  const readIds = getReadNotifIds();
  const combined = Array.from(new Set([...readIds, ...allIds]));
  setReadNotifIds(combined);
  updateNotificationBadges();
  renderNotificationList();
}

// เมื่อผู้ใช้แตะที่การแจ้งเตือน
async function handleNotificationClick(notifId) {
  const notif = currentNotifications.find(n => n.id === notifId);
  const readIds = getReadNotifIds();
  if (!readIds.includes(notifId)) {
    readIds.push(notifId);
    setReadNotifIds(readIds);
    updateNotificationBadges();
  }

  toggleNotificationDrawer(false);

  if (notif && typeof notif.action === 'function') {
    await notif.action();
  }
}

// ดึงและคำนวณการแจ้งเตือนตาม Role
async function refreshNotifications(showFeedback = false) {
  if (!currentUser) return;

  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const roleSubtitle = document.getElementById('notifRoleSubtitle');
  const isAdminOrOwner = (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'staff');

  if (roleSubtitle) {
    roleSubtitle.textContent = isAdminOrOwner 
      ? 'การแจ้งเตือนสำหรับผู้ดูแล & เจ้าของสนาม' 
      : 'การแจ้งเตือนสำหรับผู้ใช้งานทั่วไป';
  }

  const notifs = [];
  const todayYMD = formatYMD(new Date());

  try {
    if (isAdminOrOwner) {
      // ----------------------------------------------------------------------
      // 1. ฝั่ง ADMIN / OWNER: แจ้งเตือนสิ่งที่ Admin ควรได้รับและควรเห็น
      // ----------------------------------------------------------------------
      const myFacilities = getMyManagedFacilities();
      const myFacIds = myFacilities.map(f => String(f.id));

      if (myFacIds.length > 0) {
        const { data: bookings } = await supabaseClient
          .from('bookings')
          .select('*')
          .in('facility_id', myFacIds)
          .order('date', { ascending: false })
          .limit(40);

        if (bookings && bookings.length > 0) {
          bookings.forEach(b => {
            const fac = FACILITIES.find(f => String(f.id) === String(b.facility_id));
            const facName = fac?.name || 'สนามกีฬา';
            const custName = (b.customer_name || 'ลูกค้า').trim();
            const status = (b.payment_status || '').toLowerCase();
            const price = Number(b.total_price || 0);

            // 1.1 สลิปใหม่รอการตรวจสอบ
            if (status === 'pending') {
              notifs.push({
                id: `adm_pend_${b.id}`,
                bookingId: b.id,
                type: 'pending_slip',
                icon: 'file-check-2',
                iconColor: '#d97706',
                iconBg: '#fef3c7',
                title: `🟡 สลิปใหม่รอตรวจ: ${custName}`,
                desc: `ลูกค้าได้จองสนาม ${facName} วันที่ ${b.date} (${b.start_time} - ${b.end_time} น.) ยอด ฿${price.toLocaleString()} กรุณาตรวจสอบสลิป`,
                tag: 'รอตรวจสลิป',
                tagBg: '#fef3c7',
                tagColor: '#b45309',
                time: b.date,
                timestamp: new Date(b.created_at || b.date).getTime(),
                action: async () => {
                  await switchView('dashboard');
                  openMatrixSlotModal(b.id, b.facility_id, b.start_time, b.end_time);
                }
              });
            }

            // 1.2 การจองได้รับการยืนยันแล้ว
            if (status === 'approved') {
              notifs.push({
                id: `adm_appr_${b.id}`,
                bookingId: b.id,
                type: 'approved',
                icon: 'check-circle-2',
                iconColor: '#16a34a',
                iconBg: '#dcfce7',
                title: `🟢 การจองได้รับการยืนยัน: ${custName}`,
                desc: `สนาม ${facName} วันที่ ${b.date} (${b.start_time} - ${b.end_time} น.) ผ่านการอนุมัติแล้ว ยอดชำระ ฿${price.toLocaleString()}`,
                tag: 'อนุมัติแล้ว',
                tagBg: '#dcfce7',
                tagColor: '#15803d',
                time: b.date,
                timestamp: new Date(b.created_at || b.date).getTime(),
                action: async () => {
                  await switchView('dashboard');
                  openMatrixSlotModal(b.id, b.facility_id, b.start_time, b.end_time);
                }
              });
            }

            // 1.3 ลูกค้าเช็กอินเข้าใช้บริการแล้ว
            if (status === 'completed') {
              notifs.push({
                id: `adm_comp_${b.id}`,
                bookingId: b.id,
                type: 'checked_in',
                icon: 'user-check',
                iconColor: '#2563eb',
                iconBg: '#dbeafe',
                title: `📍 ลูกค้าเช็กอินแล้ว: ${custName}`,
                desc: `ได้เข้าใช้งานสนาม ${facName} ช่วงเวลา ${b.start_time} - ${b.end_time} น. เรียบร้อยแล้ว`,
                tag: 'เช็กอินแล้ว',
                tagBg: '#dbeafe',
                tagColor: '#1d4ed8',
                time: b.date,
                timestamp: new Date(b.created_at || b.date).getTime(),
                action: async () => {
                  await switchView('dashboard');
                }
              });
            }

            // 1.4 การยกเลิกหรือปฏิเสธสลิป
            if (status === 'rejected') {
              notifs.push({
                id: `adm_rej_${b.id}`,
                bookingId: b.id,
                type: 'rejected',
                icon: 'x-circle',
                iconColor: '#dc2626',
                iconBg: '#fee2e2',
                title: `❌ รายการยกเลิก: ${custName}`,
                desc: `การจองสนาม ${facName} วันที่ ${b.date} (${b.start_time} - ${b.end_time} น.) ถูกปฏิเสธหรือยกเลิกแล้ว`,
                tag: 'ยกเลิก',
                tagBg: '#fee2e2',
                tagColor: '#dc2626',
                time: b.date,
                timestamp: new Date(b.created_at || b.date).getTime(),
                action: async () => {
                  await switchView('dashboard');
                }
              });
            }

            // 1.5 เตือนคิวการใช้งานในวันนี้
            if (b.date === todayYMD && status === 'approved') {
              notifs.push({
                id: `adm_today_${b.id}`,
                bookingId: b.id,
                type: 'today_court',
                icon: 'calendar-clock',
                iconColor: '#7c3aed',
                iconBg: '#f3e8ff',
                title: `⏰ คิวใช้งานวันนี้: สนาม ${facName}`,
                desc: `คุณ ${custName} มีคิวเข้าใช้งานวันนี้ เวลา ${b.start_time} - ${b.end_time} น.`,
                tag: 'คิววันนี้',
                tagBg: '#f3e8ff',
                tagColor: '#7e22ce',
                time: 'วันนี้',
                timestamp: Date.now() + 1000,
                action: async () => {
                  await switchView('dashboard');
                }
              });
            }
          });
        }
      }
    } else {
      // ----------------------------------------------------------------------
      // 2. ฝั่ง USER: แจ้งเตือนสิ่งที่ User ควรได้รับและควรเห็น
      // ----------------------------------------------------------------------
      const { data: userBookings } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('date', { ascending: false })
        .limit(30);

      if (userBookings && userBookings.length > 0) {
        userBookings.forEach(b => {
          const fac = FACILITIES.find(f => String(f.id) === String(b.facility_id));
          const facName = fac?.name || 'สนามกีฬา';
          const status = (b.payment_status || '').toLowerCase();

          // 2.1 สลิปผ่านการอนุมัติแล้ว พร้อมตั๋ว E-Ticket
          if (status === 'approved') {
            notifs.push({
              id: `usr_appr_${b.id}`,
              bookingId: b.id,
              type: 'approved',
              icon: 'ticket',
              iconColor: '#16a34a',
              iconBg: '#dcfce7',
              title: `🟢 การจองของคุณได้รับการอนุมัติแล้ว!`,
              desc: `การจองสนาม ${facName} วันที่ ${b.date} (${b.start_time} - ${b.end_time} น.) ได้รับการอนุมัติเรียบร้อย ตั๋ว E-Ticket พร้อมใช้งาน แตะเพื่อเปิดดูตั๋ว`,
              tag: 'อนุมัติแล้ว',
              tagBg: '#dcfce7',
              tagColor: '#15803d',
              time: b.date,
              timestamp: new Date(b.created_at || b.date).getTime(),
              action: async () => {
                await openUserTicketByBookingId(b.id);
              }
            });
          }

          // 2.2 ได้รับสลิปแล้ว กำลังรอเจ้าหน้าที่ตรวจสอบ
          if (status === 'pending') {
            notifs.push({
              id: `usr_pend_${b.id}`,
              bookingId: b.id,
              type: 'pending',
              icon: 'clock',
              iconColor: '#d97706',
              iconBg: '#fef3c7',
              title: `⏳ ได้รับสลิปแล้ว กำลังรอการตรวจสอบ`,
              desc: `ระบบได้รับหลักฐานการโอนเงินสำหรับการจองสนาม ${facName} วันที่ ${b.date} (${b.start_time} - ${b.end_time} น.) แล้ว เจ้าหน้าที่กำลังตรวจสอบความถูกต้อง`,
              tag: 'รอตรวจสอบ',
              tagBg: '#fef3c7',
              tagColor: '#b45309',
              time: b.date,
              timestamp: new Date(b.created_at || b.date).getTime(),
              action: async () => {
                await switchView('my-bookings');
              }
            });
          }

          // 2.3 เตือนความจำคิวเล่นกีฬาวันนี้
          if (b.date === todayYMD && status === 'approved') {
            notifs.push({
              id: `usr_today_${b.id}`,
              bookingId: b.id,
              type: 'reminder',
              icon: 'alarm-clock',
              iconColor: '#7c3aed',
              iconBg: '#f3e8ff',
              title: `⏰ เตือนความจำ: วันนี้คุณมีนัดเล่นกีฬา!`,
              desc: `คุณมีคิวเข้าใช้บริการสนาม ${facName} ในวันนี้ เวลา ${b.start_time} - ${b.end_time} น. กรุณาเตรียมตัวและแสดง E-Ticket หน้าสนาม`,
              tag: 'นัดวันนี้',
              tagBg: '#f3e8ff',
              tagColor: '#7e22ce',
              time: 'วันนี้',
              timestamp: Date.now() + 1000,
              action: async () => {
                await openUserTicketByBookingId(b.id);
              }
            });
          }

          // 2.4 เช็กอินเข้าสนามสำเร็จ
          if (status === 'completed') {
            notifs.push({
              id: `usr_comp_${b.id}`,
              bookingId: b.id,
              type: 'completed',
              icon: 'map-pin',
              iconColor: '#2563eb',
              iconBg: '#dbeafe',
              title: `📍 เช็กอินเข้าสนามสำเร็จ!`,
              desc: `คุณได้เช็กอินเข้าใช้บริการสนาม ${facName} เรียบร้อยแล้ว ขอให้สนุกและมีความสุขกับการออกกำลังกายครับ`,
              tag: 'เช็กอินแล้ว',
              tagBg: '#dbeafe',
              tagColor: '#1d4ed8',
              time: b.date,
              timestamp: new Date(b.created_at || b.date).getTime(),
              action: async () => {
                await switchView('history');
              }
            });
          }

          // 2.5 สลิปไม่ผ่านการอนุมัติ / ถูกปฏิเสธ
          if (status === 'rejected') {
            notifs.push({
              id: `usr_rej_${b.id}`,
              bookingId: b.id,
              type: 'rejected',
              icon: 'alert-triangle',
              iconColor: '#dc2626',
              iconBg: '#fee2e2',
              title: `❌ การจองไม่ผ่านการอนุมัติ`,
              desc: `ขออภัย การจองสนาม ${facName} วันที่ ${b.date} (${b.start_time} - ${b.end_time} น.) ไม่ผ่านการตรวจสอบสลิป กรุณาตรวจสอบหรือทำรายการใหม่`,
              tag: 'ไม่อนุมัติ',
              tagBg: '#fee2e2',
              tagColor: '#dc2626',
              time: b.date,
              timestamp: new Date(b.created_at || b.date).getTime(),
              action: async () => {
                await switchView('my-bookings');
              }
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Error refreshing notifications:', err);
  }

  // เรียงลำดับ: เอาแจ้งเตือนเตือนเวลาวันนี้ และรายการใหม่สุดขึ้นก่อน
  notifs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  currentNotifications = notifs;
  updateNotificationBadges();
  renderNotificationList();

  if (showFeedback) {
    alert(`🔄 อัปเดตการแจ้งเตือนเรียบร้อยแล้ว (พบทั้งหมด ${notifs.length} รายการ)`);
  }
}

// อัปเดตตัวเลข Badge บนปุ่มกระดิ่ง และในเมนู Sidebar
function updateNotificationBadges() {
  const readIds = getReadNotifIds();
  const unreadCount = currentNotifications.filter(n => !readIds.includes(n.id)).length;
  const totalCount = currentNotifications.length;

  // ตัวเลข Badge บนปุ่มกระดิ่งมุมบนขวา
  const badge = document.getElementById('notifBadge');
  const bellBtn = document.getElementById('notifBellBtn');
  if (badge) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
  if (bellBtn) {
    bellBtn.classList.toggle('has-unread', unreadCount > 0);
  }

  // ตัวเลข Badge ในเมนู Sidebar ของแต่ละ Role
  ['notifMenuBadgeUser', 'notifMenuBadgeAdmin', 'notifMenuBadgeStaff'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = unreadCount > 99 ? '99+' : unreadCount;
      el.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
  });

  // ตัวเลขในลิ้นชักการแจ้งเตือน
  const unreadEl = document.getElementById('notifUnreadCount');
  const totalEl = document.getElementById('notifTotalCount');
  if (unreadEl) unreadEl.textContent = unreadCount;
  if (totalEl) totalEl.textContent = totalCount;
}

// วาดรายการแจ้งเตือนลงใน Drawer
function renderNotificationList() {
  const container = document.getElementById('notifListContainer');
  if (!container) return;

  const readIds = getReadNotifIds();
  const filtered = (currentNotifFilterTab === 'unread')
    ? currentNotifications.filter(n => !readIds.includes(n.id))
    : currentNotifications;

  if (filtered.length === 0) {
    const emptyMsg = (currentNotifFilterTab === 'unread')
      ? '🎉 ยอดเยี่ยม! คุณอ่านข้อความแจ้งเตือนทั้งหมดแล้ว'
      : '📭 ยังไม่มีข้อความแจ้งเตือนในขณะนี้';

    container.innerHTML = `
      <div style="text-align:center; padding:50px 20px; color:var(--text-tertiary);">
        <div style="font-size:2.4rem; margin-bottom:10px;">${currentNotifFilterTab === 'unread' ? '✨' : '🔔'}</div>
        <div style="font-weight:700; color:#334155; font-size:0.95rem;">${emptyMsg}</div>
        <p style="font-size:0.8rem; margin-top:6px; color:#94a3b8;">ระบบจะแจ้งเตือนอัตโนมัติเมื่อมีความคืบหน้าเกี่ยวกับการจองสนาม</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(n => {
    const isUnread = !readIds.includes(n.id);
    return `
      <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotificationClick('${n.id}')">
        <div class="notif-item-icon" style="background:${n.iconBg || '#eff6ff'}; color:${n.iconColor || 'var(--primary)'};">
          <i data-lucide="${n.icon || 'bell'}" width="18" height="18"></i>
        </div>
        <div class="notif-item-content">
          <div class="notif-item-title-row">
            <div class="notif-item-title">${n.title}</div>
            <span class="notif-unread-dot"></span>
          </div>
          <div class="notif-item-desc">${n.desc}</div>
          <div class="notif-item-footer">
            <span class="notif-item-time">📅 ${n.time}</span>
            <span class="notif-item-tag" style="background:${n.tagBg || '#f1f5f9'}; color:${n.tagColor || '#475569'};">${n.tag}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ฟังก์ชันช่วยเปิดตั๋ว E-Ticket ของลูกค้าเมื่อคลิกการแจ้งเตือน
async function openUserTicketByBookingId(bookingId) {
  // สลับไปยังหน้า My Bookings
  await switchView('my-bookings');

  // ค้นหากลุ่มบิลของ bookingId ใน groupedBookingsCache
  if (typeof groupedBookingsCache !== 'undefined' && groupedBookingsCache) {
    for (const [groupId, bill] of Object.entries(groupedBookingsCache)) {
      if (bill.bookingIds && bill.bookingIds.includes(bookingId)) {
        openBookingTicketModal(groupId, false);
        return;
      }
    }
  }

  // ถ้ายังไม่พบใน Cache ให้ลองดึงข้อมูลและเปิดตั๋ว
  try {
    const { data: b } = await supabaseClient.from('bookings').select('*').eq('id', bookingId).single();
    if (b) {
      const billKey = `${b.date}_${b.facility_id}_${b.created_at || b.id}`;
      groupedBookingsCache[billKey] = {
        groupId: billKey,
        facility_id: b.facility_id,
        date: b.date,
        customer_name: b.customer_name || currentUser?.profile?.name || 'ลูกค้า',
        customer_phone: b.customer_phone || currentUser?.profile?.phone || '-',
        total_price: b.total_price || 0,
        payment_status: b.payment_status || 'approved',
        slip_url: b.slip_url,
        slots: [{ id: b.id, start: b.start_time, end: b.end_time, status: b.payment_status }],
        completedCount: b.payment_status === 'completed' ? 1 : 0,
        totalSlots: 1
      };
      openBookingTicketModal(billKey, false);
    }
  } catch (e) {
    console.warn('Error opening ticket from notification:', e);
  }
}

// ============================================================================
// 🚀 บังคับอัปเดตระบบตรวจสอบการชำระเงิน (วางไว้ล่างสุดของไฟล์ app.js เท่านั้น!)
// ============================================================================

filterPayments = function(status) {
  currentPaymentFilter = status;
  
  ['pending', 'approved', 'rejected'].forEach(s => {
    const btn = document.getElementById(`tab-${s}`);
    if (btn) {
      if (s === status) {
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        btn.style.border = 'none';
      } else {
        btn.style.background = 'var(--bg-surface)';
        btn.style.color = 'var(--text)';
        btn.style.border = '1px solid var(--border)';
      }
    }
  });

  const subFilterWrapper = document.getElementById('approvedSubFilter');
  if (subFilterWrapper) {
    subFilterWrapper.style.display = (status === 'approved') ? 'flex' : 'none';
    if (status !== 'approved') {
       const sub = document.getElementById('paymentSubFilterStatus');
       if (sub) sub.value = 'all'; 
    }
  }
  renderPaymentsTable();
};

renderPaymentsTable = async function() {
  const tbody = document.getElementById('paymentsTable');
  if (!tbody) return;

  if (!FACILITIES || FACILITIES.length === 0) {
    await fetchFacilities('all');
  }

  const myFacilities = getMyManagedFacilities();
  const myFacilityIds = myFacilities.map(f => String(f.id));

  const facSelect = document.getElementById('paymentFilterFacility');
  if (facSelect) {
    const prevVal = facSelect.value || 'all';
    facSelect.innerHTML = '<option value="all">🏟️ แสดงทุกสนามในความดูแล</option>' +
      myFacilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    if (prevVal === 'all' || myFacilityIds.includes(String(prevVal))) {
      facSelect.value = prevVal;
    } else {
      facSelect.value = 'all';
    }
  }
  const selectedFacId = facSelect ? facSelect.value : 'all';

  const subFilterStatus = document.getElementById('paymentSubFilterStatus') 
                          ? document.getElementById('paymentSubFilterStatus').value 
                          : 'all';

  if (myFacilityIds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-tertiary);">คุณยังไม่มีสนามกีฬาในความดูแล</td></tr>`;
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px;">กำลังโหลดรายการ...</td></tr>';

  // 💡 ดึงรายการทั้งหมดเพื่อจัดกลุ่มบิลได้อย่างถูกต้อง 100% ไม่ให้มีรายการตกหล่น
  const { data: allBookings, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .in('facility_id', myFacilityIds)
    .order('created_at', { ascending: false });

  if (error || !allBookings || allBookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่มีรายการในหมวดหมู่นี้</td></tr>`;
    return;
  }

  const allBills = groupBookingsIntoBills(allBookings);
  
  const bills = allBills.filter(b => {
    const matchFacility = (selectedFacId === 'all') || (String(b.facility_id) === String(selectedFacId));
    if (!matchFacility) return false;

    const bStatus = String(b.payment_status).toLowerCase();

    // แท็บ "อนุมัติเรียบร้อย"
    if (currentPaymentFilter === 'approved') {
       if (bStatus !== 'approved' && bStatus !== 'completed') return false;

       if (subFilterStatus === 'completed') return b.isAllCompleted === true;
       if (subFilterStatus === 'waiting_checkin') return b.isAllCompleted === false;
       return true; 
    }
    
    // แท็บอื่นๆ
    return bStatus === currentPaymentFilter; 
  });

  if (bills.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-tertiary);">ไม่มีรายการสำหรับเงื่อนไขที่เลือก</td></tr>`;
    return;
  }

  tbody.innerHTML = bills.map(bill => {
    const facility = FACILITIES.find(f => f.id === bill.facility_id) || { name: 'สนามกีฬา' };
    const statusLower = (bill.payment_status || '').toLowerCase();

    const slotListHtml = bill.slots.map(s => {
      const isDone = s.status === 'completed';
      return `<span style="display:inline-block; background:${isDone ? '#dbeafe' : '#f1f5f9'}; color:${isDone ? '#1d4ed8' : '#334155'}; padding:2px 6px; border-radius:4px; font-size:0.74rem; font-weight:600; margin:2px 4px 2px 0;">${isDone ? '✓ ' : ''}${s.start}-${s.end}</span>`;
    }).join('');

    let actionButtons =
      `<button onclick="openBookingTicketModal('${bill.groupId}', true)" class="btn" style="background:#e2e8f0; color:#1e293b; padding:5px 10px; border-radius:4px; font-size:0.76rem;">ดูบิล / เช็คอินแยกช่วง</button>`;

    if (statusLower === 'pending') {
      actionButtons +=
        `<button onclick="processGroupBookingStatus('${bill.groupId}', 'approved')" class="btn" style="background:#22c55e; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">อนุมัติสลิป</button>` +
        `<button onclick="processGroupBookingStatus('${bill.groupId}', 'rejected')" class="btn" style="background:#ef4444; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">ปฏิเสธ</button>`;
    } else if (statusLower === 'approved') {
      const remaining = bill.slots.filter(s => s.status === 'approved').length;
      if (remaining > 0) {
        actionButtons +=
          `<button onclick="confirmGroupCheckIn('${bill.groupId}')" class="btn" style="background:#2563eb; color:white; padding:5px 10px; border-radius:4px; font-size:0.76rem;">✅ เช็คอินเข้าสนาม (${remaining} ชม.)</button>`;
      }
    }

    // 💡 เปลี่ยนป้ายสถานะเป็นภาษาไทยทั้งหมด
    let statusBadgeHtml = '';
    if (statusLower === 'completed') {
       statusBadgeHtml = `<span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">เข้าใช้งานแล้ว</span>`;
    } else if (bill.isPartiallyCheckedIn) {
       statusBadgeHtml = `<span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">ใช้แล้ว ${bill.completedCount}/${bill.totalSlots}</span>`;
    } else if (statusLower === 'approved') {
       statusBadgeHtml = `<span class="status-badge approved" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">รอเช็คอิน</span>`;
    } else if (statusLower === 'pending') {
       statusBadgeHtml = `<span class="status-badge pending" style="background:#fef9c3; color:#a16207; border:1px solid #fde047;">รอตรวจสอบสลิป</span>`;
    } else {
       statusBadgeHtml = `<span class="status-badge rejected" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca;">ถูกยกเลิก/ปฏิเสธ</span>`;
    }

    const slipCellHtml = (bill.slip_url && bill.slip_url !== 'walk-in' && !String(bill.slip_url).startsWith('walkin_'))
      ? `<button type="button" onclick="previewSlipModal('${String(bill.slip_url).trim()}')" style="background:none; border:none; color:var(--primary); text-decoration:underline; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.85rem;">🖼️ ดูสลิป</button>`
      : '<span style="color:var(--text-tertiary); font-size:0.78rem;">จองผ่านแอดมิน</span>';

    return `
      <tr>
        <td>
          <strong style="cursor:pointer; color:var(--primary);" onclick="openBookingTicketModal('${bill.groupId}', true)">#${String(bill.groupId).slice(0, 8)}</strong>
          <div style="font-size:0.72rem; color:var(--text-tertiary);">${bill.slots.length} ช่วงเวลา</div>
        </td>
        <td>
          <strong>${bill.customer_name}</strong>
          <div style="font-size:0.78rem; color:var(--text-secondary);">📞 ${bill.customer_phone}</div>
        </td>
        <td>
          <strong>${facility.name}</strong>
          <div style="font-size:0.78rem; color:var(--text-secondary);">📅 ${bill.date}</div>
          <div style="margin-top:2px;">${slotListHtml}</div>
        </td>
        <td><strong style="color:var(--primary);">฿${bill.total_price.toLocaleString()}</strong></td>
        <td>${slipCellHtml}</td>
        <td>${statusBadgeHtml}</td>
        <td><div style="display:flex; gap:6px; flex-wrap:wrap;">${actionButtons}</div></td>
      </tr>
    `;
  }).join('');
};