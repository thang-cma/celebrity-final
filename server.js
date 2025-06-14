require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'mysecret123';

// Multer cấu hình upload ảnh
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = Date.now() + ext;
    cb(null, filename);
  }
});
const upload = multer({ storage });

// Middleware xác thực token
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Bạn chưa đăng nhập' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Token không hợp lệ' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin mới được thực hiện thao tác này' });
  }
  next();
}

// Cấu hình Express
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Đã kết nối MongoDB'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// Mongoose models
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  password: String,
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Celeb' }],
  ratings: [{
    celeb: { type: mongoose.Schema.Types.ObjectId, ref: 'Celeb' },
    value: Number
  }]
}));

const Celeb = mongoose.model('Celeb', {
  name: String,
  image: String,
  description: String,
  profession: [String],
  totalRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
});

// Tạo admin mặc định
(async () => {
  const exist = await User.findOne({ username: 'admin' });
  if (!exist) {
    const hashed = await bcrypt.hash('123456', 10);
    await new User({ username: 'admin', password: hashed, role: 'admin' }).save();
    console.log('✅ Đã tạo tài khoản admin / 123456');
  }
})();

// Các route API ở đây (tương tự như của bạn — giữ nguyên, đã chuẩn)

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: 'Sai tài khoản' });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ error: 'Sai mật khẩu' });
  const token = jwt.sign({ username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token });
});

app.post('/api/auth/register-public', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
  if (!passwordRegex.test(password)) return res.status(400).json({ error: 'Mật khẩu yếu' });
  const exist = await User.findOne({ username });
  if (exist) return res.status(400).json({ error: 'Tài khoản đã tồn tại' });
  const hashed = await bcrypt.hash(password, 10);
  await new User({ username, password: hashed, role: 'user' }).save();
  res.json({ message: 'Đăng ký thành công' });
});

app.get('/api/users/me', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  res.json({ ratings: user.ratings || [] });
});

app.get('/api/celebs', async (req, res) => {
  const celebs = await Celeb.find();
  res.json(celebs);
});

app.post('/api/celebs', authMiddleware, adminOnly, upload.single('image'), async (req, res) => {
  let { name, profession, description } = req.body;
  if (typeof profession === 'string') {
    try {
      profession = JSON.parse(profession);
    } catch {
      profession = profession.split(',').map(p => p.trim());
    }
  }
  if (!name || !profession || !req.file) return res.status(400).json({ error: 'Thiếu thông tin' });
  const imagePath = `/uploads/${req.file.filename}`;
  const celeb = new Celeb({ name, profession, description, image: imagePath });
  await celeb.save();
  res.status(201).json(celeb);
});

// update, delete, favorites, ratings giống như bạn đã viết, giữ nguyên

// Route cho giao diện reset đánh giá
app.get('/admin/reset-ratings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset.html'));
});

// Giao diện gốc
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});
