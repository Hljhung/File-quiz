/* ============================================================================
 *  MODULE: js/player/player.js — CHẾ ĐỘ CHƠI & CHẤM ĐIỂM
 *  ---------------------------------------------------------------------------
 *  BẢN 2.2 — GIAO DIỆN CHƠI MỚI (theo ảnh mẫu):
 *    1. Nền TỐI NGẪU NHIÊN mỗi lượt + lớp icon silhouette RƠI từ trên xuống
 *       (pickQuizTheme / startFallingIcons / spawnFallingIcon).
 *    2. Câu hỏi IN ĐẬM MÀU TRẮNG, hiện TỪNG KÝ TỰ trong đúng 3 giây
 *       (animateQuestionText).
 *    3. Thanh thời gian 7 MÀU nền đen co dần từ phải sang trái, số điểm nằm
 *       giữa thanh (updateTimeBar / updateDynamicScore / freezeTimeBar).
 *    4. Câu hỏi CÓ ẢNH ⇒ chia 2 cột (nửa trái câu hỏi + lựa chọn, nửa phải
 *       khung ảnh); KHÔNG ảnh ⇒ căn giữa (class .has-image / .is-centered).
 *       Khung ảnh kéo–zoom–kéo lề được (buildQuestionImage).
 *    5. Ba loại câu hỏi có thiết kế riêng:
 *         - Trắc nghiệm 1 đáp án : nút pill pastel, BẤM LÀ NỘP LUÔN.
 *         - Trắc nghiệm nhiều đáp án : nút chữ nhật + checkbox, nộp xong làm MỜ ô sai.
 *         - Sắp xếp : kéo–thả sortable (hàng bị đi qua tự đẩy) + animation
 *                     BUBBLE SORT hiện đáp án đúng khi nộp sai.
 *    6. Nộp bài ⇒ bảng GHI CHÚ NỔI (kéo được, có nút thu gọn) hiện ra, sau
 *       3 giây mới hiện nút "Câu tiếp theo" (scheduleNextButton).
 *
 *  Vai trò các hàm chính:
 *    - startQuiz()            : khởi động ván chơi, hiện câu 1.
 *    - ensureRuntimeQuestion(): tạo runtime block (random hoá) theo từng câu.
 *    - showQuestion(i)        : hiển thị câu i + khởi động thanh thời gian.
 *    - startQuestionTimer / tickQuestionTimer / updateTimeBar : thanh thời gian.
 *    - applyQuestionResult()  : chốt thời gian, chấm điểm, ghi chú, nút chuyển câu.
 *    - showResultScreen()     : bảng tổng kết cuối ván.
 *
 *  Ghi chú cho AI:
 *    - playSources[] là danh sách khối GỐC (thứ tự chơi), playOrder[] là runtime
 *      block tương ứng (khởi tạo lười để biến "Điểm" đúng ngữ cảnh).
 *    - Mọi hàm dựng câu hỏi nhận "block" và chỉ đọc block.data => dùng chung
 *      cho cả khối gốc và khối runtime, không cần sửa gì.
 *    - Nút nộp (.submit-btn) KHÔNG tồn tại ở dạng trắc nghiệm 1 đáp án.
 *    - `settings.fx === false` sẽ tắt hiệu ứng icon rơi.
 * ========================================================================== */


/* ------------------------------------------------------------
 *  7. CHẾ ĐỘ CHƠI (PLAYER) & CHẤM ĐIỂM
 * ------------------------------------------------------------ */

/** Tổng điểm hiện tại trong chế độ chơi */
let playerScore = 0;

/** Danh sách kết quả từng câu để hiển thị ở bảng kết quả */
let playerResults = [];

/* ============================================================================
 *  TRẠNG THÁI CHẾ ĐỘ CHƠI (bản 2.1 — chơi từng câu như Quiz.com)
 * ========================================================================== */

/** Danh sách câu hỏi GỐC theo thứ tự chơi (có thể đã xáo trộn) */
let playSources = [];

/** Runtime block của từng câu — khởi tạo DẦN khi câu đó sắp xuất hiện */
let playOrder = [];

/** Chỉ số câu hỏi đang hiển thị (0-based) */
let currentIndex = 0;

/** Mã vòng lặp requestAnimationFrame của thanh thời gian */
let questionRafId = null;

/** Mốc thời gian bắt đầu tính giờ của câu hiện tại (performance.now) */
let questionStartTs = 0;

/** Giới hạn thời gian của câu hiện tại (giây); 0 = không giới hạn */
let questionLimit = 0;

/** Thời gian còn lại của câu hiện tại (giây, số thực để thanh chạy mượt) */
let remainingTime = 0;

/** Thời gian còn lại ĐÃ CHỐT tại lúc người chơi bấm "Nộp bài" (giây) */
let submittedTimeLeft = 0;

/** Đã nộp bài cho câu hiện tại chưa (chặn nộp hai lần) */
let questionSubmitted = false;

/** Bộ hẹn giờ chuyển sang câu kế tiếp */
let nextQuestionTimer = null;

/** Mốc thời gian cập nhật nhãn điểm động gần nhất (giới hạn 5 lần/giây) */
let lastScorePreviewTs = 0;

/* ============================================================================
 *  BẢN 2.2 — TRẠNG THÁI & HẰNG SỐ CHO GIAO DIỆN CHƠI MỚI
 * ========================================================================== */

/** Bảng màu nền tối, mỗi lượt chơi chọn ngẫu nhiên 1 màu (giống ảnh mẫu) */
const QUIZ_BG_PALETTE = [
    '#17494b',   // teal đậm (ảnh "1 đáp án")
    '#3d3a52',   // tím than (ảnh "nhiều đáp án")
    '#4a3a2e',   // nâu đậm (ảnh "sắp xếp")
    '#1d3557',   // xanh navy
    '#3a2b4d',   // tím mận
    '#14342b',   // xanh rêu
    '#3b2b2b'    // xám nâu
];

/** Bảng màu pastel cho nút lựa chọn (chọn ngẫu nhiên cho từng ô) */
const OPTION_PASTELS = [
    '#b9f6d5',   // mint
    '#cbe88a',   // vàng-xanh
    '#ffc98b',   // cam nhạt
    '#ff9a9a',   // hồng nhạt
    '#b8e2ff',   // xanh da trời nhạt
    '#e5c8ff'    // tím nhạt
];

/** Bộ icon silhouette rơi từ trên xuống (SVG, dùng currentColor để lấy màu mờ) */
const FALLING_ICON_SVGS = [
    // mảnh ghép (puzzle)
    '<svg viewBox="0 0 24 24"><path d="M10 3a2 2 0 0 1 4 0v1h4a2 2 0 0 1 2 2v4h1a2 2 0 0 1 0 4h-1v4a2 2 0 0 1-2 2h-4v-1a2 2 0 0 0-4 0v1H6a2 2 0 0 1-2-2v-4H3a2 2 0 0 1 0-4h1V6a2 2 0 0 1 2-2h4z"/></svg>',
    // ngôi sao 5 cánh
    '<svg viewBox="0 0 24 24"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
    // ngôi sao 4 cánh (sparkle)
    '<svg viewBox="0 0 24 24"><path d="M12 1l2.4 6.9L21 11l-6.6 3.1L12 21l-2.4-6.9L3 11l6.6-3.1z"/></svg>',
    // hình nón / tam giác
    '<svg viewBox="0 0 24 24"><path d="M12 2l8 19H4z"/></svg>',
    // bóng đèn
    '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2zm-2 19h4v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z"/></svg>',
    // đồng hồ
    '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.6l4 2.4-1 1.7-5-3V7z"/></svg>',
    // ô vuông có dấu tích (kiểu đáp án đúng)
    '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zm6.5 12.2l6-7.4-1.6-1.3-4.5 5.5-2-2-1.4 1.4z"/></svg>',
    // ô vuông có mũi tên xuống
    '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zm8 3.5l-4 4h2.5V15h3v-3.5H16z"/></svg>',
    // hình thoi
    '<svg viewBox="0 0 24 24"><path d="M12 2l10 10-10 10L2 12z"/></svg>',
    // bánh răng
    '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.4 4l1.4-1.2-1.3-3-1.8.4a7.6 7.6 0 0 0-1.4-1.4l.4-1.8-3-1.3L14 5.6a7.6 7.6 0 0 0-2 0L10.8 4l-3 1.3.4 1.8a7.6 7.6 0 0 0-1.4 1.4l-1.8-.4-1.3 3L5 12l-1.4 1.2 1.3 3 1.8-.4a7.6 7.6 0 0 0 1.4 1.4l-.4 1.8 3 1.3 1.2-1.4a7.6 7.6 0 0 0 2 0l1.2 1.4 3-1.3-.4-1.8a7.6 7.6 0 0 0 1.4-1.4l1.8.4 1.3-3z"/></svg>',
    // dấu cộng
    '<svg viewBox="0 0 24 24"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/></svg>',
    // dấu thăng
    '<svg viewBox="0 0 24 24"><path d="M8 3h2v4h4V3h2v4h4v2h-4v4h4v2h-4v4h-2v-4h-4v4H8v-4H4v-2h4V9H4V7h4zm2 6v4h4V9z"/></svg>',
    // bia ngắm
    '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>',
    // quyển sách
    '<svg viewBox="0 0 24 24"><path d="M4 3h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4zm16 0h-4v14h4z"/></svg>'
];

/** Màu nền tối của lượt chơi hiện tại */
let quizThemeBg = QUIZ_BG_PALETTE[0];

/** Bộ đếm sinh icon rơi */
let iconSpawnTimer = null;

/** Số icon đang rơi (giới hạn để không tụt FPS) */
let fallingIconCount = 0;

/** Phần tử danh sách đang chạy animation bubble sort (để huỷ khi thoát) */
let activeSortList = null;

/**
 * Chuyển sang chế độ chơi và dựng toàn bộ câu hỏi.
 */
function startQuiz() {
    if (blocks.length === 0) {
        showToast('⚠️ Chưa có câu hỏi nào để chơi. Hãy kéo khối vào vùng làm việc trước.');
        return;
    }

    // Sắp xếp theo thứ tự từ trên xuống trước khi chơi
    sortBlocksByPosition();

    playerScore = 0;
    playerResults = [];
    currentIndex = 0;
    playOrder = [];

    DOM.playerBox.innerHTML = '<div class="quiz-shell"></div>';
    const shell = DOM.playerBox.querySelector('.quiz-shell');

    // Thanh tiến trình: số câu hiện tại / tổng số câu + tổng điểm
    shell.appendChild(htmlToElement(
        '<div class="quiz-progress">'
        + '<div class="quiz-progress-top">'
        + '<span id="quiz-progress-text">Câu 1 / ' + blocks.length + '</span>'
        + '<span class="quiz-score" id="quiz-score">⭐ 0 điểm</span>'
        + '</div>'
        + '<div class="progress-track"><div class="progress-bar" id="quiz-progress-bar"></div></div>'
        + '</div>'
    ));

    /* BẢN 2.1 — chế độ chơi kiểu Quiz.com:
       chỉ có MỘT vùng chứa câu hỏi, mỗi lần hiển thị đúng một câu. */
    shell.appendChild(htmlToElement('<div id="quiz-card-host" class="quiz-card-host"></div>'));

    // Danh sách câu hỏi GỐC (tuỳ chọn xáo trộn theo Setting)
    playSources = settings.shuffle
        ? blocks.slice().sort(function () { return Math.random() - 0.5; })
        : blocks.slice();

    /* BẢN 2.2: nền tối ngẫu nhiên + lớp icon rơi + reset bảng ghi chú nổi */
    pickQuizTheme();
    hideNotePanel();
    startFallingIcons();

    // Hiển thị giao diện chơi
    DOM.playerView.style.display = 'flex';
    DOM.playerView.classList.add('anim-fade-up');
    setTimeout(function () { DOM.playerView.classList.remove('anim-fade-up'); }, 500);
    DOM.playerBox.scrollTop = 0;

    // Hiện câu hỏi đầu tiên (các câu sau hiện dần khi người chơi nộp bài)
    showQuestion(0);
}

/**
 * Tạo runtime block cho câu hỏi thứ i (khởi tạo LƯỜI - chỉ khi câu đó sắp hiện).
 *
 * Vì sao khởi tạo lười?
 *   Chương trình "khi bắt đầu câu hỏi" có thể dùng biến hệ thống "Điểm" (tổng
 *   điểm hiện có). Nếu chuẩn bị tất cả câu ngay từ đầu thì biến "Điểm" luôn = 0.
 *   Khởi tạo khi tới lượt giúp số liệu random và công thức luôn đúng ngữ cảnh.
 *
 * @param {number} i - chỉ số câu hỏi
 * @returns {Object|null} khối runtime
 */
function ensureRuntimeQuestion(i) {
    if (!playOrder[i] && playSources[i]) {
        const src = playSources[i];
        playOrder[i] = QuizCoding.prepareRuntimeBlock(src, {
            totalScore: playerScore,
            timeLeft: toSafeNumber(src.data.timeLimit)
        });
    }
    return playOrder[i] || null;
}

/**
 * Ép một giá trị sang số không âm an toàn (tránh NaN khi ô nhập để trống).
 * @param {*} value - giá trị cần ép
 * @returns {number} số đã ép, mặc định 0
 */
function toSafeNumber(value) {
    const n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
}

/**
 * Hiển thị câu hỏi thứ i và khởi động thanh thời gian.
 * @param {number} i - chỉ số câu hỏi (0-based)
 */
function showQuestion(i) {
    const total = playSources.length;

    // Hết câu => sang bảng kết quả
    if (i >= total) {
        showResultScreen();
        return;
    }

    clearNextQuestionTimer();
    stopQuestionTimer();
    cancelSortAnimation();     // huỷ animation bubble sort của câu trước (nếu có)
    hideNotePanel();

    currentIndex = i;
    questionSubmitted = false;

    const block = ensureRuntimeQuestion(i);
    if (!block) {
        showResultScreen();
        return;
    }

    const host = document.getElementById('quiz-card-host');
    if (!host) return;

    host.innerHTML = '';
    const card = buildQuestionCard(block, i);
    host.appendChild(card);
    card.classList.add('anim-slide');
    setTimeout(function () { card.classList.remove('anim-slide'); }, 500);

    updateProgress();
    startQuestionTimer(i);
}

/** Huỷ bộ hẹn giờ chuyển câu (dùng khi thoát/chơi lại để không nhảy câu sai). */
function clearNextQuestionTimer() {
    if (nextQuestionTimer) {
        clearTimeout(nextQuestionTimer);
        nextQuestionTimer = null;
    }
}

/* ============================================================================
 *  BẢN 2.2 — NỀN TỐI NGẪU NHIÊN + ICON RƠI (lấy cảm hứng từ ảnh mẫu)
 * ========================================================================== */

/**
 * Chọn màu nền tối ngẫu nhiên cho lượt chơi và ghi vào biến CSS `--quiz-bg`.
 * Mỗi lần bấm ⚑ sẽ ra một màu khác (teal / tím than / nâu / navy / ...).
 */
function pickQuizTheme() {
    quizThemeBg = QUIZ_BG_PALETTE[Math.floor(Math.random() * QUIZ_BG_PALETTE.length)];

    if (DOM.playerView) {
        DOM.playerView.style.setProperty('--quiz-bg', quizThemeBg);
        DOM.playerView.dataset.bg = quizThemeBg;
    }
}

/** Lấy (hoặc tạo) lớp chứa icon rơi trong màn hình chơi. */
function ensureFxLayer() {
    if (!DOM.playerView) return null;

    let layer = document.getElementById('quiz-fx');
    if (!layer) {
        layer = htmlToElement('<div id="quiz-fx" class="quiz-fx"></div>');
        DOM.playerView.appendChild(layer);
    }
    return layer;
}

/** Bắt đầu sinh icon rơi liên tục (tự dừng khi tab bị ẩn để tiết kiệm CPU). */
function startFallingIcons() {
    stopFallingIcons();

    // Có thể tắt hiệu ứng trong menu Setting
    if (typeof settings !== 'undefined' && settings && settings.fx === false) return;

    const layer = ensureFxLayer();
    if (!layer) return;

    // Tạo sẵn vài icon để màn hình không trống lúc mới vào
    for (let i = 0; i < 4; i++) spawnFallingIcon(layer);

    iconSpawnTimer = setInterval(function () {
        if (document.hidden) return;      // tab ẩn => tạm dừng sinh icon
        spawnFallingIcon(layer);
    }, 520);
}

/** Dừng sinh icon rơi và xoá hết icon đang có. */
function stopFallingIcons() {
    if (iconSpawnTimer) {
        clearInterval(iconSpawnTimer);
        iconSpawnTimer = null;
    }
    const layer = document.getElementById('quiz-fx');
    if (layer) layer.innerHTML = '';
    fallingIconCount = 0;
}

/**
 * Tạo một icon silhouette rơi từ trên xuống; chạm đáy thì tự xoá.
 * @param {HTMLElement} layer - lớp chứa icon
 */
function spawnFallingIcon(layer) {
    if (!layer || fallingIconCount >= 16) return;   // giới hạn để không tụt FPS

    const el = document.createElement('div');
    el.className = 'fx-icon';

    const size = 42 + Math.random() * 74;                  // 42 – 116 px
    el.style.left = (Math.random() * 96) + 'vw';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.animationDuration = (6 + Math.random() * 3.5).toFixed(2) + 's';
    el.style.setProperty('--fx-rot', (-30 + Math.random() * 60).toFixed(1) + 'deg');
    el.innerHTML = FALLING_ICON_SVGS[Math.floor(Math.random() * FALLING_ICON_SVGS.length)];

    el.addEventListener('animationend', function () {
        el.remove();
        fallingIconCount = Math.max(0, fallingIconCount - 1);
    });

    fallingIconCount += 1;
    layer.appendChild(el);
}

/* ============================================================================
 *  BẢN 2.2 — CÂU HỎI CHỮ TRẮNG ĐẬM, HIỆN TỪNG KÝ TỰ TRONG ĐÚNG 3 GIÂY
 * ========================================================================== */

/**
 * Chạy animation "từng ký tự xuất hiện" cho nội dung câu hỏi.
 * Tổng thời gian hiện chữ LUÔN ≈ 3 giây:
 *     bước = 3000 / sốKýTự   (tối thiểu 8ms để còn đọc được với câu rất dài)
 *
 * @param {HTMLElement} el - phần tử `.q-text`
 */
function animateQuestionText(el) {
    if (!el) return;

    const text = (el.dataset.raw !== undefined) ? el.dataset.raw : el.textContent;
    const chars = Array.from(text || '');
    if (chars.length === 0) return;

    const TOTAL_MS = 3000;
    const step = Math.max(8, TOTAL_MS / chars.length);

    el.textContent = '';
    const frag = document.createDocumentFragment();

    chars.forEach(function (ch, i) {
        const span = document.createElement('span');
        span.className = 'qch';
        span.textContent = (ch === ' ') ? '\u00A0' : ch;   // giữ khoảng trắng
        span.style.animationDelay = Math.round(i * step) + 'ms';
        frag.appendChild(span);
    });

    el.appendChild(frag);
    el.dataset.animMs = String(Math.round(chars.length * step));   // phục vụ kiểm thử
}

/* ============================================================================
 *  BẢN 2.2 — BẢNG GHI CHÚ NỔI (kéo được + nút thu gọn)
 * ========================================================================== */

/* ==========================================================================
 *  BẢN 2.3 — ANIMATION 3 GIÂY CHO CLOZE & DROPDOWN (C1 / D1)
 * --------------------------------------------------------------------------
 *  Đoạn văn và các ô (ô trống / ô thả) xuất hiện LẦN LƯỢT trong đúng 3 giây,
 *  giống cách câu hỏi hiện từng ký tự ở bản 2.2.
 *  Mỗi mảnh nhận `animation-delay` chia đều; mảnh cuối cùng kết thúc đúng tại
 *  mốc `duration` (3000 ms) => tổng thời gian luôn ~ 3 giây.
 * ========================================================================== */

/**
 * Chia đều `animation-delay` cho các mảnh con của `box` để chúng xuất hiện
 * lần lượt trong `duration` mili giây.
 *
 * @param {HTMLElement} box - vùng chứa các mảnh (đoạn văn)
 * @param {string} selector - selector của các phần tử cần animate
 * @param {number} duration - tổng thời gian (ms), mặc định 3000
 * @returns {number} tổng thời gian đã dùng (ms)
 */
function animateParagraphParts(box, selector, duration) {
    if (!box) return 0;
    const total = duration || 3000;
    const nodes = box.querySelectorAll(selector);
    const n = nodes.length;
    if (!n) return 0;

    const step = total / n;
    nodes.forEach(function (el, i) {
        let dur = Math.min(420, Math.max(140, step));
        let delay = i * step;
        /* Mảnh cuối cùng kết thúc ĐÚNG mốc `total` (3 giây) */
        if (i === n - 1) delay = Math.max(0, total - dur);
        if (delay + dur > total) dur = Math.max(60, total - delay);
        el.style.animationDelay = Math.round(delay) + 'ms';
        el.style.animationDuration = Math.round(dur) + 'ms';
    });

    /* Thuộc tính phục vụ kiểm thử tự động (tests/e2e-cdp.js) */
    box.dataset.animMs = String(total);
    box.dataset.animParts = String(n);
    return total;
}

/**
 * Bản 2.3 (C1) — câu hỏi điền đoạn văn: đoạn văn + ô trống hiện lần lượt trong 3s.
 *
 * @param {HTMLElement} textBox - phần tử `.cloze-text`
 * @param {number} duration - tổng thời gian (ms)
 * @returns {number} tổng thời gian đã dùng (ms)
 */
function animateClozeParagraph(textBox, duration) {
    return animateParagraphParts(textBox, '.cloze-ch, .cloze-blank-wrap', duration || 3000);
}

/**
 * Bản 2.3 (D1) — câu hỏi chọn từ danh sách: đoạn văn + ô thả hiện lần lượt trong 3s.
 *
 * @param {HTMLElement} textBox - phần tử `.dropdown-text`
 * @param {number} duration - tổng thời gian (ms)
 * @returns {number} tổng thời gian đã dùng (ms)
 */
function animateDropdownParagraph(textBox, duration) {
    return animateParagraphParts(textBox, '.dd-ch, .dd-chip-wrap', duration || 3000);
}

/** Khoá lưu vị trí bảng ghi chú giữa các phiên. */
const NOTE_POS_KEY = 'sqb-note-pos';

/**
 * Tạo (hoặc lấy) bảng ghi chú nổi.
 * Gồm: thanh tay cầm (kéo để di chuyển) + nút thu gọn + phần nội dung.
 * @returns {HTMLElement|null}
 */
function ensureNotePanel() {
    if (!DOM.playerView) return null;

    let panel = document.getElementById('quiz-note-float');
    if (panel) return panel;

    panel = htmlToElement(
        '<div id="quiz-note-float" class="quiz-note-float" hidden>'
        + '<div class="nf-handle" data-nf-handle title="Giữ và kéo để di chuyển ghi chú">'
        +   '<span class="nf-grip">⠿</span>'
        +   '<span class="nf-title">📝 Ghi chú</span>'
        +   '<button type="button" class="nf-toggle" data-nf-toggle title="Thu gọn / mở ghi chú">–</button>'
        + '</div>'
        + '<div class="nf-body" data-nf-body></div>'
        + '</div>'
    );

    DOM.playerView.appendChild(panel);
    setupNotePanelDrag(panel);
    applyNotePanelPos(panel);

    /* Nút thu gọn / mở lại ghi chú (nằm trong thanh tay cầm) */
    const toggleBtn = panel.querySelector('[data-nf-toggle]');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleNotePanel();
        });
    }

    return panel;
}

/**
 * Hiện bảng ghi chú với nội dung cho trước (gọi sau khi người chơi nộp bài).
 * @param {string} text - nội dung ghi chú
 */
function showNotePanel(text) {
    if (!text) return;

    const panel = ensureNotePanel();
    if (!panel) return;

    panel.querySelector('[data-nf-body]').textContent = text;
    panel.hidden = false;
    panel.classList.remove('is-collapsed');
    updateNoteToggleIcon(panel);
}

/** Ẩn bảng ghi chú (khi chuyển câu / thoát chế độ chơi). */
function hideNotePanel() {
    const panel = document.getElementById('quiz-note-float');
    if (panel) panel.hidden = true;
}

/** Thu gọn hoặc mở lại phần nội dung ghi chú. */
function toggleNotePanel() {
    const panel = document.getElementById('quiz-note-float');
    if (!panel) return;

    panel.classList.toggle('is-collapsed');
    updateNoteToggleIcon(panel);
}

/**
 * Đổi biểu tượng nút thu gọn theo trạng thái.
 * @param {HTMLElement} panel - bảng ghi chú
 */
function updateNoteToggleIcon(panel) {
    const btn = panel ? panel.querySelector('[data-nf-toggle]') : null;
    if (!btn) return;

    const collapsed = panel.classList.contains('is-collapsed');
    btn.textContent = collapsed ? '+' : '–';
    btn.title = collapsed ? 'Mở ghi chú' : 'Thu gọn ghi chú';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

/**
 * Cho phép kéo bảng ghi chú bằng thanh tay cầm; lưu vị trí vào localStorage.
 * @param {HTMLElement} panel - bảng ghi chú
 */
function setupNotePanelDrag(panel) {
    const handle = panel.querySelector('[data-nf-handle]');
    if (!handle) return;

    let dragging = false;
    let startX = 0, startY = 0, originLeft = 0, originTop = 0;

    handle.addEventListener('pointerdown', function (e) {
        if (e.target.closest('[data-nf-toggle]')) return;   // bấm nút thu gọn thì không kéo

        const rect = panel.getBoundingClientRect();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        originLeft = rect.left;
        originTop = rect.top;

        panel.classList.add('is-dragging');
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    handle.addEventListener('pointermove', function (e) {
        if (!dragging) return;

        const maxLeft = Math.max(4, window.innerWidth - panel.offsetWidth - 4);
        const maxTop = Math.max(4, window.innerHeight - panel.offsetHeight - 4);

        const left = Math.min(maxLeft, Math.max(4, originLeft + (e.clientX - startX)));
        const top = Math.min(maxTop, Math.max(4, originTop + (e.clientY - startY)));

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('is-dragging');
        saveNotePanelPos(panel);
    }

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
}

/**
 * Lưu vị trí bảng ghi chú vào localStorage.
 * @param {HTMLElement} panel - bảng ghi chú
 */
function saveNotePanelPos(panel) {
    try {
        const rect = panel.getBoundingClientRect();
        localStorage.setItem(NOTE_POS_KEY, JSON.stringify({
            left: Math.round(rect.left),
            top: Math.round(rect.top)
        }));
    } catch (e) { /* trình duyệt chặn localStorage: bỏ qua */ }
}

/**
 * Khôi phục vị trí bảng ghi chú đã lưu (nếu có).
 * @param {HTMLElement} panel - bảng ghi chú
 */
function applyNotePanelPos(panel) {
    let pos = null;
    try {
        pos = JSON.parse(localStorage.getItem(NOTE_POS_KEY) || 'null');
    } catch (e) { pos = null; }

    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;

    panel.style.left = Math.min(pos.left, Math.max(4, window.innerWidth - 320)) + 'px';
    panel.style.top = Math.min(pos.top, Math.max(4, window.innerHeight - 120)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

/* ============================================================================
 *  BẢN 2.2 — NÚT CHUYỂN CÂU (xuất hiện sau khi nộp bài 3 giây)
 * ========================================================================== */

/**
 * Hẹn hiện nút "Câu tiếp theo" sau 3 giây kể từ lúc người chơi nộp bài.
 * Người chơi bấm nút mới chuyển sang câu kế tiếp (không tự động chuyển).
 *
 * @param {number} index - vị trí câu vừa nộp
 */
function scheduleNextButton(index) {
    clearNextQuestionTimer();

    const total = playSources.length || blocks.length;
    const isLast = (index + 1) >= total;

    nextQuestionTimer = setTimeout(function () {
        nextQuestionTimer = null;

        // Nếu người chơi đã thoát chế độ chơi thì bỏ qua
        if (DOM.playerView.style.display !== 'flex') return;

        const card = DOM.playerBox.querySelector('.question-card');
        if (!card) return;

        const host = card.querySelector('.q-main') || card;

        const btn = htmlToElement(
            '<button type="button" class="btn btn-primary next-btn">'
            + (isLast ? '🏁 Xem kết quả' : 'Câu tiếp theo →')
            + '</button>'
        );

        btn.addEventListener('click', function () {
            btn.disabled = true;
            hideNotePanel();
            if (isLast) showResultScreen();
            else showQuestion(index + 1);
        });

        host.appendChild(btn);
        btn.classList.add('anim-pop');
        setTimeout(function () { btn.classList.remove('anim-pop'); }, 500);
    }, 3000);
}

/**
 * Dừng chế độ chơi và quay lại trình xây dựng.
 */
function stopQuiz() {
    clearNextQuestionTimer();
    stopQuestionTimer();
    cancelSortAnimation();
    stopFallingIcons();
    hideNotePanel();
    DOM.playerView.style.display = 'none';
    DOM.playerBox.innerHTML = '';
}

/**
 * Tạo thẻ câu hỏi cho một khối.
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí của câu hỏi (bắt đầu từ 0)
 * @returns {HTMLElement} thẻ câu hỏi
 */
function buildQuestionCard(block, index) {
    const meta = BLOCK_TYPES[block.type];
    const d = block.data;

    /* Bản 2.2: câu hỏi có ảnh (trừ "chọn vùng trên ảnh") => chia 2 cột,
       nửa trái là câu hỏi + lựa chọn, nửa phải là khung ảnh.
       Không có ảnh => căn giữa toàn bộ nội dung. */
    const hasImage = !!d.imageUrl && block.type !== 'hotspot';
    const questionText = d.question || 'Chưa có nội dung câu hỏi';

    const card = htmlToElement(
        '<div class="question-card' + (hasImage ? ' has-image' : ' is-centered') + '"'
        + ' data-type="' + block.type + '" data-index="' + index + '">'
        + '<div class="q-head">'
        +   '<span class="q-number">Câu ' + (index + 1) + '</span>'
        +   '<span class="q-type">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>'
        + '</div>'
        /* THANH THỜI GIAN 7 MÀU: nền đen, dải màu co dần từ phải sang trái,
           số điểm nằm ngay giữa thanh (không hiển thị chữ số thời gian). */
        + '<div class="q-timebar" data-timebar>'
        +   '<div class="q-timebar-fill"></div>'
        +   '<div class="q-timebar-score"><b class="qts-value">0</b></div>'
        + '</div>'
        + '<div class="q-body">'
        +   '<div class="q-main">'
        +     '<div class="q-text" data-question-text data-raw="' + escapeHtml(questionText) + '">'
        +       escapeHtml(questionText)
        +     '</div>'
        +   '</div>'
        +   (hasImage ? '<div class="q-media" data-media></div>' : '')
        + '</div>'
        + '</div>'
    );

    const main = card.querySelector('.q-main');

    // Cảnh báo nếu chương trình khối lệnh gặp lỗi khi random hoá dữ liệu
    if (block.programError) {
        main.appendChild(htmlToElement(
            '<div class="q-note q-note-error">⚠️ Lỗi khối lệnh: ' + escapeHtml(block.programError) + '</div>'
        ));
    }

    // Phần trả lời tuỳ theo loại câu hỏi
    const body = buildAnswerArea(block, index);

    /* Mọi loại câu hỏi dùng chung nút "Nộp đáp án" — TRỪ trắc nghiệm 1 đáp án:
       loại đó nộp ngay khi người chơi bấm vào một lựa chọn (không có nút). */
    const submitBtn = body.querySelector('.btn.btn-primary');
    if (submitBtn) {
        submitBtn.textContent = 'Nộp đáp án';
        submitBtn.classList.add('submit-btn');
    }

    main.appendChild(body);

    // Khung ảnh tương tác (kéo / zoom / kéo lề) ở nửa phải
    if (hasImage) {
        const media = card.querySelector('[data-media]');
        if (media) media.appendChild(buildQuestionImage(d));
    }

    // Animation từng ký tự cho nội dung câu hỏi (tổng thời gian 3 giây)
    animateQuestionText(card.querySelector('[data-question-text]'));

    return card;
}

/* ============================================================================
 *  BẢN 2.2 — KHUNG ẢNH TƯƠNG TÁC (kéo ảnh / lăn chuột zoom / kéo lề đổi khung)
 * ========================================================================== */

/**
 * Ép một giá trị về số trong khoảng [min, max] (dùng cho khung nhìn ảnh).
 * @param {*} value - giá trị cần ép
 * @param {number} min - cận dưới
 * @param {number} max - cận trên
 * @returns {number} số đã ép
 */
function clampNumber(value, min, max) {
    const n = Number(value);
    if (!isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

/**
 * Dựng khung ảnh tương tác cho câu hỏi.
 * Người chơi có thể: kéo ảnh để di chuyển, lăn chuột để phóng to/thu nhỏ,
 * kéo 8 điểm ở viền để đổi kích thước khung, bấm 🔄 để đặt lại.
 *
 * @param {Object} d - block.data của câu hỏi
 * @returns {HTMLElement} khung ảnh
 */
function buildQuestionImage(d) {
    const base = clampNumber(d.imageScale || 100, 30, 100);

    // Trạng thái khung nhìn chỉ tồn tại trong phiên chơi (không ghi vào dữ liệu)
    const state = {
        frameW: base,
        frameH: base,
        zoom: 1,
        offX: clampNumber(d.imageOffsetX || 0, -150, 150),
        offY: clampNumber(d.imageOffsetY || 0, -150, 150)
    };

    const wrap = htmlToElement('<div class="q-media-inner"></div>');

    wrap.appendChild(htmlToElement(
        '<div class="q-media-toolbar">'
        + '<button type="button" class="media-btn" data-media-action="zoom-out" title="Thu nhỏ ảnh">🔍−</button>'
        + '<button type="button" class="media-btn" data-media-action="zoom-in" title="Phóng to ảnh">🔍+</button>'
        + '<button type="button" class="media-btn" data-media-action="reset" title="Đặt lại khung nhìn">🔄</button>'
        + '<span class="media-size" data-media-size></span>'
        + '</div>'
    ));

    const frame = htmlToElement('<div class="q-media-frame" data-media-frame></div>');

    /* Lớp xem ảnh: ảnh nằm trong lớp này để phần tràn ra (khi kéo/zoom) bị cắt,
       còn 8 điểm kéo lề nằm NGOÀI lớp này nên luôn hiển thị đầy đủ. */
    const viewport = htmlToElement('<div class="q-media-viewport"></div>');

    const img = document.createElement('img');
    img.className = 'q-media-img';
    img.alt = d.imageAlt || 'Ảnh của câu hỏi';
    img.src = d.imageUrl;
    img.draggable = false;
    img.style.objectFit = (d.imageFit === 'cover') ? 'cover' : 'contain';
    img.onerror = function () {
        viewport.innerHTML = '<div class="media-fallback">🖼️ Không tải được ảnh</div>';
    };
    viewport.appendChild(img);
    frame.appendChild(viewport);

    // 8 điểm kéo ở viền khung (kéo lề để phóng to / thu nhỏ khung ảnh)
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(function (dir) {
        frame.appendChild(htmlToElement('<span class="media-handle" data-dir="' + dir + '"></span>'));
    });

    /* Bọc khung ảnh trong một "sân khấu" có chiều cao xác định để phần trăm
       kích thước khung (do người chơi kéo lề) luôn tính đúng. */
    const stage = htmlToElement('<div class="q-media-stage"></div>');
    stage.appendChild(frame);
    wrap.appendChild(stage);

    applyMediaState(wrap, frame, img, state);
    setupMediaInteractions(wrap, frame, img, state, d);
    return wrap;
}

/**
 * Áp trạng thái khung nhìn lên DOM (kích thước khung + dịch/zoom ảnh).
 * @param {HTMLElement} wrap - khung bao
 * @param {HTMLElement} frame - khung ảnh
 * @param {HTMLImageElement} img - ảnh
 * @param {Object} state - trạng thái khung nhìn
 */
function applyMediaState(wrap, frame, img, state) {
    frame.style.width = state.frameW + '%';
    frame.style.height = state.frameH + '%';
    img.style.transform = 'translate(' + state.offX + '%, ' + state.offY + '%) scale(' + state.zoom + ')';

    const label = wrap.querySelector('[data-media-size]');
    if (label) {
        label.textContent = Math.round(state.frameW) + '% · ' + state.zoom.toFixed(1) + '×';
    }
}

/**
 * Gắn các thao tác tương tác cho khung ảnh.
 * @param {HTMLElement} wrap - khung bao
 * @param {HTMLElement} frame - khung ảnh
 * @param {HTMLImageElement} img - ảnh
 * @param {Object} state - trạng thái khung nhìn
 * @param {Object} d - dữ liệu câu hỏi (để nút 🔄 biết giá trị gốc)
 */
function setupMediaInteractions(wrap, frame, img, state, d) {
    /** Lấy khung chứa (để tính tỉ lệ kéo) tại thời điểm sự kiện. */
    function columnRect() {
        const col = wrap.closest('.q-media') || wrap;
        return col.getBoundingClientRect();
    }

    /* --- 1) KÉO ẢNH để di chuyển nội dung --- */
    let panning = false, startX = 0, startY = 0, baseX = 0, baseY = 0;

    frame.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.media-handle')) return;    // đang kéo lề khung
        panning = true;
        startX = e.clientX;
        startY = e.clientY;
        baseX = state.offX;
        baseY = state.offY;
        frame.classList.add('is-panning');
        try { frame.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
        e.preventDefault();
    });

    frame.addEventListener('pointermove', function (e) {
        if (!panning) return;
        const w = Math.max(1, frame.clientWidth);
        const h = Math.max(1, frame.clientHeight);
        state.offX = clampNumber(baseX + ((e.clientX - startX) / w) * 100, -150, 150);
        state.offY = clampNumber(baseY + ((e.clientY - startY) / h) * 100, -150, 150);
        applyMediaState(wrap, frame, img, state);
    });

    function endPan() {
        panning = false;
        frame.classList.remove('is-panning');
    }
    frame.addEventListener('pointerup', endPan);
    frame.addEventListener('pointercancel', endPan);

    /* --- 2) LĂN CHUỘT để phóng to / thu nhỏ ảnh --- */
    frame.addEventListener('wheel', function (e) {
        e.preventDefault();
        state.zoom = clampNumber(state.zoom + (e.deltaY < 0 ? 0.15 : -0.15), 0.5, 4);
        applyMediaState(wrap, frame, img, state);
    }, { passive: false });

    /* --- 3) KÉO LỀ (8 điểm viền) để đổi kích thước khung --- */
    let resizing = null;
    let rsX = 0, rsY = 0, rsW = 0, rsH = 0;

    frame.addEventListener('pointerdown', function (e) {
        const handle = e.target.closest('.media-handle');
        if (!handle) return;

        resizing = handle.dataset.dir;
        rsX = e.clientX;
        rsY = e.clientY;
        rsW = state.frameW;
        rsH = state.frameH;
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
        e.preventDefault();
        e.stopPropagation();
    });

    frame.addEventListener('pointermove', function (e) {
        if (!resizing) return;

        const box = columnRect();
        const dx = ((e.clientX - rsX) / Math.max(1, box.width)) * 100;
        const dy = ((e.clientY - rsY) / Math.max(1, box.height)) * 100;

        if (resizing.indexOf('e') !== -1) state.frameW = clampNumber(rsW + dx, 30, 100);
        if (resizing.indexOf('w') !== -1) state.frameW = clampNumber(rsW - dx, 30, 100);
        if (resizing.indexOf('s') !== -1) state.frameH = clampNumber(rsH + dy, 30, 100);
        if (resizing.indexOf('n') !== -1) state.frameH = clampNumber(rsH - dy, 30, 100);

        applyMediaState(wrap, frame, img, state);
    });

    function endResize() { resizing = null; }
    frame.addEventListener('pointerup', endResize);
    frame.addEventListener('pointercancel', endResize);

    /* --- 4) Nút trên thanh công cụ (zoom / đặt lại) --- */
    wrap.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-media-action]');
        if (!btn) return;

        const action = btn.dataset.mediaAction;

        if (action === 'zoom-in') {
            state.zoom = clampNumber(state.zoom + 0.25, 0.5, 4);
        } else if (action === 'zoom-out') {
            state.zoom = clampNumber(state.zoom - 0.25, 0.5, 4);
        } else if (action === 'reset') {
            const base = clampNumber(d.imageScale || 100, 30, 100);
            state.frameW = base;
            state.frameH = base;
            state.zoom = 1;
            state.offX = clampNumber(d.imageOffsetX || 0, -150, 150);
            state.offY = clampNumber(d.imageOffsetY || 0, -150, 150);
        }

        applyMediaState(wrap, frame, img, state);
    });
}


/**
 * Cập nhật thanh tiến trình: câu hiện tại / tổng số câu + tổng điểm.
 * (Bản 2.1 — chơi từng câu nên tiến trình = số câu đã trả lời xong.)
 */
function updateProgress() {
    const total = playSources.length || blocks.length;
    const text = document.getElementById('quiz-progress-text');
    const bar = document.getElementById('quiz-progress-bar');
    const score = document.getElementById('quiz-score');

    const done = currentIndex + (questionSubmitted ? 1 : 0);

    if (text) text.textContent = 'Câu ' + Math.min(currentIndex + 1, total) + ' / ' + total;
    if (bar) bar.style.width = Math.round((done / total) * 100) + '%';
    if (score) score.textContent = '⭐ ' + formatPoints(playerScore) + ' điểm';
}

/**
 * Dựng phần trả lời cho câu hỏi, tuỳ theo từng loại.
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @returns {HTMLElement} phần tử chứa giao diện trả lời
 */
function buildAnswerArea(block, index) {
    switch (block.type) {
        /* Bản 2.1: trắc nghiệm TỰ ĐỘNG nhận diện chọn 1 hay chọn nhiều theo số
           đáp án đúng đã cấu hình (isMultiAnswerQuestion). */
        case 'multiple-choice': return buildChoiceArea(block, index, isMultiAnswerQuestion(block.data));
        case 'multi-answer':    return buildChoiceArea(block, index, true);   // dữ liệu cũ
        case 'ordering':        return buildOrderingArea(block, index);
        case 'matching':        return buildMatchingArea(block, index);
        case 'hotspot':         return buildHotspotArea(block, index);
        case 'cloze':           return buildClozeArea(block, index);
        case 'dropdown':        return buildDropdownArea(block, index);
        default: return htmlToElement('<div></div>');
    }
}

/**
 * Giao diện trắc nghiệm (1 hoặc nhiều đáp án đúng).
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @param {boolean} multi - true nếu chọn được nhiều đáp án
 * @returns {HTMLElement} phần tử trả lời
 */
function buildChoiceArea(block, index, multi) {
    const d = block.data;
    const wrap = htmlToElement('<div class="option-list ' + (multi ? 'is-multi' : 'is-single') + '"></div>');
    const selected = [];

    // Màu pastel NGẪU NHIÊN cho từng lựa chọn (mỗi lần chơi lại ra màu khác)
    const colors = shufflePastels(d.options.length);

    const optionOrder = d.options.map(function (_, i) { return i; });
    if (d.shuffleOptions) {
        for (let i = optionOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = optionOrder[i];
            optionOrder[i] = optionOrder[j];
            optionOrder[j] = temp;
        }
    }

    optionOrder.forEach(function (optionIndex, displayIndex) {
        const opt = d.options[optionIndex];
        const btn = htmlToElement(
            '<button type="button" class="option-btn ' + (multi ? 'opt-rect' : 'opt-pill') + '"'
            + ' data-index="' + optionIndex + '" style="--opt-bg:' + colors[displayIndex] + '">'
            + (multi ? '<span class="option-check" aria-hidden="true"></span>' : '')
            + '<span class="option-num">' + (displayIndex + 1) + '</span>'
            + '<span class="option-text">' + escapeHtml(opt.text) + '</span>'
            + '</button>'
        );
        btn.style.animationDelay = (displayIndex * 0.09) + 's';
        btn.classList.add('opt-pop');          // hiệu ứng "bật ra" lần lượt từ trên xuống

        btn.addEventListener('click', function () {
            if (btn.disabled || wrap.dataset.locked === 'true') return;

            if (multi) {
                // Chọn nhiều: tích / bỏ tích rồi bấm "Nộp đáp án"
                const pos = selected.indexOf(optionIndex);
                if (pos !== -1) {
                    selected.splice(pos, 1);
                    btn.classList.remove('selected');
                } else {
                    selected.push(optionIndex);
                    btn.classList.add('selected');
                }
                return;
            }

            /* Chọn 1 đáp án: BẤM LÀ NỘP LUÔN (không có nút nộp riêng) */
            selected.length = 0;
            selected.push(optionIndex);
            wrap.querySelectorAll('.option-btn').forEach(function (b) { b.classList.remove('selected'); });
            btn.classList.add('selected');
            gradeChoice(wrap, block, index, false, selected, null);
        });

        wrap.appendChild(btn);
    });

    // Nút "Nộp đáp án" chỉ có ở dạng chọn nhiều
    if (multi) {
        const checkBtn = htmlToElement(
            '<button type="button" class="btn btn-primary submit-btn">Nộp đáp án</button>'
        );
        checkBtn.addEventListener('click', function () {
            if (selected.length === 0) {
                showToast('⚠️ Bạn chưa tích đáp án nào!');
                wrap.classList.add('anim-shake');
                setTimeout(function () { wrap.classList.remove('anim-shake'); }, 500);
                return;
            }
            gradeChoice(wrap, block, index, true, selected, checkBtn);
        });
        wrap.appendChild(checkBtn);
    }

    const container = htmlToElement('<div class="choice-area"></div>');
    container.appendChild(wrap);
    return container;
}

/**
 * Trộn ngẫu nhiên bảng màu pastel và lấy ra n màu.
 * @param {number} n - số màu cần
 * @returns {Array<string>} mảng mã màu
 */
function shufflePastels(n) {
    const pool = OPTION_PASTELS.slice().sort(function () { return Math.random() - 0.5; });
    const out = [];
    for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
    return out;
}

/**
 * Chấm điểm câu hỏi trắc nghiệm (dùng cho cả chọn 1 và chọn nhiều).
 * Chỉ đổi màu viền các lựa chọn khi phản hồi; nền và bố cục được giữ nguyên.
 *
 * @param {HTMLElement} wrap - danh sách lựa chọn
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @param {boolean} multi - có phải dạng chọn nhiều không
 * @param {Array<number>} selected - các chỉ số đã chọn
 * @param {HTMLElement|null} btn - nút nộp (null nếu nộp bằng cách bấm lựa chọn)
 */
function gradeChoice(wrap, block, index, multi, selected, btn) {
    if (wrap.dataset.locked === 'true') return;
    wrap.dataset.locked = 'true';

    const d = block.data;
    let isCorrect;

    if (multi) {
        const correctIdx = d.options
            .map(function (o, i) { return o.correct ? i : -1; })
            .filter(function (i) { return i !== -1; });
        isCorrect = selected.length === correctIdx.length
            && selected.every(function (i) { return correctIdx.indexOf(i) !== -1; });
    } else {
        isCorrect = !!d.options[selected[0]].correct;
    }

    // Đánh dấu đúng/sai bằng màu viền, không làm mờ hoặc đổi màu nền.
    wrap.querySelectorAll('.option-btn').forEach(function (b) {
        const i = parseInt(b.dataset.index, 10);
        const isChosen = selected.indexOf(i) !== -1;
        b.disabled = true;

        if (d.options[i].correct) {
            b.classList.add('is-correct');
        } else if (isChosen) b.classList.add('is-wrong');
    });

    applyQuestionResult(block, index, isCorrect, btn);
}


/**
 * Giao diện sắp xếp thứ tự (kéo thả để sắp xếp lại).
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @returns {HTMLElement} phần tử trả lời
 */
function buildOrderingArea(block, index) {
    const d = block.data;
    const list = htmlToElement('<div class="sort-list"></div>');

    // Các phần tử được xáo trộn ngẫu nhiên để người thi phải sắp xếp lại
    const shuffled = d.items.slice().sort(function () { return Math.random() - 0.5; });
    const colors = shufflePastels(shuffled.length);

    shuffled.forEach(function (text, i) {
        const item = htmlToElement(
            '<div class="sort-item opt-rect" data-index="' + i + '" style="--opt-bg:' + colors[i] + '">'
            + '<span class="sort-num">' + (i + 1) + '</span>'
            + '<span class="sort-text">' + escapeHtml(text) + '</span>'
            + '<span class="sort-handle" title="Giữ và kéo để đổi chỗ">=</span>'
            + '</div>'
        );
        item.style.animationDelay = (i * 0.09) + 's';
        item.classList.add('opt-pop');     // hiệu ứng "bật ra" lần lượt như trắc nghiệm
        list.appendChild(item);
    });

    setupSortableList(list);

    // Nút nộp đáp án
    const checkBtn = htmlToElement(
        '<button type="button" class="btn btn-primary submit-btn">Nộp đáp án</button>'
    );
    checkBtn.addEventListener('click', function () {
        if (list.dataset.locked === 'true') return;
        list.dataset.locked = 'true';
        checkBtn.disabled = true;

        const current = getSortTexts(list);
        const isCorrect = current.length === d.items.length
            && current.every(function (text, i) { return text === d.items[i]; });

        if (isCorrect) {
            list.querySelectorAll('.sort-item').forEach(function (item) {
                item.classList.add('is-correct');
                item.style.animationDelay = '0s';
            });
            applyQuestionResult(block, index, true, checkBtn);
            return;
        }

        /* Làm đỏ và lắc cả danh sách trước khi chạy Bubble Sort để hiện đáp án. */
        list.querySelectorAll('.sort-item').forEach(function (item) {
            item.classList.add('is-wrong');
            item.style.animationDelay = '0s';
        });

        checkBtn.textContent = '🔀 Đang hiện đáp án đúng…';
        setTimeout(function () {
            if (!list.isConnected) return;
            animateBubbleSort(list, d.items, function () {
                list.querySelectorAll('.sort-item').forEach(function (item) {
                    item.classList.remove('is-wrong');
                    item.classList.add('is-correct');
                });
                checkBtn.textContent = '❌ Chưa đúng';
                applyQuestionResult(block, index, false, checkBtn);
            });
        }, 450);
    });

    const container = htmlToElement('<div class="sort-area"></div>');
    container.appendChild(list);
    container.appendChild(checkBtn);
    return container;
}

/**
 * Lấy danh sách nội dung các hàng theo thứ tự hiện tại trên màn hình.
 * @param {HTMLElement} list - danh sách sắp xếp
 * @returns {Array<string>} mảng nội dung
 */
function getSortTexts(list) {
    return Array.prototype.map.call(
        list.querySelectorAll('.sort-item .sort-text'),
        function (el) { return el.textContent; }
    );
}

/**
 * Gắn cơ chế KÉO–THẢ ĐỔI CHỖ kiểu sortable cho danh sách sắp xếp (bản 2.2).
 *
 * Cách hoạt động (đúng như yêu cầu):
 *   - Giữ tay cầm "=" (hoặc giữ hàng) rồi kéo lên / xuống.
 *   - Hàng đang kéo đi theo con trỏ; các hàng bị đi qua TỰ ĐỘNG đẩy lên/xuống
 *     (dùng transform nên mượt, không giật).
 *   - Thả ra thì chốt thứ tự mới và đánh số lại.
 *
 * @param {HTMLElement} list - danh sách sắp xếp
 */
function setupSortableList(list) {
    let dragging = null;
    let placeholder = null;
    let pointerOffsetY = 0;
    let activePointerId = null;
    let animationFrame = 0;

    list.addEventListener('pointerdown', function (e) {
        if (list.dataset.locked === 'true') return;

        const item = e.target.closest('.sort-item');
        if (!item) return;

        const rect = item.getBoundingClientRect();
        dragging = item;
        pointerOffsetY = e.clientY - rect.top;
        activePointerId = e.pointerId;
        placeholder = document.createElement('div');
        placeholder.className = 'sort-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.height = rect.height + 'px';
        placeholder.style.width = rect.width + 'px';
        item.parentNode.insertBefore(placeholder, item);
        item.classList.add('is-dragging');
        item.style.left = rect.left + 'px';
        item.style.top = rect.top + 'px';
        item.style.width = rect.width + 'px';
        item.style.height = rect.height + 'px';
        item.style.animation = 'none';
        item.style.transform = 'none';
        document.body.appendChild(item);
        list.classList.add('is-sorting');
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', commitSort);
        document.addEventListener('pointercancel', commitSort);
        e.preventDefault();
    });

    function animateShift(beforeRects) {
        const rows = Array.prototype.slice.call(list.querySelectorAll('.sort-item:not(.is-dragging)'));
        rows.forEach(function (row) {
            const before = beforeRects.get(row);
            if (!before) return;
            const after = row.getBoundingClientRect();
            const dy = before.top - after.top;
            if (!dy) return;
            row.style.transition = 'none';
            row.style.transform = 'translateY(' + dy + 'px)';
        });
        list.getBoundingClientRect();
        const frame = ++animationFrame;
        requestAnimationFrame(function () {
            if (frame !== animationFrame) return;
            rows.forEach(function (row) {
                row.style.transition = '';
                row.style.transform = '';
            });
        });
    }

    function movePlaceholder(pointerY) {
        const siblings = Array.prototype.slice.call(
            list.querySelectorAll('.sort-item:not(.is-dragging)')
        );
        const next = siblings.find(function (row) {
            const rect = row.getBoundingClientRect();
            return pointerY < rect.top + rect.height / 2;
        }) || null;
        const alreadyPlaced = next
            ? placeholder.nextElementSibling === next
            : placeholder === list.lastElementChild;
        if (alreadyPlaced) return;

        const beforeRects = new Map();
        siblings.forEach(function (row) {
            beforeRects.set(row, row.getBoundingClientRect());
        });
        list.insertBefore(placeholder, next);
        animateShift(beforeRects);
    }

    function onPointerMove(e) {
        if (!dragging || e.pointerId !== activePointerId) return;
        dragging.style.top = (e.clientY - pointerOffsetY) + 'px';
        movePlaceholder(parseFloat(dragging.style.top) + dragging.offsetHeight / 2);
    }

    function commitSort() {
        if (!dragging || !placeholder) return;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', commitSort);
        document.removeEventListener('pointercancel', commitSort);
        const moved = dragging;
        const targetRect = placeholder.getBoundingClientRect();
        const dropTop = parseFloat(moved.style.top) || targetRect.top;
        const beforeRects = new Map();
        list.querySelectorAll('.sort-item:not(.is-dragging)').forEach(function (row) {
            beforeRects.set(row, row.getBoundingClientRect());
        });
        placeholder.replaceWith(moved);
        placeholder = null;
        dragging = null;
        activePointerId = null;
        moved.classList.remove('is-dragging');
        moved.style.left = '';
        moved.style.top = '';
        moved.style.width = '';
        moved.style.height = '';
        moved.style.zIndex = '';
        moved.style.animation = '';
        moved.style.transition = 'none';
        moved.style.transform = 'translateY(' + (dropTop - targetRect.top) + 'px)';
        renumberSortItems(list);
        animateShift(beforeRects);

        list.getBoundingClientRect();
        requestAnimationFrame(function () {
            moved.style.transition = '';
            moved.style.transform = '';
            setTimeout(function () {
                list.classList.remove('is-sorting');
            }, 240);
        });
    }

}

/**
 * Animation "SẮP XẾP NỔI BỌT" để chỉ ra đáp án đúng khi người chơi nộp sai.
 * Mỗi nhịp so sánh một cặp kề; nếu sai thứ tự thì hoán đổi có animation,
 * lặp lại cho tới khi danh sách đúng thứ tự.
 *
 * @param {HTMLElement} list - danh sách sắp xếp
 * @param {Array<string>} correctTexts - thứ tự đúng của các phần tử
 * @param {Function} [done] - gọi khi đã sắp xếp xong
 */
function animateBubbleSort(list, correctTexts, done) {
    activeSortList = list;
    list.dataset.cancelled = 'false';

    const maxSteps = correctTexts.length * correctTexts.length + 4;
    let steps = 0;

    function step() {
        if (list.dataset.cancelled === 'true' || !list.isConnected) return;

        const rows = Array.prototype.slice.call(list.querySelectorAll('.sort-item'));
        let swapped = false;

        for (let i = 0; i < rows.length - 1; i++) {
            const a = rows[i];
            const b = rows[i + 1];
            const ia = correctTexts.indexOf(a.querySelector('.sort-text').textContent);
            const ib = correctTexts.indexOf(b.querySelector('.sort-text').textContent);

            if (ia > ib) {
                swapSortRows(list, a, b);
                swapped = true;
                steps += 1;
                break;      // mỗi nhịp chỉ đổi một cặp cho dễ nhìn
            }
        }

        if (!swapped || steps > maxSteps) {
            activeSortList = null;
            if (done) done();
            return;
        }
        setTimeout(step, 620);
    }

    step();
}

/**
 * Hoán đổi hai hàng kề nhau với animation trượt (kỹ thuật FLIP).
 * @param {HTMLElement} list - danh sách sắp xếp
 * @param {HTMLElement} a - hàng trên
 * @param {HTMLElement} b - hàng dưới
 */
function swapSortRows(list, a, b) {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    const dy = rectB.top - rectA.top;

    a.classList.add('is-comparing');
    b.classList.add('is-comparing');

    list.insertBefore(b, a);      // đưa b lên trước a

    [[a, dy], [b, -dy]].forEach(function (pair) {
        const el = pair[0];
        const shift = pair[1];

        el.style.transition = 'none';
        el.style.transform = 'translateY(' + shift + 'px)';

        requestAnimationFrame(function () {
            el.style.transition = 'transform .45s cubic-bezier(.3,.9,.3,1.1)';
            el.style.transform = '';
        });
    });

    setTimeout(function () {
        a.classList.remove('is-comparing');
        b.classList.remove('is-comparing');
        a.style.transition = '';
        b.style.transition = '';
        renumberSortItems(list);
    }, 480);
}

/** Huỷ animation bubble sort đang chạy (khi chuyển câu hoặc thoát chế độ chơi). */
function cancelSortAnimation() {
    if (activeSortList) {
        activeSortList.dataset.cancelled = 'true';
        activeSortList = null;
    }
}

/**
 * Cập nhật lại số thứ tự hiển thị sau khi kéo thả / hoán đổi.
 * @param {HTMLElement} list - phần tử chứa danh sách
 */
function renumberSortItems(list) {
    list.querySelectorAll('.sort-item').forEach(function (item, i) {
        const num = item.querySelector('.sort-num');
        if (num) num.textContent = (i + 1);
    });
}

/**
 * Giao diện nối ô (matching): bấm một ô bên trái rồi bấm ô tương ứng bên phải.
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @returns {HTMLElement} phần tử trả lời
 */
function buildMatchingArea(block, index) {
    /* Bản 2.3: delegate sang UI mới (cúc tròn + SVG overlay, 1-n matching). */
    return buildMatchingAreaV2(block, index);
}

function buildMatchingAreaV2(block, index) {
    /* Bản 2.3: delegate sang UI mới (cúc tròn + SVG overlay, matching 1-n). */
    return buildMatchingAreaV3(block, index);
}

/**
 * Giao diện chọn vùng trên ảnh (hotspot).
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @returns {HTMLElement} phần tử trả lời
 */
function buildHotspotArea(block, index) {
    /* Bản 2.3: delegate sang UI mới (kéo-and-thả + overlap ratio). */
    return buildHotspotAreaV3(block, index);
}

function buildHotspotAreaV3(block, index) {
    const d = block.data;
    if (!Array.isArray(d.regions)) d.regions = [];
    if (!Array.isArray(d.userRegions)) d.userRegions = [];
    if (typeof d.imageUrl !== 'string') d.imageUrl = '';
    if (typeof d.matchThreshold !== 'number') d.matchThreshold = 50;

}
/**
 * Tách đoạn văn theo các ký hiệu {{1}}, {{2}} ...
 * @param {string} paragraph - đoạn văn gốc
 * @returns {Array} mảng các phần tử {type:'text'|'blank', value}
 */
function splitByBlanks(paragraph) {
    const parts = [];
    const regex = /\{\{(\d+)\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(paragraph)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', value: paragraph.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'blank', value: parseInt(match[1], 10) });
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < paragraph.length) {
        parts.push({ type: 'text', value: paragraph.slice(lastIndex) });
    }

    return parts;
}

/**
 * Giao diện điền từ vào đoạn văn (cloze).
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @returns {HTMLElement} phần tử trả lời
 */
function buildClozeArea(block, index) {
    /* Bản 2.3: delegate sang UI mới (multi-answer cloze + danh sách vàng).
     * UI cũ phía dưới được giữ lại để tham khảo nhưng không còn được gọi. */
    return buildClozeAreaV2(block, index);
}

function buildClozeAreaV2(block, index) {
    /* Bản 2.3: delegate sang UI mới (multi-answer + danh sách vàng). */
    return buildClozeAreaV3(block, index);
}

/**
 * Giao diện chọn từ trong danh sách (dropdown cloze).
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @returns {HTMLElement} phần tử trả lời
 */
function buildDropdownArea(block, index) {
    /* Bản 2.3: delegate sang UI mới (mỗi ô có options riêng + popup sau submit). */
    return buildDropdownAreaV3(block, index);
}

function buildDropdownAreaV3(block, index) {
    const d = block.data;
    /* Đảm bảo schema đã được normalize sang blanks[] */
    if (!Array.isArray(d.blanks)) d.blanks = [];
    if (!Array.isArray(d.options)) d.options = [];
    if (!Array.isArray(d.answers)) d.answers = [];
    /* Fallback cho project cũ: chưa normalize -> tự sinh blanks tại đây */
    if (d.blanks.length === 0 && d.options.length > 0 && d.answers.length > 0) {
        d.answers.forEach(function (a, i) {
            d.blanks.push({
                id: 'd' + (i + 1),
                options: d.options.slice(),
                correct: a
            });
        });
    }
    /* Body moved to end of file (see buildDropdownAreaV3 UI mới). */
}

/**
 * Bắt đầu THANH THỜI GIAN cho câu hỏi hiện tại (bản 2.1).
 *
 * Dùng requestAnimationFrame nên thanh chạy mượt ở ~60fps (không giật như
 * setInterval 1 giây), đồng thời giữ `remainingTime` là số thực chính xác để
 * truyền vào biến hệ thống "Thời gian" lúc người chơi nộp bài.
 *
 * @param {number} index - vị trí câu hỏi
 */
function startQuestionTimer(index) {
    stopQuestionTimer();

    const block = playOrder[index];
    const limit = (settings.useTimer && block) ? toSafeNumber(block.data.timeLimit) : 0;

    questionLimit = limit;
    questionStartTs = performance.now();
    remainingTime = limit;
    lastScorePreviewTs = 0;

    updateTimeBar(limit, 1);
    updateDynamicScore();

    // Không giới hạn thời gian (0 hoặc đã tắt đồng hồ) => thanh đầy, không đếm
    if (limit <= 0) return;

    questionRafId = requestAnimationFrame(tickQuestionTimer);
}

/**
 * Vòng lặp cập nhật thanh thời gian (chạy mỗi khung hình).
 */
function tickQuestionTimer() {
    if (questionSubmitted) return;

    const elapsed = (performance.now() - questionStartTs) / 1000;
    remainingTime = Math.max(0, questionLimit - elapsed);

    const ratio = questionLimit > 0 ? remainingTime / questionLimit : 1;
    updateTimeBar(remainingTime, ratio);

    // Nhãn điểm động: cập nhật tối đa 5 lần/giây để không tốn CPU vô ích
    const now = performance.now();
    if (now - lastScorePreviewTs >= 200) {
        lastScorePreviewTs = now;
        updateDynamicScore();
    }

    if (remainingTime <= 0) {
        onTimeUp();
        return;
    }

    questionRafId = requestAnimationFrame(tickQuestionTimer);
}

/**
 * Dừng thanh thời gian và trả về số giây còn lại.
 * @returns {number} thời gian còn lại (giây)
 */
function stopQuestionTimer() {
    if (questionRafId) {
        cancelAnimationFrame(questionRafId);
        questionRafId = null;
    }
    return remainingTime;
}

/**
 * Cập nhật thanh thời gian: độ dài phần còn lại + màu cảnh báo.
 *
 * LƯU Ý THIẾT KẾ: KHÔNG hiển thị chữ số thời gian (giống Quiz.com); số giây
 * được lưu ở thuộc tính data-seconds của thanh để phục vụ kiểm thử tự động.
 *
 * @param {number} seconds - số giây còn lại
 * @param {number} ratio - tỉ lệ còn lại (0..1)
 */
function updateTimeBar(seconds, ratio) {
    const bar = DOM.playerBox.querySelector('.q-timebar');
    if (!bar) return;

    const fill = bar.querySelector('.q-timebar-fill');
    if (fill) {
        fill.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(2) + '%';
    }

    bar.dataset.seconds = (Math.round(seconds * 10) / 10).toFixed(1);
    bar.classList.toggle('is-warning', ratio <= 0.5 && ratio > 0.2);
    bar.classList.toggle('is-danger', ratio <= 0.2);
}

/**
 * Tính và hiển thị ĐIỂM ĐỘNG trên thanh thời gian.
 *
 * Điểm này do chương trình khối lệnh "khi trả lời đúng" quyết định và có thể
 * phụ thuộc vào hai biến hệ thống:
 *    - "Thời gian": số giây còn lại (càng nhanh càng nhiều điểm)
 *    - "Điểm"     : tổng điểm người chơi đang có
 */
function updateDynamicScore() {
    if (questionSubmitted) return;

    const block = playOrder[currentIndex];
    const value = DOM.playerBox.querySelector('.qts-value');
    if (!block || !value) return;

    const points = QuizCoding.previewScore(block, {
        timeLeft: questionLimit > 0 ? remainingTime : 0,
        totalScore: playerScore
    });

    value.textContent = formatPoints(points);
    value.dataset.preview = String(points);
}

/**
 * Hết thời gian: tự động nộp bài (coi như trả lời sai nếu chưa chọn gì).
 */
function onTimeUp() {
    if (questionSubmitted) return;

    stopQuestionTimer();
    showToast('⏰ Đã hết thời gian cho câu hỏi này!');

    const card = DOM.playerBox.querySelector('.question-card');
    const btn = card ? card.querySelector('.submit-btn') : null;

    // Khoá mọi lựa chọn để người chơi không thể trả lời sau khi hết giờ
    if (card) {
        card.querySelectorAll('button, select, input').forEach(function (el) {
            el.disabled = true;
        });
    }

    applyQuestionResult(playOrder[currentIndex], currentIndex, false, btn);
}

/**
 * Chốt thanh thời gian sau khi nộp bài và hiển thị điểm thực nhận.
 * @param {number} earned - điểm nhận được của câu này
 */
function freezeTimeBar(earned) {
    const bar = DOM.playerBox.querySelector('.q-timebar');
    if (!bar) return;

    bar.classList.add('is-frozen');

    const value = bar.querySelector('.qts-value');
    if (value) {
        value.textContent = formatPoints(earned);
        value.classList.add(earned > 0 ? 'is-earned' : 'is-zero');
        value.dataset.preview = String(earned);
    }

    const label = bar.querySelector('.qts-label');
    if (label) label.textContent = earned > 0 ? 'Điểm nhận được' : 'Không có điểm';
}

/**
 * Ghi nhận kết quả của một câu hỏi, cộng điểm và hiển thị phản hồi.
 * @param {Object} block - khối câu hỏi
 * @param {number} index - vị trí câu hỏi
 * @param {boolean} isCorrect - trả lời đúng hay sai
 * @param {HTMLElement} btn - nút kiểm tra đáp án
 */
function applyQuestionResult(block, index, isCorrect, btn) {
    // Chặn nộp bài hai lần (ví dụ vừa bấm nút vừa hết thời gian)
    if (questionSubmitted) return;
    questionSubmitted = true;

    /* --------------------------------------------------------------------
     * BẢN 2.1: CHỐT THỜI GIAN ngay tại thời điểm nộp bài.
     *   - `submittedTimeLeft` là số giây còn lại (số thực) -> truyền vào biến
     *     hệ thống "Thời gian" để công thức điểm dùng được.
     *   - Điểm số & lời nhắn vẫn do chương trình khối lệnh quyết định:
     *       đúng => stack "khi trả lời đúng" (mặc định lấy data.score)
     *       sai  => stack "khi trả lời sai"  (lời nhắn/gợi ý)
     * ------------------------------------------------------------------ */
    submittedTimeLeft = questionLimit > 0 ? Math.max(0, remainingTime) : 0;
    stopQuestionTimer();

    const gameState = { timeLeft: submittedTimeLeft, totalScore: playerScore };

    const earned = isCorrect ? QuizCoding.award(block, gameState) : 0;
    const feedback = isCorrect ? '' : QuizCoding.penalize(block, gameState);

    // Cộng điểm nếu trả lời đúng
    if (isCorrect) {
        playerScore += earned;
    }

    // Lưu kết quả (kèm thời gian còn lại để hiển thị ở bảng tổng kết)
    playerResults[index] = {
        question: block.data.question,
        correct: isCorrect,
        score: earned,
        timeLeft: Math.round(submittedTimeLeft * 10) / 10
    };

    // Cập nhật thanh tiến trình + chốt thanh thời gian với điểm thực nhận
    updateProgress();
    freezeTimeBar(earned);

    // Đổi nút thành thông báo kết quả
    if (btn) {
        btn.disabled = true;
        btn.textContent = isCorrect ? '✅ Chính xác! +' + formatPoints(earned) + ' điểm' : '❌ Chưa đúng';
        btn.style.background = isCorrect ? '#22c55e' : '#ef4444';
    }

    // Nếu tắt chế độ hiện điểm ngay thì ẩn thanh điểm số đi
    if (!settings.instantScore) {
        const scoreEl = document.getElementById('quiz-score');
        if (scoreEl) scoreEl.style.visibility = 'hidden';
    }

    // Hiệu ứng phản hồi
    const card = DOM.playerBox.querySelector('.question-card[data-index="' + index + '"]');
    if (card) {
        card.classList.add(isCorrect ? 'correct-flash' : 'wrong-flash');
    }

    // Thông báo: ưu tiên lời nhắn do chương trình khối lệnh đặt (nếu có)
    if (isCorrect) {
        showToast('🎉 Chính xác! Bạn được +' + formatPoints(earned) + ' điểm.');
    } else if (feedback) {
        showToast('💡 ' + feedback);
    } else {
        showToast('💡 Rất tiếc, bạn đã trả lời sai câu này.');
    }

    /* --------------------------------------------------------------------
     * BẢN 2.2: sau khi nộp bài, GHI CHÚ hiện ra (nếu có) và sau 3 giây mới
     * hiện nút chuyển câu để người chơi đọc phản hồi rồi tự bấm nút.
     * ------------------------------------------------------------------ */
    if (block.data.noteEnabled && block.data.note) {
        showNotePanel(block.data.note);
    }
    scheduleNextButton(index);
}

/**
 * Định dạng điểm số cho đẹp: bỏ ".0" thừa, tối đa 2 chữ số thập phân.
 * @param {number} value - điểm
 * @returns {string} chuỗi hiển thị
 */
function formatPoints(value) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return String(n);
}


/**
 * Hiển thị bảng tổng kết quả cuối buổi chơi.
 */
function showResultScreen() {
    clearNextQuestionTimer();
    stopQuestionTimer();

    const total = playSources.length || blocks.length;
    const correctCount = playerResults.filter(function (r) { return r && r.correct; }).length;
    const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    // Chọn biểu tượng và lời động viên theo tỉ lệ đúng
    let emoji = '😢';
    let title = 'Cần cố gắng thêm!';
    let message = 'Bạn đã trả lời đúng ' + correctCount + '/' + total + ' câu.';

    if (percent >= 90) {
        emoji = '🏆';
        title = 'Xuất sắc!';
        message = 'Bạn đã trả lời đúng ' + correctCount + '/' + total + ' câu. Điểm số: ' + playerScore + '.';
    } else if (percent >= 70) {
        emoji = '🎉';
        title = 'Làm tốt lắm!';
        message = 'Bạn đã trả lời đúng ' + correctCount + '/' + total + ' câu. Điểm số: ' + playerScore + '.';
    } else if (percent >= 50) {
        emoji = '👍';
        title = 'Được rồi!';
        message = 'Bạn đã trả lời đúng ' + correctCount + '/' + total + ' câu. Điểm số: ' + playerScore + '.';
    }

    // Danh sách chi tiết từng câu (kèm thời gian còn lại lúc nộp - bản 2.1)
    let listHtml = '<div class="result-list">';
    playerResults.forEach(function (r, i) {
        if (!r) return;
        listHtml += '<div class="result-row ' + (r.correct ? 'ok' : 'no') + '">'
            + '<span class="r-icon">' + (r.correct ? '✅' : '❌') + '</span>'
            + '<span class="r-text">Câu ' + (i + 1) + ': ' + escapeHtml(r.question || '(không có nội dung)') + '</span>'
            + '<span class="r-time" title="Thời gian còn lại khi nộp bài">⏱️ '
            + escapeHtml(r.timeLeft !== undefined ? r.timeLeft : 0) + 's</span>'
            + '<span class="r-score">+' + r.score + '</span>'
            + '</div>';
    });
    listHtml += '</div>';

    DOM.playerBox.innerHTML = '<div class="quiz-shell">'
        + '<div class="result-card">'
        + '<div class="result-emoji">' + emoji + '</div>'
        + '<div class="result-title">' + title + '</div>'
        + '<div class="result-score">' + playerScore + ' điểm</div>'
        + '<div class="result-detail">' + escapeHtml(message) + '</div>'
        + '<div class="result-actions">'
        + '<button type="button" class="btn btn-primary" id="result-retry">🔄 Chơi lại</button>'
        + '<button type="button" class="btn btn-ghost" id="result-back">← Quay lại Builder</button>'
        + '</div>'
        + listHtml
        + '</div>'
        + '</div>';

    // Gắn sự kiện cho các nút
    const retry = document.getElementById('result-retry');
    if (retry) retry.addEventListener('click', startQuiz);

    const back = document.getElementById('result-back');
    if (back) back.addEventListener('click', stopQuiz);
}

/**
 * Hiển thị thông báo nhỏ (toast) ở giữa màn hình.
 * @param {string} message - nội dung thông báo
 */
function showToast(message) {
    // Xoá thông báo cũ nếu đang hiển thị
    const old = document.querySelector('.sb-toast');
    if (old) old.remove();

    const toast = htmlToElement('<div class="sb-toast">' + escapeHtml(message) + '</div>');
    document.body.appendChild(toast);

    setTimeout(function () {
        toast.classList.add('sb-toast-hide');
        setTimeout(function () { toast.remove(); }, 400);
    }, 2400);
}

/* =====================  BẢN 2.6 — NỐI Ô Ở PLAYER: MỖI Ô 1 NÚT, NHIỀU-NHIỀU  ==
   Giao diện nối ô trong CHẾ ĐỘ CHƠI (Player View):
     · Mỗi ô (khái niệm hoặc giải thích) chỉ có ĐÚNG 1 nút tròn làm điểm neo.
     · Kéo từ nút ô bên trái sang nút ô bên phải để nối; dây nối xuất phát từ
       nút của ô trái, bám theo con trỏ trong lúc kéo và được neo chính xác
       vào nút của ô đích khi ghép cặp xong.
     · QUAN HỆ NHIỀU-NHIỀU: một ô khái niệm nối được nhiều ô giải thích và
       một ô giải thích cũng nối được nhiều ô khái niệm. Mỗi cặp nối là
       MỘT dây riêng; thêm cặp mới KHÔNG gỡ bất kỳ cặp nào đã có.

   Dữ liệu các cặp nối nằm trong `data.answers` dưới dạng DANH SÁCH MẢNG,
   mỗi phần tử là [idKháiNiệm, nộiDungGiảiThích] (xem matchingNormalizeLinks
   trong js/core/utils.js).

   PHÂN CÁCH EDITOR / PLAYER (rất quan trọng):
     Trình chỉnh sửa (js/ui/editor.js) GIỮ NGUYÊN giao diện cấu hình cặp
     khái niệm – giải thích (mỗi khái niệm có N cúc tròn + 1 cúc "+").
     Giao diện "1 nút / ô" ở đây CHỈ áp dụng cho Player View, được đánh dấu
     bằng lớp .match-2n-player để CSS không lan sang trình chỉnh sửa.

   Bản 2.4 đã sửa: giữ nguyên schema { id, concept, explanations[] } ở bản sao
   runtime, vẽ đường nối bằng getScreenCTM() (không lệch khi vùng chứa bị
   scale) và không kẹt trạng thái khi người chơi nối nhiều cặp.
   ======================================================================== */
function buildMatchingAreaV3(block, index) {
    const d = block.data;
    if (!Array.isArray(d.pairs)) d.pairs = [];
    if (!Array.isArray(d.explanationsAll)) d.explanationsAll = [];
    if (!d.answers || typeof d.answers !== 'object') d.answers = [];

    /* Chuẩn hoá lại dữ liệu (idempotent): id khái niệm phải duy nhất và
       explanationsAll phải chứa đủ mọi giải thích đang được gắn. */
    normalizeBlockData(d, 'matching');

    const wrap = htmlToElement('<div class="match-2n-area match-2n-player"></div>');
    const leftCol = htmlToElement('<div class="match-col match-col-left"></div>');
    const rightCol = htmlToElement('<div class="match-col match-col-right"></div>');
    const svgNS = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(svgNS, 'svg');
    overlay.setAttribute('class', 'match-overlay');
    overlay.setAttribute('xmlns', svgNS);
    overlay.style.overflow = 'visible';
    wrap.appendChild(leftCol);
    wrap.appendChild(overlay);
    wrap.appendChild(rightCol);

    /* Bảng tra cứu phần tử đã dựng — dùng để vẽ đường nối mà không phải truy
       vấn CSS selector theo nội dung (nội dung người dùng gõ có thể chứa
       ký tự đặc biệt ⇒ selector dễ hỏng). */
    const leftRows = [];
    const rightRows = Object.create(null);

    /* Cột trái — mỗi khái niệm có ĐÚNG 1 nút tròn làm điểm neo */
    d.pairs.forEach(function (pair, pi) {
        const box = htmlToElement(
            '<div class="match-box" data-concept="' + escapeHtml(pair.id) + '">'
          + '<span class="match-text">' + escapeHtml(pair.concept) + '</span>'
          + '<button type="button" class="match-button" data-side="L"></button>'
          + '</div>'
        );
        box.style.animationDelay = (pi * 0.09) + 's';
        box.classList.add('anim-pop');
        const dot = box.querySelector('.match-button');
        dot.dataset.owner = pair.id;
        leftCol.appendChild(box);
        leftRows.push({ pair: pair, box: box, dot: dot });
    });

    /* Cột phải — mỗi giải thích có ĐÚNG 1 nút tròn làm điểm neo */
    (d.explanationsAll || []).forEach(function (exp, ri) {
        const box = htmlToElement(
            '<div class="match-box" data-explanation="' + escapeHtml(exp) + '">'
          + '<button type="button" class="match-button" data-side="R"></button>'
          + '<span class="match-text">' + escapeHtml(exp) + '</span>'
          + '</div>'
        );
        box.style.animationDelay = (ri * 0.09 + 0.05) + 's';
        box.classList.add('anim-pop');
        const dot = box.querySelector('.match-button');
        dot.dataset.owner = exp;
        dot.textContent = String.fromCharCode(65 + ri);
        rightCol.appendChild(box);
        rightRows[exp] = { exp: exp, index: ri, box: box, dot: dot };
    });

    /* --- 4. Trạng thái chơi --- */
    const state = {
        drag: null,           // { dot, side } — nút đang được kéo
        dragMoved: false,     // đã di chuyển quá ngưỡng ⇒ coi là kéo thật
        dragStart: null,      // toạ độ lúc bắt đầu nhấn
        pointer: null,        // toạ độ con trỏ (clientX/clientY)
        hoverDot: null,       // nút đang được rê qua (đích hợp lệ)
        selecting: null,      // nút trái đang được chọn (thao tác bấm)
        suppressClick: false, // bỏ qua sự kiện click ngay sau thao tác chuột
        locked: false         // đã nộp đáp án ⇒ khoá thao tác
    };

    /* DANH SÁCH CẶP NỐI (quan hệ nhiều-nhiều): mỗi phần tử là một mảng
       [idKháiNiệm, nộiDungGiảiThích]. Một khái niệm có thể nối nhiều giải
       thích và một giải thích cũng có thể nối nhiều khái niệm. */
    const links = matchingNormalizeLinks(d.answers);

    /** Ghi lại danh sách cặp nối vào dữ liệu câu hỏi (kể cả bản legacy). */
    function saveLinks() {
        d.answers = links.slice();
        const legacy = {};
        links.forEach(function (pair) {
            if (!legacy[pair[0]]) legacy[pair[0]] = [];
            legacy[pair[0]].push(pair[1]);
        });
        d.userAnswers = legacy;
    }

    /** Số giải thích đang nối với một khái niệm. */
    function linkCountOf(cid) {
        return matchingTargetsOf(links, cid).length;
    }

    /** Số khái niệm đang nối với một giải thích. */
    function ownerCountOf(exp) {
        return matchingOwnerCount(links, exp);
    }

    /** Tìm hàng khái niệm theo id. */
    function rowById(cid) {
        for (let i = 0; i < leftRows.length; i++) {
            if (leftRows[i].pair.id === cid) return leftRows[i];
        }
        return null;
    }

    /** Đồng bộ trạng thái các nút (đã nối / đang chọn) + số nối hiện trên nút trái. */
    function refreshDotStates() {
        leftRows.forEach(function (row) {
            const n = linkCountOf(row.pair.id);
            row.dot.classList.toggle('is-filled', n > 0);
            row.dot.classList.toggle('is-selected', state.selecting === row.dot);
            /* Nút trái hiện số giải thích đang nối (để trống khi chưa nối) */
            row.dot.textContent = n ? String(n) : '';
            row.dot.title = 'Kéo sang ô giải thích bên phải để nối'
                + (n ? ' — đang nối ' + n + ' giải thích' : '');
        });
        Object.keys(rightRows).forEach(function (exp) {
            const item = rightRows[exp];
            const n = ownerCountOf(exp);
            item.dot.classList.toggle('is-filled', n > 0);
            item.dot.title = n
                ? 'Đang nối với ' + n + ' khái niệm — bấm để bỏ nối'
                : 'Kéo từ ô khái niệm bên trái sang đây để nối';
            /* Huy hiệu số khái niệm đang nối (quan hệ nhiều-nhiều) */
            if (!item.badge) {
                item.badge = htmlToElement('<span class="match-badge"></span>');
                item.box.appendChild(item.badge);
            }
            item.badge.textContent = n ? String(n) : '';
            item.badge.hidden = !n;
        });
    }

    /** Bỏ chọn nút trái hiện tại (kèm xoá tô sáng nút đích). */
    function clearSelection() {
        if (state.selecting) state.selecting.classList.remove('is-selected');
        state.selecting = null;
        markTarget(null);
    }

    /** Chọn một nút bên trái. */
    function selectLeft(dot) {
        clearSelection();
        state.selecting = dot;
        dot.classList.add('is-selected');
    }

    /**
     * THÊM một cặp nối — quan hệ NHIỀU-NHIỀU.
     * Hàm này KHÔNG gỡ bất kỳ cặp nào đã có: một khái niệm có thể nối thêm
     * giải thích mới, và một giải thích cũng có thể được nối thêm khái niệm
     * mà không mất các dây nối cũ.
     *
     * @param {string} cid - id khái niệm
     * @param {string} exp - nội dung giải thích
     * @returns {boolean} true nếu vừa tạo thêm cặp nối
     */
    function addLink(cid, exp) {
        if (!rightRows[exp] || !rowById(cid)) return false;
        if (!matchingAddLink(links, cid, exp)) return false;
        saveLinks();
        refreshDotStates();
        redrawLines();
        return true;
    }

    /**
     * BẬT/TẮT một cặp nối (dùng cho thao tác bấm): có thì gỡ, chưa có thì thêm.
     * @param {string} cid - id khái niệm
     * @param {string} exp - nội dung giải thích
     * @returns {boolean} true nếu sau thao tác cặp nối đang tồn tại
     */
    function toggleLink(cid, exp) {
        if (!rightRows[exp] || !rowById(cid)) return false;
        const existed = matchingRemoveLink(links, cid, exp);
        if (!existed) matchingAddLink(links, cid, exp);
        saveLinks();
        refreshDotStates();
        redrawLines();
        return !existed;
    }

    /**
     * Gỡ MỌI cặp nối đi tới một giải thích (ô bên phải có thể đang nối với
     * nhiều khái niệm cùng lúc).
     * @param {string} exp - nội dung giải thích
     * @returns {number} số cặp nối đã gỡ
     */
    function unlinkAllTo(exp) {
        const removed = matchingRemoveLinksTo(links, exp);
        if (!removed) return 0;
        saveLinks();
        refreshDotStates();
        redrawLines();
        return removed;
    }

    function redrawLines(tint, missingEdges) {
        while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
        if (!wrap.isConnected) return;
        syncSvgOverlaySize(overlay, wrap);
        if (!wrap.clientWidth) return;

        /* Các cặp đã nối — mỗi cặp là MỘT dây, xuất phát từ nút của ô khái niệm
           và neo vào nút của ô giải thích. Một nút có thể có nhiều dây. */
        links.concat(missingEdges || []).forEach(function (edge) {
            const row = rowById(edge[0]);
            const target = rightRows[edge[1]];
            if (!row || !target) return;
            const pts = matchConnectorPoints(overlay, row.dot, target.dot);
            if (!pts) return;
            const p = document.createElementNS(svgNS, 'path');
            const cls = 'match-line ' + ((tint && tint[JSON.stringify(edge)]) || 'is-active');
            p.setAttribute('class', cls);
            p.setAttribute('d', matchConnectorPath(pts.x1, pts.y1, pts.x2, pts.y2));
            overlay.appendChild(p);
        });

        /* Dây nháp: xuất phát từ nút đang kéo, bám theo con trỏ hoặc neo vào
           nút đích khi rê đúng nút đối diện. */
        drawPreviewLine();
    }

    /**
     * Vẽ dây nháp trong lúc người chơi đang kéo (hoặc đang chọn) một nút.
     * Nút bên trái xuất phát từ mép phải, nút bên phải xuất phát từ mép trái —
     * luôn hướng về phía cột đối diện.
     */
    function drawPreviewLine() {
        const src = state.drag ? state.drag.dot : state.selecting;
        if (!src) return;
        const from = src.getBoundingClientRect();
        const isLeft = src.dataset.side === 'L';
        const p1 = svgPointFromClient(overlay,
            isLeft ? from.right : from.left,
            from.top + from.height / 2);
        let p2 = null;
        const target = state.hoverDot;
        if (target && target !== src) {
            const tr = target.getBoundingClientRect();
            p2 = svgPointFromClient(overlay,
                target.dataset.side === 'L' ? tr.right : tr.left,
                tr.top + tr.height / 2);
        } else if (state.pointer) {
            p2 = svgPointFromClient(overlay, state.pointer.x, state.pointer.y);
        }
        if (!p1 || !p2) return;
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('class', 'match-line is-preview');
        p.setAttribute('d', matchConnectorPath(p1.x, p1.y, p2.x, p2.y));
        overlay.appendChild(p);
    }

    /** Lên lịch vẽ lại (gom nhiều thay đổi vào một khung hình). */
    let redrawPending = false;
    function scheduleRedraw() {
        if (redrawPending) return;
        redrawPending = true;
        requestAnimationFrame(function () {
            redrawPending = false;
            redrawLines();
        });
    }

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () { redrawLines(); }).observe(wrap);
    } else {
        window.addEventListener('resize', function () { redrawLines(); });
    }

    /* --- 5. Tương tác: kéo-thả nối, bấm nối, bỏ nối --- */

    /**
     * Tìm nút hợp lệ đang nằm dưới con trỏ.
     * @param {number} x - clientX
     * @param {number} y - clientY
     * @param {string} side - chỉ nhận nút thuộc cột này ('L' hoặc 'R')
     * @returns {Element|null} nút đích hợp lệ
     */
    function targetAt(x, y, side) {
        const el = document.elementFromPoint(x, y);
        if (!el || !el.closest) return null;
        const dot = el.closest('.match-button');
        if (!dot || dot.disabled) return null;
        if (dot.dataset.side !== side) return null;
        if (!wrap.contains(dot)) return null;
        return dot;
    }

    /** Tô sáng nút đang là đích của thao tác kéo. */
    function markTarget(dot) {
        if (state.hoverDot === dot) return;
        if (state.hoverDot) {
            state.hoverDot.classList.remove('is-target');
            const b = state.hoverDot.closest('.match-box');
            if (b) b.classList.remove('is-target');
        }
        state.hoverDot = dot;
        if (dot) {
            dot.classList.add('is-target');
            const b = dot.closest('.match-box');
            if (b) b.classList.add('is-target');
        }
    }

    /** Xử lý bấm (không kéo) vào một nút. */
    function handleClickOnDot(dot) {
        if (dot.dataset.side === 'L') {
            /* Bấm nút trái: chọn khái niệm để nối (bấm lại để bỏ chọn) */
            if (state.selecting === dot) {
                clearSelection();
            } else {
                selectLeft(dot);
            }
            redrawLines();
            return;
        }
        /* Bấm nút phải */
        if (state.selecting) {
            /* Đang có khái niệm được chọn ⇒ bật/tắt cặp nối giữa hai ô */
            const cid = state.selecting.dataset.owner;
            clearSelection();
            toggleLink(cid, dot.dataset.owner);
            return;
        }
        /* Bấm nút phải đang đã nối ⇒ gỡ MỌI cặp nối của nút này.
           (Nút phải có thể nối nhiều khái niệm — gỡ hết một lần.) */
        if (unlinkAllTo(dot.dataset.owner)) return;
        showToast('⚠️ Kéo từ ô khái niệm bên trái sang ô này để nối.');
    }

    /* Rê chuột trong lúc kéo ⇒ dây nháp bám theo con trỏ */
    function onPointerMove(e) {
        if (!state.drag) return;
        state.pointer = { x: e.clientX, y: e.clientY };
        if (!state.dragMoved) {
            const dx = Math.abs(e.clientX - state.dragStart.x);
            const dy = Math.abs(e.clientY - state.dragStart.y);
            if (dx + dy >= 6) state.dragMoved = true;
        }
        /* Nút đích hợp lệ phải nằm ở cột đối diện với nút đang kéo */
        const opposite = state.drag.side === 'L' ? 'R' : 'L';
        markTarget(targetAt(e.clientX, e.clientY, opposite));
        scheduleRedraw();
    }

    function onPointerUp(e) {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        const drag = state.drag;
        const moved = state.dragMoved;
        state.drag = null;
        state.dragMoved = false;
        state.suppressClick = true;          // bỏ qua sự kiện click ngay sau đó
        /* Trình duyệt thật sẽ bắn "click" ngay sau pointerup; hẹn giờ để cờ
           tự xoá phòng khi không có sự kiện click nào đi kèm. */
        window.setTimeout(function () { state.suppressClick = false; }, 0);
        if (!drag) return;
        drag.dot.classList.remove('is-dragging');

        const opposite = drag.side === 'L' ? 'R' : 'L';
        const target = targetAt(e.clientX, e.clientY, opposite);
        markTarget(null);

        if (target) {
            /* Kéo từ trái sang phải (hoặc ngược lại) ⇒ THÊM cặp nối.
               Mô hình nhiều-nhiều: cặp nối cũ được GIỮ NGUYÊN, dây mới được
               thêm vào chứ không ghi đè bất kỳ dây nào đã có. */
            if (drag.side === 'L') {
                addLink(drag.dot.dataset.owner, target.dataset.owner);
            } else {
                addLink(target.dataset.owner, drag.dot.dataset.owner);
            }
            return;
        }

        if (moved) {
            /* Kéo ra ngoài ⇒ hủy thao tác, KHÔNG xoá dữ liệu nối.
               (Muốn bỏ nối thì bấm nút phải, hoặc chọn khái niệm rồi bấm nút phải.) */
            clearSelection();
            redrawLines();
            return;
        }

        /* Chưa kéo ⇒ xử lý như BẤM */
        handleClickOnDot(drag.dot);
    }

    wrap.addEventListener('pointerdown', function (e) {
        if (state.locked) return;
        const dot = e.target.closest('.match-button');
        if (!dot || dot.disabled) return;
        e.preventDefault();
        state.suppressClick = false;         // chuẩn bị cho lượt bấm mới
        state.drag = { dot: dot, side: dot.dataset.side };
        state.dragMoved = false;
        state.dragStart = { x: e.clientX, y: e.clientY };
        state.pointer = { x: e.clientX, y: e.clientY };
        dot.classList.add('is-dragging');
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        scheduleRedraw();
    });

    /* Bấm bằng bàn phím (Enter / Space) — thao tác chuột đã xử lý ở pointerup. */
    wrap.addEventListener('click', function (e) {
        const suppress = state.suppressClick;
        state.suppressClick = false;
        if (suppress) return;
        const dot = e.target.closest('.match-button');
        if (!dot || dot.disabled) return;
        if (state.locked) return;
        e.preventDefault();
        handleClickOnDot(dot);
    });

/* Nút kiểm tra */
    const checkBtn = htmlToElement(
        '<button type="button" class="btn btn-primary" style="align-self:flex-start;margin-top:6px">Kiểm tra đáp án</button>'
    );
    checkBtn.addEventListener('click', function () {
        if (checkBtn.dataset.locked === 'true') return;
        checkBtn.dataset.locked = 'true';
        state.locked = true;
        clearSelection();
        const user = new Set();
        const correct = new Set();
        const correctEdges = [];
        /* Mô hình nhiều-nhiều: so sánh theo TẬP các cặp [khái niệm, giải thích] */
        links.forEach(function (edge) {
            if (edge[0] && edge[1]) user.add(JSON.stringify(edge));
        });
        d.pairs.forEach(function (p) {
            (p.explanations || []).forEach(function (e) {
                if (!e) return;
                const edge = [p.id, e];
                const key = JSON.stringify(edge);
                if (correct.has(key)) return;
                correct.add(key);
                correctEdges.push(edge);
            });
        });
        const allCorrect = user.size === correct.size
            && Array.from(user).every(function (k) { return correct.has(k); });
        const tint = {};
        links.forEach(function (edge) {
            const key = JSON.stringify(edge);
            tint[key] = correct.has(key) ? 'is-correct' : 'is-wrong';
        });
        const missingEdges = correctEdges.filter(function (edge) {
            const key = JSON.stringify(edge);
            if (user.has(key)) return false;
            tint[key] = 'is-missing';
            return true;
        });
        leftCol.querySelectorAll('.match-button').forEach(function (b) { b.disabled = true; });
        rightCol.querySelectorAll('.match-button').forEach(function (b) { b.disabled = true; });
        redrawLines(tint, missingEdges);
        applyQuestionResult(block, index, allCorrect, checkBtn);
    });

    const container = htmlToElement('<div></div>');
    container.appendChild(wrap);
    container.appendChild(checkBtn);
    /* Khôi phục trạng thái đã nối (phòng khi câu hỏi được dựng lại) */
    refreshDotStates();
    requestAnimationFrame(function () { redrawLines(); });
    return container;
}

/* CSS-escape an toàn cho attribute selector [data-…="…"]
   Lưu ý: KHÔNG dùng CSS.escape() vì hàm này viết cho IDENTIFIER (không có
   dấu nháy) — đặt vào chuỗi đã nháy sẽ hỏng với giá trị bắt đầu bằng số
   (escape dạng \31  sẽ nuốt mất khoảng trắng theo sau). */
function cssE(s) {
    return String(s == null ? '' : s).replace(/(["\\])/g, '\\$1');
}

/* =====================  GIAO DIỆN CLOZE TRONG PLAYER  =====================
  Mỗi chỗ trống chấm theo mảng đáp án chuẩn sau khi cắt khoảng trắng và chuẩn
  hoá chữ hoa/thường. Câu sai hoặc để trống hiện gợi ý đáp án màu vàng. */
function buildClozeAreaV3(block, index) {
    const d = block.data;
    if (!Array.isArray(d.blanks)) d.blanks = [];
    if (typeof d.paragraph !== 'string') d.paragraph = '';

    const textBox = htmlToElement('<div class="cloze-text"></div>');
    const parts = splitByBlanks(d.paragraph || '');

    parts.forEach(function (part) {
        if (part.type === 'text') {
            /* Bản 2.3 (C1): bọc mỗi mảnh chữ để animate lần lượt trong 3s */
            const span = document.createElement('span');
            span.className = 'cloze-ch';
            span.textContent = part.value;
            textBox.appendChild(span);
            return;
        }
        const blank = d.blanks[part.value - 1] || { answers: [], user: '' };
        const answers = Array.isArray(blank.answers) ? blank.answers : [];
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cloze-blank';
        input.dataset.blank = String(part.value);
        input.placeholder = 'Chỗ trống ' + part.value;
        input.setAttribute('aria-label', 'Điền chỗ trống ' + part.value);
        /* Bản 2.3 (C1): bọc ô trống để animate lần lượt trong 3s */
        const wrap = document.createElement('span');
        wrap.className = 'cloze-blank-wrap';
        wrap.appendChild(input);
        textBox.appendChild(wrap);
    });

    /* Bản 2.3 (C1): đoạn văn + ô trống xuất hiện từ từ trong đúng 3 giây. */
    animateClozeParagraph(textBox, 3000);

    const checkBtn = htmlToElement(
        '<button type="button" class="btn btn-primary" style="align-self:flex-start;margin-top:6px">Kiểm tra đáp án</button>'
    );

    function showAnswersArea(input) {
        /* Hiện gợi ý vàng ngay bên cạnh ô trả lời tương ứng */
        const blank = d.blanks[Number(input.dataset.blank) - 1];
        if (!blank || !Array.isArray(blank.answers) || blank.answers.length < 1) return;
        if (!input || input.dataset.hinted === 'true') return;

        const hint = document.createElement('div');
        hint.className = 'cloze-answers';

        if (blank.answers.length === 1) {
            hint.textContent = 'Đáp án: ' + blank.answers[0];
        } else {
            const list = document.createElement('select');
            list.className = 'cloze-answers-select';
            list.setAttribute('aria-label', 'Danh sách đáp án đúng');
            const placeholder = document.createElement('option');
            placeholder.textContent = 'Các đáp án đúng';
            placeholder.disabled = true;
            placeholder.selected = true;
            list.appendChild(placeholder);
            blank.answers.forEach(function (a) {
                const option = document.createElement('option');
                option.textContent = a;
                option.value = a;
                list.appendChild(option);
            });
            hint.appendChild(list);
        }
        input.insertAdjacentElement('afterend', hint);
        input.dataset.hinted = 'true';
    }

    checkBtn.addEventListener('click', function () {
        if (checkBtn.dataset.locked === 'true') return;
        checkBtn.dataset.locked = 'true';
        const inputs = textBox.querySelectorAll('.cloze-blank');
        let allCorrect = inputs.length > 0;
        inputs.forEach(function (input) {
            const blank = d.blanks[Number(input.dataset.blank) - 1];
            const value = input.value.trim().toLowerCase();
            const answers = blank && Array.isArray(blank.answers) ? blank.answers : [];
            const isCorrect = value.length > 0 && answers.some(function (answer) {
                return String(answer == null ? '' : answer).trim().toLowerCase() === value;
            });
            if (!isCorrect) allCorrect = false;
            input.classList.remove('is-correct', 'is-wrong');
            input.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
            input.disabled = true;
            if (!isCorrect) showAnswersArea(input);
        });
        applyQuestionResult(block, index, allCorrect, checkBtn);
    });

    /* Tab giữa các ô; Enter = submit (ở ô cuối) */
    textBox.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const inputs = Array.from(textBox.querySelectorAll('.cloze-blank'));
        const idx = inputs.indexOf(document.activeElement);
        if (idx < 0) return;
        if (idx === inputs.length - 1) {
            checkBtn.click();
        } else {
            inputs[idx + 1].focus();
        }
    });

    const container = htmlToElement('<div></div>');
    container.appendChild(textBox);
    container.appendChild(checkBtn);
    return container;
}

/* =====================  BẢN 2.3 — UI MỚI CHO DROPDOWN  =====================
  Mỗi <N>{{...}}</N> có options riêng (d.blanks[i].options) + correct riêng.
  UI:
    - Chip ".dd-chip" hiển thị "Chọn..." ban đầu.
    - Click chip -> popup .dd-list liệt kê options.
    - Chọn 1 item -> đóng popup, cập nhật chip.
    - Submit: tô xanh/đỏ + khoá chip; sau submit hiện nút "▾" bên cạnh
      để xem lại cả danh sách (đáp án đúng tô xanh). */
function buildDropdownAreaV3(block, index) {
    const d = block.data;
    if (!Array.isArray(d.blanks)) d.blanks = [];
    if (typeof d.paragraph !== 'string') d.paragraph = '';

    const textBox = htmlToElement('<div class="dropdown-text"></div>');
    const parts = splitByBlanks(d.paragraph || '');

    parts.forEach(function (part) {
        if (part.type === 'text') {
            /* Bản 2.3 (D1): bọc mỗi mảnh chữ để animate lần lượt trong 3s */
            const span = document.createElement('span');
            span.className = 'dd-ch';
            span.textContent = part.value;
            textBox.appendChild(span);
            return;
        }
        const blank = d.blanks[part.value - 1] || { options: [], correct: '' };

        /* Tạo chip + popup */
        const host = document.createElement('span');
        host.className = 'dd-chip-wrap';

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'dd-chip';
        chip.textContent = 'Chọn...';
        chip.dataset.blank = String(part.value);
        if (blank.correct) chip.dataset.answer = blank.correct;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'dd-toggle';
        toggle.textContent = '▾';
        toggle.title = 'Xem các lựa chọn';
        toggle.hidden = true;       /* chỉ hiện sau submit */

        const list = document.createElement('ul');
        list.className = 'dd-list';
        list.hidden = true;         /* popup mặc định đóng */

        (blank.options || []).forEach(function (opt) {
            const li = document.createElement('li');
            li.textContent = opt;
            li.dataset.value = opt;
            li.addEventListener('click', function (e) {
                e.stopPropagation();
                if (chip.classList.contains('is-locked')) return;
                chip.textContent = opt;
                chip.dataset.selected = opt;
                /* Đánh dấu "đã chọn" */
                list.querySelectorAll('li').forEach(function (x) {
                    x.classList.remove('is-selected');
                });
                li.classList.add('is-selected');
                list.hidden = true;
            });
            list.appendChild(li);
        });

        chip.addEventListener('click', function (e) {
            e.stopPropagation();
            if (chip.classList.contains('is-locked')) return;
            list.hidden = !list.hidden;
        });

        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            /* Hiện popup bất kể khoá */
            list.hidden = !list.hidden;
        });

        host.appendChild(chip);
        host.appendChild(toggle);
        host.appendChild(list);
        textBox.appendChild(host);
    });

    /* Bản 2.3 (D1): đoạn văn + ô thả xuất hiện lần lượt trong đúng 3 giây. */
    animateDropdownParagraph(textBox, 3000);

    /* Click bên ngoài -> đóng tất cả popup */
    document.addEventListener('click', function () {
        textBox.querySelectorAll('.dd-list').forEach(function (l) { l.hidden = true; });
    });

    const checkBtn = htmlToElement(
        '<button type="button" class="btn btn-primary" style="align-self:flex-start;margin-top:6px">Kiểm tra đáp án</button>'
    );
    checkBtn.addEventListener('click', function () {
        if (checkBtn.dataset.locked === 'true') return;
        checkBtn.dataset.locked = 'true';

        const chips = textBox.querySelectorAll('.dd-chip');
        let allCorrect = chips.length > 0;
        let filled = 0;
        chips.forEach(function (chip) {
            const v = (chip.dataset.selected || '').trim();
            const a = (chip.dataset.answer || '').trim();
            const ok = v.length > 0 && v === a;
            if (v.length > 0) filled += 1;
            if (!ok) allCorrect = false;
            chip.classList.remove('is-correct', 'is-wrong', 'is-locked');
            chip.classList.add(ok ? 'is-correct' : 'is-wrong');
            chip.classList.add('is-locked');
            chip.disabled = true;

            /* Hiện nút ▾ */
            const wrap = chip.parentNode;
            const tog = wrap.querySelector('.dd-toggle');
            if (tog) tog.hidden = false;
            /* Đánh dấu đáp án đúng/sai trong list */
            const list = wrap.querySelector('.dd-list');
            if (list) {
                list.querySelectorAll('li').forEach(function (li) {
                    li.classList.remove('is-correct', 'is-wrong', 'is-selected');
                    if (li.dataset.value === a) li.classList.add('is-correct');
                    else if (li.dataset.value === v) li.classList.add('is-wrong');
                });
            }
        });
        if (filled === 0) {
            showToast('⚠️ Bạn chưa chọn mục nào!');
            checkBtn.dataset.locked = '';
            chips.forEach(function (chip) {
                chip.classList.remove('is-correct', 'is-wrong', 'is-locked');
                chip.disabled = false;
                const tog = chip.parentNode.querySelector('.dd-toggle');
                if (tog) tog.hidden = true;
            });
            return;
        }
        applyQuestionResult(block, index, allCorrect, checkBtn);
    });

    const container = htmlToElement('<div></div>');
    container.appendChild(textBox);
    container.appendChild(checkBtn);
    return container;
}

/* Dựng vùng chọn ảnh và phản hồi hình học sau khi nộp bài. */
function buildHotspotAreaV3(block, index) {
    const d = block.data;
    if (!Array.isArray(d.regions)) d.regions = [];
    if (!Array.isArray(d.userRegions)) d.userRegions = [];

    const wrap = htmlToElement('<div class="hotspot-wrap"></div>');
    const stage = htmlToElement('<div class="hotspot-stage hotspot-stage-v23"></div>');

    if (d.imageUrl) {
        const img = document.createElement('img');
        img.className = 'hotspot-bg';
        img.src = d.imageUrl;
        img.alt = 'Ảnh của câu hỏi';
        function fitStageToImage() {
            if (img.naturalWidth && img.naturalHeight) {
                stage.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
            }
        }
        img.addEventListener('load', fitStageToImage);
        fitStageToImage();
        img.onerror = function () {
            stage.innerHTML = '<div class="hotspot-fallback">🖼️</div>';
        };
        stage.appendChild(img);
    } else {
        stage.appendChild(htmlToElement('<div class="hotspot-fallback">🖼️</div>'));
    }

    const answerLayer = htmlToElement('<div class="hs-layer hs-answer-layer"></div>');
    const overlapLayer = htmlToElement('<div class="hs-layer hs-overlap-layer"></div>');
    const userLayer = htmlToElement('<div class="hs-layer hs-user-layer"></div>');
    stage.appendChild(answerLayer);
    stage.appendChild(overlapLayer);
    stage.appendChild(userLayer);

    function stageAspectRatio() {
        if (stage.clientWidth && stage.clientHeight) return stage.clientWidth / stage.clientHeight;
        const image = stage.querySelector('.hotspot-bg');
        if (image && image.naturalWidth && image.naturalHeight) {
            return image.naturalWidth / image.naturalHeight;
        }
        return 16 / 10;
    }
    function canonicalRegion(region, aspect) {
        const width = Math.max(0, Number(region.w) || 0);
        const height = region.shape === 'circle' ? width * aspect : Math.max(0, Number(region.h) || 0);
        return {
            x: (Number(region.x) || 0) * aspect,
            y: Number(region.y) || 0,
            w: width * aspect,
            h: height,
            shape: region.shape === 'circle' ? 'circle' : 'rectangle'
        };
    }
    function shapeArea(region) {
        if (region.shape === 'circle') {
            const radius = Math.min(region.w, region.h) / 2;
            return Math.PI * radius * radius;
        }
        return region.w * region.h;
    }
    function circleCircleArea(a, b) {
        const ra = Math.min(a.w, a.h) / 2;
        const rb = Math.min(b.w, b.h) / 2;
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
        const bx = b.x + b.w / 2, by = b.y + b.h / 2;
        const distance = Math.hypot(ax - bx, ay - by);
        if (distance >= ra + rb) return 0;
        if (distance <= Math.abs(ra - rb)) {
            const radius = Math.min(ra, rb);
            return Math.PI * radius * radius;
        }
        const angleA = Math.acos(Math.max(-1, Math.min(1,
            (distance * distance + ra * ra - rb * rb) / (2 * distance * ra))));
        const angleB = Math.acos(Math.max(-1, Math.min(1,
            (distance * distance + rb * rb - ra * ra) / (2 * distance * rb))));
        const triangle = 0.5 * Math.sqrt(
            (-distance + ra + rb) * (distance + ra - rb)
            * (distance - ra + rb) * (distance + ra + rb)
        );
        return ra * ra * angleA + rb * rb * angleB - triangle;
    }
    function circleRectangleArea(circle, rectangle) {
        const radius = Math.min(circle.w, circle.h) / 2;
        const cx = circle.x + circle.w / 2, cy = circle.y + circle.h / 2;
        const x1 = Math.max(rectangle.x, cx - radius);
        const x2 = Math.min(rectangle.x + rectangle.w, cx + radius);
        const y1 = Math.max(rectangle.y, cy - radius);
        const y2 = Math.min(rectangle.y + rectangle.h, cy + radius);
        if (x2 <= x1 || y2 <= y1) return 0;

        const points = [y1, y2];
        [x1, x2].forEach(function (x) {
            const offset = x - cx;
            if (Math.abs(offset) < radius) {
                const dy = Math.sqrt(radius * radius - offset * offset);
                if (cy - dy > y1 && cy - dy < y2) points.push(cy - dy);
                if (cy + dy > y1 && cy + dy < y2) points.push(cy + dy);
            }
        });
        points.sort(function (a, b) { return a - b; });

        function primitive(y) {
            const t = Math.max(-radius, Math.min(radius, y - cy));
            return 0.5 * (t * Math.sqrt(Math.max(0, radius * radius - t * t))
                + radius * radius * Math.asin(t / radius));
        }
        let area = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const top = points[i], bottom = points[i + 1];
            const middle = (top + bottom) / 2;
            const halfChord = Math.sqrt(Math.max(0, radius * radius - (middle - cy) ** 2));
            const left = cx - halfChord, right = cx + halfChord;
            const clippedLeftIsCurve = left > x1;
            const clippedRightIsCurve = right < x2;
            if (right <= x1 || left >= x2) continue;
            const curveArea = primitive(bottom) - primitive(top);
            const rightArea = clippedRightIsCurve ? curveArea : x2 * (bottom - top);
            const leftArea = clippedLeftIsCurve ? curveArea : x1 * (bottom - top);
            area += rightArea - leftArea;
        }
        return Math.max(0, area);
    }
    function intersectionArea(first, second) {
        if (first.shape === 'rectangle' && second.shape === 'rectangle') {
            const width = Math.max(0, Math.min(first.x + first.w, second.x + second.w)
                - Math.max(first.x, second.x));
            const height = Math.max(0, Math.min(first.y + first.h, second.y + second.h)
                - Math.max(first.y, second.y));
            return width * height;
        }
        if (first.shape === 'circle' && second.shape === 'circle') {
            return circleCircleArea(first, second);
        }
        return first.shape === 'circle'
            ? circleRectangleArea(first, second)
            : circleRectangleArea(second, first);
    }
    function clampPct01(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    const aspect = stageAspectRatio();
    d.userRegions.length = 0;
    d.regions.forEach(function (r, i) {
        const height = r.shape === 'circle' ? r.w * aspect : r.h;
        const offset = d.regions.length === 1
            ? { x: 50 - r.w / 2, y: 50 - height / 2 }
            : (function () {
                const cols = Math.ceil(Math.sqrt(d.regions.length));
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cellW = 100 / cols;
                const yTop = row * 18;
                return { x: col * cellW + cellW / 2 - r.w / 2, y: yTop };
            })();
        d.userRegions.push({
            id: r.id || 'u' + (i + 1),
            label: r.label || 'Vùng ' + (i + 1),
            x: clampPct01(offset.x, 0, 100 - r.w),
            y: clampPct01(offset.y, 0, 100 - height),
            w: r.w, h: height, shape: r.shape === 'circle' ? 'circle' : 'rectangle'
        });
    });

    /* Dựng các vùng đáp án, chỉ hiện rõ sau khi nộp bài. */
    d.regions.forEach(function (r, i) {
        const el = document.createElement('div');
        el.className = 'hs-region hs-answer' + (r.shape === 'circle' ? ' is-circle' : '');
        el.style.left = r.x + '%';
        el.style.top = r.y + '%';
        el.style.width = r.w + '%';
        el.style.height = (r.shape === 'circle' ? r.w * aspect : r.h) + '%';
        el.style.animationDelay = (i * 0.08) + 's';
        const lbl = document.createElement('span');
        lbl.className = 'region-label';
        lbl.textContent = r.label || '';
        el.appendChild(lbl);
        answerLayer.appendChild(el);
    });

    /* Kéo thả user regions */
    let dragId = null, dragOffsetX = 0, dragOffsetY = 0;
    function onMouseDown(e) {
        const handle = e.target.closest('.hs-region.hs-user-region');
        if (!handle) return;
        if (handle.dataset.locked === 'true') return;
        dragId = handle.dataset.id;
        const sRect = stage.getBoundingClientRect();
        const hRect = handle.getBoundingClientRect();
        dragOffsetX = (e.clientX - hRect.left) / sRect.width * 100;
        dragOffsetY = (e.clientY - hRect.top) / sRect.height * 100;
        handle.classList.add('is-dragging');
        e.preventDefault();
    }
    function onMouseMove(e) {
        if (!dragId) return;
        const sRect = stage.getBoundingClientRect();
        const newX = ((e.clientX - sRect.left) / sRect.width) * 100 - dragOffsetX;
        const newY = ((e.clientY - sRect.top) / sRect.height) * 100 - dragOffsetY;
        const u = d.userRegions.filter(function (r) { return r.id === dragId; })[0];
        if (!u) return;
        u.x = clampPct01(newX, 0, 100 - u.w);
        u.y = clampPct01(newY, 0, 100 - (u.shape === 'circle' ? u.w * aspect : u.h));
        const el = userLayer.querySelector('[data-id="' + cssE(dragId) + '"]');
        if (el) {
            el.style.left = u.x + '%';
            el.style.top = u.y + '%';
        }
    }
    function onMouseUp() {
        if (!dragId) return;
        const el = userLayer.querySelector('[data-id="' + cssE(dragId) + '"]');
        if (el) el.classList.remove('is-dragging');
        dragId = null;
    }
    stage.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    d.userRegions.forEach(function (u, i) {
        const el = document.createElement('div');
        el.className = 'hs-region hs-user hs-user-region' + (u.shape === 'circle' ? ' is-circle' : '');
        el.dataset.id = u.id;
        el.style.left = u.x + '%';
        el.style.top = u.y + '%';
        el.style.width = u.w + '%';
        el.style.height = (u.shape === 'circle' ? u.w * aspect : u.h) + '%';
        el.style.animationDelay = (i * 0.08) + 's';
        el.textContent = u.label || 'Vùng ' + (i + 1);
        userLayer.appendChild(el);
    });

    const checkBtn = htmlToElement(
        '<button type="button" class="btn btn-primary" style="align-self:flex-start;margin-top:6px">Kiểm tra đáp án</button>'
    );
    checkBtn.addEventListener('click', function () {
        if (checkBtn.dataset.locked === 'true') return;
        checkBtn.dataset.locked = 'true';

        const results = [];
        const aspectNow = stageAspectRatio();
        for (let i = 0; i < d.regions.length; i++) {
            const u = d.userRegions[i] || {};
            const a = d.regions[i] || {};
            const userShape = canonicalRegion(u, aspectNow);
            const answerShape = canonicalRegion(a, aspectNow);
            const intersection = intersectionArea(userShape, answerShape);
            const smallerArea = Math.min(shapeArea(userShape), shapeArea(answerShape));
            const ov = smallerArea > 0 ? intersection / smallerArea * 100 : 0;
            const ok = ov >= d.matchThreshold;
            results.push({ idx: i, overlap: ov, correct: ok });
            if (intersection > 0) {
                const mask = document.createElement('div');
                mask.className = 'hs-overlap-mask' + (a.shape === 'circle' ? ' is-circle' : '');
                mask.style.left = a.x + '%';
                mask.style.top = a.y + '%';
                mask.style.width = a.w + '%';
                mask.style.height = (a.shape === 'circle' ? a.w * aspectNow : a.h) + '%';
                const overlap = document.createElement('div');
                overlap.className = 'hs-overlap hs-overlap-shape' + (u.shape === 'circle' ? ' is-circle' : '');
                overlap.style.left = ((u.x - a.x) / a.w * 100) + '%';
                overlap.style.top = ((u.y - a.y) / (a.shape === 'circle' ? a.w * aspectNow : a.h) * 100) + '%';
                overlap.style.width = (u.w / a.w * 100) + '%';
                overlap.style.height = ((u.shape === 'circle' ? u.w * aspectNow : u.h)
                    / (a.shape === 'circle' ? a.w * aspectNow : a.h) * 100) + '%';
                mask.appendChild(overlap);
                overlapLayer.appendChild(mask);
            }
        }
        answerLayer.style.opacity = '1';
        userLayer.querySelectorAll('.hs-region').forEach(function (el) {
            el.dataset.locked = 'true';
            el.classList.add('is-locked');
        });
        const allCorrect = results.length > 0 && results.every(function (r) { return r.correct; });
        applyQuestionResult(block, index, allCorrect, checkBtn);
    });

    wrap.appendChild(stage);
    wrap.appendChild(htmlToElement(
        '<div class="hotspot-hint">💡 Kéo các vùng màu đỏ đến vị trí bạn chọn, sau đó bấm kiểm tra.</div>'
    ));
    const container = htmlToElement('<div></div>');
    container.appendChild(wrap);
    container.appendChild(checkBtn);
    return container;
}
