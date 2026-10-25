/* ============================================================================
 *  MODULE: js/workspace/geometry.js — TOẠ ĐỘ, ZOOM VÀ VÙNG XOÁ
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - Đổi toạ độ chuột (clientX/clientY) sang toạ độ "tự nhiên" của canvas.
 *    - Quản lý kích thước canvas khi zoom và bật/tắt hiệu ứng vùng xoá.
 *  Công thức cốt lõi (đã sửa lỗi ở bản 2.0):
 *      canvasX = (clientX - workspaceRect.left + scrollLeft) / currentScale
 *    Điều kiện để công thức đúng:
 *      - #canvas-content nằm tại (0,0) của #workspace-canvas;
 *      - #canvas-content dùng transform-origin: 0 0;
 *      - #workspace-canvas có kích thước = kích thước gốc x currentScale.
 *  Ghi chú cho AI: nếu thay đổi cấu trúc DOM của workspace, PHẢI cập nhật cả
 *  applyWorkspaceScale() và toCanvasCoords(), nếu không toạ độ thả khối sẽ lệch.
 * ========================================================================== */


/* ------------------------------------------------------------
 *  3. HỆ THỐNG KÉO - THẢ
 * ------------------------------------------------------------ */

/**
 * Chuyển toạ độ chuột (clientX/clientY) thành toạ độ tương đối trên canvas.
 * Có chia cho currentScale để giữ độ chính xác khi đang zoom.
 * @param {number} clientX - toạ độ X chuột trên màn hình
 * @param {number} clientY - toạ độ Y chuột trên màn hình
 * @returns {{x:number, y:number}} toạ độ trong hệ không gian của canvas
 */
function toCanvasCoords(clientX, clientY) {
    // Dùng rect của #canvas-content: rect này ĐÃ bao gồm cả scroll và transform
    // scale, nên chỉ cần chia cho currentScale là ra toạ độ "tự nhiên".
    const rect = DOM.content.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / currentScale,
        y: (clientY - rect.top) / currentScale
    };
}

/**
 * Chiều cao GỐC hiện tại của canvas (đơn vị chưa nhân zoom).
 * Được nới rộng dần khi người dùng kéo khối xuống gần đáy.
 */
let canvasBaseHeight = CANVAS_BASE_HEIGHT;

/**
 * Áp dụng mức zoom hiện tại (currentScale) lên workspace.
 *
 * Cơ chế 2 lớp (đây là điểm sửa lỗi quan trọng của bản 2.0):
 *   1) #canvas-content bị transform: scale() -> nội dung phóng to/thu nhỏ.
 *   2) #workspace-canvas được đặt width/height = kích thước gốc x scale
 *      -> thanh cuộn của #workspace-pane bao phủ đúng toàn bộ nội dung.
 * Trước đây chỉ scale mà không đổi kích thước khung cuộn, nên khi zoom > 1
 * người dùng không thể cuộn tới mép phải/dưới của canvas.
 */
function applyWorkspaceScale() {
    if (!DOM.content || !DOM.canvas) return;

    DOM.content.style.transform = 'scale(' + currentScale + ')';
    DOM.canvas.style.width = Math.round(CANVAS_BASE_WIDTH * currentScale) + 'px';
    DOM.canvas.style.height = Math.round(canvasBaseHeight * currentScale) + 'px';

    // Ghi mức zoom lên data-zoom (tiện cho việc kiểm thử tự động / DevTools)
    DOM.content.dataset.zoom = String(currentScale);
    DOM.workspace.dataset.zoom = String(currentScale);
}

/**
 * Tự động nới rộng chiều cao canvas khi khối được kéo xuống gần đáy.
 *
 * @param {number} y - toạ độ Y (đơn vị gốc, chưa nhân zoom) của khối
 */
function expandCanvasIfNeeded(y) {
    if (y > canvasBaseHeight - 500) {
        canvasBaseHeight += 2000;
        applyWorkspaceScale();
    }
}


/**
 * Kiểm tra một toạ độ chuột có nằm ngoài vùng làm việc hay không.
 * @param {number} clientX - toạ độ X chuột
 * @param {number} clientY - toạ độ Y chuột
 * @returns {boolean} true nếu nằm ngoài vùng làm việc
 */
function isOutsideWorkspace(clientX, clientY) {
    const rect = DOM.workspace.getBoundingClientRect();
    return clientX < rect.left || clientX > rect.right
        || clientY < rect.top || clientY > rect.bottom;
}

/**
 * Kiểm tra con trỏ chuột có đang ở trên vùng "xoá" hay không.
 * Vùng xoá gồm: danh sách khối (blockList) và cột xem trước (preview-pane).
 * @param {number} clientX - toạ độ X chuột
 * @param {number} clientY - toạ độ Y chuột
 * @returns {boolean} true nếu đang ở trên vùng xoá
 */
function isOverDeleteZone(clientX, clientY) {
    const listRect = DOM.blockList.getBoundingClientRect();
    const preview = document.getElementById('preview-pane');
    const previewRect = preview ? preview.getBoundingClientRect() : null;

    const inList = clientX >= listRect.left && clientX <= listRect.right
        && clientY >= listRect.top && clientY <= listRect.bottom;

    const inPreview = previewRect
        && clientX >= previewRect.left && clientX <= previewRect.right
        && clientY >= previewRect.top && clientY <= previewRect.bottom;

    return inList || !!inPreview;
}

/**
 * Bật/tắt hiệu ứng "vùng xoá" khi đang kéo khối.
 * @param {boolean} active - true để bật hiệu ứng
 */
function toggleDeleteZoneHighlight(active) {
    const preview = document.getElementById('preview-pane');
    DOM.blockList.style.background = active ? '#ffe9e9' : '';
    if (preview) preview.style.outline = active ? '3px dashed #ff5252' : '';
}

