/* ============================================================
 *  MODULE: js/ui/editor.js (phien ban 2.3)
 * ============================================================ */

/**
 * Tạo một nhóm form: <label> + nội dung + gợi ý.
 *
 * LƯU Ý (bản 2.3): `innerHtml` nhận được CẢ chuỗi HTML lẫn phần tử DOM.
 * Trước đây hàm nội suy thẳng vào chuỗi, nên khi truyền một HTMLElement
 * (ví dụ textInput(...)) nó biến thành chuỗi "[object HTMLInputElement]"
 * => mất sạch mọi ô nhập trong form cấu hình.
 *
 * @param {string} label - nhãn của nhóm
 * @param {string|HTMLElement} innerHtml - nội dung (chuỗi HTML hoặc phần tử DOM)
 * @param {string} [hint] - gợi ý nhỏ hiển thị bên dưới
 * @returns {HTMLElement} phần tử .form-group
 */
function formGroup(label, innerHtml, hint) {
    var wrap = htmlToElement('<div class="form-group"><label>' + escapeHtml(label) + '</label></div>');
    if (innerHtml == null) {
    } else if (typeof innerHtml === 'string') {
        wrap.insertAdjacentHTML('beforeend', innerHtml);
    } else {
        wrap.appendChild(innerHtml);
    }
    if (hint) wrap.appendChild(htmlToElement('<div class="form-hint">' + escapeHtml(hint) + '</div>'));
    return wrap;
}

function textInput(value, field, placeholder) {
    return htmlToElement('<input type="text" class="form-input" data-field="' + field + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder || '') + '">');
}

function textArea(value, field, placeholder) {
    var el = htmlToElement('<textarea class="form-textarea" data-field="' + field + '" placeholder="' + escapeHtml(placeholder || '') + '"></textarea>');
    el.value = value == null ? '' : value;
    return el;
}

function numberInput(value, field, min, max) {
    var el = htmlToElement('<input type="number" class="form-input" data-field="' + field + '" min="' + (min || 0) + '" max="' + (max || '') + '" step="any">');
    el.value = value == null ? '' : value;
    return el;
}

function toggleSwitch(checked, field) {
    return htmlToElement('<label class="switch"><input type="checkbox" data-field="' + field + '"' + (checked ? ' checked' : '') + '><span class="switch-slider"></span></label>');
}

function configRow(value, field, index, extraHtml) {
    return htmlToElement(
        '<div class="row-item" data-index="' + index + '">'
        + '<span class="row-index">' + (parseInt(index, 10) + 1) + '</span>'
        + '<input type="text" class="form-input" data-field="' + field + '" value="' + escapeHtml(value) + '" placeholder="Nhập nội dung">'
        + (extraHtml || '')
        + '<div class="row-actions">'
        + '<button type="button" class="icon-btn" data-action="up">UP</button>'
        + '<button type="button" class="icon-btn" data-action="down">DOWN</button>'
        + '<button type="button" class="icon-btn" data-action="remove">DEL</button>'
        + '</div></div>'
    );
}

function buildRowList(items, field, extraBuilder, emptyText) {
    var list = htmlToElement('<div class="row-list" data-list-field="' + field + '"></div>');
    if (!items || items.length === 0) {
        list.appendChild(htmlToElement('<div class="row-empty">' + escapeHtml(emptyText || 'Chưa có mục nào.') + '</div>'));
        return list;
    }
    items.forEach(function (value, i) {
        var extra = extraBuilder ? extraBuilder(value, i) : '';
        list.appendChild(configRow(value, field, i, extra));
    });
    return list;
}

function addRowButton(label) {
    return htmlToElement('<button type="button" class="btn btn-add" data-action="add-row">+ ' + escapeHtml(label || 'Thêm') + '</button>');
}


/* ===== ANH CUA CAU HOI ===== */

function buildImageForm(block) {
    var d = block.data;
    var wrap = htmlToElement('<div class="image-form"></div>');
    wrap.appendChild(htmlToElement('<div class="section-title blue">Ảnh của câu hỏi (không bắt buộc)</div>'));
    var urlInput = htmlToElement('<input type="text" class="form-input" data-field="imageUrl" placeholder="https://... hoac bam nut Tải ảnh từ máy">');
    wrap.appendChild(formGroup('Đường dẫn ảnh (URL hoặc tải từ máy)', urlInput.outerHTML, 'Ảnh hiển thị ở nửa phải màn hình khi chơi. Câu hỏi chọn vùng trên ảnh dùng ảnh này.'));
    var urlField = wrap.querySelector('[data-field="imageUrl"]');
    if (urlField) urlField.value = d.imageUrl || '';

    var actions = htmlToElement(
        '<div class="image-actions">'
        + '<input type="file" accept="image/*" class="hidden-file" data-field="imageFile">'
        + '<button type="button" class="btn btn-add" data-action="pick-image">Tải ảnh từ máy</button>'
        + '<button type="button" class="btn btn-del" data-action="clear-image">Xóa ảnh</button>'
        + '<span class="image-fit">Chế độ hiển thị:'
        + ' <select class="form-input" data-field="imageFit" style="width:auto">'
        + '<option value="contain"' + (d.imageFit !== 'cover' ? ' selected' : '') + '>contain</option>'
        + '<option value="cover"' + (d.imageFit === 'cover' ? ' selected' : '') + '>cover</option>'
        + '</select></span></div>'
    );
    wrap.appendChild(actions);

    var previewWrap = htmlToElement(
        '<div class="image-preview-wrap">'
        + '<img class="image-preview" alt="Xem trước ảnh">'
        + '<div class="image-preview-empty">Chưa có ảnh</div>'
        + '<div class="image-size-hint form-hint" data-field="imageSizeHint" hidden></div>'
        + '</div>'
    );
    wrap.appendChild(previewWrap);

    refreshImagePreview(wrap);
    return wrap;
}

function refreshImagePreview(scope) {
    var root = scope || DOM.editorForm;
    if (!root) return;
    var input = root.querySelector('[data-field="imageUrl"]');
    var img = root.querySelector('.image-preview');
    var empty = root.querySelector('.image-preview-empty');
    var hint = root.querySelector('[data-field="imageSizeHint"]');
    if (!input || !img || !empty) return;
    var url = (input.value || '').trim();
    if (url) {
        img.src = url;
        img.hidden = false;
        empty.hidden = true;
    } else {
        img.removeAttribute('src');
        img.hidden = true;
        empty.hidden = false;
    }
    if (hint) {
        var tooBig = url.indexOf('data:') === 0 && url.length > 1500000;
        hint.hidden = !tooBig;
        hint.textContent = tooBig ? ('Cảnh báo: ảnh lớn (' + Math.round(url.length / 1024) + ' KB)') : '';
    }
}

function handleEditorImageFile(input) {
    var file = input && input.files ? input.files[0] : null;
    if (!file) return;
    if (file.type.indexOf('image/') !== 0) {
        showToast('Tệp không phải là ảnh.');
        input.value = '';
        return;
    }
    if (file.size > 4 * 1024 * 1024) {
        showToast('Ảnh quá lớn (tối đa 4 MB).');
        input.value = '';
        return;
    }
    var reader = new FileReader();
    reader.onload = function () {
        var urlInput = DOM.editorForm.querySelector('[data-field="imageUrl"]');
        if (urlInput) urlInput.value = String(reader.result);
        refreshImagePreview();
        showToast('Đã nạp ảnh (' + Math.round(file.size / 1024) + ' KB).');
    };
    reader.onerror = function () { showToast('Không đọc được tệp ảnh.'); };
    reader.readAsDataURL(file);
}

function clearEditorImage() {
    var urlInput = DOM.editorForm.querySelector('[data-field="imageUrl"]');
    if (urlInput) urlInput.value = '';
    refreshImagePreview();
}

/* ===== PHAN CHUNG (cau hoi / diem / thoi gian / note) ===== */

function buildCommonForm(block) {
    var d = block.data;
    var wrap = htmlToElement('<div></div>');
    var questionFields = htmlToElement('<div class="cloze-editor-fields"></div>');
    if (block.type === 'cloze' || block.type === 'dropdown') {
        questionFields.appendChild(textArea(
            d.paragraph || d.question || '',
            'question',
            block.type === 'dropdown'
                ? 'Nhập nội dung câu hỏi và dùng {{1}}, {{2}} để chèn danh sách chọn.'
                : 'Nhập nội dung câu hỏi và dùng {{1}}, {{2}} để tạo ô trống.'
        ));
        if (block.type === 'cloze') {
            questionFields.appendChild(htmlToElement(
                '<div class="form-hint">Mỗi chỗ trống dùng số thứ tự trong dấu ngoặc nhọn kép. Nhập nhiều đáp án đúng, phân cách bằng dấu chấm phẩy (;).</div>'
            ));
            var answerRows = buildRowList(
                (d.blanks || []).map(function (blank) {
                    var answers = Array.isArray(blank.answers) && blank.answers.length
                        ? blank.answers : (blank.answer ? [blank.answer] : []);
                    return answers.join(' ; ');
                }),
                'blanks', null, 'Chưa có đáp án cho chỗ trống nào.'
            );
            questionFields.appendChild(answerRows);
            questionFields.appendChild(addRowButton('Thêm danh sách đáp án'));
        }
    } else {
        questionFields.appendChild(textInput(d.question || '', 'question', 'Ví dụ: Tính 2 + 3 = ?'));
    }
    wrap.appendChild(formGroup('Tên / nội dung câu hỏi', questionFields));
    // LƯU Ý: KHÔNG nội suy phần tử DOM vào chuỗi HTML (sẽ thành
    // "[object HTMLInputElement]"); phải appendChild từng phần tử riêng.
    var row = htmlToElement('<div class="form-row"></div>');
    var scoreGroup = htmlToElement(
        '<div class="form-group">'
        + '<label class="form-label">Điểm thưởng (mặc định 1000)</label>'
        + '</div>'
    );
    scoreGroup.appendChild(numberInput(d.score, 'score', 0));
    var timeGroup = htmlToElement(
        '<div class="form-group">'
        + '<label class="form-label">Thời gian (giây, 0 = không giới hạn)</label>'
        + '</div>'
    );
    timeGroup.appendChild(numberInput(d.timeLimit, 'timeLimit', 0));
    row.appendChild(scoreGroup);
    row.appendChild(timeGroup);
    wrap.appendChild(row);
    wrap.appendChild(formGroup(
        'Hiển thị ghi chú / hướng dẫn sau khi nộp bài?',
        toggleSwitch(!!d.noteEnabled, 'noteEnabled')
    ));
    wrap.appendChild(formGroup(
        'Nội dung ghi chú',
        textArea(d.note || '', 'note', 'Hỗ trợ {{biến}} để chèn giá trị runtime.')
    ));
    return wrap;
}

/* ===== FORM RIENG CHO TUNG LOAI ===== */

/* ==========================================================================
 *  BẢN 2.3 (M5) — EDITOR NỐI Ô TRỰC QUAN CHO CÂU HỎI "NỐI Ô"
 * --------------------------------------------------------------------------
 *  · Cột trái  : các khái niệm. Mỗi khái niệm có N cúc tròn đã nối + 1 cúc
 *                tròn trống (nút "+") để thêm giải thích mới.
 *  · Cột phải : các giải thích. Mỗi giải thích có 1 cúc tròn.
 *  · Sợi dây  : vẽ bằng SVG (`.match-overlay`) nối cúc trái với cúc phải.
 *
 *  Dữ liệu nằm NGAY trong `block.data`:
 *     d.pairs[i]        = { id, concept, explanations: [text, ...] }
 *     d.explanationsAll = [text, ...]   (mọi giải thích, kể cả chưa nối)
 *  ⇒ bấm "Huỷ" vẫn khôi phục được dữ liệu cũ (xem snapshotEditorData).
 * ========================================================================== */

/**
 * Dựng khu vực soạn cặp nối ô cho câu hỏi "nối ô" (matching).
 *
 * @param {Object} block - khối câu hỏi đang chỉnh sửa
 * @returns {HTMLElement} phần tử .editor-match-area
 */
function buildMatchingEditor(block) {
    var d = block.data;
    if (!Array.isArray(d.pairs)) d.pairs = [];
    if (!Array.isArray(d.explanationsAll)) d.explanationsAll = [];

    /* Chuẩn hoá cột phải: bỏ trùng lặp và BẢO ĐẢM có đủ mọi giải thích đang
       được gắn với một khái niệm. Thiếu một giải thích ⇒ cột phải thiếu ô ⇒
       đường nối của cặp đó không thể vẽ (hay đúng hơn: mở lại bảng cấu hình
       sẽ thấy đường nối bị thiếu). */
    var seenExp = Object.create(null);
    var allExps = [];
    var pushExp = function (e) {
        if (typeof e !== 'string' || !e || seenExp[e]) return;
        seenExp[e] = true;
        allExps.push(e);
    };
    d.explanationsAll.forEach(pushExp);
    d.pairs.forEach(function (p) {
        (p.explanations || []).forEach(pushExp);
    });
    d.explanationsAll = allExps;

    var wrap = htmlToElement('<div class="editor-match-area"></div>');
    wrap.appendChild(htmlToElement('<div class="section-title purple">Nối ô trực quan</div>'));
    wrap.appendChild(htmlToElement(
        '<div class="form-hint match-editor-hint">Bấm ô tròn bên trái (khái niệm) rồi bấm ô tròn bên phải (giải thích) để nối. Bấm lại ô tròn đã nối để tách.</div>'
    ));

    var area = htmlToElement('<div class="match-2n-area editor-match-2n"></div>');
    var leftCol = htmlToElement('<div class="match-col match-col-left"></div>');
    var rightCol = htmlToElement('<div class="match-col match-col-right"></div>');
    var svgNS = 'http://www.w3.org/2000/svg';
    var overlay = document.createElementNS(svgNS, 'svg');
    overlay.setAttribute('class', 'match-overlay');
    overlay.setAttribute('xmlns', svgNS);
    overlay.style.overflow = 'visible';
    area.appendChild(leftCol);
    area.appendChild(overlay);
    area.appendChild(rightCol);
    wrap.appendChild(area);

    var toolbar = htmlToElement(
        '<div class="editor-match-toolbar">'
        + '<button type="button" class="btn btn-add" data-action="match-add-concept">+ Thêm khái niệm</button>'
        + '<button type="button" class="btn btn-add" data-action="match-add-explanation">+ Thêm giải thích</button>'
        + '</div>'
    );
    wrap.appendChild(toolbar);

    /* Cúc tròn bên trái đang được chọn (để nối) */
    var selecting = null;

    /* Bảng tra cứu phần tử đã dựng (dùng để vẽ đường nối, không cần selector) */
    var leftRows = [];
    var rightRows = Object.create(null);

    /** Tìm chỉ số của cặp theo id. */
    function pairIndexById(id) {
        for (var i = 0; i < d.pairs.length; i++) {
            if (d.pairs[i].id === id) return i;
        }
        return -1;
    }

    /**
     * Vẽ sợi dây giữa cúc trái (đã nối) và cúc phải tương ứng.
     *
     * Bản 2.4: toạ độ được đổi qua getScreenCTM() của chính thẻ SVG nên
     * đường nối luôn bám đúng điểm, kể cả khi modal đang chạy animation
     * "sbPopIn" (scale .6 → 1.06 → 1) hoặc vùng chứa bị co giãn.
     */
    function drawLines() {
        while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
        if (!area.isConnected) return;
        syncSvgOverlaySize(overlay, area);
        if (!area.clientWidth) return;

        d.pairs.forEach(function (pair, pi) {
            var row = leftRows[pi];
            if (!row) return;
            (pair.explanations || []).forEach(function (exp, k) {
                var l = row.dots[k];
                if (!l) return;
                var target = rightRows[exp];
                if (!target || !target.dot) return;
                var pts = matchConnectorPoints(overlay, l, target.dot);
                if (!pts) return;
                var p = document.createElementNS(svgNS, 'path');
                p.setAttribute('class', 'match-line is-active');
                p.setAttribute('d', matchConnectorPath(pts.x1, pts.y1, pts.x2, pts.y2));
                overlay.appendChild(p);
            });
        });
    }
    /**
     * Dựng lại 2 cột + sợi dây (gọi khi nối/tách/thêm/xoá).
     *
     * Bản 2.4: hai bảng tra cứu leftRows / rightRows giúp vẽ đường nối mà
     * không cần truy vấn CSS selector theo nội dung (nội dung do người dùng
     * gõ có thể chứa ký tự đặc biệt ⇒ selector dễ hỏng).
     */
    function render() {
        leftCol.innerHTML = '';
        rightCol.innerHTML = '';
        leftRows = [];
        rightRows = Object.create(null);

        d.pairs.forEach(function (pair, pi) {
            var box = htmlToElement('<div class="match-box" data-pair="' + escapeHtml(pair.id) + '"></div>');

            var text = htmlToElement('<span class="match-text"></span>');
            var input = htmlToElement('<input type="text" class="form-input match-text-input" data-field="matchConcept" data-index="' + pi + '" placeholder="Khái niệm ' + (pi + 1) + '">');
            input.value = pair.concept || '';
            text.appendChild(input);

            var btns = htmlToElement('<span class="match-buttons"></span>');
            var exps = pair.explanations || [];
            var rowDots = [];
            for (var k = 0; k <= exps.length; k++) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'match-button';
                b.dataset.side = 'L';
                b.dataset.owner = pair.id;
                b.dataset.idx = String(k);
                b.textContent = (k < exps.length) ? String(k + 1) : '+';
                if (k < exps.length) b.classList.add('is-filled');
                if (selecting && selecting.pairId === pair.id && selecting.idx === k) {
                    b.classList.add('is-selected');
                }
                btns.appendChild(b);
                rowDots.push(b);
            }

            var del = htmlToElement('<button type="button" class="icon-btn match-del" data-action="match-remove-concept" data-index="' + pi + '" title="Xoá khái niệm">X</button>');
            box.appendChild(text);
            box.appendChild(btns);
            box.appendChild(del);
            leftCol.appendChild(box);
            leftRows.push({ id: pair.id, box: box, dots: rowDots });
        });

        d.explanationsAll.forEach(function (exp, ei) {
            var box = htmlToElement('<div class="match-box" data-explanation="' + escapeHtml(exp) + '"></div>');

            var slot = htmlToElement('<span class="match-button-slot"></span>');
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'match-button';
            b.dataset.side = 'R';
            b.dataset.owner = exp;
            b.dataset.idx = String(ei);
            b.textContent = String.fromCharCode(65 + ei);
            slot.appendChild(b);

            var text = htmlToElement('<span class="match-text"></span>');
            var input = htmlToElement('<input type="text" class="form-input match-text-input" data-field="matchExplanation" data-index="' + ei + '" placeholder="Giải thích ' + (ei + 1) + '">');
            input.value = exp;
            text.appendChild(input);

            var del = htmlToElement('<button type="button" class="icon-btn match-del" data-action="match-remove-explanation" data-index="' + ei + '" title="Xoá giải thích">X</button>');
            box.appendChild(slot);
            box.appendChild(text);
            box.appendChild(del);
            rightCol.appendChild(box);
            rightRows[exp] = { index: ei, box: box, dot: b, exp: exp };
        });

        drawLines();
    requestAnimationFrame(function () { drawLines(); });
}
    /* --- Sự kiện: bấm cúc tròn / nút thêm-xoá ----------------------- */
    area.addEventListener('click', function (e) {
        var act = e.target.closest('[data-action]');
        if (act) {
            var action = act.dataset.action;
            var ai = parseInt(act.dataset.index, 10) || 0;
            if (action === 'match-remove-concept') {
                d.pairs.splice(ai, 1);
                selecting = null;
                render();
            } else if (action === 'match-remove-explanation') {
                var removed = d.explanationsAll.splice(ai, 1)[0];
                /* Gỡ khỏi MỌI khái niệm đang nối tới giải thích này */
                d.pairs.forEach(function (p) {
                    if (!Array.isArray(p.explanations)) return;
                    p.explanations = p.explanations.filter(function (ex) { return ex !== removed; });
                });
                selecting = null;
                render();
            }
            e.preventDefault();
            return;
        }

        var dot = e.target.closest('.match-button');
        if (!dot) return;
        e.preventDefault();

        if (dot.dataset.side === 'L') {
            var pi = pairIndexById(dot.dataset.owner);
            if (pi < 0) return;
            var pair = d.pairs[pi];
            var idx = parseInt(dot.dataset.idx, 10) || 0;
            var exps = pair.explanations || [];

            if (idx < exps.length) {
                /* Bấm lại cúc đã nối => TÁCH cặp */
                exps.splice(idx, 1);
                pair.explanations = exps;
                selecting = null;
                render();
                return;
            }
            /* Cúc trống => chọn khái niệm để nối */
            if (selecting && selecting.pairId === pair.id && selecting.idx === idx) {
                selecting = null;
            } else {
                selecting = { pairId: pair.id, idx: idx };
            }
            render();
            return;
        }

        /* Cột phải: nối giải thích vào khái niệm đang chọn */
        if (!selecting) {
            showToast('⚠️ Hãy bấm một ô tròn bên trái trước!');
            return;
        }
        var ei = parseInt(dot.dataset.idx, 10) || 0;
        var exp = d.explanationsAll[ei];
        var si = pairIndexById(selecting.pairId);
        if (si < 0 || !exp) return;
        var target = d.pairs[si];
        if (!Array.isArray(target.explanations)) target.explanations = [];
        if (target.explanations.indexOf(exp) === -1) target.explanations.push(exp);
        selecting = null;
        render();
    });

    /* Sửa chữ khái niệm / giải thích => cập nhật thẳng vào block.data */
    area.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || !t.dataset) return;
        if (t.dataset.field === 'matchConcept') {
            var pi = parseInt(t.dataset.index, 10) || 0;
            if (d.pairs[pi]) d.pairs[pi].concept = t.value;
            return;
        }
        if (t.dataset.field === 'matchExplanation') {
            var ei = parseInt(t.dataset.index, 10) || 0;
            if (ei < 0 || ei >= d.explanationsAll.length) return;
            var old = d.explanationsAll[ei];
            var val = t.value;
            d.explanationsAll[ei] = val;
            /* Đồng bộ MỌI cặp đang nối tới giải thích này (một giải thích
               có thể được gắn vào nhiều khái niệm). */
            if (old) {
                d.pairs.forEach(function (p) {
                    (p.explanations || []).forEach(function (ex, k) {
                        if (ex === old) p.explanations[k] = val;
                    });
                });
            }
            var box = t.closest('.match-box');
            if (box) {
                box.setAttribute('data-explanation', val);
                var dot = box.querySelector('.match-button');
                if (dot) dot.dataset.owner = val;
            }
            /* Cập nhật bảng tra cứu để đường nối vẽ lại đúng chỗ */
            if (rightRows[old]) delete rightRows[old];
            rightRows[val] = { index: ei, box: box, dot: dot, exp: val };
            drawLines();
        }
    });

    /* Nút thêm khái niệm / giải thích */
    toolbar.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.preventDefault();
        if (btn.dataset.action === 'match-add-concept') {
            var id = 'p' + (d.pairs.length + 1) + '-' + Date.now().toString(36);
            d.pairs.push({ id: id, concept: '', explanations: [] });
            render();
        } else if (btn.dataset.action === 'match-add-explanation') {
            d.explanationsAll.push('Giải thích ' + (d.explanationsAll.length + 1));
            render();
        }
    });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(drawLines).observe(area);
    } else {
        window.addEventListener('resize', drawLines);
    }

    render();
    requestAnimationFrame(function () { drawLines(); });
    return wrap;
}

/** Hàm cũ (giữ tên cho buildTypeSpecificForm) — bản 2.3 dùng editor trực quan. */
function buildMatchingForm(block) {
    return buildMatchingEditor(block);
}

/* ========================================================================== 
 *  BẢN 2.3 (D2) — EDITOR THÂN THIỆN CHO CÂU HỎI "CHỌN TỪ DANH SÁCH"
 * --------------------------------------------------------------------------
 *  Mỗi ô thả ({{1}}, {{2}}…) có riêng:
 *    · 1 ô nhập danh sách lựa chọn (mỗi dòng 1 tuỳ chọn)
 *    · các radio đánh dấu đáp án đúng của riêng ô đó
 *  Nút "+ Thêm ô thả" và "Dùng danh sách chung" giúp tác giả soạn nhanh.
 * ========================================================================== */

/** Tách một chuỗi nhiều dòng thành mảng dòng đã cắt khoảng trắng. */
function splitEditorLines(value) {
    return String(value == null ? '' : value)
        .split('\n')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
}

/**
 * Dựng danh sách radio "đáp án đúng" cho 1 ô thả.
 *
 * @param {HTMLElement} box - khung chứa radio
 * @param {Array<string>} options - danh sách lựa chọn
 * @param {string} current - đáp án đúng hiện tại
 * @param {number} index - chỉ số ô thả (dùng cho `name` của radio)
 */
function fillDropdownCorrectList(box, options, current, index) {
    box.innerHTML = '';
    if (!options || !options.length) {
        box.appendChild(htmlToElement('<div class="form-hint">Chưa có từ lựa chọn — hãy nhập vào ô bên trên.</div>'));
        return;
    }
    options.forEach(function (opt) {
        var label = htmlToElement('<label class="check-label"></label>');
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'dd-correct-' + index;
        radio.dataset.field = 'ddCorrect';
        radio.dataset.index = String(index);
        radio.dataset.value = opt;
        if (opt === current) radio.checked = true;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(' ' + opt));
        box.appendChild(label);
    });
}

/**
 * Dựng 1 khối soạn cho một ô thả của câu hỏi dropdown.
 *
 * @param {Object} blank - { id, options[], correct }
 * @param {number} index - chỉ số ô thả
 * @returns {HTMLElement} phần tử .dd-editor-item
 */
function buildDropdownBlankEditor(blank, index) {
    var item = htmlToElement('<div class="dd-editor-item"></div>');
    item.dataset.index = String(index);
    item.dataset.blankId = (blank && blank.id) ? blank.id : '';

    var head = htmlToElement('<div class="dd-editor-head"></div>');
    head.appendChild(htmlToElement('<span class="dd-editor-title">Ô thả {{' + (index + 1) + '}}</span>'));
    head.appendChild(htmlToElement(
        '<button type="button" class="icon-btn" data-action="dd-remove-blank" data-index="' + index + '" title="Xoá ô thả">X</button>'
    ));
    item.appendChild(head);

    var ta = htmlToElement('<textarea class="form-textarea dd-options-input" data-field="ddOptions" data-index="' + index + '" placeholder="Mỗi dòng một từ lựa chọn"></textarea>');
    ta.value = (blank && blank.options ? blank.options : []).join('\n');
    item.appendChild(ta);

    var correct = htmlToElement('<div class="dd-editor-correct" data-index="' + index + '"></div>');
    item.appendChild(correct);
    fillDropdownCorrectList(correct, blank && blank.options ? blank.options : [],
        (blank && blank.correct) ? blank.correct : '', index);

    return item;
}

/**
 * Dựng toàn bộ form cấu hình cho câu hỏi "chọn từ danh sách".
 *
 * @param {Object} block - khối câu hỏi đang chỉnh sửa
 * @returns {HTMLElement} phần tử form
 */
function buildDropdownEditor(block, questionInput) {
    var d = block.data;
    if (!Array.isArray(d.blanks)) d.blanks = [];

    var wrap = htmlToElement('<div></div>');
    wrap.appendChild(htmlToElement('<div class="section-title pink">Danh sách lựa chọn và đáp án cho từng chỗ trống</div>'));

    var listWrap = htmlToElement('<div class="dd-editor-list"></div>');
    d.blanks.forEach(function (b, i) {
        listWrap.appendChild(buildDropdownBlankEditor(b, i));
    });
    wrap.appendChild(listWrap);
    wrap.appendChild(htmlToElement(
        '<button type="button" class="btn btn-add" data-action="dd-add-blank">+ Thêm ô thả</button>'
    ));
    if (questionInput) {
        questionInput.addEventListener('input', function () {
            d.paragraph = questionInput.value;
            d.question = questionInput.value;
            var placeholders = questionInput.value.match(/\{\{(\d+)\}\}/g) || [];
            var maxIndex = placeholders.reduce(function (max, token) {
                return Math.max(max, parseInt(token.replace(/[{}]/g, ''), 10) || 0);
            }, 0);
            while (d.blanks.length < maxIndex) {
                var blank = {
                    id: 'd' + (d.blanks.length + 1) + '-' + Date.now().toString(36),
                    options: [],
                    correct: ''
                };
                d.blanks.push(blank);
                listWrap.appendChild(buildDropdownBlankEditor(blank, d.blanks.length - 1));
            }
        });
    }
    /* --- Sửa danh sách lựa chọn => dựng lại radio đáp án đúng ------- */
    listWrap.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || !t.dataset || t.dataset.field !== 'ddOptions') return;
        var idx = parseInt(t.dataset.index, 10) || 0;
        var item = t.closest('.dd-editor-item');
        if (!item) return;
        var opts = splitEditorLines(t.value);
        var old = d.blanks[idx] || {};
        var correct = (old.correct && opts.indexOf(old.correct) !== -1) ? old.correct : '';
        d.blanks[idx] = { id: old.id || null, options: opts, correct: correct };
        var box = item.querySelector('.dd-editor-correct');
        if (box) fillDropdownCorrectList(box, opts, correct, idx);
    });

    /* Chọn đáp án đúng của 1 ô thả */
    listWrap.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.dataset || t.dataset.field !== 'ddCorrect') return;
        var idx = parseInt(t.dataset.index, 10) || 0;
        if (d.blanks[idx]) d.blanks[idx].correct = t.dataset.value || '';
    });

    /* Thêm / xoá danh sách lựa chọn theo từng chỗ trống */
    wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        var idx = parseInt(btn.dataset.index, 10) || 0;
        e.preventDefault();

        if (action === 'dd-remove-blank') {
            var it = listWrap.querySelector('.dd-editor-item[data-index="' + idx + '"]');
            if (it) it.remove();
            d.blanks.splice(idx, 1);
            renumberDropdownBlanks(listWrap);
            return;
        }
        if (action === 'dd-add-blank') {
            var blank = {
                id: 'd' + (d.blanks.length + 1) + '-' + Date.now().toString(36),
                options: [],
                correct: ''
            };
            d.blanks.push(blank);
            listWrap.appendChild(buildDropdownBlankEditor(blank, d.blanks.length - 1));
        }
    });

    return wrap;
}

/** Đánh số lại các ô thả sau khi xoá 1 ô (tiêu đề + data-index). */
function renumberDropdownBlanks(listWrap) {
    if (!listWrap) return;
    var items = listWrap.querySelectorAll('.dd-editor-item');
    items.forEach(function (item, i) {
        item.dataset.index = String(i);
        var title = item.querySelector('.dd-editor-title');
        if (title) title.textContent = 'Ô thả {{' + (i + 1) + '}}';
        item.querySelectorAll('[data-index]').forEach(function (el) {
            el.dataset.index = String(i);
        });
        item.querySelectorAll('[data-field="ddCorrect"]').forEach(function (el) {
            el.name = 'dd-correct-' + i;
        });
    });
}

/** Hàm cũ (giữ tên cho buildTypeSpecificForm) — bản 2.3 dùng editor thân thiện. */
function buildDropdownForm(block) {
    var questionInput = DOM.editorForm
        ? DOM.editorForm.querySelector('[data-field="question"]')
        : null;
    return buildDropdownEditor(block, questionInput);
}

/* ==========================================================================
 *  BẢN 2.3 (H1–H4) — EDITOR VÙNG ĐỎ TRÊN ẢNH
 * --------------------------------------------------------------------------
 *  · Ảnh của câu hỏi hiển thị ngay trong modal.
 *  · Nút "+ Thêm ô đỏ" tạo ô đỏ mới (độ mờ 50%).
 *  · Mỗi ô có 2 nút nhỏ trên đầu: ＋ (tăng) và － (giảm) kích thước.
 *  · Kéo ô đỏ để chuyển vị trí (toạ độ lưu theo % so với khung ảnh).
 * ========================================================================== */

/** Dọn listener kéo-thả của editor hotspot (tránh nhân bản khi mở modal). */
var hotspotEditorCleanup = null;

/**
 * Dựng khu vực soạn vùng đỏ trên ảnh cho câu hỏi "chọn vùng trong ảnh".
 *
 * @param {Object} block - khối câu hỏi đang chỉnh sửa
 * @returns {HTMLElement} phần tử .editor-hotspot-wrap
 */
function buildHotspotEditor(block) {
    var d = block.data;
    if (!Array.isArray(d.regions)) d.regions = [];

    if (hotspotEditorCleanup) {
        hotspotEditorCleanup();
        hotspotEditorCleanup = null;
    }

    var wrap = htmlToElement('<div class="editor-hotspot-wrap"></div>');
    wrap.appendChild(htmlToElement('<div class="section-title pink">Soạn vùng chọn trên ảnh</div>'));
    wrap.appendChild(formGroup(
        'Ngưỡng trùng khớp (% overlap)',
        numberInput(d.matchThreshold || 50, 'matchThreshold', 0),
        'Tính đúng khi vùng người chơi overlap vùng đáp án >= ngưỡng. Mặc định 50%.'
    ));
    wrap.appendChild(htmlToElement(
        '<div class="form-hint">Vùng màu đỏ là đáp án chuẩn. Kéo để chuyển vị trí; dùng ＋ / － để đổi kích thước.</div>'
    ));

    var stage = htmlToElement('<div class="editor-hotspot-stage"></div>');
    var img = document.createElement('img');
    img.className = 'hotspot-bg';
    img.alt = 'Ảnh của câu hỏi';
    if (d.imageUrl) img.src = d.imageUrl;
    var layer = htmlToElement('<div class="hs-layer hs-draft-layer"></div>');
    stage.appendChild(img);
    stage.appendChild(layer);
    if (!d.imageUrl) {
        stage.appendChild(htmlToElement(
            '<div class="hotspot-editor-empty">Chưa có ảnh. Hãy dán URL hoặc tải ảnh ở mục phía trên.</div>'
        ));
    }
    wrap.appendChild(stage);

    var toolbar = htmlToElement(
        '<div class="hotspot-editor-toolbar">'
        + '<button type="button" class="btn btn-add" data-action="hs-add-region">+ Thêm ô đỏ</button>'
        + '</div>'
    );
    wrap.appendChild(toolbar);

    function stageAspectRatio() {
        if (stage.clientWidth && stage.clientHeight) return stage.clientWidth / stage.clientHeight;
        if (img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight;
        return 1;
    }
    function circleHeight(width) {
        return Math.min(100, width * stageAspectRatio());
    }

    /** Dựng lại các ô đỏ trên ảnh. */
    function renderRegions() {
        layer.innerHTML = '';
        d.regions.forEach(function (r, i) {
            var isCircle = r.shape === 'circle';
            if (isCircle) r.h = circleHeight(r.w);
            var el = htmlToElement('<div class="hs-region is-draft' + (isCircle ? ' is-circle' : '') + '" data-index="' + i + '"></div>');
            el.style.left = r.x + '%';
            el.style.top = r.y + '%';
            el.style.width = r.w + '%';
            el.style.height = r.h + '%';

            var handle = htmlToElement('<div class="hs-region-handle"></div>');
            handle.appendChild(htmlToElement(
                '<button type="button" data-action="hs-grow" data-index="' + i + '" title="Tăng kích thước">+</button>'
            ));
            handle.appendChild(htmlToElement(
                '<button type="button" data-action="hs-shrink" data-index="' + i + '" title="Giảm kích thước">-</button>'
            ));
            handle.appendChild(htmlToElement(
                '<button type="button" class="hs-shape-toggle" data-action="hs-toggle-shape" data-index="' + i + '"'
                + ' title="Chuyển thành hình ' + (isCircle ? 'chữ nhật' : 'tròn') + '">'
                + (isCircle ? 'Chữ nhật' : 'Tròn') + '</button>'
            ));
            var chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.dataset.field = 'hsCorrect';
            chk.dataset.index = String(i);
            chk.title = 'Là vùng đáp án đúng';
            chk.checked = (r.correct !== false);
            handle.appendChild(chk);
            handle.appendChild(htmlToElement(
                '<button type="button" class="del" data-action="hs-remove" data-index="' + i + '" title="Xoá ô đỏ">x</button>'
            ));
            el.appendChild(handle);

            var lbl = document.createElement('input');
            lbl.type = 'text';
            lbl.className = 'hs-label-input';
            lbl.dataset.field = 'hsLabel';
            lbl.dataset.index = String(i);
            lbl.placeholder = 'Nhãn vùng ' + (i + 1);
            lbl.value = r.label || '';
            el.appendChild(lbl);

            layer.appendChild(el);
        });
    }
    /* --- Kéo ô đỏ trên ảnh (toạ độ lưu theo %) ---------------------- */
    var drag = null;

    function onPointerDown(e) {
        if (e.target.closest('.hs-region-handle') || e.target.closest('.hs-label-input')) return;
        var el = e.target.closest('.hs-region.is-draft');
        if (!el) return;
        var idx = parseInt(el.dataset.index, 10) || 0;
        var r = d.regions[idx];
        var rect = stage.getBoundingClientRect();
        if (!r || !rect.width || !rect.height) return;
        drag = {
            index: idx,
            dx: (e.clientX - rect.left) / rect.width * 100 - r.x,
            dy: (e.clientY - rect.top) / rect.height * 100 - r.y
        };
        el.classList.add('is-dragging');
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!drag) return;
        var rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var r = d.regions[drag.index];
        if (!r) return;
        r.x = Math.max(0, Math.min(100 - r.w, (e.clientX - rect.left) / rect.width * 100 - drag.dx));
        r.y = Math.max(0, Math.min(100 - r.h, (e.clientY - rect.top) / rect.height * 100 - drag.dy));
        var el = layer.querySelector('.hs-region.is-draft[data-index="' + drag.index + '"]');
        if (el) {
            el.style.left = r.x + '%';
            el.style.top = r.y + '%';
        }
    }

    function onPointerUp() {
        if (!drag) return;
        var el = layer.querySelector('.hs-region.is-draft[data-index="' + drag.index + '"]');
        if (el) el.classList.remove('is-dragging');
        drag = null;
    }

    stage.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    hotspotEditorCleanup = function () {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    };

    /* --- Nút: thêm ô đỏ, tăng/giảm kích thước, xoá ------------------ */
    wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        var idx = parseInt(btn.dataset.index, 10) || 0;
        e.preventDefault();

        if (action === 'hs-add-region') {
            var n = d.regions.length;
            d.regions.push({
                id: 'r' + (n + 1) + '-' + Date.now().toString(36),
                label: 'Vùng ' + (n + 1),
                x: 10 + (n * 8) % 60,
                y: 10 + (n * 8) % 60,
                w: 20,
                h: 20,
                shape: 'rectangle',
                correct: true
            });
            renderRegions();
            return;
        }
        var r = d.regions[idx];
        if (!r) return;
        if (action === 'hs-toggle-shape') {
            r.shape = r.shape === 'circle' ? 'rectangle' : 'circle';
            if (r.shape === 'circle') {
                r.w = Math.min(r.w, 100 / stageAspectRatio(), 100 - r.x);
                r.h = circleHeight(r.w);
                r.y = Math.min(r.y, 100 - r.h);
            }
        } else if (action === 'hs-grow') {
            r.w = r.shape === 'circle'
                ? Math.min(100 - r.x, 100 / stageAspectRatio(), r.w + 2)
                : Math.min(100 - r.x, r.w + 2);
            r.h = r.shape === 'circle' ? circleHeight(r.w) : Math.min(100 - r.y, r.h + 2);
            r.y = Math.min(r.y, 100 - r.h);
        } else if (action === 'hs-shrink') {
            r.w = Math.max(2, r.w - 2);
            r.h = r.shape === 'circle' ? circleHeight(r.w) : Math.max(2, r.h - 2);
        } else if (action === 'hs-remove') {
            d.regions.splice(idx, 1);
        } else {
            return;
        }
        renderRegions();
    });

    /* Nhãn vùng + cờ "đáp án đúng" */
    wrap.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || !t.dataset || t.dataset.field !== 'hsLabel') return;
        var idx = parseInt(t.dataset.index, 10) || 0;
        if (d.regions[idx]) d.regions[idx].label = t.value;
    });
    wrap.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.dataset || t.dataset.field !== 'hsCorrect') return;
        var idx = parseInt(t.dataset.index, 10) || 0;
        if (d.regions[idx]) d.regions[idx].correct = !!t.checked;
    });

    /* Ảnh tải xong mới vẽ lại vùng (tránh vẽ sai chỗ khi ảnh chưa có kích thước) */
    img.onload = function () { renderRegions(); };

    renderRegions();
    return wrap;
}

/** Hàm cũ (giữ tên cho buildTypeSpecificForm) — bản 2.3 dùng editor trực quan. */
function buildHotspotForm(block) {
    return buildHotspotEditor(block);
}

function buildOrderingForm(block) {
    var d = block.data;
    var wrap = htmlToElement('<div></div>');
    wrap.appendChild(htmlToElement('<div class="section-title">Thứ tự các mục (mục đầu là đáp án đúng)</div>'));
    var list = buildRowList((d.items || []).slice(), 'orderingItems', null, 'Chưa có mục nào.');
    wrap.appendChild(list);
    wrap.appendChild(addRowButton('Thêm mục'));
    return wrap;
}

function buildMultipleChoiceForm(block) {
    var d = block.data;
    var wrap = htmlToElement('<div></div>');
    wrap.appendChild(htmlToElement('<div class="section-title">Các đáp án</div>'));
    var shuffleRow = htmlToElement('<div class="switch-row"><span>Xáo trộn thứ tự đáp án khi chơi</span></div>');
    shuffleRow.appendChild(toggleSwitch(!!d.shuffleOptions, 'shuffleOptions'));
    wrap.appendChild(shuffleRow);

    // d.options là mảng đối tượng { text, correct } (xem core/block-types.js).
    // Form chỉ hiển thị phần TEXT; cờ "Đúng" là checkbox đi kèm mỗi dòng.
    var opts = Array.isArray(d.options) ? d.options : [];
    var list = buildRowList(
        opts.map(function (o) { return (o && o.text) ? o.text : ''; }),
        'multipleChoice',
        function (text, i) {
            var o = opts[i] || {};
            return '<label class="check-label">'
                + '<input type="checkbox" data-field="optionCorrect" data-index="' + i + '"'
                + (o.correct ? ' checked' : '') + '>Đúng</label>';
        },
        'Chưa có đáp án.'
    );
    wrap.appendChild(list);
    wrap.appendChild(addRowButton('Thêm đáp án'));
    return wrap;
}

function buildTypeSpecificForm(block) {
    var t = block.type;
    if (t === 'matching') return buildMatchingForm(block);
    if (t === 'cloze') return null;
    if (t === 'dropdown') return buildDropdownForm(block);
    if (t === 'hotspot') return buildHotspotForm(block);
    if (t === 'ordering') return buildOrderingForm(block);
    return buildMultipleChoiceForm(block);
}

/* ===== OPEN / CLOSE / TABS ===== */

/* ==========================================================================
 *  BẢN 2.3 — BẢN SAO DỮ LIỆU KHI MỞ MODAL (để bấm "Huỷ" hoàn tác được)
 *  Các editor mới (nối ô, kéo ô đỏ, danh sách lựa chọn) ghi thẳng vào
 *  block.data ngay khi tác giả thao tác ⇒ cần chụp lại dữ liệu trước khi mở.
 * ========================================================================== */
var editorDataSnapshot = null;

/**
 * Chụp bản sao các trường dữ liệu của 4 loại câu hỏi tương tác.
 * @param {Object} block - khối câu hỏi đang mở modal
 */
function snapshotEditorData(block) {
    if (!block || !block.data) return;
    var d = block.data;
    var snap = {};
    var keys = ['pairs', 'explanationsAll', 'blanks', 'regions', 'options',
        'answers', 'paragraph', 'matchThreshold', 'userRegions'];
    keys.forEach(function (k) {
        if (d[k] !== undefined) snap[k] = JSON.parse(JSON.stringify(d[k]));
    });
    editorDataSnapshot = { blockId: block.id, data: snap };
}

/**
 * Khôi phục dữ liệu đã chụp (dùng khi bấm "Huỷ" hoặc đóng modal).
 * @param {Object} block - khối câu hỏi đang mở modal
 */
function restoreEditorData(block) {
    if (!editorDataSnapshot) return;
    if (!block || editorDataSnapshot.blockId !== block.id) {
        editorDataSnapshot = null;
        return;
    }
    var d = block.data || {};
    Object.keys(editorDataSnapshot.data).forEach(function (k) {
        d[k] = editorDataSnapshot.data[k];
    });
    editorDataSnapshot = null;
}

function openBlockEditor(block) {
    state.editingBlock = block;
    snapshotEditorData(block);
    if (DOM.editorOverlay) DOM.editorOverlay.hidden = false;
    if (DOM.editorOverlay && DOM.editorOverlay.classList) DOM.editorOverlay.classList.add('is-open');
    if (DOM.editorModal) {
        if ('hidden' in DOM.editorModal) DOM.editorModal.hidden = false;
        if (DOM.editorModal.classList) DOM.editorModal.classList.add('is-open');
    }
    if (typeof QuizCoding !== 'undefined' && QuizCoding.ensureProgram) {
        try { QuizCoding.ensureProgram(block.data); } catch (e) {}
    }
    var meta = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES[block.type]) || {};
    var titleLabel = meta.label || block.type;
    if (DOM.editorTitle) {
        DOM.editorTitle.textContent = 'Cấu hình câu hỏi: ' + titleLabel;
    }
    switchEditorTab('config');
    renderEditorForm(block);
    updateCodingBadge(block);
    if (DOM.editorCode && typeof QuizCodingUI !== 'undefined' && QuizCodingUI.mount) {
        try { QuizCodingUI.mount(DOM.editorCode, block); } catch (e) { console.warn('QuizCodingUI.mount failed', e.message); }
    }
    document.body.style.overflow = 'hidden';
}


function switchEditorTab(tab) {
    state.editorTab = tab;
    var tabs = DOM.editorModal ? DOM.editorModal.querySelectorAll('[data-editor-tab]') : (DOM.editorTabs ? DOM.editorTabs.querySelectorAll('.editor-tab') : []);
    tabs.forEach(function (t) {
        if (t.dataset.editorTab !== undefined) {
            t.classList.toggle('is-active', t.dataset.editorTab === tab);
        } else if (t.dataset.tab !== undefined) {
            t.classList.toggle('is-active', t.dataset.tab === tab);
        }
    });
    var cfg = DOM.editorForm;
    var cod = DOM.editorCode;
    if (cfg) {
        if ('hidden' in cfg) cfg.hidden = (tab !== 'config');
        cfg.style.display = (tab === 'config') ? '' : 'none';
    }
    if (cod) {
        if ('hidden' in cod) cod.hidden = (tab !== 'code');
        cod.style.display = (tab === 'code') ? '' : 'none';
    }
    if (DOM.editorModal && DOM.editorModal.classList) DOM.editorModal.classList.toggle('coding-mode', tab === 'code');
    if (tab === 'code' && typeof QuizCodingUI !== 'undefined' && state.editingBlock) {
        try {
            if (typeof QuizCodingUI.mount === 'function') QuizCodingUI.mount(DOM.editorCode, state.editingBlock);
            else if (typeof QuizCodingUI.openProgramIntoEditor === 'function') QuizCodingUI.openProgramIntoEditor(state.editingBlock);
        } catch (e) { console.warn('switchEditorTab code failed', e.message); }
    }
}


/**
 * Cập nhật badge đếm số khối lệnh trên tab "Lập trình khối".
 * @param {Object} block - khối câu hỏi đang chỉnh sửa
 */
function updateCodingBadge(block) {
    if (!DOM.editorBadge) return;
    var p = block.data && block.data.program;
    var n = p ? (p.stacks.setup.length + p.stacks.correct.length + p.stacks.wrong.length) : 0;
    DOM.editorBadge.textContent = n ? String(n) : '';
    DOM.editorBadge.hidden = !n;
}

function closeBlockEditor() {
    state.editingBlock = null;
    if (hotspotEditorCleanup) {
        hotspotEditorCleanup();
        hotspotEditorCleanup = null;
    }
    if (DOM.editorOverlay) {
        DOM.editorOverlay.hidden = true;
        if (DOM.editorOverlay.classList) DOM.editorOverlay.classList.remove('is-open');
    }
    if (DOM.editorModal) {
        DOM.editorModal.hidden = true;
        if (DOM.editorModal.classList) {
            DOM.editorModal.classList.remove('is-open');
            DOM.editorModal.classList.remove('coding-mode');
        }
    }
    document.body.style.overflow = '';
    if (typeof QuizCodingUI !== 'undefined' && typeof QuizCodingUI.unmount === 'function') {
        try { QuizCodingUI.unmount(); } catch (e) {}
    }
}
/* ===== HOOK CÁC NÚT + EVENTS KHỞI TẠO ===== */

/** Khi người dùng bấm "Lưu" trên modal cấu hình. */
function onEditorSave() {
    if (!state.editingBlock) return;
    try { collectEditorData(state.editingBlock); } catch (e) { console.warn('collectEditorData failed', e.message); }
    editorDataSnapshot = null;   /* đã lưu ⇒ không cần hoàn tác nữa */
    if (typeof QuizCodingUI !== 'undefined' && typeof QuizCodingUI.sync === 'function') {
        try { QuizCodingUI.sync(); } catch (e) {}
    }
    if (typeof renderBlock === 'function') renderBlock(state.editingBlock);
    if (typeof refreshStageAndProperties === 'function') refreshStageAndProperties();
    if (typeof showToast === 'function') showToast('💾 Đã lưu cấu hình câu hỏi.');
    closeBlockEditor();
}

/** Khi người dùng bấm "Huỷ" trên modal cấu hình. */
function onEditorCancel() {
    restoreEditorData(state.editingBlock);
    closeBlockEditor();
}

/** Khi người dùng bấm nút đóng (×) trên modal cấu hình. */
function onEditorClose() {
    restoreEditorData(state.editingBlock);
    closeBlockEditor();
}

/** Gắn sự kiện cho các nút modal (gọi 1 lần khi trang nạp xong). */
function initEditorModalHooks() {
    // Chốt chặn idempotent: không được gắn listener 2 lần (tránh bấm "Lưu"
    // bị xử lý nhiều lần).
    if (initEditorModalHooks._done) return;
    initEditorModalHooks._done = true;

    if (DOM.editorSave) DOM.editorSave.addEventListener('click', onEditorSave);
    if (DOM.editorCancel) DOM.editorCancel.addEventListener('click', onEditorCancel);
    if (DOM.editorClose) DOM.editorClose.addEventListener('click', onEditorClose);
    var tabs = DOM.editorModal ? DOM.editorModal.querySelectorAll('[data-editor-tab]') : [];
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            switchEditorTab(tab.dataset.editorTab);
        });
    });
    document.addEventListener('quiz-coding-change', function () {
        if (!state.editingBlock) return;
        renderBlock(state.editingBlock);
        updateCodingBadge(state.editingBlock);
    });
}



/* ===== COLLECT DATA + MIGRATE (idempotent) ===== */

function getListValues(form, listField) {
    var list = form.querySelector('.row-list[data-list-field="' + listField + '"]');
    if (!list) return [];
    var inputs = list.querySelectorAll('input[type="text"][data-field="' + listField + '"]');
    var out = [];
    inputs.forEach(function (inp) {
        var v = (inp.value || '').trim();
        if (v !== '') out.push(v);
    });
    return out;
}

/**
 * Đọc DANH SÁCH DÒNG (nội dung + cờ "Đúng") theo đúng thứ tự từng hàng.
 *
 * LƯU Ý: không được đọc riêng danh sách nội dung (bỏ qua dòng rỗng) rồi ghép
 * với danh sách cờ "Đúng" (giữ cả dòng rỗng) — khi có dòng rỗng, chỉ số của
 * cờ "Đúng" sẽ lệch so với nội dung.
 *
 * @param {HTMLElement} form - form cấu hình
 * @param {string} listField - data-list-field của danh sách
 * @param {string} [checkField] - data-field của checkbox (bỏ trống nếu không có)
 * @returns {Array<{text: string, checked: boolean}>} theo thứ tự hàng
 */
function getRowEntries(form, listField, checkField) {
    var list = form.querySelector('.row-list[data-list-field="' + listField + '"]');
    if (!list) return [];
    var rows = list.querySelectorAll('.row-item');
    var out = [];
    Array.prototype.forEach.call(rows, function (row) {
        var input = row.querySelector('input[type="text"][data-field="' + listField + '"]');
        var chk = checkField
            ? row.querySelector('input[type="checkbox"][data-field="' + checkField + '"]')
            : null;
        out.push({
            text: input ? (input.value || '').trim() : '',
            checked: chk ? !!chk.checked : false
        });
    });
    return out;
}

function migrateBlockData(type, old) {
    var d = old || {};
    if (type === 'matching') {
        if (Array.isArray(d.pairs)) {
            d.pairs = d.pairs.map(function (p) {
                if (!p) return null;
                if (p.concept != null) return { id: p.id, concept: p.concept || '', explanations: Array.isArray(p.explanations) ? p.explanations.slice() : [] };
                if (p.left != null || p.right != null) return { id: p.id, concept: p.left || p.concept || '', explanations: p.right ? [p.right] : [] };
                return null;
            }).filter(Boolean);
        } else { d.pairs = []; }
        /* Bản 2.6: answers chuẩn hoá thành danh sách mảng [idKháiNiệm, giảiThích]
           (định dạng cũ dạng object vẫn được đọc và tự chuyển đổi). */
        d.answers = matchingNormalizeLinks(d.answers);
        return d;
    }
    if (type === 'cloze') {
        if (Array.isArray(d.blanks)) {
            d.blanks = d.blanks.map(function (b) {
                if (!b) return null;
                var arr = Array.isArray(b.answers) ? b.answers.slice() : (b.answer ? [b.answer] : []);
                return { id: b.id, answers: arr, user: b.user || '' };
            }).filter(Boolean);
        } else { d.blanks = []; }
        return d;
    }
    if (type === 'dropdown') {
        if (Array.isArray(d.blanks)) {
            d.blanks = d.blanks.map(function (b) {
                if (!b) return null;
                if (Array.isArray(b.options) || b.correct != null) return b;
                if (b.answer != null) return { id: b.id, options: d.options || [], correct: String(b.answer) };
                return b;
            }).filter(Boolean);
        }
        return d;
    }
    if (type === 'hotspot') {
        if (Array.isArray(d.regions)) {
            d.regions = d.regions.map(function (r) {
                if (!r) return null;
                return {
                    id: r.id,
                    label: r.label || '',
                    x: Number(r.x) || 0,
                    y: Number(r.y) || 0,
                    w: Number(r.w) || 20,
                    h: Number(r.h) || 20,
                    shape: r.shape === 'circle' ? 'circle' : 'rectangle',
                    correct: !!r.correct
                };
            }).filter(Boolean);
        } else { d.regions = []; }
        d.matchThreshold = Number(d.matchThreshold) || 50;
        d.userRegions = Array.isArray(d.userRegions) ? d.userRegions : [];
        return d;
    }
    return d;
}
/* ===== COLLECT EDITOR DATA ===== */

function collectEditorData(block) {
    var d = block.data || {};
    var form = DOM.editorForm;
    if (!form) return d;
    var qEl = form.querySelector('[data-field="question"]');
    if (qEl) d.question = (qEl.value || '').trim();
    var sc = form.querySelector('[data-field="score"]');
    var tm = form.querySelector('[data-field="timeLimit"]');
    if (sc) d.score = Number(sc.value) || 1000;
    if (tm) d.timeLimit = Number(tm.value) || 0;
    var ne = form.querySelector('[data-field="noteEnabled"]');
    if (ne) d.noteEnabled = !!ne.checked;
    var nt = form.querySelector('[data-field="note"]');
    if (nt) d.note = nt.value || '';
    var iu = form.querySelector('[data-field="imageUrl"]');
    if (iu) d.imageUrl = iu.value || '';
    var iff = form.querySelector('[data-field="imageFit"]');
    if (iff) d.imageFit = iff.value || 'contain';
    var t = block.type;

    if (t === 'multiple-choice' || t === 'multi-answer') {
        var shuffleOptions = form.querySelector('[data-field="shuffleOptions"]');
        if (shuffleOptions) d.shuffleOptions = !!shuffleOptions.checked;
    }

    if (t === 'matching') {
        /* Bản 2.3 (M5): đọc trực tiếp từ editor nối ô trực quan.
           Nếu editor chưa được dựng (ví dụ gọi hàm ngoài modal) thì giữ nguyên dữ liệu cũ. */
        var matchArea = form.querySelector('.editor-match-2n');
        if (matchArea) {
            var oldPairs = Array.isArray(d.pairs) ? d.pairs : [];
            var byId = {};
            oldPairs.forEach(function (p) { byId[p.id] = p; });
            var newPairs = [];
            matchArea.querySelectorAll('.match-col-left .match-box').forEach(function (box) {
                var id = box.dataset.pair || null;
                var old = byId[id] || {};
                var input = box.querySelector('[data-field="matchConcept"]');
                var concept = input ? input.value.trim() : (old.concept || '');
                var exps = Array.isArray(old.explanations) ? old.explanations.slice() : [];
                newPairs.push({ id: id, concept: concept, explanations: exps });
            });
            d.pairs = newPairs;

            var newExps = [];
            matchArea.querySelectorAll('.match-col-right .match-box').forEach(function (box) {
                var input = box.querySelector('[data-field="matchExplanation"]');
                newExps.push(input ? input.value.trim() : (box.getAttribute('data-explanation') || ''));
            });
            d.explanationsAll = newExps;
        }
    } else if (t === 'cloze') {
        var questionContent = form.querySelector('[data-field="question"]');
        if (questionContent) {
            d.paragraph = (questionContent.value || '').trim();
            d.question = d.paragraph;
        }
        var answerList = form.querySelector('.row-list[data-list-field="blanks"]');
        var answerInputs = answerList
            ? answerList.querySelectorAll('input[type="text"][data-field="blanks"]')
            : [];
        d.blanks = Array.prototype.map.call(answerInputs, function (input) {
            var raw = input.value || '';
            var arr = raw.split(';').map(function (x) { return x.trim(); }).filter(Boolean);
            return { id: null, answers: arr, user: '' };
        });
        normalizeCloze(d);
    } else if (t === 'dropdown') {
        d.paragraph = d.question;
        /* Bản 2.3 (D2): đọc từng ô thả (danh sách lựa chọn + đáp án đúng riêng). */
        var ddList = form.querySelector('.dd-editor-list');
        if (ddList) {
            var newBlanks = [];
            ddList.querySelectorAll('.dd-editor-item').forEach(function (item) {
                var ta = item.querySelector('[data-field="ddOptions"]');
                var opts = ta ? splitEditorLines(ta.value) : [];
                var checked = item.querySelector('[data-field="ddCorrect"]:checked');
                var correct = checked ? (checked.dataset.value || '') : '';
                newBlanks.push({ id: item.dataset.blankId || null, options: opts, correct: correct });
            });
            d.blanks = newBlanks;
            d.answers = newBlanks.map(function (b) { return b.correct; });
        }
    } else if (t === 'hotspot') {
        var mt = form.querySelector('[data-field="matchThreshold"]');
        if (mt) d.matchThreshold = Number(mt.value) || 50;
        /* Bản 2.3 (H1–H4): đọc toạ độ/kích thước THẬT từ các ô đỏ trên ảnh. */
        var hsStage = form.querySelector('.editor-hotspot-stage');
        if (hsStage) {
            var oldRegions = Array.isArray(d.regions) ? d.regions : [];
            var newRegions = [];
            hsStage.querySelectorAll('.hs-region.is-draft').forEach(function (el, i) {
                var old = oldRegions[i] || {};
                var lbl = el.querySelector('[data-field="hsLabel"]');
                var chk = el.querySelector('[data-field="hsCorrect"]');
                newRegions.push({
                    id: old.id || null,
                    label: lbl ? lbl.value : (old.label || ''),
                    x: parseFloat(el.style.left) || 0,
                    y: parseFloat(el.style.top) || 0,
                    w: parseFloat(el.style.width) || 20,
                    h: parseFloat(el.style.height) || 20,
                    shape: el.classList.contains('is-circle') ? 'circle' : 'rectangle',
                    correct: chk ? !!chk.checked : (old.correct !== false)
                });
            });
            d.regions = newRegions;
        }
        if (!Array.isArray(d.userRegions)) d.userRegions = [];
    } else if (t === 'ordering') {
        d.items = getListValues(form, 'orderingItems');
    } else {
        // Trắc nghiệm: d.options là mảng { text, correct } (xem core/block-types.js).
        // Không được ghi đè bằng mảng chuỗi, nếu không sẽ mất cờ "đúng".
        var optEntries = getRowEntries(form, 'multipleChoice', 'optionCorrect')
            .filter(function (e) { return e.text !== ''; });
        d.options = optEntries.map(function (e) {
            return { text: e.text, correct: e.checked };
        });
    }
    block.data = migrateBlockData(t, d);
    return block.data;
}

/* ===== SETUP EDITOR EVENTS ===== */

function setupEditorEvents(form) {
    if (!form || form.dataset.events === '1') return;
    form.dataset.events = '1';
    form.addEventListener('click', function (e) {
        var t = e.target.closest('[data-action]');
        if (!t) return;
        var action = t.dataset.action;
        var row = t.closest('.row-item');
        if (action === 'add-row') { handleAddRow(form, t); }
        else if (row) {
            if (action === 'remove') handleRemoveRow(form, row);
            else if (action === 'up' || action === 'down') handleMoveRow(row, action);
        } else if (action === 'pick-image') {
            var inp = form.querySelector('[data-field="imageFile"]');
            if (inp) inp.click();
        } else if (action === 'clear-image') {
            clearEditorImage();
        }
    });
    form.addEventListener('change', function (e) {
        var t = e.target;
        if (t && t.dataset && t.dataset.field === 'imageFile') {
            handleEditorImageFile(t);
        }
    });
    form.addEventListener('input', function (e) {
        var t = e.target;
        if (t && t.dataset && t.dataset.field === 'imageUrl') {
            refreshImagePreview(form);
            refreshHotspotStageImage(form);
        }
    });
}

/**
 * Bản 2.3 (H1): cập nhật ảnh hiển thị trong editor hotspot khi người dùng đổi
 * URL ảnh của câu hỏi.
 *
 * @param {HTMLElement} scope - phần tử chứa form cấu hình
 */
function refreshHotspotStageImage(scope) {
    var root = scope || DOM.editorForm;
    if (!root) return;
    var input = root.querySelector('[data-field="imageUrl"]');
    var img = root.querySelector('.editor-hotspot-stage .hotspot-bg');
    if (!input || !img) return;
    var url = (input.value || '').trim();
    img.src = url;
    var empty = root.querySelector('.hotspot-editor-empty');
    if (empty) empty.hidden = !!url;
}

function handleAddRow(form, btn) {
    var list = btn.previousElementSibling;
    if (!list || !list.classList.contains('row-list')) return;
    var field = list.dataset.listField;
    var empty = list.querySelector('.row-empty');
    if (empty) empty.remove();
    var idx = list.children.length;
    // Dòng mới cũng phải có checkbox "Đúng" tương ứng với loại danh sách.
    var extra = '';
    if (field === 'multipleChoice') {
        extra = '<label class="check-label"><input type="checkbox" data-field="optionCorrect" data-index="' + idx + '">Đúng</label>';
    } else if (field === 'regions') {
        extra = '<label class="check-label"><input type="checkbox" data-field="regionCorrect" data-index="' + idx + '">Đúng</label>';
    }
    var row = configRow('', field, idx, extra);
    list.appendChild(row);
    renumberRows(list);
}

function handleRemoveRow(form, row) {
    var list = row.parentElement;
    row.remove();
    if (!list.children.length) {
        list.appendChild(htmlToElement('<div class="row-empty">Chưa có mục nào.</div>'));
    } else {
        renumberRows(list);
    }
}

function handleMoveRow(row, action) {
    var list = row.parentElement;
    var idx = Array.prototype.indexOf.call(list.children, row);
    var target = action === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.children.length) return;
    if (action === 'up') list.insertBefore(row, list.children[target]);
    else list.insertBefore(row, list.children[target].nextSibling);
    renumberRows(list);
}

function renumberRows(list) {
    var rows = list.querySelectorAll('.row-item');
    rows.forEach(function (r, i) {
        r.dataset.index = i;
        var span = r.querySelector('.row-index');
        if (span) span.textContent = i + 1;
    });
}

function renderEditorForm(block) {
    if (!DOM.editorForm) { console.warn('editorForm missing'); return; }
    DOM.editorForm.innerHTML = '';
    DOM.editorForm.appendChild(buildCommonForm(block));
    DOM.editorForm.appendChild(buildImageForm(block));
    var typeForm = buildTypeSpecificForm(block);
    if (typeForm) DOM.editorForm.appendChild(typeForm);
    // Listener được gắn bằng event delegation TRÊN #editor-form-container,
    // nên nó sống sót qua việc thay innerHTML ở trên => không cần gắn lại.
    // (Cờ dataset.events trong setupEditorEvents() chính là để tránh gắn trùng.)
    setupEditorEvents(DOM.editorForm);
}
