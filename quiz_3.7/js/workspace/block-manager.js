/* ============================================================================
 *  MODULE: js/workspace/block-manager.js — TẠO / KÉO / XOÁ KHỐI CÂU HỎI
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - createBlock()            : tạo dữ liệu + DOM cho một khối câu hỏi.
 *    - attachBlockInteractions(): kéo thả, xem trước bằng nhấn 2 lần, cấu hình bằng nhấn 3 lần hoặc bánh răng ⚙️.
 *    - removeBlock()            : xoá khối khỏi workspace.
 *    - sortBlocksByPosition()   : sắp xếp theo thứ tự đọc (trên -> dưới).
 *  Ghi chú cho AI:
 *    - Khối được gắn vào #canvas-content (lớp bị scale), KHÔNG phải
 *      #workspace-canvas (khung cuộn). Nhờ vậy block.x/block.y luôn là toạ độ
 *      "tự nhiên" và không phụ thuộc mức zoom.
 *    - Ngưỡng phân biệt click / drag là 4px: nhấn giữ rồi rê < 4px vẫn tính là
 *      click (giúp triple click không bị "ăn" bởi thao tác kéo rất nhỏ).
 *    - Double-click chỉ mở bản xem trước tại sân khấu; bộ đếm nhấn 3 lần vẫn
 *      độc lập để mở cấu hình, còn nút ⚙️ mở cấu hình ngay lập tức.
 * ========================================================================== */



/**
 * Tạo một khối câu hỏi mới trong vùng làm việc.
 * @param {string} type - loại khối (key của BLOCK_TYPES)
 * @param {number} x - toạ độ X trên canvas
 * @param {number} y - toạ độ Y trên canvas
 * @returns {Object} đối tượng khối vừa tạo
 */
function createBlock(type, x, y) {
    const meta = BLOCK_TYPES[type];
    if (!meta) return null;

    const block = {
        id: nextBlockId(),
        type: type,
        x: x,
        y: y,
        data: meta.create()
    };

    // Tạo phần tử DOM tương ứng
    const el = document.createElement('div');
    el.className = 'dropped-block';
    el.dataset.type = type;
    el.dataset.id = block.id;
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    block.el = el;

    // Gắn vào LỚP NỘI DUNG (bị scale), không phải khung cuộn
    DOM.content.appendChild(el);
    blocks.push(block);


    // Gắn cơ chế kéo-thả nội bộ và cơ chế nhấn 3 lần
    attachBlockInteractions(el, block);

    // Vẽ nội dung lên khối
    renderBlock(block);

    // Hiệu ứng xuất hiện (xoá class sau khi animation kết thúc để không "dính" hiệu ứng)
    el.classList.add('anim-pop');
    setTimeout(function () { el.classList.remove('anim-pop'); }, 500);

    expandCanvasIfNeeded(y);
    refreshStageAndProperties();

    return block;
}

/**
 * Gắn sự kiện kéo-thả nội bộ cho một khối trong workspace.
 * @param {HTMLElement} el - phần tử DOM của khối
 * @param {Object} block - dữ liệu khối
 */
function attachBlockInteractions(el, block) {
    let dragging = false;         // đang kéo hay không
    let moved = false;            // đã di chuyển trong lần nhấn này hay chưa
    let startX = 0, startY = 0;    // vị trí chuột lúc bắt đầu kéo
    let originX = 0, originY = 0; // vị trí (canvas) của khối lúc bắt đầu kéo
    let clickTimes = [];          // mốc thời gian của các lần nhấn liên tiếp
    const TRIPLE_CLICK_WINDOW = 800; // (ms) cửa sổ thời gian để tính "nhấn 3 lần"
    const DRAG_THRESHOLD = 4;        // (px) ngưỡng phân biệt click và kéo

    el.addEventListener('mousedown', (e) => {
        // Không kéo khi bấm vào các thành phần tương tác bên trong khối
        if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;

        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        originX = block.x;
        originY = block.y;

        el.classList.add('dragging');
        el.style.zIndex = '1000';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        e.preventDefault();
        e.stopPropagation();
    });

    function onMouseMove(e) {
        if (!dragging) return;

        const dx = (e.clientX - startX) / currentScale;
        const dy = (e.clientY - startY) / currentScale;

        // Chỉ coi là "đã kéo" khi dịch chuyển trên 4px, tránh xung đột với nhấn 3 lần
        if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        moved = true;

        block.x = originX + dx;
        block.y = originY + dy;

        el.style.left = block.x + 'px';
        el.style.top = block.y + 'px';

        expandCanvasIfNeeded(block.y);

        // Làm nổi vùng xoá khi rê chuột lên danh sách khối hoặc cột xem trước
        toggleDeleteZoneHighlight(isOverDeleteZone(e.clientX, e.clientY));
    }

    function onMouseUp(e) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (!dragging) return;
        dragging = false;

        el.classList.remove('dragging');
        el.style.zIndex = '5';
        toggleDeleteZoneHighlight(false);

        // Chỉ xoá khối khi người dùng thực sự đã kéo (tránh xoá nhầm khi chỉ bấm)
        if (moved && (isOverDeleteZone(e.clientX, e.clientY) || isOutsideWorkspace(e.clientX, e.clientY))) {
            removeBlock(block);
            return;
        }

        // Sắp xếp lại danh sách theo thứ tự từ trên xuống
        sortBlocksByPosition();
        refreshStageAndProperties();
    }

    /* ------------------------------------------------------------------------
     *  NHẬN BIẾT NHẤN 3 LẦN (TRIPLE CLICK)
     *  ------------------------------------------------------------------------
     *  Bản 2.0 sửa lỗi xung đột sự kiện:
     *    - Bộ đếm click lưu các mốc thời gian; 3 lần nhấn trong 800ms mở modal.
     *    - Double-click được xử lý riêng để xem trước, không xoá bộ đếm click.
     *    - Nút ⚙️ trên khối mở cấu hình ngay.
     * ---------------------------------------------------------------------- */
    el.addEventListener('click', function (e) {
        // Không xử lý nếu modal cấu hình đang mở (bản 2.3: tránh re-open)
        if (typeof editingBlock !== 'undefined' && editingBlock
            && DOM && DOM.editorOverlay && !DOM.editorOverlay.hidden) {
            return;
        }
        e.stopPropagation();

        // (a) Nút bánh răng: mở cấu hình ngay lập tức
        if (e.target.closest('[data-action="edit"]')) {
            clickTimes = [];
            openBlockEditor(block);
            return;
        }

        // (b) Vừa kéo khối xong => bỏ qua lần click phát sinh sau khi thả chuột
        if (moved) {
            moved = false;
            return;
        }

        // (c) Đếm số lần nhấn trong cửa sổ thời gian cho phép
        const now = Date.now();
        clickTimes = clickTimes.filter(function (t) {
            return now - t < TRIPLE_CLICK_WINDOW;
        });
        clickTimes.push(now);

        if (clickTimes.length >= 3) {
            clickTimes = [];
            openBlockEditor(block);
        }
    });

    el.addEventListener('dblclick', function (e) {
        if (e.target.closest('button, input, textarea, select, [data-action="edit"]')) return;
        if (typeof editingBlock !== 'undefined' && editingBlock
            && DOM && DOM.editorOverlay && !DOM.editorOverlay.hidden) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        renderStage(block);
    });
}


/**
 * Xóa một khối khỏi vùng làm việc.
 * @param {Object} block - khối cần xóa
 */
function removeBlock(block) {
    const index = blocks.indexOf(block);
    if (index !== -1) blocks.splice(index, 1);
    if (block.el) block.el.remove();
    refreshStageAndProperties();
}

/**
 * Sắp xếp lại mảng "blocks" theo thứ tự từ trên xuống (rồi từ trái sang phải).
 */
function sortBlocksByPosition() {
    blocks.sort(function (a, b) {
        if (Math.abs(a.y - b.y) > 10) return a.y - b.y;
        return a.x - b.x;
    });
}
