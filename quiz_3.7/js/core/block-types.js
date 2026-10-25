/* ============================================================================
 *  MODULE: js/core/block-types.js — DANH MỤC 6 LOẠI KHỐI CÂU HỎI
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - Định nghĩa "khuôn mẫu" (schema) cho 6 loại câu hỏi.
 *    - Mỗi loại: nhãn (label), biểu tượng (icon), hàm create() sinh data mặc định.
 *  Cấu trúc một khối trong workspace:
 *      { id, type, x, y, data, el }
 *      - data: dữ liệu câu hỏi (question, options/pairs/items/... , score, note)
 *      - data.program: chương trình khối lệnh (xem js/coding/coding-engine.js)
 *  Ghi chú cho AI khi thêm loại câu hỏi mới:
 *    (1) thêm khoá vào BLOCK_TYPES dưới đây;
 *    (2) thêm .block-item[data-type] trong index.html;
 *    (3) bổ sung case trong renderBlock()            (js/ui/render.js);
 *    (4) bổ sung case trong buildTypeSpecificForm()  (js/ui/editor.js);
 *    (5) bổ sung case trong collectEditorData()      (js/ui/editor.js);
 *    (6) bổ sung case trong buildAnswerArea()        (js/player/player.js).
 * ========================================================================== */


/* ------------------------------------------------------------
 *  1. KHAI BÁO CHUNG
 * ------------------------------------------------------------ */

/**
 * Trả về bộ thuộc tính mặc định dùng chung cho mọi loại câu hỏi.
 * @returns {Object} đối tượng thuộc tính mặc định (mới, không dùng chung tham chiếu)
 */
function baseDefaults() {
    return {
        question: '',        // Nội dung câu hỏi
        timeLimit: 30,       // Thời gian làm bài (giây), 0 = không giới hạn
        score: 1000,         // Điểm thưởng khi trả lời đúng (bản 2.2: mặc định 1000)
        noteEnabled: false,  // Có hiển thị ghi chú/hướng dẫn không
        note: '',            // Nội dung ghi chú

        /* --------------------------------------------------------------------
         * ẢNH CỦA CÂU HỎI (bản 2.2)
         *   imageUrl     : URL ảnh HOẶC data URL (khi tải file từ máy)
         *   imageFit     : 'contain' (vừa khung) | 'cover' (phủ kín khung)
         *   imageAlt     : mô tả ảnh (trợ năng)
         *   imageScale   : % kích thước khung ảnh (người tạo quiz đặt sẵn,
         *                  người chơi có thể kéo lề để đổi trong lúc chơi)
         *   imageOffsetX/Y : % dịch ảnh trong khung
         * Với câu hỏi "chọn vùng trên ảnh" (hotspot) thì imageUrl là ảnh nền
         * cho các vùng bấm — vẫn dùng chung trường này.
         * ------------------------------------------------------------------ */
        imageUrl: '',
        imageFit: 'contain',
        imageAlt: '',
        imageScale: 100,
        imageOffsetX: 0,
        imageOffsetY: 0,

        /* --------------------------------------------------------------------
         * Chương trình khối lệnh gắn với câu hỏi (bản 2.0).
         *   vars   : danh sách tên biến người dùng khai báo
         *   stacks : 3 "chồng lệnh" giống Scratch
         *            - setup   : chạy khi bắt đầu câu hỏi (random hoá dữ liệu)
         *            - correct : chạy khi trả lời đúng (công thức tính điểm)
         *            - wrong   : chạy khi trả lời sai (có thể đặt lời nhắn)
         * Mặc định để trống => hành vi y hệt phiên bản 1.0.
         * ------------------------------------------------------------------ */
        program: {
            vars: [],
            stacks: { setup: [], correct: [], wrong: [] }
        }
    };
}


/**
 * Danh mục các loại khối câu hỏi.
 * Mỗi loại có: nhãn hiển thị, biểu tượng và hàm tạo dữ liệu mặc định.
 *
 * BẢN 2.1 — HỢP NHẤT LOẠI CÂU HỎI TRẮC NGHIỆM:
 *   Trước đây có 2 loại ('multiple-choice' chọn 1 đáp án và 'multi-answer' chọn
 *   nhiều đáp án). Nay chỉ còn MỘT loại duy nhất là 'multiple-choice'; chế độ
 *   chọn 1 hay chọn nhiều được TỰ ĐỘNG nhận diện theo số đáp án đúng:
 *       - 1 đáp án đúng  -> người chơi chỉ chọn được 1 (hiện ký hiệu A, B, C...)
 *       - >= 2 đáp án đúng -> người chơi chọn nhiều (hiện ô tích ✓)
 *   Khoá 'multi-answer' vẫn được giữ như một BÍ DANH ẨN (hidden: true) để mở
 *   được các dự án JSON cũ; xem migrateLegacyBlock() bên dưới.
 */
const BLOCK_TYPES = {

    /* --- 1. Trắc nghiệm: 1 hoặc nhiều đáp án đúng (tự nhận diện) --- */
    'multiple-choice': {
        label: 'Trắc nghiệm (1 hoặc nhiều đáp án)',
        icon: '📝',
        create() {
            return Object.assign(baseDefaults(), {
                question: 'Câu hỏi trắc nghiệm mẫu?',
                options: [
                    { text: 'Đáp án A', correct: true },
                    { text: 'Đáp án B', correct: false },
                    { text: 'Đáp án C', correct: false },
                    { text: 'Đáp án D', correct: false }
                ],
                shuffleOptions: false
            });
        }
    },

    /* --- BÍ DANH ẨN của loại trắc nghiệm (tương thích dự án cũ) --- */
    'multi-answer': {
        label: 'Trắc nghiệm (nhiều đáp án) — đã gộp vào Trắc nghiệm',
        icon: '📝',
        hidden: true,
        create() {
            return BLOCK_TYPES['multiple-choice'].create();
        }
    },

    /* --- 2. Sắp xếp thứ tự --- */
    'ordering': {
        label: 'Sắp xếp thứ tự',
        icon: '🔢',
        create() {
            return Object.assign(baseDefaults(), {
                question: 'Sắp xếp các sự kiện theo đúng thứ tự diễn ra',
                // Mảng "items" được lưu theo đúng thứ tự cần sắp xếp
                items: ['Sự kiện thứ nhất', 'Sự kiện thứ hai', 'Sự kiện thứ ba']
            });
        }
    },

    /* --- 4. Nối ô (Matching) — bản 2.3 --- */
    'matching': {
        label: 'Nối ô (Matching)',
        icon: '🔗',
        create() {
            return Object.assign(baseDefaults(), {
                question: 'Hãy nối mỗi ô khái niệm (trái) với một hoặc nhiều ô giải thích (phải)',
                /**
                 * Schema mới (bản 2.3):
                 *   pairs[]          = { id, concept, explanations: [...] }
                 *   explanationsAll  = danh sách phẳng tất cả giải thích (dựng cột phải)
                 *   answers          = DANH SÁCH MẢNG các cặp nối (runtime)  ← bản 2.5
                 *                      mỗi phần tử là [idKháiNiệm, nộiDungGiảiThích]
                 *                      ⇒ quan hệ nhiều-nhiều: một khái niệm nối được
                 *                        nhiều giải thích và ngược lại
                 *   userAnswers      = bản gốc dạng object; legacy alias
                 */
                pairs: [
                    { id: 'p1', concept: 'Khái niệm 1', explanations: ['Giải thích A'] },
                    { id: 'p2', concept: 'Khái niệm 2', explanations: ['Giải thích B', 'Giải thích C'] }
                ],
                explanationsAll: ['Giải thích A', 'Giải thích B', 'Giải thích C', 'Giải thích D'],
                answers: [],
                userAnswers: {}
            });
        }
    },

    /* --- 5. Chọn vùng trên ảnh (Hotspot) — bản 2.3 --- */
    'hotspot': {
        label: 'Chọn vùng trên ảnh',
        icon: '🖼️',
        create() {
            return Object.assign(baseDefaults(), {
                question: 'Hãy chọn vùng được yêu cầu trên hình',
                imageUrl: '',
                /**
                 * Schema mới (bản 2.3):
                 *   regions[] = { id, label, x, y, w, h, correct }
                 *     - x, y, w, h là % so với ảnh thực; co giãn theo kích thước ảnh hiển thị.
                 *   matchThreshold  : % trùng khớp tối thiểu (mặc định 50%).
                 *   userRegions[]   : [{ id, x, y, w, h }] — vị trí người chơi (runtime).
                 *
                 * Trường cũ (label, ..., correct) vẫn được normalize() giữ nguyên.
                 */
                regions: [
                            { id: 'r1', label: 'Vùng 1', x: 10, y: 15, w: 25, h: 25, shape: 'rectangle', correct: true },
                            { id: 'r2', label: 'Vùng 2', x: 55, y: 55, w: 30, h: 30, shape: 'rectangle', correct: true }
                ],
                matchThreshold: 50,
                userRegions: []
            });
        }
    },

    /* --- 6. Điền từ vào đoạn văn (Cloze) — bản 2.3 --- */
    'cloze': {
        label: 'Điền từ vào đoạn văn',
        icon: '✍️',
        create() {
            return Object.assign(baseDefaults(), {
                question: 'Điền từ còn thiếu vào chỗ trống',
                paragraph: 'Hà Nội là thủ đô của {{1}}, nằm ở miền {{2}}.',
                /**
                 * Schema mới (bản 2.3):
                 *   blanks[] = { id, answers: [chuỗi-đáp-án-đúng-có-thể-nhiều-cái], user }
                 * Nếu answers.length > 1  -> khi sai sẽ hiện dải vàng #FEF3C7
                 *                              liệt kê tất cả đáp án đúng.
                 * Nếu answers.length === 1 -> chỉ hiển thị text đáp án.
                 */
                blanks: [
                    { id: 'b1', answers: ['Việt Nam', 'VN'], user: '' },
                    { id: 'b2', answers: ['miền Bắc'], user: '' }
                ]
            });
        }
    },

    /* --- 7. Chọn từ trong danh sách (Dropdown cloze) — bản 2.3 --- */
    'dropdown': {
        label: 'Chọn từ trong danh sách',
        icon: '🔽',
        create() {
            return Object.assign(baseDefaults(), {
                question: 'Chọn từ phù hợp để hoàn thành câu',
                /**
                 * Schema mới (bản 2.3) — ưu tiên `blanks`:
                 *   paragraph có {{1}}, {{2}}, ...
                 *   blanks[] = { id, options: [...chuỗi lựa chọn riêng], correct }
                 * Mỗi ô có danh sách lựa chọn riêng + đáp án đúng riêng.
                 *
                 * Trường `options`/`answers` cũ vẫn được normalize() tự sinh `blanks`.
                 */
                paragraph: 'Nước Việt Nam {{1}} nằm ở khu vực {{2}}.',
                blanks: [
                    { id: 'd1', options: ['Đông Nam Á', 'Đông Á', 'Châu Âu'], correct: 'Đông Nam Á' },
                    { id: 'd2', options: ['Châu Á', 'Châu Âu', 'Châu Phi'], correct: 'Châu Á' }
                ]
            });
        }
    }
};

/* ============================================================================
 *  TIỆN ÍCH DÙNG CHUNG CHO LOẠI CÂU HỎI TRẮC NGHIỆM (bản 2.1)
 * ========================================================================== */

/**
 * Đếm số đáp án được đánh dấu là đúng.
 * @param {Object} data - block.data của câu hỏi trắc nghiệm
 * @returns {number} số đáp án đúng
 */
function countCorrectOptions(data) {
    if (!data || !Array.isArray(data.options)) return 0;
    return data.options.filter(function (o) { return o && o.correct; }).length;
}

/**
 * Tự động nhận diện câu hỏi trắc nghiệm là dạng CHỌN NHIỀU hay CHỌN MỘT.
 * Quy tắc: từ 2 đáp án đúng trở lên => chọn nhiều.
 *
 * @param {Object} data - block.data của câu hỏi trắc nghiệm
 * @returns {boolean} true nếu người chơi được chọn nhiều đáp án
 */
function isMultiAnswerQuestion(data) {
    return countCorrectOptions(data) > 1;
}

/**
 * Nâng cấp (migrate) một mục khối trong dự án JSON cũ sang cấu trúc mới.
 *
 * Lịch sử:
 *   - Bản 2.1:  gộp 'multi-answer' vào 'multiple-choice'.
 *   - Bản 2.3:  matching/cloze/dropdown/hotspot dùng schema mới (1-n matching,
 *               multi-answer cloze, dropdown riêng/ô, hotspot tương tác).
 *
 * @param {Object} item - mục khối đọc từ JSON ({type, x, y, data})
 * @returns {Object} mục khối đã nâng cấp (giữ nguyên nếu không cần đổi)
 */
function migrateLegacyBlock(item) {
    if (!item || typeof item !== 'object') return item;

    // 2.1: gộp 'multi-answer' vào 'multiple-choice'
    if (item.type === 'multi-answer') {
        item.type = 'multiple-choice';
    }

    // Chuẩn hoá dữ liệu để tương thích với schema hiện hành.
    if (item.data && typeof item.data === 'object') {
        normalizeBlockData(item.data, item.type);
    }

    return item;
}

/* ============================================================================
 *  BẢN 2.3: CHUẨN HOÁ (NORMALIZE) DỮ LIỆU CÂU HỎI TƯƠNG TÁC
 *  ============================================================================
 *  Mục đích: khi mở dự án JSON cũ hoặc tạo khối mới, đảm bảo dữ liệu câu hỏi
 *  tương thích schema hiện hành mà không làm mất dữ liệu cũ.
 *
 *  Đặc điểm:
 *    - KHÔNG phá schema mới (chỉ bổ sung trường còn thiếu).
 *    - Idempotent: gọi 2 lần vẫn an toàn.
 *    - Làm việc với tham chiếu (không clone) để gọn.
 * ========================================================================== */

/**
 * Chuẩn hoá dữ liệu 1 khối câu hỏi theo type.
 * @param {Object} data - block.data
 * @param {string} type - block.type
 */
function normalizeBlockData(data, type) {
    if (!data || typeof data !== 'object') return;
    switch (type) {
        case 'multiple-choice':
        case 'multi-answer': normalizeMultipleChoice(data); break;
        case 'matching':   normalizeMatching(data);   break;
        case 'cloze':      normalizeCloze(data);      break;
        case 'dropdown':   normalizeDropdown(data);   break;
        case 'hotspot':    normalizeHotspot(data);    break;
    }
}

function normalizeMultipleChoice(data) {
    if (typeof data.shuffleOptions !== 'boolean') data.shuffleOptions = false;
}

/**
 * Matching: chuyển pairs cũ `{left, right}` (1-1) sang schema mới
 * `{id, concept, explanations: [right]}` (1-n).
 *
 * Không phá schema mới: thêm `answers`, `userAnswers`, `explanationsAll`.
 *
 * Bản 2.5 — quan hệ nhiều-nhiều: `answers` được chuẩn hoá thành DANH SÁCH
 * MẢNG các cặp nối `[idKháiNiệm, nộiDungGiảiThích]`:
 *
 *      answers: [['c1', 'Giải thích A'], ['c1', 'Giải thích B'],
 *                ['c2', 'Giải thích A']]
 *
 * Nhờ vậy một khái niệm nối được nhiều giải thích và một giải thích cũng
 * nối được nhiều khái niệm. Định dạng cũ `{id: [giải thích, ...]}` vẫn được
 * đọc và tự chuyển sang định dạng mới.
 *
 * @param {Object} data - block.data của loại matching
 */
function normalizeMatching(data) {
    if (!Array.isArray(data.pairs)) data.pairs = [];

    const usedIds = Object.create(null);

    data.pairs.forEach(function (pair, i) {
        if (!pair.id || usedIds[pair.id]) {
            /* id phải DUY NHẤT: Player dùng id làm khoá của cặp nối,
               trùng id ⇒ các khái niệm bị gộp làm một và không nối được. */
            let candidate = 'p' + (i + 1) + '-' + Date.now().toString(36);
            let n = 1;
            while (usedIds[candidate]) {
                candidate = 'p' + (i + 1) + '-' + Date.now().toString(36) + '-' + n;
                n += 1;
            }
            pair.id = candidate;
        }
        usedIds[pair.id] = true;

        // 1. Schema cũ { left, right } → mới { concept, explanations: [right] }.
        //    Vẫn giữ left/right để tương thích code còn dùng.
        if (pair.left !== undefined || pair.right !== undefined) {
            if (!pair.concept) pair.concept = pair.left || '';
            if (!Array.isArray(pair.explanations)) {
                pair.explanations = pair.right ? [pair.right] : [];
            }
            pair.left  = pair.concept;
            pair.right = pair.explanations[0] || '';
        }
        if (!pair.concept) pair.concept = '';
        if (!Array.isArray(pair.explanations)) pair.explanations = [];
    });

    // 2. explanationsAll = danh sách phẳng, không trùng lặp, BAO GỒM mọi
    //    giải thích đang gắn với một khái niệm (thiếu thì cột phải thiếu ô
    //    ⇒ không vẽ được đường nối cho cặp đó).
    const collected = [];
    const seen = Object.create(null);
    const pushText = function (text) {
        if (typeof text !== 'string' || !text) return;
        if (seen[text]) return;
        seen[text] = true;
        collected.push(text);
    };
    (Array.isArray(data.explanationsAll) ? data.explanationsAll : []).forEach(pushText);
    data.pairs.forEach(function (p) {
        (p.explanations || []).forEach(pushText);
    });
    data.explanationsAll = collected;

    // 3. answers = DANH SÁCH MẢNG các cặp nối [idKháiNiệm, giảiThích].
    //    Bản 2.5: định dạng chuẩn là danh sách mảng ⇒ quan hệ nhiều-nhiều.
    //    Định dạng cũ { idKháiNiệm: [giải thích, ...] } được chuyển sang.
    data.answers = matchingNormalizeLinks(data.answers);

    // 4. userAnswers = bản gốc dạng object của answers (legacy alias).
    const legacy = {};
    data.answers.forEach(function (pair) {
        if (!legacy[pair[0]]) legacy[pair[0]] = [];
        legacy[pair[0]].push(pair[1]);
    });
    data.userAnswers = legacy;
}

/**
 * Cloze: chuyển `blanks[i].answer` cũ → `blanks[i].answers: [answer]`.
 * @param {Object} data - block.data của loại cloze
 */
function normalizeCloze(data) {
    if (!Array.isArray(data.blanks)) data.blanks = [];
    if (typeof data.paragraph !== 'string') data.paragraph = '';

    data.blanks.forEach(function (blank, i) {
        if (!blank.id) blank.id = 'b' + (i + 1) + '-' + Date.now().toString(36);

        if (blank.answer !== undefined && !Array.isArray(blank.answers)) {
            blank.answers = blank.answer ? [blank.answer] : [];
        }
        if (!Array.isArray(blank.answers)) blank.answers = [];
        if (blank.user === undefined) blank.user = '';
    });

    syncBlanksWithParagraph(data);
}

/**
 * Tạo thêm blank nếu paragraph có nhiều `{{N}}` hơn blanks.length.
 * @param {Object} data - block.data (cloze hoặc dropdown)
 */
function syncBlanksWithParagraph(data) {
    const para = data.paragraph || '';
    const matches = para.match(/\{\{(\d+)\}\}/g) || [];
    if (matches.length === 0) return;

    const max = matches.reduce(function (m, s) {
        const n = parseInt(s.replace(/[{}]/g, ''), 10) || 0;
        return Math.max(m, n);
    }, 0);

    while (data.blanks.length < max) {
        data.blanks.push({
            id: 'b' + (data.blanks.length + 1) + '-' + Date.now().toString(36),
            answers: [],
            user: ''
        });
    }
}

/**
 * Dropdown: nếu project cũ chỉ có `options` (danh sách chung) + `answers`,
 * tự sinh `blanks` để mỗi ô có danh sách lựa chọn riêng + đáp án đúng riêng.
 *
 * @param {Object} data - block.data của loại dropdown
 */
function normalizeDropdown(data) {
    if (typeof data.paragraph !== 'string' || !data.paragraph) {
        data.paragraph = typeof data.question === 'string' ? data.question : '';
    }

    // Trường `options` cũ là danh sách dùng chung → giữ lại làm fallback.
    if (!Array.isArray(data.options)) data.options = [];

    // Trường tạm do form cũ (optionsText dạng textarea) để lại
    if (typeof data.optionsText === 'string') {
        const arr = data.optionsText.split('\n')
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
        if (arr.length) data.options = arr;
        delete data.optionsText;
    }

    if (!Array.isArray(data.blanks)) data.blanks = [];

    // Nếu chưa có blanks mà có options+answers -> sinh blanks từ options+answers
    if (data.blanks.length === 0
        && data.options.length > 0
        && Array.isArray(data.answers) && data.answers.length > 0) {
        data.answers.forEach(function (a, i) {
            data.blanks.push({
                id: 'd' + (i + 1) + '-' + Date.now().toString(36),
                options: data.options.slice(),
                correct: a
            });
        });
    }

    data.blanks.forEach(function (blank, i) {
        if (!blank.id) blank.id = 'd' + (i + 1) + '-' + Date.now().toString(36);
        if (!Array.isArray(blank.options)) blank.options = data.options.slice();
        if (typeof blank.correct !== 'string') blank.correct = '';
    });

    syncBlanksWithParagraph(data);
}

/**
 * Hotspot: bổ sung id cho từng region, thêm `matchThreshold` và `userRegions`
 * nếu thiếu. Đảm bảo region có đủ trường x/y/w/h.
 *
 * @param {Object} data - block.data của loại hotspot
 */
function normalizeHotspot(data) {
    if (typeof data.imageUrl !== 'string') data.imageUrl = '';
    if (typeof data.imageFit !== 'string') data.imageFit = 'contain';
    if (typeof data.matchThreshold !== 'number'
        || data.matchThreshold < 0 || data.matchThreshold > 100) {
        data.matchThreshold = 50;
    }
    if (!Array.isArray(data.regions)) data.regions = [];
    if (!Array.isArray(data.userRegions)) data.userRegions = [];

    data.regions.forEach(function (r, i) {
        if (!r.id) r.id = 'r' + (i + 1) + '-' + Date.now().toString(36);
        if (typeof r.label !== 'string') r.label = 'Vùng ' + (i + 1);
        r.x = clampNumber(r.x, 0, 100, 10);
        r.y = clampNumber(r.y, 0, 100, 10);
        r.w = clampNumber(r.w, 1, 100, 25);
        r.h = clampNumber(r.h, 1, 100, 25);
        if (r.shape !== 'circle') r.shape = 'rectangle';
        if (typeof r.correct !== 'boolean') r.correct = true;
    });
}

/**
 * Kẹp 1 số về [min, max]; nếu không phải số hợp lệ thì trả về `fallback`.
 * @param {*} v
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampNumber(v, min, max, fallback) {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}
