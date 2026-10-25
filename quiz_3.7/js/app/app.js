/* ============================================================================
 *  MODULE: js/app/app.js — KHỞI TẠO, TAB, MENU & LƯU TRỮ DỰ ÁN
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - setupTopBarEvents(): nút cờ xanh (chạy quiz), nút dừng, nút quay lại,
 *      nút xem kết quả.
 *    - setupTabs(): đổi tab "Code" / "Câu hỏi" ở cột toolbox.
 *    - setupMenus(): menu File (mới/lưu/mở/xuất/nhập) và menu Setting.
 *    - Lưu trữ: localStorage + xuất/nhập JSON.
 *    - renderQuestionList(): danh sách câu hỏi ở tab "Câu hỏi".
 *    - init(): điểm khởi động DUY NHẤT của ứng dụng.
 *  Ghi chú cho AI:
 *    - Không dùng bundler: các file JS là classic script dùng chung phạm vi
 *      toàn cục, nạp theo đúng thứ tự khai báo trong index.html.
 *    - Dữ liệu lưu xuống localStorage/JSON có chứa data.program (khối lệnh).
 *      deserializeProject() sao chép nguyên vẹn mọi khoá của data, và
 *      QuizCoding.ensureProgram() sẽ nâng cấp dự án cũ khi mở bảng cấu hình.
 * ========================================================================== */


/* ------------------------------------------------------------
 *  8. KHỞI TẠO ỨNG DỤNG
 * ------------------------------------------------------------ */

/**
 * Gắn sự kiện cho các nút trên thanh điều hướng.
 */
function setupTopBarEvents() {
    // Nút bắt đầu: chuyển sang chế độ chơi (nếu đang chơi thì chơi lại từ đầu)
    DOM.startBtn.addEventListener('click', function () {
        if (DOM.playerView.style.display === 'flex') {
            startQuiz();
            return;
        }
        startQuiz();
    });

    // Nút dừng: quay lại trình xây dựng
    DOM.stopBtn.addEventListener('click', stopQuiz);

    // Nút quay lại builder trong màn hình chơi
    DOM.backBtn.addEventListener('click', stopQuiz);

    // Nút xem kết quả trong màn hình chơi
    if (DOM.resultBtn) {
        DOM.resultBtn.addEventListener('click', function () {
            const answered = playerResults.filter(function (r) { return r !== undefined; }).length;
            if (answered === 0) {
                showToast('⚠️ Bạn chưa trả lời câu nào. Hãy kiểm tra đáp án trước nhé!');
                return;
            }
            showResultScreen();
        });
    }
}

/**
 * Đưa vùng làm việc về vị trí giữa khi vừa tải trang.
 */
function centerWorkspace() {
    const targetScrollLeft = (DOM.canvas.offsetWidth - DOM.workspace.clientWidth) / 2;
    DOM.workspace.scrollLeft = Math.max(0, targetScrollLeft);
    DOM.workspace.scrollTop = 0;
}

/**
 * Hàm khởi tạo chính, chạy khi trang vừa tải xong.
 */
function init() {
    setupBlockListDrag();
    setupWorkspaceDrop();
    setupPan();
    setupZoom();
    setupTopBarEvents();
    setupTabs();
    setupMenus();

    // Gắn sự kiện cho modal cấu hình (bản 2.3): Lưu/Huỷ/Đóng + 2 tab.
    if (typeof initEditorModalHooks === 'function') {
        initEditorModalHooks();
    }

    // Đồng bộ kích thước khung cuộn với mức zoom hiện tại (bản 2.0)
    applyWorkspaceScale();

    // Gắn sự kiện nhập dự án từ tệp
    const importInput = document.getElementById('import-file-input');
    if (importInput) {
        importInput.addEventListener('change', function () {
            if (importInput.files && importInput.files[0]) {
                handleImportFile(importInput.files[0]);
            }
        });
    }

    // Vẽ sân khấu và bảng thuộc tính ban đầu
    refreshStageAndProperties();

    // Căn giữa vùng làm việc
    centerWorkspace();
}

/* ------------------------------------------------------------
 *  9. TAB, MENU FILE/SETTING & LƯU TRỮ DỰ ÁN
 * ------------------------------------------------------------ */

/** Tuỳ chọn của dự án */
const settings = {
    useTimer: true,       // Có dùng thanh thời gian đếm ngược hay không
    shuffle: false,       // Xáo trộn câu hỏi khi chơi
    instantScore: true,   // Hiện điểm ngay khi trả lời
    fx: true              // Bản 2.2: hiệu ứng nền (icon rơi) khi chơi
};

/** Khoá lưu trữ trong trình duyệt */
const STORAGE_KEY = 'scratch-quiz-builder-project';

/**
 * Gắn sự kiện cho các tab trong cột toolbox.
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('[data-panel]');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            const name = tab.dataset.tab;

            // Đánh dấu tab đang chọn
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');

            // Hiện panel tương ứng
            panels.forEach(function (p) {
                p.hidden = (p.dataset.panel !== name);
            });
        });
    });
}

/**
 * Gắn sự kiện cho menu File và menu Setting.
 */
function setupMenus() {
    const fileBtn = document.getElementById('file-menu-btn');
    const fileMenu = document.getElementById('file-menu');
    const setBtn = document.getElementById('setting-menu-btn');
    const setMenu = document.getElementById('setting-menu');

    // Mở/đóng menu khi bấm nút
    fileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const willOpen = fileMenu.hidden;
        fileMenu.hidden = !willOpen;
        setMenu.hidden = true;
    });

    setBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const willOpen = setMenu.hidden;
        setMenu.hidden = !willOpen;
        fileMenu.hidden = true;
    });

    // Bấm ra ngoài thì đóng tất cả menu
    document.addEventListener('click', function () {
        fileMenu.hidden = true;
        setMenu.hidden = true;
    });

    // Ngăn menu đóng khi bấm bên trong nó
    [fileMenu, setMenu].forEach(function (menu) {
        menu.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    // Các mục trong menu File
    fileMenu.addEventListener('click', function (e) {
        const item = e.target.closest('.menu-item');
        if (!item) return;
        handleFileAction(item.dataset.action);
    });

    // Các tuỳ chọn trong menu Setting
    const timerChk = document.getElementById('setting-timer');
    const shuffleChk = document.getElementById('setting-shuffle');
    const instantChk = document.getElementById('setting-instant-score');

    timerChk.addEventListener('change', function () {
        settings.useTimer = timerChk.checked;
    });
    shuffleChk.addEventListener('change', function () {
        settings.shuffle = shuffleChk.checked;
    });
    instantChk.addEventListener('change', function () {
        settings.instantScore = instantChk.checked;
    });

    // Bản 2.2: bật/tắt hiệu ứng nền (icon rơi) khi chơi
    const fxChk = document.getElementById('setting-fx');
    if (fxChk) {
        fxChk.addEventListener('change', function () {
            settings.fx = fxChk.checked;
            if (DOM.playerView.style.display === 'flex') {
                if (settings.fx) startFallingIcons();
                else stopFallingIcons();
            }
        });
    }
}

/**
 * Xử lý các thao tác trong menu File.
 * @param {string} action - hành động cần thực hiện
 */
function handleFileAction(action) {
    switch (action) {
        case 'new':    newProject(); break;
        case 'save':   saveProjectToStorage(); break;
        case 'load':   loadProjectFromStorage(); break;
        case 'export': exportProjectToFile(); break;
        case 'import': openImportDialog(); break;
    }
}

/**
 * Tạo dự án mới: xoá toàn bộ khối trong vùng làm việc.
 */
function newProject() {
    blocks.slice().forEach(function (b) { removeBlock(b); });
    DOM.projectTitle.value = 'Dự án Quiz của tôi';
    showToast('🆕 Đã tạo dự án mới.');
}

/**
 * Chuyển toàn bộ trạng thái dự án thành đối tượng JSON thuần.
 * @returns {Object} dữ liệu dự án
 */
function serializeProject() {
    return {
        title: DOM.projectTitle.value,
        settings: {
            useTimer: settings.useTimer,
            shuffle: settings.shuffle,
            instantScore: settings.instantScore,
            fx: settings.fx
        },
        blocks: blocks.map(function (b) {
            return {
                type: b.type,
                x: Math.round(b.x),
                y: Math.round(b.y),
                data: JSON.parse(JSON.stringify(b.data))
            };
        })
    };
}

/**
 * Khôi phục dự án từ dữ liệu JSON.
 * @param {Object} project - dữ liệu dự án
 */
function deserializeProject(project) {
    if (!project || !Array.isArray(project.blocks)) {
        showToast('❌ Tệp dự án không hợp lệ.');
        return;
    }

    // Xoá các khối cũ
    blocks.slice().forEach(function (b) { removeBlock(b); });

    if (project.title) DOM.projectTitle.value = project.title;

    if (project.settings) {
        settings.useTimer = project.settings.useTimer !== false;
        settings.shuffle = !!project.settings.shuffle;
        settings.instantScore = project.settings.instantScore !== false;
        settings.fx = project.settings.fx !== false;
        syncSettingsUI();
    }

    // Tạo lại từng khối (nâng cấp dữ liệu dự án cũ trước khi dựng)
    project.blocks.forEach(function (rawItem) {
        const item = migrateLegacyBlock(rawItem);      // 2.1: gộp multi-answer
        if (!BLOCK_TYPES[item.type]) return;
        const block = createBlock(item.type, item.x || 0, item.y || 0);
        if (block && item.data) {
            // Ghi đè dữ liệu mặc định bằng dữ liệu đã lưu
            Object.keys(item.data).forEach(function (key) {
                block.data[key] = item.data[key];
            });

            // Nâng cấp dự án cũ: bổ sung/chuẩn hoá chương trình khối lệnh
            QuizCoding.ensureProgram(block.data);
        }
    });

    sortBlocksByPosition();
    blocks.forEach(function (b) { renderBlock(b); });
    refreshStageAndProperties();
}
/**
 * Lưu dự án vào bộ nhớ của trình duyệt.
 */
function saveProjectToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject()));
        showToast('💾 Đã lưu dự án vào trình duyệt.');
    } catch (e) {
        /* Bản 2.2: ảnh nhúng (data URL) có thể làm đầy bộ nhớ trình duyệt */
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        showToast(isQuota
            ? '❌ Bộ nhớ trình duyệt đã đầy — có thể do ảnh nhúng quá lớn. Hãy dùng URL ảnh hoặc xuất JSON.'
            : '❌ Không lưu được dự án: ' + e.message);
    }
}

/**
 * Mở dự án đã lưu trong trình duyệt.
 */
function loadProjectFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        showToast('⚠️ Chưa có dự án nào được lưu trong trình duyệt.');
        return;
    }
    try {
        deserializeProject(JSON.parse(raw));
        showToast('📂 Đã mở dự án đã lưu.');
    } catch (e) {
        showToast('❌ Dữ liệu dự án bị lỗi: ' + e.message);
    }
}

/**
 * Xuất dự án ra tệp JSON để người dùng tải về.
 */
function exportProjectToFile() {
    const data = JSON.stringify(serializeProject(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = (DOM.projectTitle.value || 'quiz') + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('📤 Đã xuất tệp JSON.');
}

/**
 * Mở hộp thoại chọn tệp để nhập dự án.
 */
function openImportDialog() {
    const input = document.getElementById('import-file-input');
    input.value = '';
    input.click();
}

/**
 * Đọc tệp JSON do người dùng chọn và nạp vào trình xây dựng.
 * @param {File} file - tệp được chọn
 */
function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
        try {
            deserializeProject(JSON.parse(reader.result));
            showToast('📥 Đã nhập dự án từ tệp.');
        } catch (e) {
            showToast('❌ Không đọc được tệp: ' + e.message);
        }
    };
    reader.readAsText(file);
}

/**
 * Vẽ danh sách câu hỏi ở tab "Câu hỏi".
 */
function renderQuestionList() {
    const list = document.getElementById('question-list');
    if (!list) return;

    if (blocks.length === 0) {
        list.innerHTML = '<div class="question-list-empty">Chưa có câu hỏi nào trong dự án.</div>';
        return;
    }

    list.innerHTML = '';

    blocks.forEach(function (block, i) {
        const meta = BLOCK_TYPES[block.type];
        const item = htmlToElement(
            '<div class="question-item" data-block-id="' + block.id + '">'
            + '<div class="qi-title">' + (i + 1) + '. ' + escapeHtml(block.data.question || 'Chưa có nội dung') + '</div>'
            + '<div class="qi-meta">' + meta.icon + ' ' + escapeHtml(meta.label)
            + ' · ⏱️ ' + block.data.timeLimit + 's · ⭐ ' + block.data.score + 'đ</div>'
            + '</div>'
        );
        item.style.animationDelay = (i * 0.05) + 's';

        // Bấm vào mục => cuộn tới khối tương ứng trong vùng làm việc
        item.addEventListener('click', function () {
            DOM.workspace.scrollTo({
                left: block.x * currentScale - DOM.workspace.clientWidth / 2,
                top: block.y * currentScale - 60,
                behavior: 'smooth'
            });
            block.el.classList.add('anim-pulse');
            setTimeout(function () { block.el.classList.remove('anim-pulse'); }, 1900);
        });

        list.appendChild(item);
    });
}


/**
 * Đồng bộ giao diện với các tuỳ chọn trong menu Setting.
 */
function syncSettingsUI() {
    const timerChk = document.getElementById('setting-timer');
    const shuffleChk = document.getElementById('setting-shuffle');
    const instantChk = document.getElementById('setting-instant-score');
    const fxChk = document.getElementById('setting-fx');
    if (timerChk) timerChk.checked = settings.useTimer;
    if (shuffleChk) shuffleChk.checked = settings.shuffle;
    if (instantChk) instantChk.checked = settings.instantScore;
    if (fxChk) fxChk.checked = settings.fx !== false;
}

// Chạy khởi tạo khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

