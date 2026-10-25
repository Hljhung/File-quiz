/* ============================================================================
 *  MODULE: js/coding/coding-engine.js — MÔ HÌNH & TRÌNH THÔNG DỊCH KHỐI LỆNH
 *  ============================================================================
 *  Đây là "phần não" của hệ thống lập trình khối kiểu Scratch. File này KHÔNG
 *  dựng giao diện (giao diện nằm ở js/coding/coding-ui.js); nó chịu trách nhiệm:
 *
 *    1. Định nghĩa DANH MỤC KHỐI (BLOCKS) và các nhóm màu (CATEGORIES).
 *    2. Quản lý MÔ HÌNH DỮ LIỆU của một chương trình:
 *         data.program = {
 *             vars:   ['a', 'b'],                 // biến người dùng khai báo
 *             stacks: { setup: [...], correct: [...], wrong: [...] }
 *         }
 *       Mỗi phần tử trong stacks là một NODE:
 *         { id: 'cb-1', t: 'set_var',
 *           slots: { name: {id, t:'varname', v:'a'}, value: {id, t:'num', v:5} },
 *           body: [], body2: [] }
 *       - t     : loại khối (khoá của BLOCKS)
 *       - slots : các "ổ" nhập; mỗi ổ chứa một node LITERAL hoặc một REPORTER
 *       - body  : các khối con (chỉ khối hình chữ C: if / if_else / repeat)
 *       - body2 : nhánh "không thì" của if_else
 *    3. TRÌNH THÔNG DỊCH: chạy 3 chồng lệnh trên để random hoá dữ liệu, đổi nội
 *       dung câu hỏi/ghi chú và tính điểm.
 *
 *  BA CHỒNG LỆNH (giống 3 "script" trong Scratch):
 *    - setup   : chạy NGAY khi bắt đầu câu hỏi  -> random hoá số liệu.
 *    - correct : chạy khi người chơi trả lời ĐÚNG -> công thức tính điểm.
 *    - wrong   : chạy khi trả lời SAI -> có thể đặt lời nhắn/gợi ý.
 *
 *  CÁCH DÙNG TRONG CODE KHÁC:
 *      QuizCoding.ensureProgram(block.data)              // tạo/chuẩn hoá
 *      const runtime = QuizCoding.prepareRuntimeBlock(block, {totalScore: 0});
 *      const diem    = QuizCoding.award(runtime, {timeLeft: 12.4, totalScore: 30});
 *      QuizCoding.runPreview(block)                      // nút "Chạy thử"
 *
 *  BIẾN HỆ THỐNG (bản 2.1) — luôn có sẵn trong mọi ngữ cảnh chạy:
 *      'Thời gian' : số giây còn lại lúc người chơi nộp bài (cập nhật liên tục
 *                    trong lúc làm bài để nhãn điểm động thay đổi theo).
 *      'Điểm'      : tổng điểm người chơi đang có TRƯỚC câu hiện tại.
 *    Hai biến này chỉ đọc (lệnh "đặt biến" vào chúng sẽ bị bỏ qua) và có thể
 *    kéo lắp vào công thức tính điểm qua khối ⏱️ / ⭐ trong nhóm "Trò chơi".
 * ========================================================================== */

(function (global) {
    'use strict';

    /* ========================================================================
     *  1. DANH MỤC NHÓM KHỐI (màu giống Scratch)
     * ====================================================================== */
    const CATEGORIES = [
        { id: 'var',   label: 'Biến',      icon: '📦', color: '#ff8c1a' },
        { id: 'math',  label: 'Toán',      icon: '🧮', color: '#59c059' },
        { id: 'logic', label: 'Điều kiện', icon: '🔀', color: '#ffab19' },
        { id: 'text',  label: 'Chuỗi',     icon: '🔤', color: '#ff6680' },
        { id: 'quiz',  label: 'Câu hỏi',   icon: '❓', color: '#4c97ff' },
        { id: 'game',  label: 'Trò chơi',  icon: '🎮', color: '#0fbd8c' }
    ];

    /* ------------------------------------------------------------------------
     *  BIẾN HỆ THỐNG (bản 2.1) — luôn tồn tại, người dùng KHÔNG xoá được
     * ------------------------------------------------------------------------
     *  - 'Thời gian' : số giây còn lại tính từ lúc bắt đầu câu hỏi đến lúc
     *                  người chơi bấm nút "Nộp bài". Khi đang làm bài, biến này
     *                  được cập nhật liên tục nên công thức điểm có thể dùng nó
     *                  để thưởng điểm nhanh tay.
     *  - 'Điểm'      : TỔNG điểm người chơi đang có TRƯỚC khi tính câu hiện tại
     *                  (dùng cho công thức thưởng theo chuỗi điểm).
     *
     *  Hai biến này được nạp sẵn vào mọi ngữ cảnh chạy (createContext) và có
     *  thể dùng ở cả 3 chương trình (setup / correct / wrong).
     * ---------------------------------------------------------------------- */
    const TIME_VAR = 'Thời gian';
    const SCORE_VAR = 'Điểm';

    const SYSTEM_VARS = [
        { name: TIME_VAR,  icon: '⏱️', desc: 'Số giây còn lại lúc nộp bài' },
        { name: SCORE_VAR, icon: '⭐', desc: 'Tổng điểm hiện có của người chơi' }
    ];
    const SYSTEM_VAR_NAMES = SYSTEM_VARS.map(function (v) { return v.name; });

    /* Số bước thực thi tối đa: chống treo trình duyệt nếu lỡ tạo vòng lặp vô hạn. */
    const MAX_STEPS = 20000;

    /** Danh sách toán tử số học cho ổ kiểu 'op' */
    const MATH_OPS = ['+', '-', '×', '÷', 'mod'];
    /** Danh sách phép so sánh cho ổ kiểu 'cmp' */
    const CMP_OPS = ['=', '≠', '>', '<', '≥', '≤'];
    /** Danh sách phép logic cho ổ kiểu 'logic' */
    const LOGIC_OPS = ['và', 'hoặc'];


    /* ========================================================================
     *  2. ĐỊNH NGHĨA TỪNG KHỐI
     *  ----------------------------------------------------------------------
     *  shape:
     *    'stack'    : khối lệnh thường (xếp dọc)
     *    'c'        : khối hình chữ C có thân (if, repeat)
     *    'c2'       : khối chữ C có 2 nhánh (if ... else)
     *    'reporter' : khối tròn trả về GIÁ TRỊ (số hoặc chuỗi)
     *    'boolean'  : khối trả về ĐÚNG/SAI (dùng cho điều kiện)
     *  label: chuỗi có các "ổ" dạng [tenO]
     *  slots: mô tả từng ổ
     *    kind: 'num' | 'txt' | 'any' | 'var' | 'op' | 'cmp' | 'logic'
     *    def : giá trị mặc định
     * ====================================================================== */
    const BLOCKS = {

        /* ------------------------- NHÓM BIẾN ------------------------------ */
        set_var: {
            cat: 'var', shape: 'stack', label: 'đặt [name] = [value]',
            slots: { name: { kind: 'var', def: 'a' }, value: { kind: 'any', def: '0' } }
        },
        change_var: {
            cat: 'var', shape: 'stack', label: 'thay đổi [name] thêm [value]',
            slots: { name: { kind: 'var', def: 'a' }, value: { kind: 'any', def: '1' } }
        },
        var_ref: {
            cat: 'var', shape: 'reporter', label: 'giá trị [name]',
            slots: { name: { kind: 'var', def: 'a' } }
        },

        /* ------------------------- NHÓM TOÁN ------------------------------ */
        random: {
            cat: 'math', shape: 'reporter', label: 'số ngẫu nhiên [min] đến [max]',
            slots: { min: { kind: 'num', def: 1 }, max: { kind: 'num', def: 10 } }
        },
        math_op: {
            cat: 'math', shape: 'reporter', label: '[a] [op] [b]',
            slots: { a: { kind: 'num', def: 1 }, op: { kind: 'op', def: '+' }, b: { kind: 'num', def: 1 } }
        },
        round: {
            cat: 'math', shape: 'reporter', label: 'làm tròn [a]',
            slots: { a: { kind: 'num', def: 0 } }
        },
        abs_value: {
            cat: 'math', shape: 'reporter', label: 'giá trị tuyệt đối [a]',
            slots: { a: { kind: 'num', def: 0 } }
        },
        pick: {
            cat: 'math', shape: 'reporter', label: 'chọn ngẫu nhiên trong [list]',
            slots: { list: { kind: 'txt', def: '10, 20, 30' } }
        },

        /* ---------------------- NHÓM ĐIỀU KIỆN ---------------------------- */
        compare: {
            cat: 'logic', shape: 'boolean', label: '[a] [cmp] [b]',
            slots: { a: { kind: 'any', def: '0' }, cmp: { kind: 'cmp', def: '>' }, b: { kind: 'any', def: '0' } }
        },
        logic_op: {
            cat: 'logic', shape: 'boolean', label: '[a] [op] [b]',
            slots: { a: { kind: 'any', def: '1' }, op: { kind: 'logic', def: 'và' }, b: { kind: 'any', def: '1' } }
        },
        if_block: {
            cat: 'logic', shape: 'c', label: 'nếu [cond] thì',
            slots: { cond: { kind: 'any', def: '1' } }, body: true
        },
        if_else_block: {
            cat: 'logic', shape: 'c2', label: 'nếu [cond] thì',
            slots: { cond: { kind: 'any', def: '1' } }, body: true, body2: true
        },
        repeat_block: {
            cat: 'logic', shape: 'c', label: 'lặp [times] lần',
            slots: { times: { kind: 'num', def: 3 } }, body: true
        },

        /* ------------------------ NHÓM CÂU HỎI ---------------------------- */
        set_question: {
            cat: 'quiz', shape: 'stack', label: 'đặt nội dung câu hỏi = [value]',
            slots: { value: { kind: 'txt', def: '' } }
        },
        set_note: {
            cat: 'quiz', shape: 'stack', label: 'đặt ghi chú = [value]',
            slots: { value: { kind: 'txt', def: '' } }
        },
        set_feedback: {
            cat: 'quiz', shape: 'stack', label: 'đặt lời nhắn = [value]',
            slots: { value: { kind: 'txt', def: '' } }
        },
        add_score: {
            cat: 'quiz', shape: 'stack', label: 'cộng [value] điểm',
            slots: { value: { kind: 'any', def: '1' } }
        },
        set_score: {
            cat: 'quiz', shape: 'stack', label: 'đặt điểm = [value]',
            slots: { value: { kind: 'any', def: '1000' } }
        },

        /* ------------------------ NHÓM TRÒ CHƠI --------------------------- */
        /* Hai khối "đọc" biến hệ thống, giúp kéo lắp trực tiếp vào công thức
           tính điểm mà không cần mở hộp chọn biến. */
        sys_time: {
            cat: 'game', shape: 'reporter', label: '⏱️ thời gian còn lại',
            slots: {}
        },
        sys_score: {
            cat: 'game', shape: 'reporter', label: '⭐ điểm hiện tại',
            slots: {}
        },

        /* ------------------------- NHÓM CHUỖI ----------------------------- */
        join: {
            cat: 'text', shape: 'reporter', label: 'ghép [a] và [b]',
            slots: { a: { kind: 'any', def: '' }, b: { kind: 'any', def: '' } }
        },
        letter_count: {
            cat: 'text', shape: 'reporter', label: 'độ dài của [a]',
            slots: { a: { kind: 'any', def: '' } }
        }
    };

    /* ========================================================================
     *  3. MÔ HÌNH DỮ LIỆU: TẠO / CHUẨN HOÁ CHƯƠNG TRÌNH
     * ====================================================================== */

    /**
     * Tạo một chương trình rỗng (3 chồng lệnh trống, không có biến).
     * @returns {{vars: string[], stacks: Object}}
     */
    function createProgram() {
        return {
            vars: [],
            stacks: { setup: [], correct: [], wrong: [] }
        };
    }

    /**
     * Tạo một node LITERAL (giá trị hằng) cho một ổ nhập.
     * @param {Object} slotDef - định nghĩa ổ (có kind + def)
     * @returns {Object} node literal
     */
    function makeLiteral(slotDef) {
        const kind = slotDef.kind;
        const def = slotDef.def;

        if (kind === 'var')   return { id: uid('lit'), t: 'varname', v: def || 'a' };
        if (kind === 'op')    return { id: uid('lit'), t: 'op', v: def || '+' };
        if (kind === 'cmp')   return { id: uid('lit'), t: 'cmp', v: def || '=' };
        if (kind === 'logic') return { id: uid('lit'), t: 'logicop', v: def || 'và' };
        if (kind === 'num')   return { id: uid('lit'), t: 'num', v: def === undefined ? 0 : def };
        return { id: uid('lit'), t: 'txt', v: def === undefined ? '' : def };
    }

    /**
     * Tạo một node KHỐI LỆNH mới (kèm giá trị mặc định cho mọi ổ).
     * @param {string} type - khoá trong BLOCKS
     * @returns {Object|null} node mới
     */
    function createNode(type) {
        const def = BLOCKS[type];
        if (!def) return null;

        const node = { id: uid('cb'), t: type, slots: {} };
        Object.keys(def.slots || {}).forEach(function (name) {
            node.slots[name] = makeLiteral(def.slots[name]);
        });
        if (def.body)  node.body = [];
        if (def.body2) node.body2 = [];
        return node;
    }

    /**
     * Chuẩn hoá đệ quy một node đọc từ JSON (dự phòng dữ liệu cũ/thiếu trường).
     * @param {Object} node - node gốc
     * @returns {Object|null} node hợp lệ hoặc null nếu không nhận dạng được
     */
    function normalizeNode(node) {
        if (!node || typeof node !== 'object') return null;
        if (!node.t || !BLOCKS[node.t]) return null;      // bỏ khối lạ

        if (!node.id) node.id = uid('cb');
        const def = BLOCKS[node.t];
        node.slots = node.slots || {};

        // Bảo đảm mọi ổ đều tồn tại và đúng kiểu
        Object.keys(def.slots || {}).forEach(function (name) {
            const slotDef = def.slots[name];
            const cur = node.slots[name];
            if (!cur || typeof cur !== 'object') {
                node.slots[name] = makeLiteral(slotDef);
            } else if (cur.t && BLOCKS[cur.t]) {
                normalizeNode(cur);                       // reporter lồng nhau
            } else if (!cur.t) {
                node.slots[name] = makeLiteral(slotDef);
            }
        });

        if (def.body) {
            if (!Array.isArray(node.body)) node.body = [];
            node.body = node.body.map(normalizeNode).filter(Boolean);
        }
        if (def.body2) {
            if (!Array.isArray(node.body2)) node.body2 = [];
            node.body2 = node.body2.map(normalizeNode).filter(Boolean);
        }
        return node;
    }

    /**
     * Bảo đảm block.data.program tồn tại và hợp lệ; nếu thiếu thì tạo mới.
     * Được gọi ở mọi nơi cần dùng chương trình (editor, player, render).
     *
     * @param {Object} data - block.data
     * @returns {Object} chương trình đã chuẩn hoá
     */
    function ensureProgram(data) {
        if (!data) return createProgram();

        if (!data.program || typeof data.program !== 'object') {
            data.program = createProgram();
            return data.program;
        }

        const prog = data.program;
        if (!Array.isArray(prog.vars)) prog.vars = [];
        if (!prog.stacks || typeof prog.stacks !== 'object') prog.stacks = {};

        ['setup', 'correct', 'wrong'].forEach(function (key) {
            if (!Array.isArray(prog.stacks[key])) prog.stacks[key] = [];
            prog.stacks[key] = prog.stacks[key].map(normalizeNode).filter(Boolean);
        });
        return prog;
    }

    /**
     * Đếm tổng số khối trong cả 3 chồng lệnh (kể cả khối lồng nhau).
     * @param {Object} data - block.data
     * @returns {number} số khối
     */
    function countBlocks(data) {
        const prog = ensureProgram(data);
        let total = 0;
        function walk(list) {
            (list || []).forEach(function (n) {
                total += 1;
                if (n.body) walk(n.body);
                if (n.body2) walk(n.body2);
            });
        }
        walk(prog.stacks.setup);
        walk(prog.stacks.correct);
        walk(prog.stacks.wrong);
        return total;
    }

    /**
     * Kiểm tra câu hỏi có chương trình khối lệnh hay chưa (hiện dấu 🧩).
     * @param {Object} data - block.data
     * @returns {boolean}
     */
    function hasCodingProgram(data) {
        if (!data || !data.program || !data.program.stacks) return false;
        return countBlocks(data) > 0;
    }

    /* ========================================================================
     *  4. TIỆN ÍCH TÌM / CHÈN / XOÁ NODE (dùng cho giao diện kéo thả)
     * ====================================================================== */

    /**
     * Tìm node theo id trong toàn bộ chương trình.
     * @param {Object} program - chương trình
     * @param {string} id - id node
     * @returns {{node:Object, list:Array, index:number, parent:Object|null}|null}
     */
    function findNode(program, id) {
        let result = null;

        function walk(list, parent) {
            if (!list || result) return;
            for (let i = 0; i < list.length; i++) {
                const n = list[i];
                if (n.id === id) {
                    result = { node: n, list: list, index: i, parent: parent };
                    return;
                }
                if (n.body)  walk(n.body, n);
                if (n.body2) walk(n.body2, n);
            }
        }

        if (!program || !program.stacks) return null;
        ['setup', 'correct', 'wrong'].forEach(function (k) {
            if (!result) walk(program.stacks[k], null);
        });
        return result;
    }

    /**
     * Lấy mảng khối theo listId.
     * listId có dạng: 'stack:setup' | 'body:<nodeId>' | 'else:<nodeId>'
     *
     * @param {Object} program - chương trình
     * @param {string} listId - mã danh sách
     * @returns {Array|null} mảng node hoặc null
     */
    function getList(program, listId) {
        if (!program || !listId) return null;

        if (listId.indexOf('stack:') === 0) {
            return program.stacks[listId.slice(6)] || null;
        }
        const id = listId.slice(listId.indexOf(':') + 1);
        const found = findNode(program, id);
        if (!found) return null;
        return listId.indexOf('body:') === 0 ? found.node.body : found.node.body2;
    }

    /**
     * Kiểm tra node có nằm trong cây con của một node khác hay không.
     * Dùng để chặn kéo một khối vào chính thân của nó (gây đệ quy vô hạn).
     *
     * @param {Object} node - node cha
     * @param {string} id - id cần kiểm tra
     * @returns {boolean}
     */
    function containsNode(node, id) {
        if (!node) return false;
        let found = false;
        function walk(list) {
            (list || []).forEach(function (n) {
                if (n.id === id) found = true;
                if (n.body) walk(n.body);
                if (n.body2) walk(n.body2);
            });
        }
        walk(node.body);
        walk(node.body2);
        return found;
    }

    /**
     * Chèn node vào vị trí index của danh sách (index được kẹp trong mảng).
     * @param {Array} list - danh sách đích
     * @param {number} index - vị trí chèn
     * @param {Object} node - node cần chèn
     */
    function insertNode(list, index, node) {
        if (!list) return;
        const pos = Math.max(0, Math.min(index, list.length));
        list.splice(pos, 0, node);
    }

    /**
     * Xoá node khỏi chương trình theo id.
     * @param {Object} program - chương trình
     * @param {string} id - id node cần xoá
     * @returns {boolean} true nếu đã xoá
     */
    function removeNodeById(program, id) {
        const found = findNode(program, id);
        if (!found) return false;
        found.list.splice(found.index, 1);
        return true;
    }

    /* ========================================================================
     *  5. TRÌNH THÔNG DỊCH (INTERPRETER)
     * ----------------------------------------------------------------------
     *  Chạy các chồng lệnh trên một "ngữ cảnh" (ctx). Ngữ cảnh giữ:
     *    - vars        : bảng biến { tenBien: giaTri }
     *    - question    : nội dung câu hỏi sau khi chạy (có thể bị đổi)
     *    - note        : ghi chú sau khi chạy
     *    - noteEnabled : có bật ghi chú hay không
     *    - awarded     : điểm của câu hỏi này (do stack correct tính ra)
     *    - scoreTouched: true nếu chương trình đã chủ động đặt/cộng điểm
     *    - feedback    : lời nhắn hiển thị cho người chơi (thường ở stack wrong)
     * ====================================================================== */

    /**
     * Chuyển một giá trị bất kỳ sang số (an toàn, không trả về NaN).
     * @param {*} v - giá trị
     * @returns {number} số tương ứng, mặc định 0
     */
    function toNumber(v) {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        if (v === null || v === undefined || v === '') return 0;
        const n = parseFloat(String(v).replace(',', '.'));
        return isFinite(n) ? n : 0;
    }

    /**
     * Chuyển một giá trị sang chuỗi để ghép/hiển thị.
     * Số được làm tròn tối đa 6 chữ số thập phân để tránh "0.30000000004".
     * @param {*} v - giá trị
     * @returns {string}
     */
    function toText(v) {
        if (typeof v === 'number') {
            if (!isFinite(v)) return '0';
            return String(Math.round(v * 1e6) / 1e6);
        }
        return v === null || v === undefined ? '' : String(v);
    }

    /**
     * Diễn giải "đúng/sai" theo tinh thần Scratch:
     * 0, '', 'false', 'sai' => sai; còn lại => đúng.
     * @param {*} v - giá trị
     * @returns {boolean}
     */
    function truthy(v) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        const s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
        return s !== '' && s !== '0' && s !== 'false' && s !== 'sai';
    }

    /**
     * Tạo ngữ cảnh chạy mới từ dữ liệu của một khối câu hỏi.
     * Mọi biến được khởi tạo bằng 0 (giống "set [biến] to 0" của Scratch).
     *
     * @param {Object} data - block.data
     * @returns {Object} ngữ cảnh chạy
     */
    function createContext(data, state) {
        const prog = ensureProgram(data);
        const vars = {};
        prog.vars.forEach(function (name) {
            if (name) vars[name] = 0;
        });

        /* Nạp sẵn hai biến hệ thống (bản 2.1):
           - 'Thời gian' : giây còn lại (được cập nhật liên tục khi đang chơi)
           - 'Điểm'      : tổng điểm người chơi đang có trước câu này */
        const game = state || {};
        vars[TIME_VAR] = toNumber(game.timeLeft);
        vars[SCORE_VAR] = toNumber(game.totalScore);

        return {
            vars: vars,
            question: data.question || '',
            note: data.note || '',
            noteEnabled: !!data.noteEnabled,
            score: toNumber(data.score),
            awarded: 0,
            scoreTouched: false,
            feedback: '',
            steps: 0
        };
    }

    /**
     * Cập nhật hai biến hệ thống trong ngữ cảnh chạy.
     * Được player gọi trước mỗi lần tính điểm (kể cả khi xem trước điểm động).
     *
     * @param {Object} runtime - khối runtime
     * @param {{timeLeft:number, totalScore:number}} state - trạng thái ván chơi
     * @returns {Object} ngữ cảnh đã cập nhật
     */
    function setGameVars(runtime, state) {
        const ctx = runtime.ctx || (runtime.ctx = createContext(runtime.data, state));
        const game = state || {};

        if (game.timeLeft !== undefined) ctx.vars[TIME_VAR] = toNumber(game.timeLeft);
        if (game.totalScore !== undefined) ctx.vars[SCORE_VAR] = toNumber(game.totalScore);

        return ctx;
    }

    /**
     * Chạy một chồng lệnh theo tên.
     * @param {Object} data - block.data
     * @param {string} name - 'setup' | 'correct' | 'wrong'
     * @param {Object} ctx - ngữ cảnh
     */
    function runStack(data, name, ctx) {
        const prog = ensureProgram(data);
        execList(prog.stacks[name] || [], ctx);
    }

    /**
     * Chạy danh sách lệnh tuần tự, có giới hạn số bước để chống treo.
     * @param {Array} list - danh sách node
     * @param {Object} ctx - ngữ cảnh
     */
    function execList(list, ctx) {
        (list || []).forEach(function (node) {
            ctx.steps += 1;
            if (ctx.steps > MAX_STEPS) {
                throw new Error('Chương trình chạy quá ' + MAX_STEPS + ' bước (kiểm tra vòng lặp).');
            }
            execNode(node, ctx);
        });
    }

    /**
     * Thực thi một khối lệnh (statement).
     * @param {Object} node - node khối lệnh
     * @param {Object} ctx - ngữ cảnh
     */
    function execNode(node, ctx) {
        if (!node) return;
        const slots = node.slots || {};

        switch (node.t) {

            /* ----- BIẾN ----- */
            case 'set_var':
                // Hai biến hệ thống là chỉ đọc: bỏ qua lệnh ghi để tránh nhầm lẫn
                if (SYSTEM_VAR_NAMES.indexOf(slots.name.v) !== -1) break;
                ctx.vars[slots.name.v] = evalNode(slots.value, ctx);
                break;

            case 'change_var': {
                const key = slots.name.v;
                if (SYSTEM_VAR_NAMES.indexOf(key) !== -1) break;   // chỉ đọc
                ctx.vars[key] = toNumber(ctx.vars[key]) + toNumber(evalNode(slots.value, ctx));
                break;
            }

            /* ----- ĐIỀU KIỆN / VÒNG LẶP ----- */
            case 'if_block':
                if (truthy(evalNode(slots.cond, ctx))) execList(node.body, ctx);
                break;

            case 'if_else_block':
                if (truthy(evalNode(slots.cond, ctx))) execList(node.body, ctx);
                else execList(node.body2, ctx);
                break;

            case 'repeat_block': {
                const times = Math.max(0, Math.floor(toNumber(evalNode(slots.times, ctx))));
                for (let i = 0; i < times; i++) {
                    execList(node.body, ctx);
                    if (ctx.steps > MAX_STEPS) break;
                }
                break;
            }

            /* ----- CÂU HỎI / ĐIỂM ----- */
            case 'set_question':
                ctx.question = toText(evalNode(slots.value, ctx));
                break;

            case 'set_note':
                ctx.note = toText(evalNode(slots.value, ctx));
                ctx.noteEnabled = true;
                break;

            case 'set_feedback':
                ctx.feedback = toText(evalNode(slots.value, ctx));
                break;

            case 'add_score':
                ctx.awarded += toNumber(evalNode(slots.value, ctx));
                ctx.scoreTouched = true;
                break;

            case 'set_score':
                ctx.awarded = toNumber(evalNode(slots.value, ctx));
                ctx.scoreTouched = true;
                break;

            default:
                /* Khối reporter/boolean đứng một mình: không có tác dụng phụ */
                break;
        }
    }

    /**
     * Tính giá trị của một node biểu thức (literal, reporter hoặc boolean).
     *
     * @param {Object} node - node biểu thức
     * @param {Object} ctx - ngữ cảnh
     * @returns {number|string|boolean} giá trị
     */
    function evalNode(node, ctx) {
        if (node === null || node === undefined) return 0;
        if (typeof node !== 'object') return node;

        const slots = node.slots || {};

        switch (node.t) {

            /* ----- GIÁ TRỊ HẰNG ----- */
            case 'num':
                return toNumber(node.v);

            case 'txt':
                return node.v === undefined ? '' : String(node.v);

            case 'varname':
                return node.v || '';

            case 'op':
            case 'cmp':
            case 'logicop':
                return node.v;

            /* ----- BIẾN ----- */
            case 'var_ref': {
                const name = slots.name && slots.name.v;
                return ctx.vars[name] === undefined ? 0 : ctx.vars[name];
            }

            /* ----- BIẾN HỆ THỐNG (chỉ đọc) ----- */
            case 'sys_time':
                return ctx.vars[TIME_VAR] === undefined ? 0 : ctx.vars[TIME_VAR];

            case 'sys_score':
                return ctx.vars[SCORE_VAR] === undefined ? 0 : ctx.vars[SCORE_VAR];

            /* ----- TOÁN ----- */
            case 'random': {
                let min = Math.ceil(toNumber(evalNode(slots.min, ctx)));
                let max = Math.floor(toNumber(evalNode(slots.max, ctx)));
                if (min > max) { const t = min; min = max; max = t; }
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }

            case 'math_op': {
                const a = toNumber(evalNode(slots.a, ctx));
                const b = toNumber(evalNode(slots.b, ctx));
                switch (slots.op.v) {
                    case '-':   return a - b;
                    case '×':   return a * b;
                    case '÷':   return b === 0 ? 0 : a / b;
                    case 'mod': return b === 0 ? 0 : a % b;
                    default:    return a + b;
                }
            }

            case 'round':
                return Math.round(toNumber(evalNode(slots.a, ctx)));

            case 'abs_value':
                return Math.abs(toNumber(evalNode(slots.a, ctx)));

            case 'pick': {
                // Tách danh sách theo dấu phẩy hoặc dấu gạch đứng
                const raw = toText(evalNode(slots.list, ctx));
                const items = raw.split(/[,|;]/).map(function (s) { return s.trim(); })
                    .filter(function (s) { return s !== ''; });
                if (items.length === 0) return '';
                return items[Math.floor(Math.random() * items.length)];
            }

            /* ----- ĐIỀU KIỆN ----- */
            case 'compare': {
                const rawA = evalNode(slots.a, ctx);
                const rawB = evalNode(slots.b, ctx);
                const a = toNumber(rawA);
                const b = toNumber(rawB);
                const bothNumeric = isNumeric(rawA) && isNumeric(rawB);

                switch (slots.cmp.v) {
                    case '=':  return bothNumeric ? a === b : toText(rawA) === toText(rawB);
                    case '≠':  return bothNumeric ? a !== b : toText(rawA) !== toText(rawB);
                    case '>':  return bothNumeric ? a > b : toText(rawA) > toText(rawB);
                    case '<':  return bothNumeric ? a < b : toText(rawA) < toText(rawB);
                    case '≥':  return bothNumeric ? a >= b : toText(rawA) >= toText(rawB);
                    case '≤':  return bothNumeric ? a <= b : toText(rawA) <= toText(rawB);
                    default:   return false;
                }
            }

            case 'logic_op': {
                const a = truthy(evalNode(slots.a, ctx));
                const b = truthy(evalNode(slots.b, ctx));
                return slots.op.v === 'hoặc' ? (a || b) : (a && b);
            }

            /* ----- CHUỖI ----- */
            case 'join':
                return toText(evalNode(slots.a, ctx)) + toText(evalNode(slots.b, ctx));

            case 'letter_count':
                return toText(evalNode(slots.a, ctx)).length;

            default:
                return 0;
        }
    }

    /**
     * Kiểm tra một giá trị có phải số hợp lệ hay không (dùng cho so sánh).
     * @param {*} v - giá trị
     * @returns {boolean}
     */
    function isNumeric(v) {
        if (typeof v === 'number') return isFinite(v);
        if (typeof v !== 'string' || v.trim() === '') return false;
        return isFinite(parseFloat(v.replace(',', '.')));
    }

    /* ========================================================================
     *  6. ÁP DỤNG KẾT QUẢ VÀO DỮ LIỆU CÂU HỎI
     * ====================================================================== */

    /**
     * Thay các "placeholder" dạng {{tenBien}} bằng giá trị biến.
     *
     * Ví dụ: renderTemplate('Tính {{a}} + {{b}}', {a: 3, b: 4}) => 'Tính 3 + 4'
     *
     * @param {string} text - chuỗi gốc
     * @param {Object} vars - bảng biến
     * @param {boolean} [keepNumeric=false] - giữ nguyên các placeholder số
     *        ({{1}}, {{2}}...) vì cloze/dropdown dùng chúng để đánh dấu chỗ trống
     * @returns {string} chuỗi sau khi thay thế
     */
    function renderTemplate(text, vars, keepNumeric) {
        if (typeof text !== 'string' || text.indexOf('{{') === -1) return text;

        return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (match, name) {
            // Placeholder số của câu hỏi điền khuyết: giữ nguyên
            if (keepNumeric && /^\d+$/.test(name)) return match;

            if (vars && Object.prototype.hasOwnProperty.call(vars, name)) {
                return toText(vars[name]);
            }
            return '';   // biến chưa được khai báo => chuỗi rỗng
        });
    }

    /**
     * Ghi kết quả chạy chương trình vào dữ liệu của khối (bản sao runtime).
     * Hàm này KHÔNG làm thay đổi dữ liệu gốc trong builder vì luôn được gọi
     * trên bản sao do prepareRuntimeBlock() tạo ra.
     *
     * @param {Object} block - khối runtime { type, data }
     * @param {Object} ctx - ngữ cảnh đã chạy
     */
    function applyToData(block, ctx) {
        const d = block.data;
        const v = ctx.vars;

        d.question = renderTemplate(ctx.question, v);

        /* Bản 2.2: ảnh cũng nhận placeholder {{bien}} cho MỌI loại câu hỏi
           (trước đây chỉ hotspot) => có thể random ảnh theo biến. */
        if (typeof d.imageUrl === 'string') {
            d.imageUrl = renderTemplate(d.imageUrl, v);
        }

        if (ctx.noteEnabled) {
            d.noteEnabled = true;
            d.note = renderTemplate(ctx.note, v);
        }

        switch (block.type) {

            case 'multiple-choice':
            case 'multi-answer':
                d.options = (d.options || []).map(function (o) {
                    return { text: renderTemplate(o.text, v), correct: !!o.correct };
                });
                break;

            case 'ordering':
                d.items = (d.items || []).map(function (t) { return renderTemplate(t, v); });
                break;

            case 'matching': {
                /* Bản 2.4 — Matching 1-n: PHẢI giữ nguyên schema mới
                   { id, concept, explanations[] }.
                   Bản cũ ghi đè thành { left, right } khiến id/concept/explanations
                   biến mất hoàn toàn ⇒ Player dựng ra hai cột rỗng, mọi khái
                   niệm cùng mang id "undefined", không vẽ được đường nối và
                   người chơi chỉ nối được đúng một cặp rồi bị kẹt.

                   Ghi nhớ kết quả render theo chuỗi gốc để pairs[].explanations
                   và explanationsAll luôn cho ra CÙNG một chuỗi (Player khớp
                   cặp theo text nội dung, lệch nhau sẽ hỏng đường nối). */
                var memo = Object.create(null);
                var renderMatchingText = function (text) {
                    if (typeof text !== 'string') return text;
                    if (!(text in memo)) memo[text] = renderTemplate(text, v);
                    return memo[text];
                };
                d.pairs = (d.pairs || []).map(function (p) {
                    var out = Object.assign({}, p);
                    out.concept = renderMatchingText(p.concept);
                    out.explanations = (p.explanations || []).map(renderMatchingText);
                    /* Giữ tương thích với code cũ vẫn đọc p.left / p.right */
                    out.left = out.concept || '';
                    out.right = out.explanations[0] || '';
                    return out;
                });
                if (Array.isArray(d.explanationsAll)) {
                    d.explanationsAll = d.explanationsAll.map(renderMatchingText);
                }
                break;
            }

            case 'hotspot':
                d.regions = (d.regions || []).map(function (r) {
                    return Object.assign({}, r, { label: renderTemplate(r.label, v) });
                });
                break;

            case 'cloze':
                /* Giữ placeholder {{N}} và chuẩn hoá đáp án trên bản runtime. */
                d.paragraph = renderTemplate(d.paragraph || ctx.question || '', v, true);
                d.question = d.paragraph;
                d.blanks = (d.blanks || []).map(function (b) {
                    var answers = Array.isArray(b.answers)
                        ? b.answers
                        : (b.answer == null ? [] : [b.answer]);
                    var renderedAnswers = answers.map(function (answer) {
                        return renderTemplate(String(answer == null ? '' : answer), v);
                    });
                    return {
                        id: b.id,
                        answers: renderedAnswers,
                        answer: renderedAnswers[0] || '',
                        user: b.user || ''
                    };
                });
                break;

            case 'dropdown':
                d.paragraph = renderTemplate(d.paragraph || '', v, true);
                d.options = (d.options || []).map(function (t) { return renderTemplate(t, v); });
                d.answers = (d.answers || []).map(function (a) { return renderTemplate(a, v); });
                break;

            default:
                break;
        }
    }

    /* ========================================================================
     *  7. API CHẠY CHƯƠNG TRÌNH (dùng bởi player & nút "Chạy thử")
     * ====================================================================== */

    /**
     * Tạo "runtime block": bản sao độc lập của khối câu hỏi + kết quả chạy
     * stack 'setup' (random hoá dữ liệu, thay placeholder).
     *
     * Vì sao phải sao chép? Mỗi lượt chơi phải random lại số liệu, nhưng dữ liệu
     * người dùng thiết kế trong builder phải giữ nguyên. Nhờ vậy chơi lại nhiều
     * lần vẫn ra đề khác nhau mà không làm hỏng dự án đã lưu.
     *
     * @param {Object} block - khối gốc trong workspace
     * @returns {Object} khối runtime { id, type, x, y, data, source, ctx }
     */
    function prepareRuntimeBlock(block, state) {
        const runtime = {
            id: block.id,
            type: block.type,
            x: block.x,
            y: block.y,
            data: deepClone(block.data),
            source: block,        // tham chiếu ngược về khối gốc (để debug)
            ctx: null,
            programError: ''
        };

        const ctx = createContext(runtime.data, state);
        try {
            runStack(runtime.data, 'setup', ctx);
            applyToData(runtime, ctx);
        } catch (err) {
            runtime.programError = err.message || String(err);
            console.warn('[QuizCoding] Lỗi chương trình "khi bắt đầu":', err);
        }
        runtime.ctx = ctx;
        return runtime;
    }

    /**
     * Tính điểm khi trả lời ĐÚNG bằng cách chạy stack 'correct'.
     * - Nếu chương trình có dùng "cộng điểm"/"đặt điểm" => lấy kết quả đó.
     * - Nếu không => dùng điểm mặc định của câu hỏi (data.score).
     *
     * @param {Object} runtime - khối runtime
     * @returns {number} điểm được cộng (đã làm tròn, không âm)
     */
    function award(runtime, state) {
        const ctx = runtime.ctx || createContext(runtime.data, state);
        runtime.ctx = ctx;
        setGameVars(runtime, state);

        ctx.awarded = 0;
        ctx.scoreTouched = false;
        ctx.feedback = '';
        ctx.steps = 0;

        try {
            runStack(runtime.data, 'correct', ctx);
        } catch (err) {
            runtime.programError = err.message || String(err);
            console.warn('[QuizCoding] Lỗi chương trình "khi trả lời đúng":', err);
        }

        const base = ctx.scoreTouched ? ctx.awarded : toNumber(runtime.data.score);
        return Math.max(0, Math.round(base * 100) / 100);
    }

    /**
     * Xem trước điểm sẽ nhận được với trạng thái ván chơi hiện tại.
     * Dùng cho nhãn điểm động trên thanh thời gian ở chế độ chơi.
     *
     * @param {Object} runtime - khối runtime
     * @param {{timeLeft:number, totalScore:number}} state - trạng thái ván chơi
     * @returns {number} điểm dự kiến
     */
    function previewScore(runtime, state) {
        return award(runtime, state);
    }

    /**
     * Chạy stack 'wrong' khi trả lời sai (có thể đặt lời nhắn/gợi ý).
     * @param {Object} runtime - khối runtime
     * @returns {string} lời nhắn (feedback) nếu có
     */
    function penalize(runtime, state) {
        const ctx = runtime.ctx || createContext(runtime.data, state);
        runtime.ctx = ctx;
        setGameVars(runtime, state);

        ctx.feedback = '';
        ctx.steps = 0;

        try {
            runStack(runtime.data, 'wrong', ctx);
        } catch (err) {
            runtime.programError = err.message || String(err);
            console.warn('[QuizCoding] Lỗi chương trình "khi trả lời sai":', err);
        }

        runtime.ctx = ctx;
        // Lời nhắn cũng được thay placeholder {{bien}} trước khi hiển thị
        return renderTemplate(ctx.feedback, ctx.vars);
    }

    /**
     * Chạy thử toàn bộ chương trình để xem trước kết quả trong trình soạn thảo.
     * (Dùng cho nút "▶ Chạy thử" ở tab Lập trình khối.)
     *
     * @param {Object} block - khối câu hỏi
     * @returns {{vars:Object, question:string, note:string, score:number,
     *            feedback:string, error:string, sample:Object}}
     */
    function runPreview(block, state) {
        const out = {
            vars: {},
            question: '',
            note: '',
            noteEnabled: false,
            score: 0,
            feedback: '',
            error: '',
            sample: {}
        };

        /* Mặc định xem trước với thời gian = giới hạn của câu hỏi và điểm = 0
           để người tạo quiz thấy công thức dùng biến "Thời gian"/"Điểm". */
        const gameState = state || {
            timeLeft: toNumber(block.data.timeLimit),
            totalScore: 0
        };

        const ctx = createContext(block.data, gameState);
        try {
            // 1. Chạy "khi bắt đầu câu hỏi"
            runStack(block.data, 'setup', ctx);

            // 2. Áp dụng lên bản sao để xem nội dung câu hỏi/đáp án sau random
            const temp = { type: block.type, data: deepClone(block.data) };
            applyToData(temp, ctx);

            out.question = temp.data.question;
            out.note = temp.data.note || '';
            out.noteEnabled = !!temp.data.noteEnabled;
            out.sample = temp.data;

            // 3. Chạy "khi trả lời đúng" để xem trước điểm
            ctx.awarded = 0;
            ctx.scoreTouched = false;
            runStack(block.data, 'correct', ctx);
            out.score = ctx.scoreTouched
                ? Math.max(0, Math.round(ctx.awarded * 100) / 100)
                : toNumber(block.data.score);

            // 4. Chạy "khi trả lời sai" để xem trước lời nhắn (đã thay placeholder)
            ctx.feedback = '';
            runStack(block.data, 'wrong', ctx);
            out.feedback = renderTemplate(ctx.feedback, ctx.vars);

        } catch (err) {
            out.error = err.message || String(err);
        }

        out.vars = ctx.vars;
        return out;
    }

    /* ========================================================================
     *  8. XUẤT API RA TOÀN CỤC
     *  (dùng tên QuizCoding để tránh trùng với biến khác của ứng dụng)
     * ====================================================================== */
    global.QuizCoding = {
        /* Dữ liệu tĩnh */
        CATEGORIES: CATEGORIES,
        BLOCKS: BLOCKS,
        MATH_OPS: MATH_OPS,
        CMP_OPS: CMP_OPS,
        LOGIC_OPS: LOGIC_OPS,
        MAX_STEPS: MAX_STEPS,

        /* Biến hệ thống (bản 2.1) */
        TIME_VAR: TIME_VAR,
        SCORE_VAR: SCORE_VAR,
        SYSTEM_VARS: SYSTEM_VARS,
        SYSTEM_VAR_NAMES: SYSTEM_VAR_NAMES,

        /* Mô hình */
        createProgram: createProgram,
        createNode: createNode,
        makeLiteral: makeLiteral,
        ensureProgram: ensureProgram,
        normalizeNode: normalizeNode,
        countBlocks: countBlocks,
        hasCodingProgram: hasCodingProgram,

        /* Thao tác cây */
        findNode: findNode,
        getList: getList,
        containsNode: containsNode,
        insertNode: insertNode,
        removeNodeById: removeNodeById,

        /* Thông dịch */
        createContext: createContext,
        runStack: runStack,
        execList: execList,
        execNode: execNode,
        evalNode: evalNode,
        toNumber: toNumber,
        toText: toText,
        truthy: truthy,
        isNumeric: isNumeric,

        /* Áp dụng & chạy */
        renderTemplate: renderTemplate,
        applyToData: applyToData,
        prepareRuntimeBlock: prepareRuntimeBlock,
        setGameVars: setGameVars,
        award: award,
        previewScore: previewScore,
        penalize: penalize,
        runPreview: runPreview
    };

})(window);
