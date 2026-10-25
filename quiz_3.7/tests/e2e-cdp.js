/* ============================================================================
 *  tests/e2e-cdp.js — KIỂM THỬ TỰ ĐỘNG END-TO-END BẰNG CHROME HEADLESS + CDP
 *  ============================================================================
 *  Cách chạy:   node tests/e2e-cdp.js
 *  Kết quả:     in ra màn hình + ghi vào tests/last-run.txt
 *
 *  Nguyên lý:
 *    1. Mở Chrome headless với cổng remote-debugging.
 *    2. Kết nối CDP tới tab đang mở (dùng WebSocket có sẵn của Node >= 21).
 *    3. Nạp index.html qua file:// rồi gọi Runtime.evaluate để kiểm thử.
 *    4. Mọi lỗi console / exception của trang đều được ghi lại.
 *
 *  Bộ test bao phủ:
 *    - Nạp trang không lỗi, đủ 7 loại khối.
 *    - Nhấn 3 lần mở modal (và 2 lần thì KHÔNG mở).
 *    - Tab "Cấu hình" / "Lập trình khối", danh mục khối, 3 chương trình.
 *    - Kéo khối lệnh từ danh mục vào chương trình (mô phỏng DragEvent).
 *    - Chạy chương trình: random hoá câu hỏi/đáp án, công thức điểm, lời nhắn.
 *    - Chạy quiz: dữ liệu runtime đổi nhưng dữ liệu gốc giữ nguyên.
 *    - Chấm điểm theo công thức người dùng + phản hồi đúng/sai.
 *    - Kéo khối câu hỏi, zoom đúng tâm con trỏ, pan 1:1, kích thước canvas.
 *    - Lưu/khôi phục dự án có chương trình khối lệnh.
 * ========================================================================== */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME_PATH
    || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const OUTPUT = path.join(__dirname, 'last-run.txt');

const log = [];
let passed = 0;
let failed = 0;

/** Ghi một dòng kết quả (đồng thời ghi ra file để dễ xem lại) */
function line(text) {
    log.push(text);
    fs.writeFileSync(OUTPUT, log.join('\n'), 'utf8');
    /* In ra stdout ngay để theo dõi tiến độ khi chạy lâu (và để CI log đầy đủ). */
    process.stdout.write(text + '\n');
}

/** Ghi nhận một phép kiểm thử */
function check(label, ok, detail) {
    if (ok) {
        passed += 1;
        line('  ✅ ' + label + (detail ? '  →  ' + detail : ''));
    } else {
        failed += 1;
        line('  ❌ ' + label + (detail ? '  →  ' + detail : ''));
    }
}

/** Gọi HTTP GET và trả về JSON */
function getJSON(url) {
    return new Promise(function (resolve, reject) {
        http.get(url, function (res) {
            let data = '';
            res.on('data', function (c) { data += c; });
            res.on('end', function () {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/**
 * Chụp ảnh màn hình hiện tại (Chrome headless) rồi lưu vào tests/screenshots/.
 *
 * @param {Object} cdp - kết nối CDP
 * @param {string} fileName - tên file, ví dụ '31-matching.png'
 * @returns {Promise<string|null>} đường dẫn file đã lưu (null nếu lỗi)
 */
async function captureScreenshot(cdp, fileName) {
    try {
        const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const dir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, fileName);
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        return file;
    } catch (e) {
        return null;
    }
}

/** Kết nối CDP đơn giản qua WebSocket */
function connectCDP(wsUrl) {
    return new Promise(function (resolve, reject) {
        const ws = new WebSocket(wsUrl);
        let id = 0;
        const pending = new Map();

        ws.onopen = function () {
            resolve({
                send: function (method, params) {
                    return new Promise(function (res, rej) {
                        const msgId = ++id;
                        pending.set(msgId, { res: res, rej: rej });
                        ws.send(JSON.stringify({ id: msgId, method: method, params: params || {} }));
                    });
                },
                on: function (handler) { ws.addEventListener('message', handler); },
                close: function () { ws.close(); }
            });
        };
        ws.onerror = function (e) { reject(new Error('WS error: ' + (e.message || 'unknown'))); };
        ws.onmessage = function (ev) {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) {
                const p = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
                else p.res(msg.result);
            }
        };
    });
}

/**
 * Đánh giá biểu thức JS trong trang, trả về giá trị.
 * Có giới hạn thời gian (mặc định 30s) để tránh treo vô hạn khi một bước
 * trong trang không bao giờ hoàn tất (ví dụ animation chờ rAF).
 */
async function evaluate(cdp, expression, timeoutMs) {
    const limit = timeoutMs || 30000;
    const r = await Promise.race([
        cdp.send('Runtime.evaluate', {
            expression: expression,
            returnByValue: true,
            awaitPromise: true
        }),
        new Promise(function (_, rej) {
            setTimeout(function () {
                rej(new Error('EVAL_TIMEOUT: biểu thức không trả về sau ' + limit + 'ms'));
            }, limit);
        })
    ]);
    if (r.exceptionDetails) {
        const ex = r.exceptionDetails.exception;
        throw new Error('EVAL_ERR: ' + (ex && (ex.description || ex.value) || 'unknown'));
    }
    return r.result.value;
}

/* ============================================================================
 *  CHẠY TEST
 * ========================================================================== */
(async function main() {
    const userDir = path.join(os.tmpdir(), 'cdp-quiz-' + Date.now());
    const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
        '--allow-file-access-from-files', '--window-size=1600,1000', 'about:blank'
    ], { stdio: 'ignore' });

    const consoleErrors = [];
    let cdp = null;

    try {
        await sleep(3000);

        const list = await getJSON('http://127.0.0.1:' + PORT + '/json/list');
        const target = list.find(function (t) { return t.type === 'page'; });
        if (!target) throw new Error('Không tìm thấy tab của Chrome');

        cdp = await connectCDP(target.webSocketDebuggerUrl);
        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');
        await cdp.send('Page.enable');

        // Thu thập mọi lỗi của trang
        cdp.on(function (ev) {
            const msg = JSON.parse(ev.data);

            if (msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params.exceptionDetails;
                consoleErrors.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
            }
            if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
                consoleErrors.push('CONSOLE: ' + msg.params.args.map(function (a) {
                    return a.value || a.description || '';
                }).join(' '));
            }
            if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
                consoleErrors.push('LOG: ' + msg.params.entry.text);
            }
        });

        const url = 'file:///' + path.join(PROJECT, 'index.html').replace(/\\/g, '/');
        line('===== KIỂM THỬ SCRATCH QUIZ BUILDER 2.3 =====');
        line('URL : ' + url);
        line('Node: ' + process.version);
        line('');

        await cdp.send('Page.navigate', { url: url });
        await sleep(1200);

        /* Chờ cho trang nạp xong hẳn (máy chậm / OneDrive đang đồng bộ có thể lâu hơn). */
        for (let i = 0; i < 40; i++) {
            const ready = await evaluate(cdp,
                `document.readyState === 'complete' && typeof QuizCoding !== 'undefined'`);
            if (ready) break;
            await sleep(400);
        }

        /* ---------------------------------------------------------------
         * 1. NẠP TRANG
         * ------------------------------------------------------------- */
        line('--- 1. NẠP TRANG ---');
        const boot = await evaluate(cdp, `({
            ready: document.readyState,
            coding: typeof QuizCoding,
            codingUi: typeof QuizCodingUI,
            blockItems: document.querySelectorAll('.block-item').length,
            scripts: document.querySelectorAll('script[src]').length,
            hasContent: !!document.getElementById('canvas-content'),
            hasHint: !!document.getElementById('workspace-hint'),
            sysVars: QuizCoding.SYSTEM_VARS.map(function (v) { return v.name; }),
            hasSysTimeBlock: !!QuizCoding.BLOCKS.sys_time,
            hasSysScoreBlock: !!QuizCoding.BLOCKS.sys_score,
            gameCategory: QuizCoding.CATEGORIES.filter(function (c) { return c.id === 'game'; }).length,
            defaultScore: BLOCK_TYPES['multiple-choice'].create().score,
            imageFields: ['imageUrl', 'imageFit', 'imageAlt', 'imageScale'].filter(function (k) {
                return k in BLOCK_TYPES['multiple-choice'].create();
            }).length
        })`);

        check('Trang nạp xong', boot.ready === 'complete');
        check('Engine QuizCoding sẵn sàng', boot.coding === 'object');
        check('Giao diện QuizCodingUI sẵn sàng', boot.codingUi === 'object');
        check('Đủ 6 loại khối câu hỏi (đã gộp trắc nghiệm)', boot.blockItems === 6, boot.blockItems + ' khối');
        check('Nạp đủ 12 file JS module', boot.scripts === 12, boot.scripts + ' file');
        check('Có 2 lớp canvas (#canvas-content + gợi ý)', boot.hasContent && boot.hasHint);
        check('Có 2 biến hệ thống Thời gian / Điểm',
            boot.sysVars.join(',') === 'Thời gian,Điểm', boot.sysVars.join(','));
        check('Có khối ⏱️ thời gian còn lại và ⭐ điểm hiện tại',
            boot.hasSysTimeBlock && boot.hasSysScoreBlock);
        check('Có nhóm khối "Trò chơi"', boot.gameCategory === 1);
        check('Điểm mặc định mỗi câu = 1000', boot.defaultScore === 1000, boot.defaultScore);
        check('Câu hỏi có đủ trường ảnh (imageUrl/imageFit/imageAlt/imageScale)',
            boot.imageFields === 4, boot.imageFields + '/4');

        /* ---------------------------------------------------------------
         * 2. TẠO KHỐI CÂU HỎI
         * ------------------------------------------------------------- */
        line('');
        line('--- 2. TẠO KHỐI CÂU HỎI ---');
        const made = await evaluate(cdp, `(function () {
            var a = createBlock('multiple-choice', 120, 120);
            var b = createBlock('ordering', 420, 120);
            return {
                n: blocks.length,
                dom: document.querySelectorAll('#canvas-content .dropped-block').length,
                parent: a.el.parentElement.id,
                hasEditBtn: !!a.el.querySelector('[data-action="edit"]')
            };
        })()`);

        check('Tạo được 2 khối', made.n === 2, 'blocks=' + made.n);
        check('Khối nằm trong #canvas-content', made.parent === 'canvas-content');
        check('DOM khớp số khối', made.dom === 2, made.dom + ' khối');
        check('Mỗi khối có nút bánh răng ⚙️', made.hasEditBtn === true);

        /* ---------------------------------------------------------------
         * 3. NHẤN 3 LẦN MỞ BẢNG CẤU HÌNH
         * ------------------------------------------------------------- */
        line('');
        line('--- 3. NHẤN 3 LẦN (TRIPLE CLICK) ---');
        const triple = await evaluate(cdp, `(function () {
            var el = document.querySelectorAll('#canvas-content .dropped-block')[1];
            function fire() { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }

            fire(); fire();
            var afterTwo = !document.getElementById('block-editor-overlay').hidden;
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            var previewCard = document.querySelector('#stage-area .stage-player-preview .question-card');
            var previewCanvas = document.querySelector('#stage-area .stage-player-canvas');
            var previewControlsDisabled = !!previewCard
                && Array.from(previewCard.querySelectorAll('button, input, select, textarea'))
                    .every(function (control) { return control.disabled; });

            fire();
            var afterThree = !document.getElementById('block-editor-overlay').hidden;

            return {
                afterTwo: afterTwo,
                previewType: previewCard ? previewCard.dataset.type : null,
                previewScale: previewCanvas ? previewCanvas.style.transform : '',
                previewControlsDisabled: previewControlsDisabled,
                afterThree: afterThree,
                editingId: editingBlock ? editingBlock.id : null,
                blockId: el.dataset.id,
                title: document.getElementById('editor-title').textContent
            };
        })()`);

        check('Nhấn 2 lần KHÔNG mở cấu hình', triple.afterTwo === false);
        check('Double-click hiển thị đúng câu hỏi ở dạng thu nhỏ, chỉ đọc trong sân khấu',
            triple.previewType === 'ordering' && triple.previewScale.indexOf('scale(') === 0
                && triple.previewControlsDisabled,
            triple.previewType + ', ' + triple.previewScale);
        check('Nhấn 3 lần MỞ cấu hình', triple.afterThree === true, triple.title);
        check('Đúng khối được chọn để sửa', triple.editingId === triple.blockId);

        /* ---------------------------------------------------------------
         * 3b. SỬA CÂU HỎI TỪ KHỐI TRONG WORKSPACE (nút ⚙️)
         *  Bảo hiểm cho lỗi: form cấu hình không có ô nhập / không lưu được.
         * ------------------------------------------------------------- */
        line('');
        line('--- 3b. SỬA CÂU HỎI TỪ KHỐI TRONG WORKSPACE ---');
        const openForm = await evaluate(cdp, `(function () {
            // Đóng modal đang mở (do bước 3 triple-click) để nút ⚙️ hoạt động
            document.getElementById('editor-cancel-btn').click();

            // Tạo một khối RIÊNG để thử sửa, không ảnh hưởng các bước sau
            var t = createBlock('multiple-choice', 60, 620);
            window.__editTestId = t.id;
            var el = t.el;
            var gear = el.querySelector('[data-action="edit"]');
            gear.click();

            var form = document.getElementById('editor-form-container');
            var rows = form.querySelectorAll('.row-list[data-list-field="multipleChoice"] .row-item');
            var row0 = rows.length ? rows[0] : null;
            var shuffleSwitch = form.querySelector('[data-field="shuffleOptions"]');
            return {
                opened: !document.getElementById('block-editor-overlay').hidden,
                hasQuestion: !!form.querySelector('[data-field="question"]'),
                hasScore: !!form.querySelector('[data-field="score"]'),
                hasTime: !!form.querySelector('[data-field="timeLimit"]'),
                hasNote: !!form.querySelector('[data-field="note"]'),
                hasNoteSwitch: !!form.querySelector('[data-field="noteEnabled"]'),
                rowCount: rows.length,
                hasOptInput: !!(row0 && row0.querySelector('input[data-field="multipleChoice"]')),
                hasCorrectBox: !!(row0 && row0.querySelector('input[data-field="optionCorrect"]')),
                hasShuffleSwitch: !!shuffleSwitch,
                shuffleInitiallyOff: !!shuffleSwitch && !shuffleSwitch.checked,
                hasCountHint: /\d+\s+đáp án đúng/i.test(form.textContent),
                optValue: row0 ? row0.querySelector('input[data-field="multipleChoice"]').value : ''
            };
        })()`);

        check('Bấm nút ⚙️ trên khối mở được bảng cấu hình', openForm.opened === true);
        check('Form có ô nhập câu hỏi / điểm / thời gian',
            openForm.hasQuestion && openForm.hasScore && openForm.hasTime);
        check('Form có ô ghi chú + công tắc bật ghi chú',
            openForm.hasNote && openForm.hasNoteSwitch);
        check('Form có danh sách đáp án kèm ô tick "Đúng"',
            openForm.rowCount > 0 && openForm.hasOptInput && openForm.hasCorrectBox,
            openForm.rowCount + ' dòng');
        check('Form có công tắc xáo trộn đáp án, mặc định tắt',
            openForm.hasShuffleSwitch && openForm.shuffleInitiallyOff);
        check('Form cấu hình không hiển thị số lượng đáp án đúng',
            openForm.hasCountHint === false);
        check('Dòng đáp án hiển thị đúng nội dung (không phải [object Object])',
            openForm.optValue.length > 0 && openForm.optValue.indexOf('[object') === -1,
            openForm.optValue);

        const saveForm = await evaluate(cdp, `(function () {
            var b = blocks.find(function (x) { return x.id === window.__editTestId; });
            var form = document.getElementById('editor-form-container');

            form.querySelector('[data-field="question"]').value = 'Cau hoi da sua tu workspace';
            form.querySelector('[data-field="score"]').value = '2500';
            form.querySelector('[data-field="note"]').value = 'Ghi chu da sua';

            // Sửa dòng đáp án thứ 2 và chuyển cờ "Đúng" sang dòng đó
            var rows = form.querySelectorAll('.row-list[data-list-field="multipleChoice"] .row-item');
            rows[1].querySelector('input[data-field="multipleChoice"]').value = 'Dap an da sua';
            rows[1].querySelector('input[data-field="optionCorrect"]').checked = true;
            rows[0].querySelector('input[data-field="optionCorrect"]').checked = false;
            form.querySelector('[data-field="shuffleOptions"]').checked = true;

            // Thêm 1 dòng mới (kiểm tra listener vẫn gắn sau khi mở lại modal)
            var before = rows.length;
            form.querySelector('[data-action="add-row"]').click();
            var after = form.querySelectorAll('.row-list[data-list-field="multipleChoice"] .row-item').length;

            document.getElementById('editor-save-btn').click();

            var savedShuffleOptions = b.data.shuffleOptions;
            return {
                closed: document.getElementById('block-editor-overlay').hidden,
                question: b.data.question,
                score: b.data.score,
                note: b.data.note,
                opt1: b.data.options[1] ? b.data.options[1].text : '',
                correctCount: b.data.options.filter(function (o) { return o.correct; }).length,
                correctIndex: b.data.options.findIndex(function (o) { return o.correct; }),
                shuffleOptions: savedShuffleOptions,
                chip: b.el.innerHTML.indexOf('Cau hoi da sua tu workspace') !== -1,
                addedRow: after === before + 1
            };
        })()`);

        check('Bấm "Lưu cấu hình" đóng modal', saveForm.closed === true);
        check('Nội dung câu hỏi đã lưu', saveForm.question === 'Cau hoi da sua tu workspace', saveForm.question);
        check('Điểm đã lưu', saveForm.score === 2500, String(saveForm.score));
        check('Ghi chú đã lưu', saveForm.note === 'Ghi chu da sua', saveForm.note);
        check('Đáp án đã sửa được lưu', saveForm.opt1 === 'Dap an da sua', saveForm.opt1);
        check('Cờ "Đúng" chuyển đúng dòng (1 đáp án đúng)',
            saveForm.correctCount === 1 && saveForm.correctIndex === 1,
            saveForm.correctCount + ' đáp án đúng ở index ' + saveForm.correctIndex);
        check('Trạng thái bật xáo trộn được lưu cùng câu hỏi',
            saveForm.shuffleOptions === true, String(saveForm.shuffleOptions));
        check('Khối trong workspace được vẽ lại với nội dung mới', saveForm.chip === true);
        check('Nút "+ Thêm đáp án" vẫn hoạt động', saveForm.addedRow === true);

        line('');
        line('--- 3c. XÁO TRỘN ĐÁP ÁN TRẮC NGHIỆM ---');
        const optionShuffle = await evaluate(cdp, `(function () {
            var savedRandom = Math.random;
            var savedGradeChoice = gradeChoice;
            var capturedIndex = null;
            var capturedMultiSelection = [];
            var block = {
                data: {
                    options: [
                        { text: 'Đáp án A', correct: true },
                        { text: 'Đáp án B', correct: false },
                        { text: 'Đáp án C', correct: true },
                        { text: 'Đáp án D', correct: false }
                    ],
                    shuffleOptions: true
                }
            };
            Math.random = function () { return 0; };
            gradeChoice = function (wrap, currentBlock, index, multi, selected) {
                if (multi) capturedMultiSelection = selected.slice();
                else capturedIndex = selected[0];
            };
            var shuffled = buildChoiceArea(block, 0, false).querySelector('.option-list');
            var displayed = Array.from(shuffled.querySelectorAll('.option-btn')).map(function (button) {
                return button.querySelector('.option-text').textContent;
            });
            shuffled.querySelectorAll('.option-btn')[displayed.length - 1].click();
            var correctMapping = capturedIndex === 0 && block.data.options[capturedIndex].correct;

            var multi = buildChoiceArea(block, 1, true).querySelector('.option-list');
            var multiButtons = multi.querySelectorAll('.option-btn');
            multiButtons[1].click();
            multiButtons[3].click();
            multi.querySelector('.submit-btn').click();
            capturedMultiSelection.sort(function (a, b) { return a - b; });
            var multiMapping = JSON.stringify(capturedMultiSelection) === '[0,2]'
                && capturedMultiSelection.every(function (index) { return block.data.options[index].correct; });

            block.data.shuffleOptions = false;
            var ordered = buildChoiceArea(block, 0, false).querySelector('.option-list');
            var unchanged = Array.from(ordered.querySelectorAll('.option-text')).map(function (text) {
                return text.textContent;
            });
            Math.random = savedRandom;
            gradeChoice = savedGradeChoice;
            return {
                displayed: displayed.join(','),
                correctMapping: correctMapping,
                multiMapping: multiMapping,
                unchanged: unchanged.join(',')
            };
        })()`);
        check('Bật xáo trộn làm đổi thứ tự đáp án nhưng giữ đúng ánh xạ đáp án',
            optionShuffle.displayed === 'Đáp án B,Đáp án C,Đáp án D,Đáp án A'
                && optionShuffle.correctMapping && optionShuffle.multiMapping,
            optionShuffle.displayed + '; chọn một=' + optionShuffle.correctMapping
                + '; chọn nhiều=' + optionShuffle.multiMapping);
        check('Tắt xáo trộn giữ nguyên thứ tự ban đầu',
            optionShuffle.unchanged === 'Đáp án A,Đáp án B,Đáp án C,Đáp án D',
            optionShuffle.unchanged);

        // Mở lại modal lần 2: form phải có ô nhập và không bị mất listener
        const reopen = await evaluate(cdp, `(function () {
            var t = blocks.find(function (x) { return x.id === window.__editTestId; });
            t.el.querySelector('[data-action="edit"]').click();
            var form = document.getElementById('editor-form-container');
            var q = form.querySelector('[data-field="question"]');
            var rows = form.querySelectorAll('.row-list[data-list-field="multipleChoice"] .row-item');
            return {
                hasQuestion: !!q,
                questionValue: q ? q.value : '',
                shuffleChecked: !!form.querySelector('[data-field="shuffleOptions"]').checked,
                rowCount: rows.length
            };
        })()`);

        check('Mở lại modal lần 2 vẫn có ô nhập câu hỏi', reopen.hasQuestion === true);
        check('Mở lại modal hiển thị đúng nội dung đã lưu',
            reopen.questionValue === 'Cau hoi da sua tu workspace', reopen.questionValue);
        check('Mở lại modal giữ trạng thái xáo trộn đã lưu',
            reopen.shuffleChecked === true, String(reopen.shuffleChecked));

        // Dọn khối thử nghiệm rồi mở lại modal của khối gốc (cho các bước 4-6)
        await evaluate(cdp, `(function () {
            document.getElementById('editor-cancel-btn').click();
            var t = blocks.find(function (x) { return x.id === window.__editTestId; });
            if (t) removeBlock(t);
            var first = document.querySelector('#canvas-content .dropped-block');
            first.querySelector('[data-action="edit"]').click();
            return true;
        })()`);

        /* ---------------------------------------------------------------
         * 4. TAB CẤU HÌNH / LẬP TRÌNH KHỐI
         * ------------------------------------------------------------- */
        line('');
        line('--- 4. TAB & GIAO DIỆN KHỐI LỆNH ---');
        const coding = await evaluate(cdp, `(function () {
            document.querySelector('[data-editor-tab="code"]').click();
            return {
                codeVisible: !document.getElementById('editor-code-container').hidden,
                formHidden: document.getElementById('editor-form-container').hidden,
                mode: document.getElementById('block-editor-modal').classList.contains('coding-mode'),
                cats: document.querySelectorAll('.coding-cat').length,
                palette: document.querySelectorAll('.cb-palette').length,
                expectedPalette: Object.keys(QuizCoding.BLOCKS).length,
                stacks: document.querySelectorAll('.coding-stack').length,
                hasVarsInput: !!document.getElementById('coding-vars-input'),
                hasPaletteHint: !!document.querySelector('.coding-palette-hint'),
                hasSysLegend: !!document.querySelector('.coding-sysvars'),
                delButtons: document.querySelectorAll('.cb-del').length,
                trashZones: document.querySelectorAll('.coding-trash').length
            };
        })()`);

        check('Tab "Lập trình khối" hiển thị', coding.codeVisible === true && coding.formHidden === true);
        check('Modal mở rộng ở chế độ coding', coding.mode === true);
        check('Đủ 6 nhóm khối (thêm nhóm Trò chơi)', coding.cats === 6, coding.cats + ' nhóm');
        check('Đủ khối mẫu trong danh mục', coding.palette === coding.expectedPalette,
            coding.palette + '/' + coding.expectedPalette + ' khối');
        check('Có 3 chương trình', coding.stacks === 3, coding.stacks + ' chương trình');
        check('Có ô quản lý biến + chú thích biến hệ thống',
            coding.hasVarsInput && coding.hasSysLegend);
        check('KHÔNG còn nút ✕ trên khối lệnh', coding.delButtons === 0, coding.delButtons + ' nút ✕');
        check('KHÔNG còn vùng xoá 🗑️ riêng', coding.trashZones === 0, coding.trashZones + ' vùng');
        check('Danh mục có dải nhắc "kéo vào đây để xoá"', coding.hasPaletteHint === true);

        /* ---------------------------------------------------------------
         * 5. KÉO KHỐI LỆNH TỪ DANH MỤC VÀO CHƯƠNG TRÌNH (mô phỏng DragEvent)
         * ------------------------------------------------------------- */
        line('');
        line('--- 5. KÉO KHỐI LỆNH (DRAG & DROP) ---');
        const dnd = await evaluate(cdp, `(function () {
            var palette = document.querySelector('[data-palette-type="set_var"]');
            var gap = document.querySelector('.coding-stack[data-stack="setup"] .cb-gap');
            var dt = new DataTransfer();

            palette.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
            gap.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            gap.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

            var prog = QuizCoding.ensureProgram(editingBlock.data);
            return {
                nodes: prog.stacks.setup.length,
                type: prog.stacks.setup[0] ? prog.stacks.setup[0].t : null,
                rendered: document.querySelectorAll('.coding-stack[data-stack="setup"] > .coding-stack-body > .cb').length,
                badge: document.querySelector('.editor-tab-count').textContent,
                badgeHidden: document.querySelector('.editor-tab-count').hidden
            };
        })()`);

        check('Thả được khối vào "khi bắt đầu"', dnd.nodes === 1, 'node=' + dnd.type);
        check('Khối được vẽ lại trong chương trình', dnd.rendered === 1, dnd.rendered + ' khối');
        check('Badge đếm số khối trên tab', dnd.badge === '1' && dnd.badgeHidden === false, 'badge=' + dnd.badge);

        /* ---------------------------------------------------------------
         * 6. LẬP TRÌNH: RANDOM HOÁ + CÔNG THỨC ĐIỂM + LỜI NHẮN
         * ------------------------------------------------------------- */
        line('');
        line('--- 6. CHẠY THỬ CHƯƠNG TRÌNH KHỐI LỆNH ---');
        const program = await evaluate(cdp, `(function () {
            var b = editingBlock;
            var p = QuizCoding.ensureProgram(b.data);
            p.vars = ['a', 'b', 'kq'];
            p.stacks.setup = [];
            p.stacks.correct = [];
            p.stacks.wrong = [];

            function node(t) { return QuizCoding.createNode(t); }
            function num(v) { return { id: 'n' + Math.random(), t: 'num', v: v }; }
            function txt(v) { return { id: 't' + Math.random(), t: 'txt', v: v }; }
            function vname(v) { return { id: 'v' + Math.random(), t: 'varname', v: v }; }
            function varRef(name) { var n = node('var_ref'); n.slots.name = vname(name); return n; }
            function math(a, op, bb) {
                var n = node('math_op');
                n.slots.a = a;
                n.slots.op = { id: 'o' + Math.random(), t: 'op', v: op };
                n.slots.b = bb;
                return n;
            }
            function setVar(name, expr) {
                var n = node('set_var');
                n.slots.name = vname(name);
                n.slots.value = expr;
                return n;
            }
            function rand(min, max) {
                var n = node('random');
                n.slots.min = num(min);
                n.slots.max = num(max);
                return n;
            }

            p.stacks.setup.push(setVar('a', rand(1, 9)));
            p.stacks.setup.push(setVar('b', rand(1, 9)));
            p.stacks.setup.push(setVar('kq', math(varRef('a'), '+', varRef('b'))));

            var add = node('add_score');
            add.slots.value = math(varRef('a'), '+', num(5));
            p.stacks.correct.push(add);

            var fb = node('set_feedback');
            fb.slots.value = txt('Gợi ý: {{a}} + {{b}} = {{kq}}');
            p.stacks.wrong.push(fb);

            // Nội dung câu hỏi/đáp án dùng placeholder {{bien}}
            b.data.question = 'Tính {{a}} + {{b}} = ?';
            b.data.options = [
                { text: '{{kq}}', correct: true },
                { text: '{{kq}} + 1', correct: false },
                { text: '{{a}}', correct: false },
                { text: '0', correct: false }
            ];

            renderBlock(b);
            QuizCodingUI.refresh();

            var r = QuizCoding.runPreview(b);
            return {
                vars: r.vars,
                question: r.question,
                opt0: r.sample.options ? r.sample.options[0].text : '',
                score: r.score,
                feedback: r.feedback,
                error: r.error,
                expectedScore: r.vars.a + 5,
                hasCodeMark: b.el.innerHTML.indexOf('block-code-dot') !== -1
            };
        })()`);

        check('Chạy thử không lỗi', program.error === '');
        check('Random hoá câu hỏi bằng placeholder',
            /^Tính \d+ \+ \d+ = \?$/.test(program.question), program.question);
        check('Random hoá đáp án đúng', program.opt0 === String(program.vars.kq),
            'kq=' + program.vars.kq + ', đáp án=' + program.opt0);
        check('Công thức điểm tuỳ biến (a + 5)', program.score === program.expectedScore,
            'điểm=' + program.score + ', mong đợi=' + program.expectedScore);
        check('Lời nhắn khi sai thay được biến', program.feedback ===
            ('Gợi ý: ' + program.vars.a + ' + ' + program.vars.b + ' = ' + program.vars.kq), program.feedback);
        check('Khối hiển thị dấu 🧩', program.hasCodeMark === true);

        /* ---------------------------------------------------------------
         * 6b. LƯU CẤU HÌNH: chương trình khối lệnh phải được giữ lại
         * ------------------------------------------------------------- */
        const saved = await evaluate(cdp, `(function () {
            // Cập nhật form giống người dùng nhập (để collectEditorData lấy đúng)
            document.querySelector('[data-field="question"]').value = 'Tính {{a}} + {{b}} = ?';
            var noteChk = document.querySelector('[data-field="noteEnabled"]');
            if (noteChk) noteChk.checked = true;
            var noteArea = document.querySelector('[data-field="note"]');
            if (noteArea) noteArea.value = 'Ghi chú kiểm thử: {{a}} + {{b}} = {{kq}}';
            var texts = ['{{kq}}', '{{kq}} + 1', '{{a}}', '0'];
            var rows = document.querySelectorAll('[data-list="options"] .row-item');
            Array.prototype.forEach.call(rows, function (row, i) {
                var input = row.querySelector('input[data-field="options"]');
                if (input) input.value = texts[i];
                var chk = row.querySelector('input[data-field="correct"]');
                if (chk) chk.checked = (i === 0);
            });

            document.getElementById('editor-save-btn').click();

            var b = blocks.find(function (x) { return x.type === 'multiple-choice'; });
            return {
                closed: document.getElementById('block-editor-overlay').hidden,
                question: b.data.question,
                opt0: b.data.options[0].text,
                correctCount: b.data.options.filter(function (o) { return o.correct; }).length,
                setup: b.data.program.stacks.setup.length,
                correct: b.data.program.stacks.correct.length,
                wrong: b.data.program.stacks.wrong.length
            };
        })()`);

        check('Bấm "Lưu cấu hình" đóng modal', saved.closed === true);
        check('Giữ đủ 3+1+1 khối lệnh sau khi lưu',
            saved.setup === 3 && saved.correct === 1 && saved.wrong === 1,
            saved.setup + '/' + saved.correct + '/' + saved.wrong);
        check('Nội dung câu hỏi giữ placeholder', saved.question === 'Tính {{a}} + {{b}} = ?', saved.question);
        check('Đáp án đúng duy nhất được lưu', saved.correctCount === 1, saved.correctCount + ' đáp án đúng');

        /* ---------------------------------------------------------------
         * 7. CHẠY QUIZ: RANDOM HOÁ DỮ LIỆU RUNTIME
         * ------------------------------------------------------------- */
        line('');
        line('--- 7. CHẠY QUIZ (RUNTIME RANDOM) ---');
        const player = await evaluate(cdp, `(function () {
            document.getElementById('start-btn').click();

            var card = document.querySelector('#quiz-player-container .question-card');
            var bar = document.querySelector('.q-timebar');
            var fill = document.querySelector('.q-timebar-fill');
            return {
                view: document.getElementById('player-view').style.display,
                cards: document.querySelectorAll('#quiz-player-container .question-card').length,
                hasHost: !!document.getElementById('quiz-card-host'),
                q: card ? card.querySelector('.q-text').textContent.replace(/\u00A0/g, ' ') : '',
                opt0: card ? card.querySelector('.option-btn .option-text').textContent : '',
                submitLabel: card && card.querySelector('.submit-btn')
                    ? card.querySelector('.submit-btn').textContent : '',
                hasTimeBar: !!bar,
                barWidth: fill ? fill.style.width : '',
                barSeconds: bar ? bar.dataset.seconds : '',
                scoreChip: bar ? bar.querySelector('.qts-value').textContent : '',
                oldTimerVisible: (function () {
                    var t = document.querySelector('.q-timer');
                    return t ? getComputedStyle(t).display !== 'none' : false;
                })(),
                progress: document.getElementById('quiz-progress-text').textContent,
                original: blocks.find(function (b) { return b.type === 'multiple-choice'; }).data.question,
                runtime: playOrder[0] ? playOrder[0].data.question : '',
                runtimeVars: playOrder[0] && playOrder[0].ctx ? playOrder[0].ctx.vars : null,
                currentIndex: currentIndex,
                /* Bản 2.2 */
                centered: card.classList.contains('is-centered'),
                hasImageClass: card.classList.contains('has-image'),
                charCount: card.querySelectorAll('.q-text .qch').length,
                animMs: Number((card.querySelector('[data-question-text]') || {}).dataset
                    ? card.querySelector('[data-question-text]').dataset.animMs : 0),
                fxIcons: document.querySelectorAll('#quiz-fx .fx-icon').length,
                fxPointer: (function () {
                    var fx = document.getElementById('quiz-fx');
                    return fx ? getComputedStyle(fx).pointerEvents : '';
                })(),
                bg: document.getElementById('player-view').style.getPropertyValue('--quiz-bg').trim(),
                nextBtnNow: !!document.querySelector('.next-btn'),
                answerHintVisible: !!card.querySelector('.q-answer-label')
            };
        })()`);

        check('Chuyển sang chế độ chơi', player.view === 'flex');
        check('CHỈ hiển thị 1 câu tại một thời điểm (kiểu Quiz.com)',
            player.cards === 1 && player.hasHost === true, player.cards + ' câu');
        check('Câu hỏi runtime đã random', player.q.indexOf('{{') === -1 && /[0-9]+ \+ [0-9]+/.test(player.q), player.q);
        check('Đáp án runtime đã thay số', player.opt0.indexOf('{{') === -1, player.opt0);
        check('Dữ liệu gốc trong builder giữ nguyên placeholder',
            player.original.indexOf('{{a}}') !== -1, player.original);
        check('Có bảng biến runtime', !!player.runtimeVars && typeof player.runtimeVars.a === 'number');
        check('Có biến hệ thống trong ngữ cảnh runtime',
            player.runtimeVars['Thời gian'] !== undefined && player.runtimeVars['Điểm'] !== undefined,
            'Thời gian=' + player.runtimeVars['Thời gian'] + ', Điểm=' + player.runtimeVars['Điểm']);
        check('Câu hỏi 1 đáp án KHÔNG có nút nộp (bấm là nộp)', player.submitLabel === '');
        check('Có thanh thời gian ngang (không phải đồng hồ chữ số)',
            player.hasTimeBar === true && player.oldTimerVisible === false);
        check('Thanh thời gian bắt đầu đầy (100%)', parseFloat(player.barWidth) === 100, player.barWidth);
        check('Điểm trên thanh thời gian là con số', /^[0-9]/.test(player.scoreChip), player.scoreChip);
        check('Tiến trình hiển thị đúng câu hiện tại', player.progress === 'Câu 1 / 2', player.progress);
        check('Màn hình chơi không hiển thị gợi ý số lượng đáp án đúng',
            player.answerHintVisible === false);

        /* --- Bản 2.2: nền tối, icon rơi, câu hỏi hiện từng ký tự 3 giây --- */
        check('Câu hỏi không có ảnh => căn giữa (.is-centered)',
            player.centered === true && player.hasImageClass === false);
        check('Câu hỏi được tách thành từng ký tự',
            player.charCount > 5, player.charCount + ' ký tự');
        check('Tổng thời gian hiện chữ ≈ 3 giây',
            Math.abs(player.animMs - 3000) <= 120, player.animMs + 'ms');
        check('Có nền tối ngẫu nhiên (--quiz-bg)', /^#/.test(player.bg), player.bg);
        check('Lớp icon rơi hoạt động và không chặn chuột',
            player.fxIcons > 0 && player.fxPointer === 'none', player.fxIcons + ' icon');

        /* ---------------------------------------------------------------
         * 7b. THANH THỜI GIAN ĐẾM NGƯỢC (requestAnimationFrame)
         * ------------------------------------------------------------- */
        line('');
        line('--- 7b. THANH THỜI GIAN ĐẾM NGƯỢC ---');
        const barTick = await evaluate(cdp, `(async function () {
            var bar = document.querySelector('.q-timebar');
            var fill = bar.querySelector('.q-timebar-fill');
            var before = { w: parseFloat(fill.style.width), s: parseFloat(bar.dataset.seconds) };
            await new Promise(function (r) { setTimeout(r, 700); });
            var after = { w: parseFloat(fill.style.width), s: parseFloat(bar.dataset.seconds) };
            return { before: before, after: after };
        })()`);

        check('Thanh thời gian ngắn dần theo thời gian thực',
            barTick.after.w < barTick.before.w && barTick.after.s < barTick.before.s,
            barTick.before.s + 's → ' + barTick.after.s + 's');
        check('Thời gian còn lại chính xác (sai số < 0.4s)',
            Math.abs(barTick.after.s - (barTick.before.s - 0.7)) < 0.4, barTick.after.s + 's');

        /* ---------------------------------------------------------------
         * 8. NỘP BÀI: CHỐT THỜI GIAN + CHẤM ĐIỂM BẰNG CÔNG THỨC KHỐI LỆNH
         * ------------------------------------------------------------- */
        line('');
        line('--- 8. BẤM LỰA CHỌN LÀ NỘP BÀI (1 đáp án) + CHẤM ĐIỂM ---');
        const scored = await evaluate(cdp, `(function () {
            var card = document.querySelectorAll('#quiz-player-container .question-card')[0];
            var opts = card.querySelectorAll('.option-btn');

            Array.prototype.forEach.call(opts, function (button) {
                button.style.transition = 'none';
            });
            var submitExists = !!card.querySelector('.submit-btn');
            opts[0].click();   // đáp án 0 là đáp án đúng ({{kq}}) => nộp luôn
            var correctBaseline = opts[0].cloneNode(true);
            correctBaseline.classList.remove('is-correct');
            opts[0].parentElement.appendChild(correctBaseline);
            var correctBackgroundAtSelection = getComputedStyle(correctBaseline).backgroundColor;
            correctBaseline.remove();
            var wrongBackgroundBefore = getComputedStyle(opts[1]).backgroundColor;
            opts[1].classList.add('is-wrong');
            var correctStyle = getComputedStyle(opts[0]);
            var wrongStyle = getComputedStyle(opts[1]);

            var bar = document.querySelector('.q-timebar');
            var list = card.querySelector('.option-list');
            return {
                submitExists: submitExists,
                locked: list.dataset.locked === 'true',
                dimCount: card.querySelectorAll('.option-btn.is-dim').length,
                correctCount: card.querySelectorAll('.option-btn.is-correct').length,
                correctBorder: correctStyle.borderTopColor,
                correctBackgroundUnchanged: correctStyle.backgroundColor === correctBackgroundAtSelection,
                wrongBorder: wrongStyle.borderTopColor,
                wrongBackgroundUnchanged: wrongStyle.backgroundColor === wrongBackgroundBefore,
                total: playerScore,
                resultScore: playerResults[0] ? playerResults[0].score : null,
                resultTime: playerResults[0] ? playerResults[0].timeLeft : null,
                correct: playerResults[0] ? playerResults[0].correct : null,
                expected: playOrder[0].ctx.vars.a + 5,
                progress: document.getElementById('quiz-score').textContent,
                frozen: bar.classList.contains('is-frozen'),
                chip: bar.querySelector('.qts-value').textContent,
                chipPreview: Number(bar.querySelector('.qts-value').dataset.preview),
                timeVar: playOrder[0].ctx.vars['Thời gian'],
                nextBtnNow: !!document.querySelector('.next-btn')
            };
        })()`);

        check('Không có nút nộp ở câu 1 đáp án', scored.submitExists === false);
        check('Bấm một lựa chọn là nộp luôn (khoá lựa chọn)', scored.locked === true);
        check('Phản hồi trắc nghiệm chỉ đổi viền xanh/đỏ, không đổi nền hay làm mờ',
            scored.dimCount === 0 && scored.correctCount === 1
                && scored.correctBorder === 'rgb(34, 197, 94)'
                && scored.wrongBorder === 'rgb(239, 68, 68)'
                && scored.correctBackgroundUnchanged && scored.wrongBackgroundUnchanged,
            scored.correctBorder + ' / ' + scored.wrongBorder);
        check('Trả lời đúng được ghi nhận', scored.correct === true);
        check('Điểm cộng theo công thức người dùng', scored.total === scored.expected,
            'nhận ' + scored.total + ' / mong đợi ' + scored.expected);
        check('Thanh điểm tổng cập nhật', scored.progress === '⭐ ' + scored.total + ' điểm', scored.progress);
        check('Thời gian còn lại được lưu vào kết quả câu',
            scored.resultTime > 0 && scored.resultTime <= 30, scored.resultTime + 's');
        check('Biến hệ thống "Thời gian" = thời gian còn lại lúc nộp',
            Math.abs(scored.timeVar - scored.resultTime) < 0.11,
            'biến=' + scored.timeVar + ', lưu=' + scored.resultTime);
        check('Thanh thời gian bị chốt (is-frozen)', scored.frozen === true);
        check('Điểm trên thanh = điểm thực nhận',
            scored.chipPreview === scored.resultScore && scored.chip === String(scored.resultScore), scored.chip);
        check('Sau khi nộp CHƯA có nút chuyển câu', scored.nextBtnNow === false);

        /* ---------------------------------------------------------------
         * 8b. GHI CHÚ NỔI + NÚT CHUYỂN CÂU XUẤT HIỆN SAU 3 GIÂY
         * ------------------------------------------------------------- */
        line('');
        line('--- 8b. GHI CHÚ NỔI & NÚT CHUYỂN CÂU (3 giây) ---');
        const notePanel = await evaluate(cdp, `(async function () {
            var panel = document.getElementById('quiz-note-float');
            var immediate = {
                visible: panel ? !panel.hidden : false,
                text: panel ? panel.querySelector('[data-nf-body]').textContent : ''
            };

            await new Promise(function (r) { setTimeout(r, 3300); });

            var p = document.getElementById('quiz-note-float');
            var toggle = p ? p.querySelector('[data-nf-toggle]') : null;
            var btn = document.querySelector('.next-btn');

            // Thu gọn rồi mở lại ghi chú
            var beforeCollapse = p ? !p.hidden : false;
            if (toggle) toggle.click();
            var collapsed = p ? p.classList.contains('is-collapsed') : false;
            var bodyHidden = p ? getComputedStyle(p.querySelector('[data-nf-body]')).display === 'none' : false;
            if (toggle) toggle.click();
            var reopened = p ? !p.classList.contains('is-collapsed') : false;

            return {
                immediate: immediate,
                hasPanel: !!p,
                visible: p ? !p.hidden : false,
                text: p ? p.querySelector('[data-nf-body]').textContent : '',
                hasToggle: !!toggle,
                beforeCollapse: beforeCollapse,
                collapsed: collapsed,
                bodyHidden: bodyHidden,
                reopened: reopened,
                btnAfter3s: !!btn,
                btnText: btn ? btn.textContent.trim() : ''
            };
        })()`);

        check('Ghi chú nổi hiện NGAY sau khi nộp bài',
            notePanel.hasPanel === true && notePanel.immediate.visible === true);
        check('Ghi chú đã thay biến {{a}}/{{b}}/{{kq}}',
            notePanel.immediate.text.indexOf('{{') === -1 && /[0-9]/.test(notePanel.immediate.text),
            notePanel.immediate.text);
        check('Có nút thu gọn ghi chú', notePanel.hasToggle === true);
        check('Thu gọn => ẩn nội dung ghi chú',
            notePanel.collapsed === true && notePanel.bodyHidden === true);
        check('Nhấn lần nữa => mở lại ghi chú', notePanel.reopened === true);
        check('Sau 3 giây mới xuất hiện nút chuyển câu',
            notePanel.btnAfter3s === true && /Câu tiếp theo/.test(notePanel.btnText), notePanel.btnText);

        /* ---------------------------------------------------------------
         * 8c. BẤM NÚT CHUYỂN CÂU => SANG CÂU 2
         * ------------------------------------------------------------- */
        line('');
        line('--- 8c. CHUYỂN CÂU BẰNG NÚT ---');
        const nextQ = await evaluate(cdp, `(async function () {
            var btn = document.querySelector('.next-btn');
            if (btn) btn.click();
            await new Promise(function (r) { setTimeout(r, 300); });

            var card = document.querySelector('#quiz-player-container .question-card');
            var bar = document.querySelector('.q-timebar');
            var note = document.getElementById('quiz-note-float');
            return {
                cards: document.querySelectorAll('#quiz-player-container .question-card').length,
                index: card ? card.dataset.index : '',
                type: card ? card.dataset.type : '',
                currentIndex: currentIndex,
                progress: document.getElementById('quiz-progress-text').textContent,
                barFresh: bar ? !bar.classList.contains('is-frozen') : false,
                barSeconds: bar ? parseFloat(bar.dataset.seconds) : 0,
                noteHidden: note ? note.hidden : true,
                sortRows: card ? card.querySelectorAll('.sort-item').length : 0,
                handleCount: card ? card.querySelectorAll('.sort-handle').length : 0,
                submitLabel: card && card.querySelector('.submit-btn')
                    ? card.querySelector('.submit-btn').textContent.trim() : ''
            };
        })()`);

        check('Vẫn chỉ có 1 câu trên màn hình', nextQ.cards === 1, nextQ.cards + ' câu');
        check('Đã sang câu 2 (index = 1)', nextQ.index === '1' && nextQ.currentIndex === 1, 'index=' + nextQ.index);
        check('Câu 2 đúng loại đã tạo (ordering)', nextQ.type === 'ordering', nextQ.type);
        check('Thanh thời gian được làm mới cho câu 2',
            nextQ.barFresh === true && nextQ.barSeconds > 29, nextQ.barSeconds + 's');
        check('Tiến trình cập nhật "Câu 2 / 2"', nextQ.progress === 'Câu 2 / 2', nextQ.progress);
        check('Ghi chú nổi được ẩn khi sang câu mới', nextQ.noteHidden === true);
        check('Câu sắp xếp có các hàng + tay cầm kéo "="',
            nextQ.sortRows >= 3 && nextQ.handleCount === nextQ.sortRows,
            nextQ.sortRows + ' hàng / ' + nextQ.handleCount + ' tay cầm');
        check('Câu sắp xếp có nút "Nộp đáp án"', nextQ.submitLabel === 'Nộp đáp án', nextQ.submitLabel);

        /* ---------------------------------------------------------------
         * 8d. KẾT THÚC VÁN: BẢNG TỔNG KẾT CÓ THỜI GIAN TỪNG CÂU
         * ------------------------------------------------------------- */
        line('');
        line('--- 8d. BẢNG TỔNG KẾT ---');
        const finish = await evaluate(cdp, `(async function () {
            var btn = document.querySelector('.submit-btn');
            applyQuestionResult(playOrder[1], 1, false, btn);   // câu 2 trả lời sai
            await new Promise(function (r) { setTimeout(r, 3300); });

            var lastBtn = document.querySelector('.next-btn');
            var lastText = lastBtn ? lastBtn.textContent.trim() : '';
            if (lastBtn) lastBtn.click();
            await new Promise(function (r) { setTimeout(r, 400); });

            return {
                lastText: lastText,
                resultCard: !!document.querySelector('.result-card'),
                rows: document.querySelectorAll('.result-row').length,
                times: Array.prototype.map.call(document.querySelectorAll('.result-row .r-time'),
                    function (e) { return e.textContent.trim(); }),
                score: (document.querySelector('.result-score') || {}).textContent || ''
            };
        })()`);

        check('Câu cuối có nút "Xem kết quả"', /Xem kết quả/.test(finish.lastText), finish.lastText);
        check('Bấm nút => hiện bảng tổng kết', finish.resultCard === true);
        check('Bảng tổng kết đủ 2 dòng', finish.rows === 2, finish.rows + ' dòng');
        check('Mỗi dòng có cột thời gian còn lại', finish.times.length === 2, finish.times.join(' | '));

        /* ---------------------------------------------------------------
         * 9. LỜI NHẮN KHI TRẢ LỜI SAI (stack "khi trả lời sai")
         * ------------------------------------------------------------- */
        const feedback = await evaluate(cdp, `(function () {
            var src = blocks.find(function (b) { return b.type === 'multiple-choice'; });
            var rt = QuizCoding.prepareRuntimeBlock(src);
            var fb = QuizCoding.penalize(rt);
            return { fb: fb, hasNumber: /[0-9]/.test(fb) };
        })()`);

        check('Stack "khi trả lời sai" tạo lời nhắn',
            feedback.fb.indexOf('Gợi ý') === 0 && feedback.hasNumber, feedback.fb);

        /* ---------------------------------------------------------------
         * 9b. ENGINE: VÒNG LẶP, ĐIỀU KIỆN, CLOZE {{1}}, FALLBACK ĐIỂM
         * ------------------------------------------------------------- */
        line('');
        line('--- 9b. ENGINE: VÒNG LẶP / ĐIỀU KIỆN / CLOZE ---');
        const engine = await evaluate(cdp, `(function () {
            /* (a) Lặp 3 lần, mỗi lần cộng 2 => a = 6 */
            var d1 = { question: '', score: 10, note: '', noteEnabled: false };
            var p1 = QuizCoding.ensureProgram(d1);
            p1.vars = ['a'];
            var rep = QuizCoding.createNode('repeat_block');
            rep.slots.times = { id: 'x1', t: 'num', v: 3 };
            var chg = QuizCoding.createNode('change_var');
            chg.slots.name = { id: 'x2', t: 'varname', v: 'a' };
            chg.slots.value = { id: 'x3', t: 'num', v: 2 };
            rep.body.push(chg);
            p1.stacks.setup.push(rep);

            var ctx1 = QuizCoding.createContext(d1);
            QuizCoding.runStack(d1, 'setup', ctx1);
            var loopValue = ctx1.vars.a;

            /* (b) if / else với phép so sánh */
            var d2 = { question: '', score: 10, note: '', noteEnabled: false };
            var p2 = QuizCoding.ensureProgram(d2);
            p2.vars = ['a'];
            var branch = QuizCoding.createNode('if_else_block');
            branch.slots.cond = { id: 'c1', t: 'compare',
                slots: { a: { id: 'c2', t: 'num', v: 7 },
                         cmp: { id: 'c3', t: 'cmp', v: '>' },
                         b: { id: 'c4', t: 'num', v: 5 } } };
            var n1 = QuizCoding.createNode('set_note');
            n1.slots.value = { id: 'c5', t: 'txt', v: 'lớn hơn' };
            var n2 = QuizCoding.createNode('set_note');
            n2.slots.value = { id: 'c6', t: 'txt', v: 'nhỏ hơn' };
            branch.body.push(n1);
            branch.body2.push(n2);
            p2.stacks.setup.push(branch);

            var ctx2 = QuizCoding.createContext(d2);
            QuizCoding.runStack(d2, 'setup', ctx2);

            /* (c) Cloze phải giữ nguyên {{1}} nhưng thay {{y}} */
            var d3 = { type: 'cloze',
                data: { question: '', paragraph: 'A {{1}} B {{y}}', blanks: [{ answer: '{{y}}' }],
                        note: '', noteEnabled: false, score: 10 } };
            var p3 = QuizCoding.ensureProgram(d3.data);
            p3.vars = ['y'];
            p3.stacks.setup.push((function () {
                var n = QuizCoding.createNode('set_var');
                n.slots.name = { id: 'y1', t: 'varname', v: 'y' };
                n.slots.value = { id: 'y2', t: 'txt', v: 'Xong' };
                return n;
            })());
            var ctx3 = QuizCoding.createContext(d3.data);
            QuizCoding.runStack(d3.data, 'setup', ctx3);
            QuizCoding.applyToData(d3, ctx3);

            /* (d) Câu hỏi không có chương trình => điểm mặc định */
            var plain = blocks.find(function (b) { return b.type === 'ordering'; });
            var pts = QuizCoding.award(QuizCoding.prepareRuntimeBlock(plain));

            /* (e) BIẾN HỆ THỐNG: công thức điểm dùng "Thời gian" */
            var d4 = { question: '', score: 10, note: '', noteEnabled: false, timeLimit: 30 };
            var p4 = QuizCoding.ensureProgram(d4);
            p4.vars = [];
            var addTime = QuizCoding.createNode('add_score');
            addTime.slots.value = QuizCoding.createNode('sys_time');
            p4.stacks.correct.push(addTime);

            var rt4 = QuizCoding.prepareRuntimeBlock(
                { id: 'x1', type: 'multiple-choice', x: 0, y: 0, data: d4 },
                { totalScore: 0, timeLeft: 30 });
            var scoreAt12 = QuizCoding.award(rt4, { timeLeft: 12.5, totalScore: 40 });

            /* (f) Biến hệ thống là CHỈ ĐỌC: lệnh "đặt Thời gian = 999" bị bỏ qua */
            var d5 = { question: '', score: 10, note: '', noteEnabled: false };
            var p5 = QuizCoding.ensureProgram(d5);
            var writeSys = QuizCoding.createNode('set_var');
            writeSys.slots.name = { id: 'w1', t: 'varname', v: 'Thời gian' };
            writeSys.slots.value = { id: 'w2', t: 'num', v: 999 };
            p5.stacks.setup.push(writeSys);
            var ctx5 = QuizCoding.createContext(d5, { timeLeft: 7, totalScore: 5 });
            QuizCoding.runStack(d5, 'setup', ctx5);

            /* (g) Khối "điểm hiện tại" đọc đúng biến "Điểm" */
            var rt6 = QuizCoding.prepareRuntimeBlock(
                { id: 'x2', type: 'multiple-choice', x: 0, y: 0, data: { question: '', score: 1, note: '', noteEnabled: false } },
                { totalScore: 0, timeLeft: 0 });
            var ctx6 = QuizCoding.setGameVars(rt6, { totalScore: 33, timeLeft: 5 });
            var readScore = QuizCoding.evalNode(QuizCoding.createNode('sys_score'), ctx6);

            return {
                loop: loopValue,
                note: ctx2.note,
                paragraph: d3.data.paragraph,
                blank: d3.data.blanks[0].answer,
                plainScore: pts,
                plainDefault: plain.data.score,
                timeScore: scoreAt12,
                scoreVar: ctx5.vars['Điểm'],
                timeVarAfterWrite: ctx5.vars['Thời gian'],
                readScore: readScore
            };
        })()`);

        check('Vòng lặp "lặp 3 lần" chạy đúng', engine.loop === 6, 'a=' + engine.loop);
        check('Khối điều kiện if/else rẽ nhánh đúng', engine.note === 'lớn hơn', engine.note);
        check('Cloze giữ {{1}} và thay {{y}}', engine.paragraph === 'A {{1}} B Xong', engine.paragraph);
        check('Cloze thay biến trong đáp án', engine.blank === 'Xong', engine.blank);
        check('Không có khối lệnh => dùng điểm mặc định',
            engine.plainScore === engine.plainDefault, engine.plainScore + ' điểm');
        check('Công thức điểm dùng được biến "Thời gian"',
            engine.timeScore === 12.5, 'thời gian 12.5s → ' + engine.timeScore + ' điểm');
        check('Biến "Điểm" = tổng điểm truyền vào', engine.scoreVar === 5, engine.scoreVar);
        check('Không ghi được vào biến hệ thống (chỉ đọc)',
            engine.timeVarAfterWrite === 7, engine.timeVarAfterWrite);
        check('Khối "điểm hiện tại" đọc đúng biến "Điểm"', engine.readScore === 33, engine.readScore);

        /* ---------------------------------------------------------------
         * 9c. HỢP NHẤT LOẠI CÂU HỎI TRẮC NGHIỆM (TỰ NHẬN DIỆN 1 / NHIỀU)
         * ------------------------------------------------------------- */
        line('');
        line('--- 9c. GỘP LOẠI TRẮC NGHIỆM ---');
        const merged = await evaluate(cdp, `(function () {
            function base(q) {
                return {
                    question: q, timeLimit: 30, score: 10, noteEnabled: false, note: '',
                    program: { vars: [], stacks: { setup: [], correct: [], wrong: [] } }
                };
            }

            var singleBlock = {
                id: 'm1', type: 'multiple-choice', x: 0, y: 0,
                data: Object.assign(base('Một đáp án?'), {
                    options: [{ text: 'A1', correct: true }, { text: 'B1', correct: false }]
                })
            };
            var multiBlock = {
                id: 'm2', type: 'multiple-choice', x: 0, y: 0,
                data: Object.assign(base('Nhiều đáp án?'), {
                    options: [
                        { text: 'A2', correct: true },
                        { text: 'B2', correct: true },
                        { text: 'C2', correct: false }
                    ]
                })
            };

            var host = document.createElement('div');
            host.appendChild(buildQuestionCard(singleBlock, 0));
            host.appendChild(buildQuestionCard(multiBlock, 1));
            var cards = host.querySelectorAll('.question-card');

            // Tạm thay hàm chấm điểm để không ảnh hưởng ván chơi thật
            var realApply = window.applyQuestionResult;
            var captured = [];
            window.applyQuestionResult = function (b, i, ok) { captured.push(ok); };

            /* Câu CHỌN 1: bấm một lựa chọn là nộp luôn (không có nút nộp) */
            var singleHasSubmit = !!cards[0].querySelector('.submit-btn');
            var singleBtns = cards[0].querySelectorAll('.option-btn');
            singleBtns[0].click();
            var singleSelected = cards[0].querySelectorAll('.option-btn.selected').length;
            var singleDim = cards[0].querySelectorAll('.option-btn.is-dim').length;

            /* Câu CHỌN NHIỀU: tích 2 ô rồi bấm nút "Nộp đáp án" */
            var multiHasSubmit = !!cards[1].querySelector('.submit-btn');
            var multiBtns = cards[1].querySelectorAll('.option-btn');
            multiBtns[0].click();
            multiBtns[1].click();
            var multiSelected = cards[1].querySelectorAll('.option-btn.selected').length;
            multiBtns[2].click();
            var multiAfterToggle = cards[1].querySelectorAll('.option-btn.selected').length;
            multiBtns[2].click();
            var multiFinal = cards[1].querySelectorAll('.option-btn.selected').length;
            cards[1].querySelector('.submit-btn').click();
            var multiDim = cards[1].querySelectorAll('.option-btn.is-dim').length;

            window.applyQuestionResult = realApply;

            return {
                aliasHidden: !!(BLOCK_TYPES['multi-answer'] && BLOCK_TYPES['multi-answer'].hidden),
                singleNums: cards[0].querySelectorAll('.option-num').length,
                singleChecks: cards[0].querySelectorAll('.option-check').length,
                singlePills: cards[0].querySelectorAll('.option-btn.opt-pill').length,
                multiChecks: cards[1].querySelectorAll('.option-check').length,
                multiRects: cards[1].querySelectorAll('.option-btn.opt-rect').length,
                singleHasSubmit: singleHasSubmit,
                multiHasSubmit: multiHasSubmit,
                singleSelected: singleSelected,
                singleDim: singleDim,
                multiSelected: multiSelected,
                multiAfterToggle: multiAfterToggle,
                multiFinal: multiFinal,
                multiDim: multiDim,
                graded: captured
            };
        })()`);

        check('Loại "multi-answer" chỉ còn là bí danh ẩn', merged.aliasHidden === true);
        check('Chọn 1 ⇒ nút viên thuốc (opt-pill), không có ô tích',
            merged.singlePills === 2 && merged.singleChecks === 0,
            merged.singlePills + ' pill / ' + merged.singleChecks + ' check');
        check('Chọn nhiều ⇒ nút chữ nhật (opt-rect) + ô tích ✓',
            merged.multiRects === 3 && merged.multiChecks === 3,
            merged.multiRects + ' rect / ' + merged.multiChecks + ' check');
        check('Chỉ dạng chọn nhiều mới có nút "Nộp đáp án"',
            merged.singleHasSubmit === false && merged.multiHasSubmit === true);
        check('Câu chọn-một: bấm lựa chọn là nộp luôn',
            merged.graded.length >= 1 && merged.graded[0] === true, JSON.stringify(merged.graded));
        check('Câu chọn-nhiều: tích đủ đáp án rồi nộp ⇒ đúng',
            merged.graded.length === 2 && merged.graded[1] === true, JSON.stringify(merged.graded));
        check('Bấm lại để bỏ tích (chọn-nhiều)',
            merged.multiAfterToggle === 3 && merged.multiFinal === 2,
            merged.multiAfterToggle + ' → ' + merged.multiFinal);
        check('Lựa chọn không bị làm mờ sau khi nộp',
            merged.singleDim === 0 && merged.multiDim === 0,
            merged.singleDim + ' / ' + merged.multiDim);

        /* ---------------------------------------------------------------
         * 10. KÉO KHỐI CÂU HỎI TRONG WORKSPACE
         * ------------------------------------------------------------- */
        line('');
        line('--- 10. KÉO KHỐI CÂU HỎI TRONG WORKSPACE ---');
        const dragBlock = await evaluate(cdp, `(function () {
            stopQuiz();
            var ws = document.getElementById('workspace-pane');
            var el = document.querySelector('#canvas-content .dropped-block');
            var b = blocks.find(function (x) { return x.id === el.dataset.id; });

            // Đưa khối vào vùng nhìn thấy để con trỏ không rơi ra ngoài workspace
            ws.scrollLeft = Math.max(0, b.x * currentScale - 120);
            ws.scrollTop = Math.max(0, b.y * currentScale - 80);

            var before = { x: b.x, y: b.y };
            var r = el.getBoundingClientRect();

            el.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true, clientX: r.left + 30, clientY: r.top + 15, button: 0
            }));
            document.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true, clientX: r.left + 150, clientY: r.top + 95
            }));
            document.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true, clientX: r.left + 150, clientY: r.top + 95
            }));

            return {
                dx: Math.round(b.x - before.x),
                dy: Math.round(b.y - before.y),
                scale: currentScale,
                stillThere: blocks.indexOf(b) !== -1
            };
        })()`);

        check('Kéo khối di chuyển đúng theo con trỏ (dx=120)',
            Math.abs(dragBlock.dx - 120) <= 1, 'dx=' + dragBlock.dx);
        check('Kéo khối di chuyển đúng theo con trỏ (dy=80)',
            Math.abs(dragBlock.dy - 80) <= 1, 'dy=' + dragBlock.dy);
        check('Khối vẫn còn trong workspace sau khi kéo', dragBlock.stillThere === true);

        /* ---------------------------------------------------------------
         * 11. ZOOM ĐÚNG TÂM CON TRỎ + KÍCH THƯỚC KHUNG CUỘN
         * ------------------------------------------------------------- */
        line('');
        line('--- 11. ZOOM (CTRL + LĂN CHUỘT) ---');
        const zoom = await evaluate(cdp, `(function () {
            var ws = document.getElementById('workspace-pane');
            var content = document.getElementById('canvas-content');
            var canvas = document.getElementById('workspace-canvas');
            ws.scrollLeft = 0;
            ws.scrollTop = 0;

            var rect = content.getBoundingClientRect();
            // Điểm neo: toạ độ canvas (300, 200)
            var clientX = rect.left + 300 * currentScale;
            var clientY = rect.top + 200 * currentScale;

            ws.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true, cancelable: true,
                deltaY: -100, ctrlKey: true, clientX: clientX, clientY: clientY
            }));

            var rect2 = content.getBoundingClientRect();
            return {
                scale: currentScale,
                anchorX: (clientX - rect2.left) / currentScale,
                anchorY: (clientY - rect2.top) / currentScale,
                attr: ws.dataset.zoom,
                width: canvas.style.width,
                height: canvas.style.height,
                scrollLeft: ws.scrollLeft,
                scrollTop: ws.scrollTop
            };
        })()`);

        check('Zoom tăng đúng 0.1', zoom.scale === 1.1, 'scale=' + zoom.scale);
        check('Điểm neo dưới con trỏ không bị trôi',
            Math.abs(zoom.anchorX - 300) < 1.5 && Math.abs(zoom.anchorY - 200) < 1.5,
            'x=' + zoom.anchorX.toFixed(2) + ', y=' + zoom.anchorY.toFixed(2));
        check('data-zoom được cập nhật', zoom.attr === '1.1', zoom.attr);
        check('Khung cuộn mở rộng theo zoom', zoom.width === '2200px' && zoom.height === '3300px',
            zoom.width + ' x ' + zoom.height);
        check('Cuộn tới điểm neo (scroll > 0)', zoom.scrollLeft > 0 && zoom.scrollTop > 0,
            zoom.scrollLeft.toFixed(0) + ' / ' + zoom.scrollTop.toFixed(0));

        /* ---------------------------------------------------------------
         * 12. PAN 1:1 (KHÔNG PHỤ THUỘC MỨC ZOOM)
         * ------------------------------------------------------------- */
        line('');
        line('--- 12. PAN VÙNG LÀM VIỆC ---');
        const pan = await evaluate(cdp, `(function () {
            var ws = document.getElementById('workspace-pane');
            ws.scrollLeft = 400;
            ws.scrollTop = 400;
            var r = ws.getBoundingClientRect();

            ws.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true, clientX: r.left + 200, clientY: r.top + 200, button: 0
            }));
            document.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true, clientX: r.left + 180, clientY: r.top + 170
            }));
            document.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true, clientX: r.left + 180, clientY: r.top + 170
            }));

            return {
                dx: Math.round(ws.scrollLeft - 400),
                dy: Math.round(ws.scrollTop - 400),
                scale: currentScale
            };
        })()`);

        check('Pan ngang đúng 1:1 khi đang zoom', Math.abs(pan.dx - 20) <= 1,
            'dx=' + pan.dx + ' @ scale ' + pan.scale);
        check('Pan dọc đúng 1:1 khi đang zoom', Math.abs(pan.dy - 30) <= 1, 'dy=' + pan.dy);

        /* ---------------------------------------------------------------
         * 13. LƯU / KHÔI PHỤC DỰ ÁN (localStorage & JSON)
         * ------------------------------------------------------------- */
        line('');
        line('--- 13. LƯU / KHÔI PHỤC DỰ ÁN ---');
        const persist = await evaluate(cdp, `(function () {
            var index = blocks.findIndex(function (b) { return b.type === 'multiple-choice'; });
            var snapshot = serializeProject();
            var savedProgram = snapshot.blocks[index].data.program;
            var hasProgram = !!(savedProgram
                && savedProgram.stacks.setup.length === 3
                && savedProgram.stacks.correct.length === 1
                && savedProgram.stacks.wrong.length === 1);

            // Mô phỏng: xuất JSON rồi nhập lại
            var json = JSON.parse(JSON.stringify(snapshot));
            deserializeProject(json);

            var restored = blocks.find(function (b) { return b.type === 'multiple-choice'; });
            return {
                hasProgram: hasProgram,
                total: blocks.length,
                nodes: QuizCoding.countBlocks(restored.data),
                question: restored.data.question,
                hasMark: restored.el.innerHTML.indexOf('block-code-dot') !== -1,
                vars: restored.data.program.vars
            };
        })()`);

        check('Dự án lưu kèm chương trình khối lệnh', persist.hasProgram === true);
        check('Khôi phục đủ số câu hỏi', persist.total === 2, persist.total + ' câu');
        check('Khôi phục đủ 5 khối lệnh', persist.nodes === 5, persist.nodes + ' khối');
        check('Khôi phục danh sách biến', persist.vars.join(',') === 'a,b,kq', persist.vars.join(','));
        check('Khôi phục placeholder câu hỏi', persist.question.indexOf('{{a}}') !== -1, persist.question);
        check('Khối sau khôi phục có dấu 🧩', persist.hasMark === true);

        /* ---------------------------------------------------------------
         * 13b. XOÁ KHỐI LỆNH BẰNG CÁCH KÉO VỀ DANH MỤC (bản 2.1)
         * ------------------------------------------------------------- */
        line('');
        line('--- 13b. XOÁ KHỐI LỆNH BẰNG KÉO VỀ DANH MỤC ---');
        const delTest = await evaluate(cdp, `(function () {
            var b = blocks.find(function (x) { return x.type === 'multiple-choice'; });
            openBlockEditor(b);
            switchEditorTab('code');

            var before = QuizCoding.ensureProgram(b.data).stacks.setup.length;

            // Thêm 1 khối tạm để kiểm thử việc xoá
            QuizCoding.ensureProgram(b.data).stacks.setup.push(QuizCoding.createNode('set_var'));
            QuizCodingUI.refresh();
            var afterAdd = QuizCoding.ensureProgram(b.data).stacks.setup.length;

            // Kéo khối cuối cùng trong chồng "khi bắt đầu" thả về danh mục
            var nodes = document.querySelectorAll(
                '.coding-stack[data-stack="setup"] > .coding-stack-body > .cb');
            var nodeEl = nodes[nodes.length - 1];
            var palette = document.querySelector('.coding-palette');
            var dt = new DataTransfer();

            nodeEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
            palette.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            var highlighted = palette.classList.contains('is-over-trash');
            palette.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

            var afterDrop = QuizCoding.ensureProgram(b.data).stacks.setup.length;
            var rendered = document.querySelectorAll(
                '.coding-stack[data-stack="setup"] > .coding-stack-body > .cb').length;
            var delButtons = document.querySelectorAll('.cb-del').length;
            var toast = (document.querySelector('.sb-toast') || {}).textContent || '';

            closeBlockEditor();

            return {
                before: before,
                afterAdd: afterAdd,
                highlighted: highlighted,
                afterDrop: afterDrop,
                rendered: rendered,
                delButtons: delButtons,
                toast: toast
            };
        })()`);

        check('Danh mục sáng đỏ khi rê khối lệnh tới', delTest.highlighted === true);
        check('Thả khối lệnh vào danh mục => khối bị XOÁ',
            delTest.afterAdd === delTest.before + 1 && delTest.afterDrop === delTest.before,
            delTest.afterAdd + ' khối → ' + delTest.afterDrop + ' khối');
        check('Giao diện vẽ lại đúng số khối', delTest.rendered === delTest.before,
            delTest.rendered + ' khối');
        check('KHÔNG có nút ✕ nào trong vùng lập trình', delTest.delButtons === 0);
        check('Có thông báo đã xoá khối lệnh', delTest.toast.indexOf('Đã xoá') !== -1, delTest.toast);

        /* ---------------------------------------------------------------
         * 13c. NÂNG CẤP DỰ ÁN CŨ (multi-answer → multiple-choice)
         * ------------------------------------------------------------- */
        line('');
        line('--- 13c. NÂNG CẤP DỰ ÁN CŨ ---');
        const migration = await evaluate(cdp, `(function () {
            var legacy = {
                title: 'Dự án cũ',
                settings: { useTimer: true, shuffle: false, instantScore: true },
                blocks: [{
                    type: 'multi-answer', x: 100, y: 100,
                    data: {
                        question: 'Câu hỏi cũ?', timeLimit: 20, score: 5,
                        noteEnabled: false, note: '',
                        options: [
                            { text: 'A', correct: true },
                            { text: 'B', correct: true },
                            { text: 'C', correct: false }
                        ]
                    }
                }]
            };

            deserializeProject(JSON.parse(JSON.stringify(legacy)));

            var b = blocks[0];
            return {
                total: blocks.length,
                type: b ? b.type : '',
                label: b ? BLOCK_TYPES[b.type].label : '',
                correct: b ? countCorrectOptions(b.data) : -1,
                multi: b ? isMultiAnswerQuestion(b.data) : false,
                shuffleDefault: !!b && b.data.shuffleOptions === false
            };
        })()`);

        check('Dự án cũ (multi-answer) được gộp sang multiple-choice',
            migration.total === 1 && migration.type === 'multiple-choice', migration.type);
        check('Giữ nguyên số đáp án đúng sau khi gộp',
            migration.correct === 2 && migration.multi === true, migration.correct + ' đáp án đúng');
        check('Dự án cũ mặc định giữ nguyên thứ tự đáp án',
            migration.shuffleDefault === true);

        /* ---------------------------------------------------------------
         * 15. ẢNH CỦA CÂU HỎI (editor + runtime + layout 2 cột)
         * ------------------------------------------------------------- */
        line('');
        line('--- 15. ẢNH CỦA CÂU HỎI ---');
        const imageTest = await evaluate(cdp, `(function () {
            // Ảnh nhỏ dạng data URL để kiểm thử phần "tải ảnh từ máy"
            var px = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

            var b = createBlock('multiple-choice', 200, 200);
            b.data.imageUrl = px;
            b.data.imageAlt = 'Ảnh kiểm thử';

            var hotspotBlock = createBlock('hotspot', 200, 700);
            hotspotBlock.data.imageUrl = px;

            // Form cấu hình gồm 2 phần: phần chung + phần "Ảnh của câu hỏi"
            // (js/ui/editor.js — renderEditorForm() nối cả hai vào #editor-form-container).
            var form = buildCommonForm(b);
            form.appendChild(buildImageForm(b));

            // Gắn thẻ vào DOM để đo được lưới 2 cột
            var host = document.createElement('div');
            host.style.width = '1200px';
            document.body.appendChild(host);

            var card = buildQuestionCard(b, 0);
            var hotspotCard = buildQuestionCard(hotspotBlock, 1);
            host.appendChild(card);
            host.appendChild(hotspotCard);

            var bodyStyle = getComputedStyle(card.querySelector('.q-body'));

            var out = {
                hasImageUrlField: !!form.querySelector('[data-field="imageUrl"]'),
                hasFileInput: !!form.querySelector('[data-field="imageFile"]'),
                hasPickBtn: !!form.querySelector('[data-action="pick-image"]'),
                hasClearBtn: !!form.querySelector('[data-action="clear-image"]'),
                hasPreview: !!form.querySelector('.image-preview'),
                hasFitSelect: !!form.querySelector('[data-field="imageFit"]'),
                cardHasImage: card.classList.contains('has-image'),
                bodyDisplay: bodyStyle.display,
                gridCols: bodyStyle.gridTemplateColumns.split(' ').length,
                mediaImg: !!card.querySelector('.q-media-img'),
                handles: card.querySelectorAll('.media-handle').length,
                hotspotDisplay: getComputedStyle(hotspotCard.querySelector('.q-body')).display,
                chip: (function () {
                    renderBlock(b);
                    return b.el.innerHTML.indexOf('🖼️ Có ảnh') !== -1;
                })(),
                templated: (function () {
                    var d = { question: '', score: 1000, note: '', noteEnabled: false,
                              imageUrl: 'https://x/{{anh}}.png' };
                    var p = QuizCoding.ensureProgram(d);
                    p.vars = ['anh'];
                    var set = QuizCoding.createNode('set_var');
                    set.slots.name = { id: 'z1', t: 'varname', v: 'anh' };
                    set.slots.value = { id: 'z2', t: 'txt', v: 'hinh1' };
                    p.stacks.setup.push(set);

                    var ctx = QuizCoding.createContext(d, { timeLeft: 0, totalScore: 0 });
                    QuizCoding.runStack(d, 'setup', ctx);
                    QuizCoding.applyToData({ type: 'multiple-choice', data: d }, ctx);
                    return d.imageUrl;
                })()
            };

            host.remove();
            removeBlock(b);
            removeBlock(hotspotBlock);
            return out;
        })()`);

        check('Form có ô URL ảnh + ô chọn tệp + 2 nút ảnh',
            imageTest.hasImageUrlField && imageTest.hasFileInput
            && imageTest.hasPickBtn && imageTest.hasClearBtn);
        check('Form có khung xem trước + chọn chế độ hiển thị',
            imageTest.hasPreview === true && imageTest.hasFitSelect === true);
        check('Câu hỏi có ảnh ⇒ thẻ có class .has-image + khung ảnh',
            imageTest.cardHasImage === true && imageTest.mediaImg === true);
        check('Bố cục 2 cột được áp dụng cho câu hỏi có ảnh',
            imageTest.bodyDisplay === 'grid' && imageTest.gridCols === 2,
            imageTest.bodyDisplay + ' / ' + imageTest.gridCols + ' cột');
        check('Khung ảnh có 8 điểm kéo lề', imageTest.handles === 8, imageTest.handles + ' handle');
        check('Câu hỏi chọn vùng trên ảnh KHÔNG dùng bố cục 2 cột',
            imageTest.hotspotDisplay !== 'grid', imageTest.hotspotDisplay);
        check('Khối trong workspace hiển thị chip "🖼️ Có ảnh"', imageTest.chip === true);
        check('Ảnh thay được placeholder {{anh}}',
            imageTest.templated === 'https://x/hinh1.png', imageTest.templated);

        /* ---------------------------------------------------------------
         * 16. SẮP XẾP: KÉO–THẢ ĐỔI CHỖ + ANIMATION BUBBLE SORT
         * ------------------------------------------------------------- */
        line('');
        line('--- 16. SẮP XẾP: KÉO–THẢ & BUBBLE SORT ---');
        const sortTest = await evaluate(cdp, `(async function () {
            var b = createBlock('ordering', 300, 300);
            b.data.items = ['A', 'B', 'C', 'D'];
            var expectedItems = b.data.items.slice();

            var host = document.createElement('div');
            host.style.width = '520px';
            document.body.appendChild(host);

            var card = buildQuestionCard(b, 0);
            host.appendChild(card);

            var list = card.querySelector('.sort-list');
            function rows() { return Array.prototype.slice.call(list.querySelectorAll('.sort-item')); }
            function texts() {
                return rows().map(function (r) { return r.querySelector('.sort-text').textContent; });
            }

            var order0 = texts();

            // Kéo hàng đầu xuống dưới 2 hàng bằng PointerEvent
            var first = rows()[0];
            var r0 = first.getBoundingClientRect();
            var step = r0.height + 8;

            first.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true, clientY: r0.top + 10, pointerId: 1
            }));
            var dragStartRect = first.getBoundingClientRect();
            var dragIsInBody = first.parentNode === document.body;
            list.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true, clientY: r0.top + 10 + step * 2 + 4, pointerId: 1
            }));
            var shifted = rows().filter(function (el) { return el.style.transform; }).length;
            var draggingStyle = getComputedStyle(first);
            var dragShadow = draggingStyle.boxShadow;
            var dragPosition = draggingStyle.position;
            var dragTop = parseFloat(draggingStyle.top);
            var placeholder = list.querySelector('.sort-placeholder');
            var placeholderIndex = -1;
            if (placeholder) {
                var childrenBeforePlaceholder = Array.prototype.slice.call(list.children)
                    .slice(0, Array.prototype.indexOf.call(list.children, placeholder));
                placeholderIndex = childrenBeforePlaceholder.filter(function (child) {
                    return child.classList.contains('sort-item')
                        && !child.classList.contains('is-dragging');
                }).length;
            }
            var isDragging = first.classList.contains('is-dragging');

            list.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true, clientY: r0.top + 10 + step * 2 + 4, pointerId: 1
            }));
            await new Promise(function (r) { requestAnimationFrame(r); });

            var order1 = texts();
            var renumbered = rows().map(function (r) {
                return r.querySelector('.sort-num').textContent;
            }).join('');
            var snapTransition = getComputedStyle(first).transition;
            var snapActive = list.classList.contains('is-sorting');
            await new Promise(function (r) { setTimeout(r, 300); });

            // Ép thứ tự nghịch để kiểm tra phản hồi sai và Bubble Sort ổn định
            rows().slice().sort(function (a, b) {
                var textA = a.querySelector('.sort-text').textContent;
                var textB = b.querySelector('.sort-text').textContent;
                return expectedItems.indexOf(textB) - expectedItems.indexOf(textA);
            }).forEach(function (row) { list.appendChild(row); });
            card.querySelector('.submit-btn').click();
            var wrongRows = list.querySelectorAll('.sort-item.is-wrong');
            var wrongStyle = wrongRows.length ? getComputedStyle(wrongRows[0]) : null;
            var wrongCount = wrongRows.length;
            var wrongAnimation = wrongStyle ? wrongStyle.animationName : '';
            var wrongDelay = wrongStyle ? wrongStyle.animationDelay : '';
            var wrongBackground = wrongStyle ? wrongStyle.backgroundColor : '';
            var wrongBorder = wrongStyle ? wrongStyle.borderTopColor : '';
            await new Promise(function (r) { setTimeout(r, 4600); });
            var order2 = texts();
            var marked = list.querySelectorAll('.sort-item.is-correct').length;
            var revealedStyle = getComputedStyle(rows()[0]);
            var revealedBackground = revealedStyle.backgroundColor;
            var revealedBorder = revealedStyle.borderTopColor;

            var correctBlock = createBlock('ordering', 300, 500);
            correctBlock.data.items = ['A', 'B', 'C', 'D'];
            var correctCard = buildQuestionCard(correctBlock, 1);
            host.appendChild(correctCard);
            var correctList = correctCard.querySelector('.sort-list');
            var correctRows = Array.prototype.slice.call(correctList.querySelectorAll('.sort-item'));
            ['A', 'B', 'C', 'D'].forEach(function (text) {
                correctList.appendChild(correctRows.find(function (row) {
                    return row.querySelector('.sort-text').textContent === text;
                }));
            });
            correctCard.querySelector('.submit-btn').click();
            var correctStyle = getComputedStyle(correctList.querySelector('.sort-item'));
            var correctBackground = correctStyle.backgroundColor;
            var correctBorder = correctStyle.borderTopColor;
            var correctAnimation = correctStyle.animationName;
            var correctDelay = correctStyle.animationDelay;

            host.remove();
            removeBlock(b);
            removeBlock(correctBlock);

            return {
                order0: order0, order1: order1, order2: order2,
                shifted: shifted, renumbered: renumbered, marked: marked,
                isDragging: isDragging, dragPosition: dragPosition,
                dragTop: dragTop, startTop: r0.top,
                dragStartLeft: dragStartRect.left, dragStartTop: dragStartRect.top,
                originalLeft: r0.left, originalTop: r0.top,
                dragIsInBody: dragIsInBody,
                placeholderIndex: placeholderIndex,
                dragShadow: dragShadow, snapTransition: snapTransition,
                snapActive: snapActive, wrongCount: wrongCount,
                wrongAnimation: wrongAnimation, wrongDelay: wrongDelay,
                wrongBackground: wrongBackground,
                wrongBorder: wrongBorder, revealedBackground: revealedBackground,
                revealedBorder: revealedBorder, correctBackground: correctBackground,
                correctBorder: correctBorder, correctAnimation: correctAnimation,
                correctDelay: correctDelay
            };
        })()`);

        const expOrder1 = sortTest.order0.slice();
        const movedRow = expOrder1.shift();
        expOrder1.splice(2, 0, movedRow);

        check('Kéo hàng đầu xuống 2 hàng ⇒ thứ tự thay đổi đúng',
            sortTest.order1.join('') === expOrder1.join(''),
            sortTest.order0.join('') + ' → ' + sortTest.order1.join(''));
        check('Các hàng bị đi qua tự đẩy lên (có transform)',
            sortTest.shifted >= 2, sortTest.shifted + ' hàng bị đẩy');
        check('Hàng được kéo nổi theo con trỏ với bóng đổ rõ',
            sortTest.isDragging && sortTest.dragPosition === 'fixed'
                && sortTest.dragTop > sortTest.startTop
                && sortTest.dragShadow !== 'none',
            sortTest.dragPosition + ' / ' + sortTest.dragTop + 'px / '
                + sortTest.dragShadow);
        check('Khi bắt đầu kéo, ô giữ nguyên tọa độ và thoát khỏi vùng có transform',
            sortTest.dragIsInBody
                && Math.abs(sortTest.dragStartLeft - sortTest.originalLeft) < 1
                && Math.abs(sortTest.dragStartTop - sortTest.originalTop) < 1,
            'tọa độ trước/sau: (' + sortTest.originalLeft + ', ' + sortTest.originalTop
                + ') / (' + sortTest.dragStartLeft + ', ' + sortTest.dragStartTop + ')');
        check('Khe giữ chỗ di chuyển trực tiếp theo vị trí thả',
            sortTest.placeholderIndex === 2, 'vị trí khe: ' + sortTest.placeholderIndex);
        check('Khi thả, danh sách giữ transition trong lúc hít vào vị trí',
            sortTest.snapActive && sortTest.snapTransition.indexOf('transform') !== -1,
            sortTest.snapTransition);
        check('Đánh số lại sau khi kéo', sortTest.renumbered === '1234', sortTest.renumbered);
        check('Câu trả lời sai chuyển ô sai sang đỏ và lắc',
            sortTest.wrongCount === 4 && sortTest.wrongAnimation.indexOf('sort-shake') !== -1
                && sortTest.wrongBackground === 'rgb(252, 165, 165)'
                && sortTest.wrongBorder === 'rgb(220, 38, 38)'
                && sortTest.wrongDelay === '0s',
            sortTest.wrongCount + ' ô / ' + sortTest.wrongAnimation + ' / '
                + sortTest.wrongBackground + ' / ' + sortTest.wrongBorder);
        check('Nộp sai ⇒ animation bubble sort sắp lại đúng thứ tự',
            sortTest.order2.join('') === 'ABCD', sortTest.order2.join(''));
        check('Sau bubble sort, cả 4 hàng được đánh dấu đúng',
            sortTest.marked === 4, sortTest.marked + ' hàng');
        check('Đáp án đúng chuyển toàn bộ ô sang xanh lá',
            sortTest.correctBackground === 'rgb(134, 239, 172)'
                && sortTest.correctBorder === 'rgb(22, 163, 74)'
                && sortTest.correctAnimation.indexOf('sort-correct') !== -1
                && sortTest.correctDelay === '0s',
            sortTest.correctBackground + ' / ' + sortTest.correctBorder
                + ' / ' + sortTest.correctAnimation + ' / ' + sortTest.correctDelay);

        /* ---------------------------------------------------------------
         * 17. NỐI Ô (MATCHING) — EDITOR TRỰC QUAN (M5)
         * ------------------------------------------------------------- */
        line('');
        line('--- 17. NỐI Ô: EDITOR TRỰC QUAN ---');
        const matchTest = await evaluate(cdp, `(function () {
            var b = createBlock('matching', 200, 200);
            b.data.pairs = [
                { id: 'p1', concept: 'Hà Nội', explanations: [] },
                { id: 'p2', concept: 'Hồ Chí Minh', explanations: [] }
            ];
            b.data.explanationsAll = ['Thủ đô', 'Lớn nhất'];

            var host = document.createElement('div');
            host.id = '__shotHost';
            host.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:#fff;padding:12px;border-radius:12px;width:900px;';
            document.body.appendChild(host);

            var editor = buildMatchingEditor(b);
            host.appendChild(editor);

            var leftCol = editor.querySelector('.match-col-left');
            var rightCol = editor.querySelector('.match-col-right');
            var colCount = editor.querySelectorAll('.match-col').length;
            var leftDots = leftCol.querySelectorAll('.match-button').length;
            var rightDots = rightCol.querySelectorAll('.match-button').length;
            /* Editor KHÔNG được dùng giao diện "1 nút / ô" của Player View */
            var editorArea = editor.querySelector('.editor-match-2n');
            var usesPlayerLayout = !!editorArea && editorArea.classList.contains('match-2n-player');
            /* Editor giữ nút "+" (nút trống) để tác giả thêm giải thích mới */
            var hasPlusButton = Array.prototype.some.call(
                leftCol.querySelectorAll('.match-button'),
                function (b) { return b.textContent === '+'; });
            /* Modal thật (buildTypeSpecificForm) cũng phải hiện editor trực quan */
            var viaForm = buildTypeSpecificForm(b);
            var formHasEditor = !!viaForm.querySelector('.editor-match-2n');

            /* Bấm cúc trống bên trái (khái niệm 1) => chọn khái niệm */
            leftCol.querySelectorAll('.match-button')[0].click();
            var selected = leftCol.querySelectorAll('.match-button.is-selected').length;

            /* Bấm cúc bên phải (giải thích A) => nối */
            rightCol.querySelectorAll('.match-button')[0].click();
            var linked1 = b.data.pairs[0].explanations.length;
            var lines1 = editor.querySelectorAll('.match-overlay path').length;

            /* Nối thêm giải thích thứ 2 cho CÙNG khái niệm 1 (quan hệ 1-n) */
            leftCol.querySelectorAll('.match-button')[1].click();
            rightCol.querySelectorAll('.match-button')[1].click();
            var linked2 = b.data.pairs[0].explanations.length;
            var lines2 = editor.querySelectorAll('.match-overlay path').length;

            /* Bấm lại cúc đã nối => tách cặp */
            leftCol.querySelectorAll('.match-button.is-filled')[0].click();
            var afterUnlink = b.data.pairs[0].explanations.length;

            /* Lưu cấu hình => collectEditorData ghi đúng pairs + explanationsAll.
               Dùng 1 bản editor thứ 2 để bản đang hiển thị vẫn nằm trong host (cho ảnh chụp). */
            var editorSave = buildMatchingEditor(b);
            var savedForm = DOM.editorForm.innerHTML;
            DOM.editorForm.innerHTML = '';
            DOM.editorForm.appendChild(editorSave);
            collectEditorData(b);
            DOM.editorForm.innerHTML = savedForm;
            var savedPairs = b.data.pairs.length;
            var savedExp = b.data.explanationsAll.length;
            var savedConcept = b.data.pairs[0].concept;

            removeBlock(b);

            return {
                colCount: colCount, leftDots: leftDots, rightDots: rightDots,
                formHasEditor: formHasEditor,
                usesPlayerLayout: usesPlayerLayout, hasPlusButton: hasPlusButton,
                selected: selected, linked1: linked1, lines1: lines1,
                linked2: linked2, lines2: lines2, afterUnlink: afterUnlink,
                savedPairs: savedPairs, savedExp: savedExp, savedConcept: savedConcept
            };
        })()`);

        check('Editor nối ô có 2 cột + cúc tròn ở cả hai bên (và modal thật cũng dùng editor này)',
            matchTest.colCount === 2 && matchTest.leftDots >= 2 && matchTest.rightDots === 2
            && matchTest.formHasEditor === true,
            matchTest.colCount + ' cột, ' + matchTest.leftDots + '/' + matchTest.rightDots + ' cúc');
        check('Bấm cúc trái (chọn khái niệm) rồi cúc phải ⇒ nối được 1 cặp',
            matchTest.selected === 1 && matchTest.linked1 === 1,
            matchTest.selected + ' cúc được chọn, ' + matchTest.linked1 + ' cặp đã nối');
        check('Sợi dây SVG được vẽ đúng số cặp đã nối',
            matchTest.lines1 === 1 && matchTest.lines2 === 2,
            matchTest.lines1 + ' → ' + matchTest.lines2 + ' sợi dây');
        check('1 khái niệm nối được NHIỀU giải thích (quan hệ 1-n)',
            matchTest.linked2 === 2, matchTest.linked2 + ' giải thích cho 1 khái niệm');
        check('Bấm lại cúc đã nối ⇒ tách cặp, và lưu cấu hình ghi đúng dữ liệu',
            matchTest.afterUnlink === 1 && matchTest.savedPairs === 2
            && matchTest.savedExp === 2 && matchTest.savedConcept === 'Hà Nội',
            'còn ' + matchTest.afterUnlink + ' cặp, lưu ' + matchTest.savedPairs
                + ' khái niệm / ' + matchTest.savedExp + ' giải thích');
        check('Editor GIỮ NGUYÊN giao diện cấu hình (không dùng kiểu "1 nút/ô" của Player)',
            matchTest.usesPlayerLayout === false && matchTest.hasPlusButton === true,
            'dùng kiểu Player=' + matchTest.usesPlayerLayout
                + ', còn nút "+"=' + matchTest.hasPlusButton);

        /* Ảnh chụp bản 2.3 */
        await captureScreenshot(cdp, '31-matching.png');

        /* ---------------------------------------------------------------
         * 17b. MATCHING TRONG PLAYER VIEW: BỐ CỤC VÀ VỊ TRÍ CÚC NỐI
         * ------------------------------------------------------------- */
        line('');
        line('--- 17b. NỐI Ô: BỐ CỤC PLAYER VIEW ---');
        const playerMatch = await evaluate(cdp, `(function () {
            var b = createBlock('matching', 0, 0);
            b.data.pairs = [
                { id: 'left-1', concept: 'Khái niệm thứ nhất', explanations: ['Giải thích tương ứng'] },
                { id: 'left-2', concept: 'Khái niệm thứ hai', explanations: [] }
            ];
            b.data.explanationsAll = ['Giải thích tương ứng', 'Một giải thích dài hơn để kiểm tra khả năng xuống dòng'];
            b.data.answers = {};

            var host = document.createElement('div');
            host.style.cssText = 'position:fixed;left:20px;top:20px;width:900px;z-index:99999;';
            document.body.appendChild(host);
            var card = buildQuestionCard(b, 0);
            host.appendChild(card);

            var area = card.querySelector('.match-2n-area');
            var leftCol = area.querySelector('.match-col-left');
            var rightCol = area.querySelector('.match-col-right');
            var leftDot = leftCol.querySelector('.match-button');
            var rightDot = rightCol.querySelector('.match-button');
            var leftRect = leftCol.getBoundingClientRect();
            var rightRect = rightCol.getBoundingClientRect();
            var leftDotRect = leftDot.getBoundingClientRect();
            var rightDotRect = rightDot.getBoundingClientRect();
            var gridColumns = getComputedStyle(area).gridTemplateColumns.split(' ').length;
            leftDot.click();
            rightDot.click();
            var lineCount = area.querySelectorAll('.match-overlay path').length;
            var result = {
                gridColumns: gridColumns,
                widthsBalanced: Math.abs(leftRect.width - rightRect.width) < 5,
                dotsFaceGap: leftDotRect.right <= rightDotRect.left,
                lineCount: lineCount
            };
            host.remove();
            removeBlock(b);
            return result;
        })()`);
        check('Matching Player View giữ hai cột cân đối và điểm nối hướng vào khoảng giữa',
            playerMatch.gridColumns === 2 && playerMatch.widthsBalanced && playerMatch.dotsFaceGap,
            playerMatch.gridColumns + ' cột; cân đối=' + playerMatch.widthsBalanced
                + '; điểm nối đúng vị trí=' + playerMatch.dotsFaceGap);
        check('Bấm hai điểm nối tạo được đường SVG',
            playerMatch.lineCount === 1, playerMatch.lineCount + ' đường nối');

        /* ---------------------------------------------------------------
         * 17c. MỞ LẠI BẢNG CẤU HÌNH LẦN 2 — ĐƯỜNG NỐI KHÔNG BỊ LỆCH
         * ------------------------------------------------------------- */
        line('');
        line('--- 17c. NỐI Ô: MỞ LẠI CẤU HÌNH LẦN 2 ---');
        const reopenMatch = await evaluate(cdp, `(async function () {
            function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

            /* Đo đường nối trong hệ toạ độ user space của SVG + vị trí thật
               của các cúc tròn (cũng quy đổi sang user space) để so sánh. */
            function measure(editorEl) {
                var area = editorEl.querySelector('.editor-match-2n');
                var overlay = editorEl.querySelector('.match-overlay');
                var ctm = overlay.getScreenCTM();
                function toUser(cx, cy) {
                    var det = ctm.a * ctm.d - ctm.b * ctm.c;
                    var x = cx - ctm.e, y = cy - ctm.f;
                    return { x: (ctm.d * x - ctm.c * y) / det, y: (-ctm.b * x + ctm.a * y) / det };
                }
                var left = [], right = [];
                editorEl.querySelectorAll('.match-col-left .match-box').forEach(function (box) {
                    box.querySelectorAll('.match-button').forEach(function (btn) {
                        var r = btn.getBoundingClientRect();
                        var p = toUser(r.right, r.top + r.height / 2);
                        left.push({ x: p.x, y: p.y });
                    });
                });
                editorEl.querySelectorAll('.match-col-right .match-box').forEach(function (box) {
                    var btn = box.querySelector('.match-button');
                    var r = btn.getBoundingClientRect();
                    var p = toUser(r.left, r.top + r.height / 2);
                    right.push({ x: p.x, y: p.y });
                });
                var paths = [];
                overlay.querySelectorAll('path').forEach(function (p) {
                    var m = p.getAttribute('d').match(/M\\s+([-\\d.]+)\\s+([-\\d.]+)[\\s\\S]*T\\s+([-\\d.]+)\\s+([-\\d.]+)/);
                    if (!m) return;
                    paths.push({
                        x1: parseFloat(m[1]), y1: parseFloat(m[2]),
                        x2: parseFloat(m[3]), y2: parseFloat(m[4])
                    });
                });
                /* Sai lệch lớn nhất giữa đầu đường nối và cúc tròn thật */
                var worst = 0;
                paths.forEach(function (p) {
                    var d1 = Math.min.apply(null, left.map(function (d) {
                        return Math.hypot(d.x - p.x1, d.y - p.y1);
                    }));
                    var d2 = Math.min.apply(null, right.map(function (d) {
                        return Math.hypot(d.x - p.x2, d.y - p.y2);
                    }));
                    worst = Math.max(worst, d1, d2);
                });
                return { count: paths.length, worst: worst };
            }

            var b = createBlock('matching', 200, 200);
            b.data.pairs = [
                { id: 'p1', concept: 'Khái niệm 1', explanations: ['Giải thích A'] },
                { id: 'p2', concept: 'Khái niệm 2', explanations: ['Giải thích B'] }
            ];
            b.data.explanationsAll = ['Giải thích A', 'Giải thích B'];

            openBlockEditor(b);
            await wait(700);
            var first = measure(document.querySelector('.editor-match-area'));
            closeBlockEditor();
            await wait(300);

            openBlockEditor(b);
            await wait(700);
            var second = measure(document.querySelector('.editor-match-area'));
            closeBlockEditor();
            removeBlock(b);
            return { first: first, second: second };
        })()`);
        check('Mở cấu hình nối ô lần 1 vẽ đủ đường nối và bám đúng cúc tròn',
            reopenMatch.first.count === 2 && reopenMatch.first.worst < 2,
            reopenMatch.first.count + ' đường; lệch tối đa '
                + reopenMatch.first.worst.toFixed(2) + 'px');
        check('Mở lại cấu hình nối ô lần 2 vẽ đúng vị trí (không bị lệch)',
            reopenMatch.second.count === 2 && reopenMatch.second.worst < 2,
            reopenMatch.second.count + ' đường; lệch tối đa '
                + reopenMatch.second.worst.toFixed(2) + 'px');

        /* ---------------------------------------------------------------
         * 17d. NỐI Ô TRONG PLAYER THẬT — NỐI ĐỦ CÁC CẶP, KHÔNG BỊ KẸT
         * ------------------------------------------------------------- */
        line('');
        line('--- 17d. NỐI Ô: CHƠI THẬT, NỐI ĐỦ CÁC CẶP ---');
        const playMatch = await evaluate(cdp, `(async function () {
            function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
            /* Bắn sự kiện Pointer giả lập để mô phỏng thao tác kéo chuột */
            function pev(type, x, y, target) {
                var ev = new PointerEvent(type, {
                    bubbles: true, cancelable: true, pointerId: 1,
                    clientX: x, clientY: y
                });
                (target || window).dispatchEvent(ev);
            }
            var b = createBlock('matching', 0, 0);
            b.data.pairs = [
                { id: 'c1', concept: 'Khái niệm 1', explanations: ['Giải thích A'] },
                { id: 'c2', concept: 'Khái niệm 2', explanations: ['Giải thích B'] },
                { id: 'c3', concept: 'Khái niệm 3', explanations: ['Giải thích C'] }
            ];
            b.data.explanationsAll = ['Giải thích A', 'Giải thích B', 'Giải thích C'];

            startQuiz();
            await wait(1200);

            var area = document.querySelector('.match-2n-area');
            if (!area) return { err: 'khong co vung noi o' };
            var leftCol = area.querySelector('.match-col-left');
            var rightCol = area.querySelector('.match-col-right');
            var lefts = leftCol.querySelectorAll('.match-button');
            var rights = rightCol.querySelectorAll('.match-button');

            var out = {};

            /* MỖI Ô CHỈ CÓ ĐÚNG 1 NÚT (chỉ ở Player View) */
            out.leftBoxes = leftCol.querySelectorAll('.match-box').length;
            out.leftDots = leftCol.querySelectorAll('.match-button').length;
            out.rightBoxes = rightCol.querySelectorAll('.match-box').length;
            out.rightDots = rightCol.querySelectorAll('.match-button').length;
            out.oneDotPerBox = out.leftDots === out.leftBoxes && out.rightDots === out.rightBoxes;
            out.playerClass = area.classList.contains('match-2n-player');
            out.leftTexts = Array.prototype.map.call(
                leftCol.querySelectorAll('.match-text'),
                function (t) { return t.textContent; });
            out.runtimeKeepsSchema = playOrder[0].data.pairs.every(function (p) {
                return !!p.id && typeof p.concept === 'string' && Array.isArray(p.explanations);
            });

            var lefts = leftCol.querySelectorAll('.match-button');
            var rights = rightCol.querySelectorAll('.match-button');

            /* Kéo từ nút trái sang nút phải */
            function drag(fromDot, toDot) {
                var a = fromDot.getBoundingClientRect();
                var c = toDot.getBoundingClientRect();
                pev('pointerdown', a.left + a.width / 2, a.top + a.height / 2, fromDot);
                pev('pointermove', (a.left + c.left) / 2, (a.top + c.top) / 2);
                pev('pointermove', c.left + c.width / 2, c.top + c.height / 2);
                pev('pointerup', c.left + c.width / 2, c.top + c.height / 2);
            }
            function realPaths() {
                return area.querySelectorAll('.match-overlay path:not(.is-preview)').length;
            }

            /* Dây nháp xuất hiện ngay khi đang kéo (bám theo con trỏ) */
            var a0 = lefts[0].getBoundingClientRect();
            pev('pointerdown', a0.left + a0.width / 2, a0.top + a0.height / 2, lefts[0]);
            pev('pointermove', a0.left + 120, a0.top + 10);
            await wait(80);
            out.previewLines = area.querySelectorAll('.match-overlay path.is-preview').length;
            pev('pointerup', a0.left + 120, a0.top + 10);
            await wait(80);
            out.previewAfterDrop = area.querySelectorAll('.match-overlay path.is-preview').length;

            /* Kéo nối đủ 3 cặp */
            var counts = [];
            for (var i = 0; i < 3; i++) {
                drag(lefts[i], rights[i]);
                await wait(110);
                counts.push({
                    step: i + 1,
                    paths: realPaths(),
                    answers: Object.keys(playOrder[0].data.answers).length
                });
            }
            out.counts = counts;
            out.filledLeft = leftCol.querySelectorAll('.match-button.is-filled').length;
            out.filledRight = rightCol.querySelectorAll('.match-button.is-filled').length;
            out.answerKeys = playOrder[0].data.answers.length;

            /* Dây nối phải xuất phát đúng từ nút trái và neo vào nút phải */
            var ctm = area.querySelector('.match-overlay').getScreenCTM();
            function toUser(cx, cy) {
                var det = ctm.a * ctm.d - ctm.b * ctm.c;
                var x = cx - ctm.e, y = cy - ctm.f;
                return { x: (ctm.d * x - ctm.c * y) / det, y: (-ctm.b * x + ctm.a * y) / det };
            }
            var path = area.querySelector('.match-overlay path:not(.is-preview)');
            var m = path.getAttribute('d').match(/M\\s+([-\\d.]+)\\s+([-\\d.]+)[\\s\\S]*T\\s+([-\\d.]+)\\s+([-\\d.]+)/);
            var p1 = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
            var p2 = { x: parseFloat(m[3]), y: parseFloat(m[4]) };
            var lr0 = lefts[0].getBoundingClientRect();
            var rr0 = rights[0].getBoundingClientRect();
            var expL = toUser(lr0.right, lr0.top + lr0.height / 2);
            var expR = toUser(rr0.left, rr0.top + rr0.height / 2);
            out.lineFromLeftButton = Math.hypot(p1.x - expL.x, p1.y - expL.y);
            out.lineToRightButton = Math.hypot(p2.x - expR.x, p2.y - expR.y);

            /* Bấm nút phải đang đã nối ⇒ bỏ nối */
            rights[0].click();
            await wait(110);
            out.afterUnlinkPaths = realPaths();
            out.afterUnlinkAnswers = playOrder[0].data.answers.length;

            stopQuiz();
            removeBlock(b);
            return out;
        })()`);
        check('Player giữ nguyên schema nối ô (id / concept / explanations)',
            playMatch.runtimeKeepsSchema === true);
        check('Hai cột Player hiện đúng nội dung khái niệm và giải thích',
            playMatch.leftTexts && playMatch.leftTexts.length === 3
            && playMatch.leftTexts[0] === 'Khái niệm 1',
            (playMatch.leftTexts || []).join(' | '));
        check('Player View: mỗi ô match-box chỉ có ĐÚNG 1 button',
            playMatch.oneDotPerBox === true && playMatch.playerClass === true,
            'trái ' + playMatch.leftDots + '/' + playMatch.leftBoxes + ' ô, phải '
                + playMatch.rightDots + '/' + playMatch.rightBoxes + ' ô');
        check('Kéo nối thì có dây nháp bám theo con trỏ, thả ra thì dây nháp biến mất',
            playMatch.previewLines === 1 && playMatch.previewAfterDrop === 0,
            playMatch.previewLines + ' dây nháp; sau khi thả còn '
                + playMatch.previewAfterDrop);
        check('Kéo từ nút trái sang nút phải nối được đủ các cặp',
            playMatch.counts && playMatch.counts.length === 3
            && playMatch.counts[0].paths === 1
            && playMatch.counts[1].paths === 2
            && playMatch.counts[2].paths === 3
            && playMatch.answerKeys === 3,
            playMatch.counts ? playMatch.counts.map(function (c) {
                return c.step + ':' + c.paths + 'đường';
            }).join(', ') : 'không có dữ liệu');
        check('Dây nối xuất phát từ nút trái và neo chính xác vào nút phải',
            playMatch.lineFromLeftButton < 1.5 && playMatch.lineToRightButton < 1.5,
            'lệch đầu ' + (playMatch.lineFromLeftButton || 0).toFixed(2)
                + 'px, lệch cuối ' + (playMatch.lineToRightButton || 0).toFixed(2) + 'px');
        check('Nút đã nối được tô xanh ở cả hai cột',
            playMatch.filledLeft === 3 && playMatch.filledRight === 3,
            'trái=' + playMatch.filledLeft + ' phải=' + playMatch.filledRight);
        check('Bấm nút phải đang nối thì bỏ nối được (không bị kẹt)',
            playMatch.afterUnlinkPaths === 2 && playMatch.afterUnlinkAnswers === 2,
            playMatch.afterUnlinkPaths + ' đường còn lại');

        /* ---------------------------------------------------------------
         * 17e. QUAN HỆ 1-N: MỘT NÚT TRÁI, NHIỀU DÂY NỐI
         * ------------------------------------------------------------- */
        line('');
        line('--- 17e. NỐI Ô: 1 KHÁI NIỆM NỐI NHIỀU GIẢI THÍCH (1-N) ---');
        const matchOneN = await evaluate(cdp, `(async function () {
            function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
            function pev(type, x, y, target) {
                var ev = new PointerEvent(type, {
                    bubbles: true, cancelable: true, pointerId: 1,
                    clientX: x, clientY: y
                });
                (target || window).dispatchEvent(ev);
            }
            var b = createBlock('matching', 0, 0);
            b.data.pairs = [
                { id: 'c1', concept: 'Khái niệm 1', explanations: ['Giải thích A', 'Giải thích B'] }
            ];
            b.data.explanationsAll = ['Giải thích A', 'Giải thích B'];

            startQuiz();
            await wait(1200);
            var area = document.querySelector('.match-2n-area');
            var leftCol = area.querySelector('.match-col-left');
            var rightCol = area.querySelector('.match-col-right');
            var leftDot = leftCol.querySelector('.match-button');
            var rights = rightCol.querySelectorAll('.match-button');

            function drag(toDot) {
                var a = leftDot.getBoundingClientRect();
                var c = toDot.getBoundingClientRect();
                pev('pointerdown', a.left + a.width / 2, a.top + a.height / 2, leftDot);
                pev('pointermove', c.left + c.width / 2, c.top + c.height / 2);
                pev('pointerup', c.left + c.width / 2, c.top + c.height / 2);
            }

            var out = {};
            out.dotsInLeftBox = leftCol.querySelectorAll('.match-box')[0]
                .querySelectorAll('.match-button').length;
            drag(rights[0]);
            await wait(110);
            drag(rights[1]);
            await wait(110);
            out.paths = area.querySelectorAll('.match-overlay path:not(.is-preview)').length;
            out.links = playOrder[0].data.answers.filter(function (e) { return e[0] === 'c1'; }).length;
            /* Cả hai dây phải xuất phát từ CÙNG một nút trái */
            var ctm = area.querySelector('.match-overlay').getScreenCTM();
            function toUser(cx, cy) {
                var det = ctm.a * ctm.d - ctm.b * ctm.c;
                var x = cx - ctm.e, y = cy - ctm.f;
                return { x: (ctm.d * x - ctm.c * y) / det, y: (-ctm.b * x + ctm.a * y) / det };
            }
            var lr = leftDot.getBoundingClientRect();
            var anchor = toUser(lr.right, lr.top + lr.height / 2);
            out.maxOffset = 0;
            area.querySelectorAll('.match-overlay path:not(.is-preview)').forEach(function (p) {
                var m = p.getAttribute('d').match(/M\\s+([-\\d.]+)\\s+([-\\d.]+)/);
                out.maxOffset = Math.max(out.maxOffset, Math.hypot(
                    parseFloat(m[1]) - anchor.x, parseFloat(m[2]) - anchor.y));
            });

            stopQuiz();
            removeBlock(b);
            return out;
        })()`);
        check('Quan hệ 1-n: ô khái niệm vẫn chỉ có 1 nút dù nối nhiều giải thích',
            matchOneN.dotsInLeftBox === 1, matchOneN.dotsInLeftBox + ' nút');
        check('Quan hệ 1-n: mọi dây nối đều xuất phát từ CÙNG một nút trái',
            matchOneN.paths === 2 && matchOneN.links === 2
            && matchOneN.maxOffset < 1.5,
            matchOneN.paths + ' dây / ' + matchOneN.links + ' nối; lệch neo '
                + (matchOneN.maxOffset || 0).toFixed(2) + 'px');

        /* ---------------------------------------------------------------
         * 17f. QUAN HỆ NHIỀU-NHIỀU (MANY-TO-MANY)
         * ------------------------------------------------------------- */
        line('');
        line('--- 17f. NỐI Ô: QUAN HỆ NHIỀU-NHIỀU ---');
        const matchMany = await evaluate(cdp, `(async function () {
            function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
            function pev(type, x, y, target) {
                var ev = new PointerEvent(type, {
                    bubbles: true, cancelable: true, pointerId: 1,
                    clientX: x, clientY: y
                });
                (target || window).dispatchEvent(ev);
            }
            var b = createBlock('matching', 0, 0);
            b.data.pairs = [
                { id: 'c1', concept: 'Khái niệm 1', explanations: ['Gải thích A', 'Gải thích B'] },
                { id: 'c2', concept: 'Khái niệm 2', explanations: ['Gải thích A'] }
            ];
            b.data.explanationsAll = ['Gải thích A', 'Gải thích B'];

            startQuiz();
            await wait(1200);
            var area = document.querySelector('.match-2n-area');
            var leftCol = area.querySelector('.match-col-left');
            var rightCol = area.querySelector('.match-col-right');
            var lefts = leftCol.querySelectorAll('.match-button');
            var rights = rightCol.querySelectorAll('.match-button');

            function drag(fromDot, toDot) {
                var a = fromDot.getBoundingClientRect();
                var c = toDot.getBoundingClientRect();
                pev('pointerdown', a.left + a.width / 2, a.top + a.height / 2, fromDot);
                pev('pointermove', c.left + c.width / 2, c.top + c.height / 2);
                pev('pointerup', c.left + c.width / 2, c.top + c.height / 2);
            }
            function realPaths() {
                return area.querySelectorAll('.match-overlay path:not(.is-preview)').length;
            }

            var out = {};
            /* 1) Khái niệm 1 nối giải thích A */
            drag(lefts[0], rights[0]);
            await wait(110);
            out.afterFirst = realPaths();

            /* 2) Nối TIẾP giải thích B cho CÙNG khái niệm 1 ⇒ phải giữ dây cũ */
            drag(lefts[0], rights[1]);
            await wait(110);
            out.afterSecond = realPaths();

            /* 3) Khái niệm 2 cũng nối giải thích A ⇒ A có 2 dây, dây cũ giữ nguyên */
            drag(lefts[1], rights[0]);
            await wait(110);
            out.afterThird = realPaths();

            /* Dữ liệu cặp nối phải là DANH SÁCH MẢNG [khái niệm, giải thích] */
            out.rawAnswers = JSON.parse(JSON.stringify(playOrder[0].data.answers));
            out.isEdgeList = Array.isArray(out.rawAnswers)
                && out.rawAnswers.every(function (e) { return Array.isArray(e) && e.length === 2; });

            /* Số nối hiển thị trên nút */
            out.leftCounts = Array.prototype.map.call(lefts, function (b) { return b.textContent; });
            out.rightBadges = Array.prototype.map.call(
                rightCol.querySelectorAll('.match-badge'),
                function (b) { return b.textContent; });

            /* Bấm nút phải đang nối 2 khái niệm ⇒ gỡ hết các cặp của nó */
            rights[0].click();
            await wait(110);
            out.afterClear = realPaths();

            stopQuiz();
            removeBlock(b);
            return out;
        })()`);
        check('Nối thêm giải thích cho cùng một khái niệm thì dây cũ KHÔNG bị mất',
            matchMany.afterFirst === 1 && matchMany.afterSecond === 2,
            matchMany.afterFirst + ' → ' + matchMany.afterSecond + ' dây');
        check('Nối cùng một giải thích cho nhiều khái niệm thì dây cũ KHÔNG bị mất',
            matchMany.afterThird === 3,
            matchMany.afterSecond + ' → ' + matchMany.afterThird + ' dây');
        check('Dữ liệu cặp nối lưu dạng DANH SÁCH MẢNG [khái niệm, giải thích]',
            matchMany.isEdgeList === true
            && matchMany.rawAnswers.length === 3
            && matchMany.rawAnswers.some(function (e) { return e[0] === 'c1' && e[1] === 'Gải thích B'; })
            && matchMany.rawAnswers.some(function (e) { return e[0] === 'c2' && e[1] === 'Gải thích A'; }),
            JSON.stringify(matchMany.rawAnswers));
        check('Nút hiển thị số nối (trái = số giải thích, phải = số khái niệm)',
            matchMany.leftCounts.join(',') === '2,1' && matchMany.rightBadges.join(',') === '2,1',
            'trái=' + matchMany.leftCounts.join(',') + ' phải=' + matchMany.rightBadges.join(','));
        check('Bấm nút phải đang nối nhiều khái niệm ⇒ gỡ hết các cặp của nút đó',
            matchMany.afterClear === 1,
            matchMany.afterThird + ' → ' + matchMany.afterClear + ' dây');

        /* ---------------------------------------------------------------
         * 17g. ĐỌC ĐƯỢC DỰ ÁN CŨ (ĐỊNH DẠNG ANSWERS DẠNG OBJECT)
         * ------------------------------------------------------------- */
        line('');
        line('--- 17g. NỐI Ô: CHUYỂN ĐỔI DỮ LIỆU CŨ ---');
        const matchLegacy = await evaluate(cdp, `(async function () {
            function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
            var b = createBlock('matching', 0, 0);
            b.data.pairs = [
                { id: 'c1', concept: 'Khái niệm 1', explanations: ['Gải thích A'] }
            ];
            b.data.explanationsAll = ['Gải thích A'];
            /* ĐỊNH DẠNG CŨ: { idKháiNiệm: [giải thích, ...] } */
            b.data.answers = { c1: ['Gải thích A'] };

            startQuiz();
            await wait(1200);
            var area = document.querySelector('.match-2n-area');
            var out = {};
            out.paths = area.querySelectorAll('.match-overlay path:not(.is-preview)').length;
            out.isEdgeList = Array.isArray(playOrder[0].data.answers)
                && playOrder[0].data.answers.length === 1
                && playOrder[0].data.answers[0][0] === 'c1'
                && playOrder[0].data.answers[0][1] === 'Gải thích A';
            stopQuiz();
            removeBlock(b);
            return out;
        })()`);
        check('Dự án cũ (answers dạng object) vẫn nối và vẽ đúng đường nối',
            matchLegacy.paths === 1 && matchLegacy.isEdgeList === true,
            matchLegacy.paths + ' đường; đã chuyển sang danh sách mảng='
                + matchLegacy.isEdgeList);

        /* ---------------------------------------------------------------
         * 17h. PHẢN HỒI MÀU DÂY NỐI SAU KHI NỘP
         * ------------------------------------------------------------- */
        line('');
        line('--- 17h. NỐI Ô: PHẢN HỒI MÀU SAU KHI NỘP ---');
        const matchFeedback = await evaluate(cdp, `(async function () {
            function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
            function pev(type, x, y, target) {
                var ev = new PointerEvent(type, {
                    bubbles: true, cancelable: true, pointerId: 1,
                    clientX: x, clientY: y
                });
                (target || window).dispatchEvent(ev);
            }
            function drag(fromDot, toDot) {
                var a = fromDot.getBoundingClientRect();
                var c = toDot.getBoundingClientRect();
                pev('pointerdown', a.left + a.width / 2, a.top + a.height / 2, fromDot);
                pev('pointermove', c.left + c.width / 2, c.top + c.height / 2);
                pev('pointerup', c.left + c.width / 2, c.top + c.height / 2);
            }
            var b = createBlock('matching', 0, 0);
            b.data.pairs = [
                { id: 'c1', concept: 'Khái niệm 1', explanations: ['Giải thích A'] },
                { id: 'c2', concept: 'Khái niệm 2', explanations: ['Giải thích B'] },
                { id: 'c3', concept: 'Khái niệm 3', explanations: ['Giải thích C'] }
            ];
            b.data.explanationsAll = ['Giải thích A', 'Giải thích B', 'Giải thích C'];

            startQuiz();
            await wait(1200);
            var area = document.querySelector('.match-2n-area');
            var lefts = area.querySelectorAll('.match-col-left .match-button');
            var rights = area.querySelectorAll('.match-col-right .match-button');
            drag(lefts[0], rights[0]);
            drag(lefts[0], rights[1]);
            await wait(100);
            area.parentElement.querySelector('.btn-primary').click();
            await wait(100);

            var paths = Array.prototype.slice.call(
                area.querySelectorAll('.match-overlay path:not(.is-preview)'));
            var out = {
                correct: paths.filter(function (p) { return p.classList.contains('is-correct'); }).length,
                wrong: paths.filter(function (p) { return p.classList.contains('is-wrong'); }).length,
                missing: paths.filter(function (p) { return p.classList.contains('is-missing'); }).length,
                total: paths.length,
                allCorrect: playerResults[currentIndex].correct
            };
            stopQuiz();
            removeBlock(b);
            return out;
        })()`);
        check('Nộp Matching tô đúng xanh, sai đỏ và cặp còn thiếu vàng',
            matchFeedback.correct === 1 && matchFeedback.wrong === 1
                && matchFeedback.missing === 2 && matchFeedback.total === 4
                && matchFeedback.allCorrect === false,
            'xanh ' + matchFeedback.correct + ', đỏ ' + matchFeedback.wrong
                + ', vàng ' + matchFeedback.missing + ', tổng ' + matchFeedback.total);

        /* ---------------------------------------------------------------
         * 18. ĐIỀN ĐOẠN VĂN (CLOZE) — ANIMATION 3 GIÂY + NHIỀU ĐÁP ÁN
         * ------------------------------------------------------------- */
        line('');
        line('--- 18. ĐIỀN ĐOẠN VĂN (CLOZE) ---');
        const clozeTest = await evaluate(cdp, `(function () {
            function makeCard(answers) {
                var b = createBlock('cloze', 200, 200);
                b.data.paragraph = 'Hà Nội là {{1}} của {{2}}.';
                b.data.blanks = [
                    { id: 'b1', answers: answers[0], user: '' },
                    { id: 'b2', answers: answers[1], user: '' }
                ];
                var card = buildQuestionCard(b, 0);
                return { b: b, card: card };
            }

            var oldHost = document.getElementById('__shotHost');
            if (oldHost) oldHost.remove();

            var host = document.createElement('div');
            host.id = '__shotHost';
            host.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:#141c33;padding:12px;border-radius:12px;width:760px;';
            document.body.appendChild(host);

            /* --- Câu 1: trả lời SAI --- */
            var wrong = makeCard([['Thủ đô', 'Thủ đô'], ['Việt Nam']]);
            host.appendChild(wrong.card);
            var textBox = wrong.card.querySelector('.cloze-text');
            var parts = textBox.querySelectorAll('.cloze-ch, .cloze-blank-wrap');
            var maxEnd = 0, minDelay = -1;
            parts.forEach(function (el) {
                var d = parseFloat(el.style.animationDelay) || 0;
                var dur = parseFloat(el.style.animationDuration) || 0;
                if (d + dur > maxEnd) maxEnd = d + dur;
                if (minDelay < 0 || d < minDelay) minDelay = d;
            });
            var animMs = parseInt(textBox.dataset.animMs, 10) || 0;
            var inputs = wrong.card.querySelectorAll('.cloze-blank');
            var multiAnswers = wrong.b.data.blanks[0].answers.length;

            questionSubmitted = false;
            inputs[0].value = 'Sai rồi';
            inputs[1].value = 'Sai rồi';
            wrong.card.querySelector('.cloze-text').parentElement.querySelector('.btn-primary').click();

            var isWrong = inputs[0].className.indexOf('is-wrong') !== -1;
            var hintMulti = inputs[0].parentElement.querySelector('.cloze-answers');
            var hintBg = hintMulti ? getComputedStyle(hintMulti).backgroundColor : '';
            var hintOptions = hintMulti ? hintMulti.querySelectorAll('select option').length : 0;
            var hintSingle = inputs[1].parentElement.querySelector('.cloze-answers');
            var hintSingleSelect = hintSingle ? hintSingle.querySelector('select') : null;
            var hintSingleText = hintSingle ? hintSingle.textContent : '';

            /* --- Câu 2: trả lời ĐÚNG --- */
            var right = makeCard([['Thủ đô', 'Thủ đô'], ['Việt Nam']]);
            host.appendChild(right.card);
            var rInputs = right.card.querySelectorAll('.cloze-blank');
            questionSubmitted = false;
            rInputs[0].value = '  THỦ ĐÔ  ';
            rInputs[1].value = '  việt NAM ';
            right.card.querySelector('.cloze-text').parentElement.querySelector('.btn-primary').click();
            var isCorrect = rInputs[0].className.indexOf('is-correct') !== -1;
            var isCorrect2 = rInputs[1].className.indexOf('is-correct') !== -1;

            var empty = makeCard([['Thủ đô', 'Trung tâm hành chính'], ['Việt Nam']]);
            host.appendChild(empty.card);
            var emptyInputs = empty.card.querySelectorAll('.cloze-blank');
            questionSubmitted = false;
            empty.card.querySelector('.cloze-text').parentElement.querySelector('.btn-primary').click();
            var emptySubmitted = emptyInputs[0].disabled
                && emptyInputs[0].classList.contains('is-wrong')
                && !!emptyInputs[0].parentElement.querySelector('.cloze-answers-select');

            var editorBlock = createBlock('cloze', 200, 200);
            var editorCommon = buildCommonForm(editorBlock);
            var editorSpecific = buildTypeSpecificForm(editorBlock);
            var editorQuestionGroup = editorCommon.querySelector('.form-group');
            var editorQuestionField = editorQuestionGroup
                ? editorQuestionGroup.querySelector('[data-field="question"]') : null;
            var editorIntegrated = !!editorQuestionGroup
                && editorQuestionField
                && editorQuestionField.tagName === 'TEXTAREA'
                && !editorQuestionGroup.querySelector('[data-field="paragraph"]')
                && !!editorQuestionGroup.querySelector('[data-list-field="blanks"]')
                && !!editorQuestionGroup.querySelector('[data-action="add-row"]')
                && editorSpecific === null;
            var savedEditorForm = DOM.editorForm;
            DOM.editorForm = editorCommon;
            editorQuestionField.value = 'Câu có {{1}}.';
            var editorAnswerInputs = editorCommon.querySelectorAll('input[data-field="blanks"]');
            editorAnswerInputs[0].value = 'Đáp án A ; Đáp án B';
            editorAnswerInputs[1].value = '';
            collectEditorData(editorBlock);
            var editorDataSaved = editorBlock.data.paragraph === 'Câu có {{1}}.'
                && editorBlock.data.question === 'Câu có {{1}}.'
                && editorBlock.data.blanks.length === 2
                && editorBlock.data.blanks[0].answers.join('|') === 'Đáp án A|Đáp án B';
            var runtimeBlock = QuizCoding.prepareRuntimeBlock(editorBlock, {
                totalScore: 0,
                timeLeft: 0
            });
            var runtimeAnswersPreserved = runtimeBlock.data.paragraph === 'Câu có {{1}}.'
                && runtimeBlock.data.question === 'Câu có {{1}}.'
                && runtimeBlock.data.blanks[0].answers.join('|') === 'Đáp án A|Đáp án B';
            var runtimeArea = buildClozeAreaV3(runtimeBlock, 0);
            host.appendChild(runtimeArea);
            var runtimeInput = runtimeArea.querySelector('.cloze-blank');
            questionSubmitted = false;
            runtimeInput.value = '  đáp án a ';
            runtimeArea.querySelector('.btn-primary').click();
            var runtimeAnswerAccepted = runtimeInput.classList.contains('is-correct');
            var editorPlayerCard = buildQuestionCard(editorBlock, 0);
            host.appendChild(editorPlayerCard);
            var editorContentNotDuplicated = getComputedStyle(
                editorPlayerCard.querySelector('.q-text')).display === 'none';
            DOM.editorForm = savedEditorForm;

            removeBlock(wrong.b);
            removeBlock(right.b);
            removeBlock(empty.b);
            removeBlock(editorBlock);

            return {
                partCount: parts.length, animMs: animMs, maxEnd: maxEnd, minDelay: minDelay,
                multiAnswers: multiAnswers, isWrong: isWrong, hintBg: hintBg,
                hintOptions: hintOptions, hintSingleSelect: !!hintSingleSelect,
                hintSingleText: hintSingleText, isCorrect: isCorrect, isCorrect2: isCorrect2,
                emptySubmitted: emptySubmitted, editorIntegrated: editorIntegrated,
                editorDataSaved: editorDataSaved,
                runtimeAnswersPreserved: runtimeAnswersPreserved,
                runtimeAnswerAccepted: runtimeAnswerAccepted,
                editorContentNotDuplicated: editorContentNotDuplicated
            };
        })()`);

        check('Đoạn văn cloze hiện từ từ trong đúng 3 giây (animation-delay chia đều)',
            clozeTest.animMs === 3000 && clozeTest.partCount >= 3
            && clozeTest.maxEnd <= 3000 && clozeTest.maxEnd >= 2500 && clozeTest.minDelay === 0,
            clozeTest.partCount + ' mảnh, kết thúc ở ' + Math.round(clozeTest.maxEnd) + 'ms');
        check('1 ô trống có NHIỀU đáp án đúng',
            clozeTest.multiAnswers === 2, clozeTest.multiAnswers + ' đáp án đúng');
        check('Trả lời sai ⇒ ô đỏ + ô vàng #FEF3C7 liệt kê các đáp án đúng',
            clozeTest.isWrong && clozeTest.hintBg === 'rgb(254, 243, 199)' && clozeTest.hintOptions === 3,
            clozeTest.hintBg + ', ' + clozeTest.hintOptions + ' lựa chọn trong danh sách vàng');
        check('Trả lời đúng, có khoảng trắng thừa và khác hoa/thường ⇒ ô xanh',
            clozeTest.isCorrect && clozeTest.isCorrect2);
        check('Ô chỉ có 1 đáp án đúng ⇒ hiện gợi ý chữ, không hiện danh sách',
            !clozeTest.hintSingleSelect && clozeTest.hintSingleText.indexOf('Đáp án') === 0,
            clozeTest.hintSingleText.slice(0, 40));
        check('Để trống toàn bộ ô vẫn nộp được, hiện ô đỏ và danh sách đáp án vàng',
            clozeTest.emptySubmitted);
        check('Editor gộp tên, đoạn văn và danh sách đáp án trong cùng một nhóm',
            clozeTest.editorIntegrated && clozeTest.editorDataSaved,
            'không có trường đoạn văn riêng; đã lưu đoạn văn cùng đáp án');
        check('Đáp án Cloze được giữ nguyên và chấm đúng sau khi tạo bản runtime',
            clozeTest.runtimeAnswersPreserved && clozeTest.runtimeAnswerAccepted);
        check('Player không lặp đoạn văn Cloze ở phần tiêu đề câu hỏi',
            clozeTest.editorContentNotDuplicated);

        /* Ảnh chụp bản 2.3 */
        await captureScreenshot(cdp, '32-cloze.png');

        /* ---------------------------------------------------------------
         * 19. CHỌN TỪ DANH SÁCH (DROPDOWN) — ANIMATION 3s + EDITOR THÂN THIỆN
         * ------------------------------------------------------------- */
        line('');
        line('--- 19. CHỌN TỪ DANH SÁCH (DROPDOWN) ---');
        const dropdownTest = await evaluate(cdp, `(function () {
            var b = createBlock('dropdown', 200, 200);
            b.data.paragraph = 'Việt Nam {{1}} thuộc {{2}}.';
            b.data.blanks = [
                { id: 'd1', options: ['Đông Nam Á', 'Châu Âu'], correct: 'Đông Nam Á' },
                { id: 'd2', options: ['Hà Nội', 'Sài Gòn'], correct: 'Hà Nội' }
            ];

            var oldHost = document.getElementById('__shotHost');
            if (oldHost) oldHost.remove();

            var host = document.createElement('div');
            host.id = '__shotHost';
            host.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:#141c33;padding:12px;border-radius:12px;width:760px;';
            document.body.appendChild(host);

            var card = buildQuestionCard(b, 0);
            host.appendChild(card);

            var textBox = card.querySelector('.dropdown-text');
            var parts = textBox.querySelectorAll('.dd-ch, .dd-chip-wrap');
            var maxEnd = 0, minDelay = -1;
            parts.forEach(function (el) {
                var d = parseFloat(el.style.animationDelay) || 0;
                var dur = parseFloat(el.style.animationDuration) || 0;
                if (d + dur > maxEnd) maxEnd = d + dur;
                if (minDelay < 0 || d < minDelay) minDelay = d;
            });
            var animMs = parseInt(textBox.dataset.animMs, 10) || 0;

            var chips = card.querySelectorAll('.dd-chip');
            var lists = card.querySelectorAll('.dd-list');
            var opt0 = lists[0].querySelectorAll('li').length;
            var opt1 = lists[1].querySelectorAll('li').length;
            var first0 = lists[0].querySelector('li').textContent;
            var first1 = lists[1].querySelector('li').textContent;

            /* Chọn: ô 1 đúng, ô 2 sai */
            chips[0].click();
            lists[0].querySelectorAll('li')[0].click();
            chips[1].click();
            lists[1].querySelectorAll('li')[1].click();

            questionSubmitted = false;
            card.querySelector('.dropdown-text').parentElement.querySelector('.btn-primary').click();

            var chip0Ok = chips[0].className.indexOf('is-correct') !== -1;
            var chip1Bad = chips[1].className.indexOf('is-wrong') !== -1;
            var toggles = card.querySelectorAll('.dd-toggle');
            var toggleVisible = toggles.length === 2 && !toggles[0].hidden;
            var locked = chips[0].disabled && chips[0].className.indexOf('is-locked') !== -1;

            /* --- Editor thân thiện (D2) --- */
            var editor = buildDropdownEditor(b);
            var items = editor.querySelectorAll('.dd-editor-item');
            var textareas = editor.querySelectorAll('[data-field="ddOptions"]');
            var radios = editor.querySelectorAll('[data-field="ddCorrect"]');
            var checkedRadios = editor.querySelectorAll('[data-field="ddCorrect"]:checked');
            var addBtn = !!editor.querySelector('[data-action="dd-add-blank"]');
            var useCommon = editor.querySelectorAll('[data-action="dd-use-common"]').length;
            var commonForm = buildCommonForm(b);
            var contentField = commonForm.querySelector('[data-field="question"]');
            var hasLegacyParagraph = editor.querySelector('[data-field="paragraph"]');
            var hasSharedOptions = editor.querySelector('[data-field="optionsText"]');
            var originalBlanks = JSON.parse(JSON.stringify(b.data.blanks));
            var originalParagraph = b.data.paragraph;
            var originalQuestion = b.data.question;
            var tempForm = document.createElement('div');
            tempForm.appendChild(buildCommonForm(b));
            var tempQuestion = tempForm.querySelector('[data-field="question"]');
            var dynamicEditor = buildDropdownEditor(b, tempQuestion);
            tempForm.appendChild(dynamicEditor);
            tempQuestion.value = 'Một {{1}}, hai {{2}}, ba {{3}}';
            tempQuestion.dispatchEvent(new Event('input', { bubbles: true }));
            var insertedPlaceholderCount = dynamicEditor.querySelectorAll('.dd-editor-item').length;
            b.data.blanks = originalBlanks;
            b.data.paragraph = originalParagraph;
            b.data.question = originalQuestion;
            /* Modal thật (buildTypeSpecificForm) cũng phải hiện editor thân thiện */
            var viaForm = buildTypeSpecificForm(b);
            var formHasEditor = !!viaForm.querySelector('.dd-editor-list');

            removeBlock(b);

            return {
                partCount: parts.length, animMs: animMs, maxEnd: maxEnd, minDelay: minDelay,
                opt0: opt0, opt1: opt1, first0: first0, first1: first1,
                chip0Ok: chip0Ok, chip1Bad: chip1Bad, toggleVisible: toggleVisible,
                locked: locked, items: items.length, textareas: textareas.length,
                radios: radios.length, checkedRadios: checkedRadios.length,
                addBtn: addBtn, useCommon: useCommon, formHasEditor: formHasEditor,
                contentField: !!contentField, contentValue: contentField ? contentField.value : '',
                expectedContent: b.data.paragraph,
                hasLegacyParagraph: !!hasLegacyParagraph, hasSharedOptions: !!hasSharedOptions,
                insertedPlaceholderCount: insertedPlaceholderCount
            };
        })()`);

        check('Đoạn văn dropdown hiện từ từ trong đúng 3 giây (animation-delay chia đều)',
            dropdownTest.animMs === 3000 && dropdownTest.partCount >= 3
            && dropdownTest.maxEnd <= 3000 && dropdownTest.maxEnd >= 2500 && dropdownTest.minDelay === 0,
            dropdownTest.partCount + ' mảnh, kết thúc ở ' + Math.round(dropdownTest.maxEnd) + 'ms');
        check('Mỗi ô thả có DANH SÁCH LỰA CHỌN RIÊNG',
            dropdownTest.opt0 === 2 && dropdownTest.opt1 === 2 && dropdownTest.first0 !== dropdownTest.first1,
            dropdownTest.first0 + ' | ' + dropdownTest.first1);
        check('Editor dropdown: nội dung nằm trong nhóm câu hỏi, mỗi chỗ trống có lựa chọn riêng',
            dropdownTest.items === 2 && dropdownTest.textareas === 2 && dropdownTest.radios === 4
            && dropdownTest.checkedRadios === 2 && dropdownTest.addBtn && dropdownTest.useCommon === 0
            && dropdownTest.formHasEditor === true && dropdownTest.contentField
            && dropdownTest.contentValue === dropdownTest.expectedContent
            && !dropdownTest.hasLegacyParagraph && !dropdownTest.hasSharedOptions,
            dropdownTest.items + ' ô, ' + dropdownTest.radios + ' radio, ' + dropdownTest.useCommon + ' nút dùng chung');
        check('Thêm {{N}} vào nội dung câu hỏi tự tạo cấu hình danh sách chọn tương ứng',
            dropdownTest.insertedPlaceholderCount === 3,
            dropdownTest.insertedPlaceholderCount + ' chỗ trống');
        check('Sau khi nộp: đúng ⇒ xanh, sai ⇒ đỏ',
            dropdownTest.chip0Ok && dropdownTest.chip1Bad);
        check('Sau khi nộp: có nút ▾ xem lại lựa chọn và KHÔNG đổi được nữa',
            dropdownTest.toggleVisible && dropdownTest.locked);

        /* Ảnh chụp bản 2.3 */
        await captureScreenshot(cdp, '33-dropdown.png');

        /* ---------------------------------------------------------------
         * 20. CHỌN VÙNG TRONG ẢNH (HOTSPOT) — EDITOR Ô ĐỎ (H1–H4)
         * ------------------------------------------------------------- */
        line('');
        line('--- 20. CHỌN VÙNG TRONG ẢNH (HOTSPOT) ---');
        const hotspotTest = await evaluate(cdp, `(async function () {
            var svg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">'
                + '<rect width="480" height="320" fill="#cfe3ff"/>'
                + '<circle cx="150" cy="120" r="62" fill="#ff7b8b"/>'
                + '<rect x="300" y="170" width="120" height="90" fill="#0fbd8c"/></svg>');

            var old = document.getElementById('__shotHost');
            if (old) old.remove();

            var b = createBlock('hotspot', 200, 200);
            b.data.imageUrl = svg;
            b.data.regions = [{ id: 'r1', label: 'Vùng 1', x: 20, y: 20, w: 20, h: 20, correct: true }];
            b.data.matchThreshold = 50;

            var host = document.createElement('div');
            host.id = '__shotHost';
            host.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:#fff;padding:12px;border-radius:12px;width:560px;';
            document.body.appendChild(host);

            var editor = buildHotspotEditor(b);
            host.appendChild(editor);

            var stage = editor.querySelector('.editor-hotspot-stage');
            var img = stage.querySelector('img.hotspot-bg');
            if (img && !img.complete) {
                await new Promise(function (res) {
                    img.addEventListener('load', res);
                    img.addEventListener('error', res);
                });
            }
            var hasImg = !!img && img.getAttribute('src').indexOf('data:image/svg') === 0;
            var hasAddBtn = !!editor.querySelector('[data-action="hs-add-region"]');
            var drafts = editor.querySelectorAll('.hs-region.is-draft');
            var draftCount = drafts.length;
            var draftBg = drafts[0] ? getComputedStyle(drafts[0]).backgroundColor : '';
            var handleBtns = drafts[0] ? drafts[0].querySelectorAll('.hs-region-handle button').length : 0;

            /* Nút + / - đổi kích thước ô đỏ */
            var w0 = parseFloat(drafts[0].style.width);
            editor.querySelector('[data-action="hs-grow"]').click();
            var w1 = parseFloat(editor.querySelector('.hs-region.is-draft').style.width);
            editor.querySelector('[data-action="hs-shrink"]').click();
            var w2 = parseFloat(editor.querySelector('.hs-region.is-draft').style.width);
            editor.querySelector('[data-action="hs-toggle-shape"]').click();
            var circleDraft = editor.querySelector('.hs-region.is-draft');
            var circleShapeEnabled = circleDraft.classList.contains('is-circle')
                && getComputedStyle(circleDraft).borderRadius === '50%';

            /* Kéo ô đỏ trên ảnh */
            var region = editor.querySelector('.hs-region.is-draft');
            var r0 = region.getBoundingClientRect();
            var x0 = parseFloat(region.style.left);
            region.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true, clientX: r0.left + 4, clientY: r0.top + 4, pointerId: 1
            }));
            document.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true, clientX: r0.left + 54, clientY: r0.top + 24, pointerId: 1
            }));
            document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
            var x1 = parseFloat(editor.querySelector('.hs-region.is-draft').style.left);

            /* Modal thật (buildTypeSpecificForm) cũng phải hiện editor vùng đỏ
               (gọi SAU khi kéo xong vì mỗi lần dựng lại sẽ thay listener kéo-thả) */
            var viaForm = buildTypeSpecificForm(b);
            var formHasEditor = !!viaForm.querySelector('.editor-hotspot-stage');

            /* Lưu cấu hình => toạ độ THẬT được ghi vào block.data
               (dùng bản editor thứ 2 để bản đang hiển thị vẫn còn trong host). */
            var editorSave = buildHotspotEditor(b);
            var savedForm = DOM.editorForm.innerHTML;
            DOM.editorForm.innerHTML = '';
            DOM.editorForm.appendChild(editorSave);
            collectEditorData(b);
            DOM.editorForm.innerHTML = savedForm;
            var savedX = b.data.regions[0].x;
            var savedW = b.data.regions[0].w;
            var savedLabel = b.data.regions[0].label;
            var savedShape = b.data.regions[0].shape;
            /* --- Ngưỡng % hoạt động: vùng trùng vùng đáp án => xanh --- */
            var pb = createBlock('hotspot', 200, 200);
            pb.data.imageUrl = svg;
            pb.data.regions = [{ id: 'r1', label: 'Miền Bắc', x: 20, y: 20, w: 30, h: 30, shape: 'circle', correct: true }];
            pb.data.matchThreshold = 50;
            var pcard = buildQuestionCard(pb, 0);
            var pstage = document.createElement('div');
            pstage.style.cssText = 'position:fixed;left:600px;top:20px;z-index:99999;background:#fff;padding:12px;border-radius:12px;width:560px;';
            pstage.appendChild(pcard);
            document.body.appendChild(pstage);

            pb.data.userRegions[0].x = 20;
            pb.data.userRegions[0].y = 20;
            questionSubmitted = false;
            pcard.querySelector('.hotspot-wrap').parentElement.querySelector('.btn-primary').click();
            var overlap = pcard.querySelectorAll('.hs-overlap').length;
            var answerBoxes = pcard.querySelectorAll('.hs-answer').length;
            var answerColor = getComputedStyle(pcard.querySelector('.hs-answer')).borderColor;
            var userColor = getComputedStyle(pcard.querySelector('.hs-user-region')).borderColor;
            var overlapColor = getComputedStyle(pcard.querySelector('.hs-overlap')).backgroundColor;
            var playerCircle = pcard.querySelector('.hs-user-region').classList.contains('is-circle');
            var playerLabel = pcard.querySelector('.hs-user-region').textContent;
            var answerLabel = pcard.querySelector('.hs-answer .region-label').textContent;

            var mixedBlock = createBlock('hotspot', 200, 200);
            mixedBlock.data.imageUrl = svg;
            mixedBlock.data.regions = [{ id: 'r1', label: 'A', x: 20, y: 20, w: 30, h: 30, shape: 'circle', correct: true }];
            mixedBlock.data.matchThreshold = 50;
            var mixedCard = buildQuestionCard(mixedBlock, 0);
            pstage.appendChild(mixedCard);
            var mixedUser = mixedBlock.data.userRegions[0];
            mixedUser.x = 20;
            mixedUser.y = 20;
            mixedUser.w = 5;
            mixedUser.h = 5;
            mixedUser.shape = 'rectangle';
            var mixedUserElement = mixedCard.querySelector('.hs-user-region');
            mixedUserElement.classList.remove('is-circle');
            mixedUserElement.style.left = '20%';
            mixedUserElement.style.top = '20%';
            mixedUserElement.style.width = '5%';
            mixedUserElement.style.height = '5%';
            questionSubmitted = false;
            mixedCard.querySelector('.btn-primary').click();
            var mixedIntersectionCount = mixedCard.querySelectorAll('.hs-overlap').length;
            var mixedFeedback = mixedCard.querySelector('.btn-primary').textContent;

            pstage.remove();
            removeBlock(b);
            removeBlock(pb);
            removeBlock(mixedBlock);

            return {
                hasImg: hasImg, hasAddBtn: hasAddBtn, draftCount: draftCount,
                draftBg: draftBg, handleBtns: handleBtns, formHasEditor: formHasEditor,
                w0: w0, w1: w1, w2: w2, x0: x0, x1: x1,
                savedX: savedX, savedW: savedW, savedLabel: savedLabel,
                savedShape: savedShape, circleShapeEnabled: circleShapeEnabled,
                overlap: overlap, answerBoxes: answerBoxes,
                answerColor: answerColor, userColor: userColor,
                overlapColor: overlapColor, playerCircle: playerCircle,
                playerLabel: playerLabel, answerLabel: answerLabel,
                mixedIntersectionCount: mixedIntersectionCount, mixedFeedback: mixedFeedback
            };
        })()`);

        check('Editor hotspot hiện ảnh + nút "+ Thêm ô đỏ" + ô đỏ độ mờ 50%',
            hotspotTest.hasImg && hotspotTest.hasAddBtn && hotspotTest.draftCount === 1
            && hotspotTest.draftBg.indexOf('239, 68, 68') !== -1 && hotspotTest.handleBtns >= 3
            && hotspotTest.formHasEditor === true,
            hotspotTest.draftBg + ', ' + hotspotTest.handleBtns + ' nút trên đầu ô');
        check('Nút ＋ / － đổi kích thước ô đỏ',
            hotspotTest.w1 > hotspotTest.w0 && hotspotTest.w2 < hotspotTest.w1,
            hotspotTest.w0 + '% → ' + hotspotTest.w1 + '% → ' + hotspotTest.w2 + '%');
        check('Kéo ô đỏ trên ảnh để chuyển vị trí',
            hotspotTest.x1 > hotspotTest.x0 + 5,
            hotspotTest.x0 + '% → ' + Math.round(hotspotTest.x1 * 10) / 10 + '%');
        check('Lưu cấu hình ghi toạ độ/kích thước THẬT của ô đỏ',
            Math.abs(hotspotTest.savedX - hotspotTest.x1) < 0.5
            && Math.abs(hotspotTest.savedW - hotspotTest.w2) < 0.5
            && hotspotTest.savedLabel === 'Vùng 1',
            'x=' + Math.round(hotspotTest.savedX * 10) / 10 + '%, w=' + hotspotTest.savedW + '%');
        check('Có thể đổi vùng chọn hình chữ nhật thành hình tròn và lưu hình dạng',
            hotspotTest.circleShapeEnabled && hotspotTest.savedShape === 'circle',
            hotspotTest.savedShape);
        check('Sau khi nộp, đáp án vàng, vùng người chơi đỏ và phần giao xanh',
            hotspotTest.overlap >= 1 && hotspotTest.answerBoxes >= 1
            && hotspotTest.answerColor.indexOf('234, 179, 8') !== -1
            && hotspotTest.userColor.indexOf('220, 38, 38') !== -1
            && hotspotTest.overlapColor.indexOf('34, 197, 94') !== -1
            && hotspotTest.playerCircle,
            hotspotTest.overlap + ' vùng giao màu xanh');
        check('Tên vùng người chơi trùng với tên vùng đã đặt trong Editor',
            hotspotTest.playerLabel === 'Miền Bắc' && hotspotTest.answerLabel === 'Miền Bắc',
            hotspotTest.playerLabel + ' / ' + hotspotTest.answerLabel);
        check('Giao hình tròn–chữ nhật loại đúng vùng nằm ngoài đường tròn',
            hotspotTest.mixedIntersectionCount === 0 && hotspotTest.mixedFeedback.indexOf('Chưa đúng') !== -1,
            hotspotTest.mixedIntersectionCount + ' vùng giao, ' + hotspotTest.mixedFeedback);

        /* Ảnh chụp bản 2.3 */
        await captureScreenshot(cdp, '34-hotspot.png');
        await evaluate(cdp, `(function () {
            var h = document.getElementById('__shotHost');
            if (h) h.remove();
        })()`);

        /* ---------------------------------------------------------------
         * 14. LỖI CONSOLE / RUNTIME
         * ------------------------------------------------------------- */
        line('');
        line('--- 14. LỖI CONSOLE / RUNTIME ---');
        check('Không có lỗi runtime trong suốt quá trình test',
            consoleErrors.length === 0, consoleErrors.join(' | '));

    } catch (err) {
        failed += 1;
        line('');
        line('❌ LỖI KHÔNG MONG MUỐN: ' + (err && err.stack ? err.stack : err));
        if (consoleErrors.length) {
            line('Lỗi console của trang:');
            consoleErrors.forEach(function (e) { line('   ' + e); });
        }
    } finally {
        line('');
        line('================ KẾT QUẢ ================');
        line('  Tổng: ' + (passed + failed) + '  |  Đạt: ' + passed + '  |  Lỗi: ' + failed);
        line(failed === 0 ? '  ✅ TẤT CẢ KIỂM THỬ ĐỀU ĐẠT' : '  ❌ CÓ KIỂM THỬ THẤT BẠI');
        line('=========================================');

        if (cdp) { try { cdp.close(); } catch (e) { /* bỏ qua */ } }
        chrome.kill();
        await sleep(300);

        process.exitCode = failed === 0 ? 0 : 1;
    }
})();
