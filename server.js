const http = require('http');
const httpProxy = require('http-proxy');

// 1. ดึง URL ของแอปหลังบ้านจาก Environment Variables ของ Railway
// หากไม่มีการตั้งค่า จะถอยกลับไปใช้ URL ตัวอย่าง (Fallback)
const BACKEND_SERVICE_A = process.env.SERVICE_A_URL || 'https://mock-service-a.railway.internal';
const BACKEND_SERVICE_B = process.env.SERVICE_B_URL || 'https://mock-service-b.railway.internal';

const proxy = httpProxy.createProxyServer({
    xfwd: true,         // จำเป็นมากบน Cloud เพื่อส่งต่อ IP ที่แท้จริงของ User ไปยังแอปหลังบ้าน
    changeOrigin: true, // ป้องกันปัญหา CORS และ Host header mismatch บน Railway
    preserveHeaderKeyCase: true
});

const server = http.createServer((req, res) => {
    // 2. การจัดเส้นทางแบบ Path-based Routing (รอบคอบและเสถียรกว่าบน Cloud)
    let target = BACKEND_SERVICE_A; // กำหนดค่าเริ่มต้นเป็น Service A

    if (req.url.startsWith('/api/v2') || req.url.startsWith('/auth')) {
        target = BACKEND_SERVICE_B;
    }

    console.log(`[Proxy Log] Forwarding Request: ${req.method} ${req.url} -> ${target}`);
    
    // ส่งต่อ Request
    proxy.web(req, res, { target: target });
});

// 3. Error Handling ป้องกัน Proxy ล่ม (สำคัญที่สุดบน Production)
proxy.on('error', (err, req, res) => {
    console.error(`[Proxy Error]: ${err.message}`);
    
    // หาก Client กดยกเลิก Request ไปก่อน (Connection ขาด) ให้จบการทำงานเงียบๆ
    if (res.headersSent) return; 

    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        error: 'Bad Gateway', 
        message: 'บริการหลังบ้านไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง' 
    }));
});

// 4. ใช้ Port ที่ Railway กำหนดให้แบบ Dynamic
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Reverse Proxy กำลังรันบนพอร์ต ${PORT} (Railway Environment)`);
});
