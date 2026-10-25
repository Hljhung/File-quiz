/* ============================================================================
 *  MODULE: js/workspace/interactions.js — KÉO TỪ TOOLBOX, PAN & ZOOM
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - setupBlockListDrag() : kéo khối mẫu từ toolbox (HTML5 Drag & Drop).
 *    - setupWorkspaceDrop() : thả khối vào workspace, quy đổi toạ độ theo zoom.
 *    - setupPan()           : giữ chuột trái ở nền trống để di chuyển canvas.
 *    - setupZoom()          : Ctrl + lăn chuột, zoom đúng tâm con trỏ.
 *  Lỗi đã sửa ở bản 2.0:
 *    (1) PAN: trước đây chia delta cho currentScale khiến khi zoom > 1 thì
 *        canvas di chuyển chậm hơn chuột. scrollLeft/Top là pixel màn hình nên
 *        KHÔNG được chia cho scale.
 *    (2) ZOOM: trước đây tính lại toạ độ sau khi đã đổi scale nên điểm dưới
 *        con trỏ bị trôi. Nay tính toạ độ canvas TRƯỚC khi zoom, sau đó suy ra
 *        scrollLeft/Top mới để giữ nguyên điểm neo dưới con trỏ.
 *    (3) Khung cuộn được cập nhật kích thước qua applyWorkspaceScale() nên có
 *        thể cuộn tới toàn bộ nội dung ở mọi mức zoom.
 * ========================================================================== */


/* ------------------------------------------------------------
 *  4. KÉO TỪ DANH SÁCH, PAN & ZOOM
 * ------------------------------------------------------------ */

/**
 * Gắn sự kiện kéo thả (HTML5 Drag & Drop) cho các khối mẫu trong danh sách.
 */
function setupBlockListDrag() {
    const items = DOM.blockList.querySelectorAll('.block-item');

    items.forEach(function (item) {
        item.addEventListener('dragstart', function (e) {
            // Lưu loại khối đang kéo
            e.dataTransfer.setData('text/plain', item.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
            item.style.opacity = '0.5';
        });

        item.addEventListener('dragend', function () {
            item.style.opacity = '1';
        });
    });

    // Cho phép thả khối đang kéo (từ workspace) trở lại danh sách để xóa
    DOM.blockList.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'delete';
        DOM.blockList.style.background = '#ffe9e9';
    });

    DOM.blockList.addEventListener('dragleave', function () {
        DOM.blockList.style.background = '';
    });

    DOM.blockList.addEventListener('drop', function (e) {
        e.preventDefault();
        DOM.blockList.style.background = '';
    });
}

/**
 * Gắn sự kiện thả khối vào vùng làm việc.
 */
function setupWorkspaceDrop() {
    DOM.workspace.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    DOM.workspace.addEventListener('drop', function (e) {
        e.preventDefault();

        const type = e.dataTransfer.getData('text/plain');
        if (!type || !BLOCK_TYPES[type]) return;

        // Tính toạ độ thả chính xác theo hệ số zoom hiện tại
        const pos = toCanvasCoords(e.clientX, e.clientY);

        // Nếu không lấy được toạ độ (một số trình duyệt không cung cấp) => thả vào giữa vùng xem
        if (!isFinite(pos.x) || !isFinite(pos.y)) {
            pos.x = Math.max(0, (DOM.workspace.scrollLeft + DOM.workspace.clientWidth / 2) / currentScale - 100);
            pos.y = Math.max(0, (DOM.workspace.scrollTop + DOM.workspace.clientHeight / 2) / currentScale - 40);
        }

        // Lệch nhẹ vị trí khi thả nhiều khối liên tiếp để không bị chồng lên nhau
        const offset = (blocks.length % 5) * 28;
        pos.x += offset;
        pos.y += offset;

        createBlock(type, pos.x, pos.y);
    });
}

/**
 * Gắn cơ chế kéo (nhấn giữ chuột trái) để di chuyển toàn bộ vùng làm việc.
 */
function setupPan() {
    let isPanning = false;
    let startX = 0, startY = 0;
    let startScrollLeft = 0, startScrollTop = 0;

    DOM.workspace.addEventListener('mousedown', function (e) {
        // Chỉ pan khi bấm vào nền trống (không bấm vào khối)
        const onBackground = e.target === DOM.workspace
            || e.target === DOM.canvas
            || e.target === DOM.content;
        if (!onBackground) return;

        isPanning = true;
        startX = e.clientX;
        startY = e.clientY;
        startScrollLeft = DOM.workspace.scrollLeft;
        startScrollTop = DOM.workspace.scrollTop;

        DOM.workspace.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isPanning) return;

        // KHÔNG chia cho currentScale: scrollLeft/Top tính bằng pixel màn hình,
        // nên công thức đúng ở mọi mức zoom (đây là lỗi đã sửa ở bản 2.0).
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        DOM.workspace.scrollLeft = startScrollLeft - dx;
        DOM.workspace.scrollTop = startScrollTop - dy;
    });

    document.addEventListener('mouseup', function () {
        if (!isPanning) return;
        isPanning = false;
        DOM.workspace.style.cursor = '';
    });
}

/**
 * Gắn cơ chế phóng to / thu nhỏ bằng tổ hợp Ctrl + lăn chuột.
 *
 * Thuật toán giữ điểm neo (zoom-at-cursor) - đã sửa lỗi bản 1.0:
 *   1. Đổi con trỏ chuột sang toạ độ canvas TRƯỚC khi zoom:
 *        x = (clientX - wsRect.left + scrollLeft) / scaleCũ
 *   2. Cập nhật scale mới rồi áp dụng (applyWorkspaceScale).
 *   3. Chọn scrollLeft/Top sao cho điểm x vẫn nằm ngay dưới con trỏ:
 *        scrollLeft = x * scaleMới - (clientX - wsRect.left)
 */
function setupZoom() {
    DOM.workspace.addEventListener('wheel', function (e) {
        if (!e.ctrlKey) return;    // Chỉ zoom khi giữ Ctrl

        e.preventDefault();        // Tắt zoom mặc định của trình duyệt

        const contentRect = DOM.content.getBoundingClientRect();

        // (1) Toạ độ canvas dưới con trỏ, tính theo mức zoom HIỆN TẠI
        const canvasX = (e.clientX - contentRect.left) / currentScale;
        const canvasY = (e.clientY - contentRect.top) / currentScale;

        // (2) Cập nhật mức zoom (bước 0.1, giới hạn 0.4 .. 2)
        if (e.deltaY < 0) {
            currentScale = Math.min(currentScale + 0.1, 2);
        } else {
            currentScale = Math.max(currentScale - 0.1, 0.4);
        }
        currentScale = Math.round(currentScale * 10) / 10;   // tránh sai số 0.30000004
        applyWorkspaceScale();

        // (3) Giữ nguyên điểm neo dưới con trỏ.
        //     rect.left ban đầu KHÔNG đổi khi transform (origin 0 0), nên chỉ cần
        //     so vị trí mới của điểm neo với vị trí con trỏ là ra độ lệch scroll.
        const afterX = contentRect.left + canvasX * currentScale;
        const afterY = contentRect.top + canvasY * currentScale;

        DOM.workspace.scrollLeft += afterX - e.clientX;
        DOM.workspace.scrollTop += afterY - e.clientY;

        // Ghi lại mức zoom lên thuộc tính data-zoom để test/DevTools dễ kiểm tra
        DOM.content.dataset.zoom = String(currentScale);
        DOM.workspace.dataset.zoom = String(currentScale);
    }, { passive: false });
}


