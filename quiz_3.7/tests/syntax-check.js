/* ============================================================================
 *  tests/syntax-check.js — KIỂM TRA NHANH CẤU TRÚC DỰ ÁN (không cần Chrome)
 *  ---------------------------------------------------------------------------
 *  Cách chạy:  node tests/syntax-check.js
 *
 *  Nội dung kiểm tra:
 *    1. Mọi file <script src> / <link href> trong index.html đều tồn tại.
 *    2. Tất cả file .js trong thư mục js/ đều hợp lệ cú pháp (dùng vm.Script).
 *    3. Các module bắt buộc phải có (engine, ui, player, app...).
 *    4. index.html nạp script theo đúng thứ tự phụ thuộc.
 *
 *  Ưu điểm: chạy vài giây, dùng được trong CI mà không cần trình duyệt.
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failed = 0;

function ok(label, detail) {
    console.log('  ✅ ' + label + (detail ? '  →  ' + detail : ''));
}

function no(label, detail) {
    failed += 1;
    console.log('  ❌ ' + label + (detail ? '  →  ' + detail : ''));
}

/* --------------------------------------------------------------------------
 * 1. Kiểm tra các tài nguyên được index.html tham chiếu
 * ------------------------------------------------------------------------ */
console.log('--- 1. TÀI NGUYÊN TRONG index.html ---');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const refs = [];
html.replace(/<script[^>]+src="([^"]+)"/g, function (_, src) { refs.push(src); return _; });
html.replace(/<link[^>]+href="([^"]+\.css)"/g, function (_, href) { refs.push(href); return _; });

let missing = 0;
refs.forEach(function (rel) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
        missing += 1;
        no('Thiếu file: ' + rel);
    }
});
if (missing === 0) ok('Đủ ' + refs.length + ' file CSS/JS được tham chiếu');

/* --------------------------------------------------------------------------
 * 2. Kiểm tra cú pháp toàn bộ file JS
 * ------------------------------------------------------------------------ */
console.log('');
console.log('--- 2. CÚ PHÁP JAVASCRIPT ---');
const jsFiles = [];

(function walk(dir) {
    fs.readdirSync(dir).forEach(function (name) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js')) jsFiles.push(full);
    });
})(path.join(ROOT, 'js'));

jsFiles.sort().forEach(function (file) {
    const code = fs.readFileSync(file, 'utf8');
    try {
        new vm.Script(code, { filename: file });
        ok(path.relative(ROOT, file), code.split('\n').length + ' dòng');
    } catch (err) {
        no(path.relative(ROOT, file), err.message);
    }
});

/* --------------------------------------------------------------------------
 * 3. Các module bắt buộc
 * ------------------------------------------------------------------------ */
console.log('');
console.log('--- 3. MODULE BẮT BUỘC ---');
const required = [
    'js/core/utils.js',
    'js/core/block-types.js',
    'js/core/state.js',
    'js/workspace/geometry.js',
    'js/workspace/block-manager.js',
    'js/workspace/interactions.js',
    'js/ui/render.js',
    'js/ui/editor.js',
    'js/coding/coding-engine.js',
    'js/coding/coding-ui.js',
    'js/player/player.js',
    'js/app/app.js'
];

required.forEach(function (rel) {
    if (fs.existsSync(path.join(ROOT, rel))) ok(rel);
    else no('Thiếu module: ' + rel);
});

/* --------------------------------------------------------------------------
 * 4. Thứ tự nạp script
 * ------------------------------------------------------------------------ */
console.log('');
console.log('--- 4. THỨ TỰ NẠP SCRIPT ---');
const order = [];
html.replace(/<script[^>]+src="(js\/[^"]+)"/g, function (_, src) { order.push(src); return _; });

function before(a, b, label) {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1 && ia < ib) ok(label, a + ' trước ' + b);
    else no(label, 'thứ tự sai: ' + a + ' / ' + b);
}

before('js/core/utils.js', 'js/core/state.js', 'utils trước state');
before('js/core/block-types.js', 'js/workspace/block-manager.js', 'block-types trước block-manager');
before('js/workspace/block-manager.js', 'js/ui/editor.js', 'workspace trước editor');
before('js/coding/coding-engine.js', 'js/coding/coding-ui.js', 'engine trước coding-ui');
before('js/coding/coding-ui.js', 'js/app/app.js', 'coding-ui trước app (khởi tạo)');
before('js/player/player.js', 'js/app/app.js', 'player trước app (khởi tạo)');

/* --------------------------------------------------------------------------
 * TỔNG KẾT
 * ------------------------------------------------------------------------ */
console.log('');
console.log('================ KẾT QUẢ ================');
console.log(failed === 0
    ? '  ✅ CẤU TRÚC DỰ ÁN HỢP LỆ (' + jsFiles.length + ' file JS)'
    : '  ❌ CÓ ' + failed + ' LỖI CẤU TRÚC');
console.log('=========================================');

process.exitCode = failed === 0 ? 0 : 1;
