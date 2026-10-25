/* ============================================================================
 *  MODULE: js/ui/render.js — VẼ KHỐI, SÂN KHẤU, BẢNG THUỘC TÍNH
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - blockHeaderHtml/blockFooterHtml: phần đầu & chân của một khối.
 *    - renderBlock()  : vẽ toàn bộ nội dung một khối trong workspace.
 *    - renderStage()  : sân khấu xem trước câu hỏi đầu tiên hoặc khối đang chọn.
 *    - renderProperties()     : danh sách tất cả câu hỏi ở cột phải.
 *    - refreshStageAndProperties(): gọi lại cả 3 phần trên.
 *  Ghi chú cho AI:
 *    - renderBlock() GHI ĐÈ innerHTML của block.el. Vì vậy mọi nút bên trong
 *      khối (ví dụ nút ⚙️) phải xử lý bằng uỷ quyền sự kiện trong
 *      attachBlockInteractions() (js/workspace/block-manager.js).
 *    - Dấu 🧩 cho biết câu hỏi đã có chương trình khối lệnh.
 * ========================================================================== */

var stagePreviewBlockId = null;


/**
 * Tạo phần đầu khối (tên loại câu hỏi + biểu tượng).
 * @param {Object} block - khối cần vẽ
 * @returns {string} chuỗi HTML
 */
function blockHeaderHtml(block) {
    const meta = BLOCK_TYPES[block.type];
    const index = blocks.indexOf(block) + 1;

    // Dấu 🧩 cảnh báo khối đã được lập trình (có chương trình khối lệnh)
    const codeMark = QuizCoding.hasCodingProgram(block.data)
        ? '<span class="block-code-dot" title="Câu hỏi có chương trình khối lệnh">🧩</span>'
        : '';

    return '<div class="block-head">'
        + '<span>' + meta.icon + '</span>'
        + '<span>' + escapeHtml(meta.label) + '</span>'
        + codeMark
        + '<span class="block-badge">#' + index + '</span>'
        + '<button type="button" class="block-edit-btn" data-action="edit"'
        + ' title="Mở cấu hình & lập trình khối lệnh">⚙️</button>'
        + '</div>';
}


/**
 * Tạo phần chân khối (các nhãn thông tin: thời gian, điểm, ghi chú).
 * @param {Object} block - khối cần vẽ
 * @returns {string} chuỗi HTML
 */
function blockFooterHtml(block) {
    const d = block.data;
    let html = '<div class="block-meta">';

    if (d.timeLimit > 0) {
        html += '<span class="tag">⏱️ ' + d.timeLimit + ' giây</span>';
    }
    html += '<span class="tag">⭐ ' + d.score + ' điểm</span>';
    if (d.noteEnabled && d.note) {
        html += '<span class="tag">📝 Có ghi chú</span>';
    }
    // Bản 2.2: cho biết câu hỏi đã có ảnh
    if (d.imageUrl) {
        html += '<span class="tag">🖼️ Có ảnh</span>';
    }

    html += '</div>';
    return html;
}

/**
 * Vẽ lại toàn bộ nội dung hiển thị của một khối trong vùng làm việc.
 * @param {Object} block - khối cần vẽ
 */
function renderBlock(block) {
    const meta = BLOCK_TYPES[block.type];
    const d = block.data;
    let bodyHtml = '';

    // Sinh phần thân tuỳ theo từng loại câu hỏi
    switch (block.type) {

        case 'multiple-choice':
        case 'multi-answer': {
            bodyHtml = '<div class="block-body">'
                + '<div>' + (escapeHtml(d.question) || '<span class="line-empty">Chưa có nội dung câu hỏi</span>') + '</div>'
                + '<div class="chip-row">';
            d.options.forEach(function (opt, i) {
                bodyHtml += '<span class="chip' + (opt.correct ? ' is-correct' : '') + '">'
                    + String.fromCharCode(65 + i) + '. ' + escapeHtml(opt.text) + '</span>';
            });
            bodyHtml += '</div></div>';
            break;
        }

        case 'ordering': {
            bodyHtml = '<div class="block-body">'
                + '<div>' + (escapeHtml(d.question) || '<span class="line-empty">Chưa có nội dung câu hỏi</span>') + '</div>'
                + '<div class="chip-row">';
            (Array.isArray(d.items) ? d.items : []).forEach(function (item, i) {
                bodyHtml += '<span class="chip">' + (i + 1) + '. ' + escapeHtml(item) + '</span>';
            });
            bodyHtml += '</div></div>';
            break;
        }

        case 'matching': {
            bodyHtml = '<div class="block-body">'
                + '<div>' + (escapeHtml(d.question) || '<span class="line-empty">Chưa có nội dung câu hỏi</span>') + '</div>'
                + '<div class="chip-row">';
            (Array.isArray(d.pairs) ? d.pairs : []).forEach(function (pair) {
                /* Bản 2.3: ưu tiên schema mới (concept + explanations[]), fallback left/right. */
                const concept = (pair && (pair.concept || pair.left)) || '';
                const exps = (pair && Array.isArray(pair.explanations) && pair.explanations.length)
                    ? pair.explanations
                    : (pair && pair.right ? [pair.right] : []);
                bodyHtml += '<span class="chip">🔗 ' + escapeHtml(concept) + ' → '
                    + escapeHtml(exps.join(' | ')) + '</span>';
            });
            bodyHtml += '</div></div>';
            break;
        }

        case 'hotspot': {
            bodyHtml = '<div class="block-body">'
                + '<div>' + (escapeHtml(d.question) || '<span class="line-empty">Chưa có nội dung câu hỏi</span>') + '</div>'
                + '<div class="chip-row">';
            (Array.isArray(d.regions) ? d.regions : []).forEach(function (r) {
                bodyHtml += '<span class="chip' + (r.correct ? ' is-correct' : '') + '">🖼️ ' + escapeHtml(r.label || '') + '</span>';
            });
            bodyHtml += '</div></div>';
            break;
        }

        case 'cloze': {
            bodyHtml = '<div class="block-body">'
                + '<div>' + (escapeHtml(d.question) || '<span class="line-empty">Chưa có nội dung câu hỏi</span>') + '</div>'
                + '<div class="chip-row">';
            (Array.isArray(d.blanks) ? d.blanks : []).forEach(function (b, i) {
                const txt = (b && b.answer) ? b.answer
                    : (b && Array.isArray(b.answers) ? b.answers.join(' / ') : '');
                bodyHtml += '<span class="chip">' + (i + 1) + '. ' + escapeHtml(txt || '(trống)') + '</span>';
            });
            bodyHtml += '</div></div>';
            break;
        }

        case 'dropdown': {
            bodyHtml = '<div class="block-body">'
                + '<div>' + (escapeHtml(d.question) || '<span class="line-empty">Chưa có nội dung câu hỏi</span>') + '</div>'
                + '<div class="chip-row">';
            /* Bản 2.3: ưu tiên `blanks[].correct`, fallback về `answers` (project cũ). */
            const ddRows = (Array.isArray(d.blanks) && d.blanks.length)
                ? d.blanks.map(function (b) { return (b && b.correct) ? b.correct : ''; })
                : (Array.isArray(d.answers) ? d.answers : []);
            ddRows.forEach(function (a, i) {
                bodyHtml += '<span class="chip">' + (i + 1) + '. ' + escapeHtml(a || '(trống)') + '</span>';
            });
            bodyHtml += '</div></div>';
            break;
        }
    }

    block.el.innerHTML = blockHeaderHtml(block) + bodyHtml + blockFooterHtml(block);
    block.el.title = meta.label + ' — nhấn 3 lần chuột để cấu hình';
}

/**
 * Cập nhật sân khấu xem trước và bảng thuộc tính bên phải.
 * Sân khấu hiển thị khối đầu tiên; bảng thuộc tính liệt kê toàn bộ khối.
 */
function refreshStageAndProperties() {
    renderStage();
    renderProperties();
    if (typeof renderQuestionList === 'function') renderQuestionList();
}


/**
 * Vẽ sân khấu xem trước (khối câu hỏi đầu tiên trong thứ tự dọc).
 */
function renderStage(selectedBlock) {
    if (!DOM.stage) return;

    if (blocks.length === 0) {
        stagePreviewBlockId = null;
        DOM.stage.innerHTML = '<div class="stage-empty">'
            + '<span class="big">🎬</span>'
            + 'Chưa có câu hỏi nào.<br>Kéo một khối từ danh sách bên trái vào vùng làm việc.'
            + '</div>';
        return;
    }

    if (selectedBlock) stagePreviewBlockId = selectedBlock.id;
    let first = blocks.filter(function (block) {
        return block.id === stagePreviewBlockId;
    })[0];
    if (!first) {
        stagePreviewBlockId = null;
        first = blocks[0];
    }
    const meta = BLOCK_TYPES[first.type];
    const d = first.data;

    if (stagePreviewBlockId) {
        const index = blocks.indexOf(first);
        DOM.stage.innerHTML = '<div class="stage-player-preview">'
            + '<div class="stage-preview-label">🎮 Xem trước khi chơi · Câu ' + (index + 1) + '</div>'
            + '<div class="stage-player-viewport"><div class="stage-player-canvas"></div></div>'
            + '</div>';
        const canvas = DOM.stage.querySelector('.stage-player-canvas');
        if (canvas && typeof buildQuestionCard === 'function') {
            canvas.appendChild(buildQuestionCard(first, index));
            canvas.querySelectorAll('button, input, select, textarea').forEach(function (control) {
                control.disabled = true;
            });
            canvas.setAttribute('aria-hidden', 'true');
            fitStagePlayerPreview();
            requestAnimationFrame(fitStagePlayerPreview);
        }
        return;
    }

    let preview = '';
    if (d.question) {
        preview = '<div class="sp-text">' + escapeHtml(d.question) + '</div>';
    } else {
        preview = '<div class="sp-text sp-empty">Chưa có nội dung câu hỏi</div>';
    }

    // Tóm tắt số lượng đáp án theo từng loại
    let summary = '';
    if (first.type === 'multiple-choice' || first.type === 'multi-answer') {
        summary = d.options.length + ' đáp án';
    } else if (first.type === 'ordering') {
        summary = d.items.length + ' phần tử cần sắp xếp';
    } else if (first.type === 'matching') {
        summary = d.pairs.length + ' cặp nối ô';
    } else if (first.type === 'hotspot') {
        summary = d.regions.length + ' vùng trên ảnh';
    } else if (first.type === 'cloze') {
        summary = d.blanks.length + ' chỗ trống cần điền';
    } else if (first.type === 'dropdown') {
        summary = d.answers.length + ' chỗ trống, ' + d.options.length + ' lựa chọn';
    }

    DOM.stage.innerHTML = '<div class="stage-preview">'
        + '<div class="sp-type">' + meta.icon + ' ' + escapeHtml(meta.label) + '</div>'
        + preview
        + '<div class="chip-row"><span class="chip">' + escapeHtml(summary) + '</span></div>'
        + '</div>';
}

function fitStagePlayerPreview() {
    if (!DOM.stage) return;
    const viewport = DOM.stage.querySelector('.stage-player-viewport');
    const canvas = DOM.stage.querySelector('.stage-player-canvas');
    if (!viewport || !canvas) return;

    const baseWidth = 1180;
    const baseHeight = 700;
    const availableWidth = Math.max(0, viewport.clientWidth - 4);
    const availableHeight = Math.max(0, viewport.clientHeight - 4);
    const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
    canvas.style.transform = 'scale(' + Math.max(0.1, scale) + ')';
}

if (typeof window !== 'undefined') {
    window.addEventListener('resize', fitStagePlayerPreview);
}

/**
 * Vẽ bảng thuộc tính (danh sách tất cả khối theo thứ tự dọc).
 */
function renderProperties() {
    if (!DOM.properties) return;

    if (blocks.length === 0) {
        DOM.properties.innerHTML = '<div class="prop-empty">Chưa có khối nào trong vùng làm việc.</div>';
        return;
    }

    let html = '<div class="prop-title">Danh sách câu hỏi (' + blocks.length + ')</div>';

    blocks.forEach(function (block, i) {
        const meta = BLOCK_TYPES[block.type];
        html += '<div class="prop-block" data-block-id="' + block.id + '">'
            + '<b>Câu ' + (i + 1) + ':</b> ' + meta.icon + ' ' + escapeHtml(meta.label) + '<br>'
            + '<span style="color:#8b95a3">' + escapeHtml(block.data.question || 'Chưa có nội dung') + '</span><br>'
            + '<span style="color:#8b95a3">⏱️ ' + block.data.timeLimit + 's · ⭐ ' + block.data.score + ' điểm</span>'
            + '</div>';
    });

    DOM.properties.innerHTML = html;

    // Bấm vào một mục trong bảng thuộc tính => cuộn tới khối tương ứng
    DOM.properties.querySelectorAll('.prop-block').forEach(function (item) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', function () {
            const id = item.dataset.blockId;
            const target = blocks.find(function (b) { return b.id === id; });
            if (!target) return;

            // Đưa khối vào giữa vùng xem
            DOM.workspace.scrollTo({
                left: target.x * currentScale - DOM.workspace.clientWidth / 2,
                top: target.y * currentScale - 60,
                behavior: 'smooth'
            });

            // Nhấp nháy để dễ nhận biết
            target.el.classList.add('anim-pulse');
            setTimeout(function () { target.el.classList.remove('anim-pulse'); }, 1900);
        });
    });
}
