/* ============================================================================
 *  tests/scope-check.js — KIỂM TRA SCOPE CỦA CÁC HÀM KHAI BÁO Ở CỘT 0
 * ---------------------------------------------------------------------------
 *  Mục đích: phát hiện trường hợp một hàm khai báo ở cột 0 nhưng thực tế lại
 *  bị NESTED trong hàm khác. Khi đó hàm đó KHÔNG còn là global, nên gọi từ
 *  module khác sẽ ném lỗi "ReferenceError: xxx is not defined".
 *
 *  Lỗi loại này rất dễ xảy ra khi dùng công cụ sửa file: một đoạn code bị
 *  chèn nhầm chỗ (ví dụ trong js/ui/editor.js bản 2.3) → file vẫn parse được
 *  nhưng các hàm bị lồng sai chỗ.
 *
 *  Cách chạy:  node tests/scope-check.js [file1.js file2.js ...]
 *  (không truyền tham số ⇒ quét toàn bộ thư mục js/)
 *  Exit code:  0 = đạt, 1 = có lỗi.
 * ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const out = [];
let bad = 0;

function collectJs(dir, acc) {
    fs.readdirSync(dir).forEach(function (name) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) collectJs(full, acc);
        else if (name.endsWith('.js')) acc.push(full);
    });
    return acc;
}

const args = process.argv.slice(2);
const files = args.length
    ? args.map(function (a) { return path.join(ROOT, a); })
    : collectJs(path.join(ROOT, 'js'), []).sort();

/**
 * Quét một file: theo dõi độ sâu ngoặc nhọn (bỏ qua chuỗi và chú thích).
 * Mỗi khai báo `function xxx(` nằm ở cột 0 phải có độ sâu = 0.
 */
function analyze(file) {
    const code = fs.readFileSync(file, 'utf8');
    const lines = code.split(/\r?\n/);

    let depth = 0;
    let inBlockComment = false;

    lines.forEach(function (ln, i) {
        const lineNo = i + 1;
        const m = /^function\s+(\w+)/.exec(ln);
        if (m && depth !== 0) {
            bad += 1;
            out.push('  ❌ ' + path.relative(ROOT, file) + ' :' + lineNo
                + '  depth=' + depth + '  ' + m[1] + '   <-- KHÔNG PHAI GLOBAL');
        }

        for (let j = 0; j < ln.length; j++) {
            const c = ln[j], n = ln[j + 1];
            if (inBlockComment) {
                if (c === '*' && n === '/') { inBlockComment = false; j++; }
                continue;
            }
            if (c === '/' && n === '/') break;
            if (c === '/' && n === '*') { inBlockComment = true; j++; continue; }
            if (c === '"' || c === "'" || c === '`') {
                const quote = c;
                j++;
                while (j < ln.length) {
                    if (ln[j] === '\\') { j += 2; continue; }
                    if (ln[j] === quote) break;
                    j++;
                }
                continue;
            }
            if (c === '{') depth += 1;
            else if (c === '}') depth -= 1;
        }
    });

    if (depth !== 0) {
        bad += 1;
        out.push('  ❌ ' + path.relative(ROOT, file) + ' : độ sâu ngoặc nhọn cuối = '
            + depth + ' (phải bằng 0)');
    }
}

files.forEach(analyze);

console.log('--- SCOPE CỦA CÁC HÀM KHAI BÁO Ở CỘT 0 ---');
if (bad === 0) {
    console.log('  ✅ Mọi hàm khai báo ở cột 0 đều là GLOBAL (' + files.length + ' file)');
} else {
    out.forEach(function (l) { console.log(l); });
    console.log('  ❌ CÓ ' + bad + ' VẤN ĐỀ SCOPE');
}
console.log('=========================================');

process.exitCode = bad === 0 ? 0 : 1;
