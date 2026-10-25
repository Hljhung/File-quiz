/* ============================================================================
 *  MODULE: js/core/state.js — TRẠNG THÁI TOÀN CỤC CỦA ỨNG DỤNG
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - Giữ tham chiếu DOM dùng chung (đối tượng DOM).
 *    - Giữ trạng thái: currentScale, blocks[], editingBlock, bộ đếm id.
 *  Ghi chú cho AI:
 *    - Đây là "nguồn sự thật" duy nhất cho workspace. blocks[] luôn được sắp
 *      xếp theo thứ tự đọc từ trên xuống => chính là thứ tự câu hỏi khi chơi.
 *    - HAI lớp DOM của workspace (quan trọng):
 *        #workspace-canvas  = khung cuộn (kích thước = base x currentScale)
 *        #canvas-content    = lớp chứa khối, bị transform: scale()
 *      Nhờ tách 2 lớp, thanh cuộn luôn bao phủ toàn bộ nội dung khi zoom.
 *    - Không khai báo lại các biến này ở module khác.
 * ========================================================================== */


/* ------------------------------------------------------------
 *  2. TRẠNG THÁI ỨNG DỤNG
 * ------------------------------------------------------------ */

/** Tham chiếu tới các phần tử DOM quan trọng */
const DOM = {
    blockList:    document.getElementById('block-list'),
    workspace:    document.getElementById('workspace-pane'),
    canvas:       document.getElementById('workspace-canvas'),
    content:      document.getElementById('canvas-content'),
    stage:        document.getElementById('stage-area'),
    properties:   document.querySelector('#properties-area .sprite-info'),
    playerView:   document.getElementById('player-view'),
    playerBox:    document.getElementById('quiz-player-container'),
    startBtn:     document.getElementById('start-btn'),
    stopBtn:      document.getElementById('stop-btn'),
    backBtn:      document.getElementById('back-btn'),
    resultBtn:    document.getElementById('result-btn'),
    editorOverlay: document.getElementById('block-editor-overlay'),
    editorModal:  document.getElementById('block-editor-modal'),
    editorTabs:   document.getElementById('editor-tabs') || document.querySelector('.editor-tabs'),
    editorForm:   document.getElementById('editor-form-container'),
    editorCode:   document.getElementById('editor-code-container'),
    editorTitle:  document.getElementById('editor-title'),
    editorSave:   document.getElementById('editor-save-btn'),
    editorCancel: document.getElementById('editor-cancel-btn'),
    editorClose:  document.getElementById('editor-close-btn'),
    editorBadge:  document.getElementById('editor-tab-count')
                || document.getElementById('editor-badge')
                || document.querySelector('.editor-tab-count'),
    projectTitle: document.querySelector('.project-title')
};

/** Kích thước GỐC của canvas (chưa nhân mức zoom) */
const CANVAS_BASE_WIDTH = 2000;
const CANVAS_BASE_HEIGHT = 3000;


/** Tỉ lệ zoom hiện tại của vùng làm việc (bản 2.3: dùng var để cross-module) */
var currentScale = 1;

/** Danh sách khối đang có trong workspace, sắp xếp theo thứ tự từ trên xuống */
var blocks = [];

/** Khối đang được chỉnh sửa trong bảng cấu hình (cũng là global để test e2e truy cập) */
var editingBlock = null;

/** Tab đang mở của bảng cấu hình: 'config' (Cấu hình) hoặc 'code' (Lập trình) */
var editorTab = 'config';

/** Bộ đếm id tăng dần cho mỗi khối mới */
var blockIdCounter = 0;

/**
 * Sinh mã định danh duy nhất cho một khối.
 * @returns {string} chuỗi id duy nhất
 */
function nextBlockId() {
    blockIdCounter += 1;
    return 'block-' + blockIdCounter;
}

/**
 * Gom tất cả các biến trạng thái mutable vào một đối tượng `state`.
 * Trước bản 2.3 chỉ có `editingBlock` (đứng riêng). Giờ thêm `editorTab`.
 * Mọi nơi có thể dùng cả hai cách: `editingBlock` hoặc `state.editingBlock`.
 */
const state = {
    get currentScale() { return currentScale; },
    set currentScale(v) { currentScale = v; },
    get blocks() { return blocks; },
    set blocks(v) { blocks = v; },
    get editingBlock() { return editingBlock; },
    set editingBlock(v) { editingBlock = v; },
    get editorTab() { return editorTab; },
    set editorTab(v) { editorTab = v; }
};


