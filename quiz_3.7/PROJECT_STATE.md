# Trạng thái dự án

**Dự án:** Scratch Quiz Builder  
**Cập nhật:** 24-10-2026

## Tổng quan

Ứng dụng trình duyệt thuần HTML5, CSS3 và Vanilla JavaScript. Builder hiện hỗ
trợ tạo khối câu hỏi, chỉnh sửa nội dung, lưu/khôi phục dự án và chạy quiz ở
Player View. Các loại câu hỏi gồm trắc nghiệm, sắp xếp, nối ô, chọn vùng ảnh,
điền từ và chọn từ trong danh sách.

## Tính năng đã hoàn thành

- Bố cục Builder ba cột, toolbox, workspace có kéo thả, pan và zoom.
- Cấu hình chi tiết từng loại câu hỏi và lập trình khối lệnh theo sự kiện.
- Player View có tiến trình, đồng hồ, chấm điểm, phản hồi và màn hình kết quả.
- Câu hỏi sắp xếp đưa ô kéo tạm ra `document.body` để giữ đúng tọa độ con trỏ,
  đồng thời tắt transform/animation đầu vào gây lệch. Khe giữ chỗ đổi vị trí
  theo con trỏ, các hàng lân cận trượt bằng FLIP và ô snap vào khe khi thả.
  Trả lời đúng chuyển các hàng sang nền/viền xanh và bounce đồng thời; trả lời
  sai tô đỏ, shake cả danh sách rồi chạy Bubble Sort để hiển thị đáp án chuẩn.
  Có hỗ trợ giảm chuyển động.
- Trắc nghiệm có toggle tùy chọn xáo trộn thứ tự lựa chọn; mặc định tắt. Việc
  xáo trộn chỉ đổi thứ tự chỉ số hiển thị nên giữ nguyên dữ liệu gốc và ánh xạ
  đáp án đúng cho cả chế độ chọn một lẫn chọn nhiều.
- Đã bỏ gợi ý số lượng đáp án đúng khỏi cấu hình và màn hình chơi. Sau khi nộp,
  phản hồi trắc nghiệm chỉ đổi viền xanh/đỏ, không đổi nền hoặc làm mờ lựa chọn.
- Matching hỗ trợ một khái niệm nối nhiều giải thích và thể hiện đường nối SVG.
- Hai cột Matching trong Player dùng lưới cân đối; các điểm nối lấy tọa độ từ
  nút thực tế và đường nối được vẽ lại khi vùng hiển thị đổi kích thước.
- **Sửa lỗi hiển thị đường nối trong Editor (bản 2.4):** đường nối trước đây lấy
  thẳng số đo từ `getBoundingClientRect()` (đã bị scale) nên bị lệch khi modal
  cấu hình chạy animation `sbPopIn`; `ResizeObserver` không nhận biết transform
  nên đường nối không được vẽ lại. Nay tọa độ được đổi qua `getScreenCTM()`
  sang user space của SVG, nên mở lại bảng cấu hình lần hai (hay bất kỳ lúc nào)
  đường nối vẫn bám đúng 100% vào cúc tròn.
- **Sửa lỗi Player không hiện / kẹt đường nối (bản 2.4):** `applyToData()` trong
  engine từng ghi đè `pairs` thành `{ left, right }`, làm mất `id` và `concept`
  trong bản sao runtime ⇒ Player dựng ra hai cột rỗng, mọi khái niệm trùng id
  `"undefined"`, không vẽ được đường nối và người chơi chỉ nối được đúng một cặp
  rồi bị kẹt (bấm ô phải báo *"Hãy bấm một ô tròn bên trái trước"*). Nay engine
  chỉ render placeholder và giữ nguyên schema `{ id, concept, explanations[] }`.
- **Matching trong Player (bản 2.4):** hỗ trợ bấm-chọn lẫn kéo-thả; khi đang
  chọn có đường nối nháp bám theo con trỏ và tô sáng ô đích; nối xong thì đường
  nối được cố định và ô tròn ở cả hai cột chuyển màu xanh. Người chơi nối được
  đủ các cặp, bấm lại ô tròn đã nối (hoặc ô phải đã nối) để bỏ nối, và giải
  thích đang nối với khái niệm khác sẽ được chuyển sang khái niệm mới — không
  bao giờ bị kẹt hay báo lỗi sai logic.
- **Giao diện "mỗi ô 1 nút" chỉ ở chế độ chơi (bản 2.5):** Player View dựng mỗi
  ô match-box với **đúng 1 nút tròn** làm điểm neo. Dây nối xuất phát trực tiếp
  từ nút của ô bên trái, bám theo con trỏ khi kéo và được neo chính xác vào
  nút của ô đích bên phải khi ghép cặp thành công. Một khái niệm nối N giải
  thích thì có N dây, tất cả cùng xuất phát từ một nút. Nút trái hiển thị số
  giải thích đang nối.
- **Giao diện trình chỉnh sửa giữ nguyên (bản 2.5):** phần thiết lập câu hỏi
  vẫn dùng bố cục cặp khái niệm – giải thích (mỗi khái niệm có N cúc tròn
  **+ 1 cúc "+"** để thêm giải thích mới). Ranh giới hai giao diện được đánh dấu
  bằng lớp `.match-2n-player`; mọi kiểu CSS riêng cho Player đều gắn với lớp
  này nên không bao giờ lan sang Editor.
- **Quan hệ nối ô NHIỀU-NHIỀU ở Player View (bản 2.6):** một ô khái niệm nối
  được **nhiều** ô giải thích và một ô giải thích cũng nối được **nhiều** ô
  khái niệm. Kéo từ nút trái sang nút phải (hoặc ngược lại) chỉ **vẽ thêm dây**,
  các dây nối cũ được giữ nguyên — không còn hành vi 1-1 ghi đè/xoá dây cũ.
  Mỗi nút có thể mang nhiều dây cùng lúc.
- **Cấu trúc dữ liệu cặp nối (bản 2.6):** `block.data.answers` lưu các cặp nối
  dưới dạng **danh sách mảng** `[idKháiNiệm, nộiDungGiảiThích]`
  (ví dụ `[['c1','Gải thích A'],['c1','Gải thích B'],['c2','Gải thích A']]`).
  Định dạng cũ `{id: [giải thích, ...]}` vẫn được đọc và tự chuyển đổi khi
  mở dự án cũ. Toàn bộ thao tác thêm/gỡ đi qua các hàm dùng chung
  `matchingNormalizeLinks()`, `matchingAddLink()`, `matchingRemoveLink()`,
  `matchingRemoveLinksTo()`, `matchingTargetsOf()`, `matchingOwnersOf()`,
  `matchingOwnerCount()` trong `js/core/utils.js`.
- **Chấm điểm nhiều-nhiều (bản 2.6):** so sánh **tập các cặp**
  `khái niệm|giải thích` giữa lựa chọn của người chơi và đáp án của tác giả —
  đúng khi hai tập trùng khít. Nút trái hiện số giải thích đang nối; ô bên phải
  có huy hiệu số khái niệm đang nối.
- **Phản hồi màu dây Matching sau khi nộp:** Player View tô xanh các cặp người
  chơi nối đúng, tô đỏ các cặp đã nối sai và vẽ thêm dây vàng cho từng cặp đúng
  còn thiếu. Phản hồi chỉ xuất hiện sau khi nộp; Editor và trạng thái trước nộp
  không thay đổi.
- **Editor Cloze:** một textarea nội dung với placeholder `{{N}}` thay thế
  trường tên riêng và trường “Nội dung đoạn văn”; danh sách đáp án theo từng ô
  và nút thêm dòng nằm chung trong nhóm “Tên / nội dung câu hỏi”. Khi lưu,
  nội dung được ghi vào cả `question` và `paragraph`; dòng đáp án rỗng được
  giữ để chỉ số đáp án không lệch placeholder. Player ẩn tiêu đề câu hỏi trùng
  với đoạn văn hiển thị ở vùng trả lời.
- **Chấm và phản hồi Cloze:** so khớp từng đáp án hợp lệ sau khi bỏ khoảng trắng
  đầu/cuối và chuẩn hóa chữ hoa/thường. Khi nộp, ô đúng chuyển xanh; ô sai hoặc
  bỏ trống chuyển đỏ. Đáp án chuẩn hiện trong ô vàng dạng chữ nếu có một đáp án,
  hoặc danh sách thả màu vàng nếu có nhiều đáp án. Có thể nộp ngay cả khi bỏ
  trống tất cả ô.
- **Sửa lỗi mất đáp án Cloze trong bản runtime:** `QuizCoding.applyToData()` nay
  render toàn bộ `blanks[].answers[]` thay vì chỉ chuyển một trường `answer`.
  Điều này giữ được mảng đáp án hợp lệ mà Player dùng để chấm và dựng gợi ý;
  trường `answer` đầu tiên vẫn được giữ để tương thích ngược.
- **Dropdown trong Editor:** nội dung có placeholder `{{N}}` được chuyển vào
  trường “Tên / nội dung câu hỏi”. Đã bỏ trường đoạn văn và danh sách từ dùng
  chung; mỗi chỗ trống tiếp tục có danh sách lựa chọn và đáp án đúng riêng.
  Dữ liệu cũ có `paragraph`/`options` vẫn đọc được để tương thích, nhưng không
  hiện thành các phần cấu hình riêng.
- **Hotspot hình tròn:** Editor có nút đổi từng vùng giữa hình chữ nhật và hình
  tròn; dữ liệu lưu loại hình ở `regions[].shape`. Player giữ hình tròn đúng tỷ
  lệ ảnh và tính phần trăm giao chính xác cho cặp hình chữ nhật/hình tròn.
  Sau khi nộp, vùng đáp án màu vàng, vùng người chơi màu đỏ, phần giao màu xanh.
- **Tên vùng Hotspot trong Player:** mỗi vùng kéo thả hiển thị đúng nhãn đã đặt
  trong Editor, thay cho ký tự A/B/C; nhãn được sao chép cùng hình dạng và kích
  thước sang vùng người chơi.
- `normalizeMatching()` bảo đảm `id` khái niệm luôn duy nhất và
  `explanationsAll` luôn chứa đủ mọi giải thích đang được gắn (thiếu một giải
  thích thì cột phải thiếu ô ⇒ không vẽ được đường nối).
- Double-click một khối workspace để hiển thị thẻ Player thu nhỏ của khối đó
  trong `#stage-area`. Bản xem trước chỉ đọc và tự thu tỷ lệ theo kích thước
  sân khấu.
- Triple-click hoặc nút bánh răng tiếp tục mở cấu hình; kéo khối không kích
  hoạt thao tác xem trước/cấu hình.
- Bộ tài liệu gốc gồm `AI_CONTEXT.md`, `ARCHITECTURE.md`, `PROJECT_STATE.md`
  và `TESTING_GUIDE.md`; AI_CONTEXT yêu cầu đồng bộ đủ bốn tệp sau khi có thay
  đổi code.

## Trạng thái kiểm thử

- `node tests/syntax-check.js`: đạt, cú pháp 12 module JavaScript và thứ tự nạp
  đều hợp lệ.
- `node tests/scope-check.js`: đạt, phạm vi hàm toàn cục hợp lệ trên 12 module.
- `node tests/e2e-cdp.js`: 217/223 kiểm tra đạt. Dropdown xác nhận nội dung nằm
  trong nhóm câu hỏi, không còn trường đoạn văn/danh sách chung và lựa chọn
  riêng từng ô. Hotspot xác nhận đổi/lưu hình tròn, tên Player trùng nhãn Editor,
  phản hồi màu vàng–đỏ–xanh
  và phép giao tròn–chữ nhật loại đúng vùng nằm ngoài hình tròn.
  Các kiểm tra Matching và Cloze đều đạt. Cloze xác nhận Editor dùng textarea
  nội dung duy nhất, đáp án được
  lưu và giữ nguyên qua runtime, chuẩn hóa trim/hoa thường, không lặp nội dung ở
  tiêu đề Player, phản hồi từng ô, gợi ý đáp án vàng và nộp được khi toàn bộ ô
  trống. Toàn bộ kiểm tra về nối ô
  đều đạt: mở lại bảng cấu hình lần hai thì đường nối bám đúng cúc tròn (sai lệch
  0.00px), Editor **giữ nguyên** giao diện cấu hình (vẫn có cúc "+", không dùng
  kiểu "1 nút/ô"), Player View mỗi ô chỉ có đúng 1 button, dây nối xuất phát từ
  nút trái và neo vào nút phải (sai lệch 0.00px), có dây nháp bám theo con trỏ, nối
  đủ 3/3 cặp mà không bị kẹt, quan hệ 1-n vẫn dùng chung một nút, **quan hệ
  nhiều-nhiều giữ nguyên các dây nối cũ**, dữ liệu cặp nối lưu đúng dạng danh
  sách mảng `[khái niệm, giải thích]`, dự án cũ (định dạng object) vẫn mở được,
  và khi nộp có đúng 1 dây xanh, 1 dây đỏ, 2 dây vàng trong ca kiểm thử gồm đủ
  ba trạng thái.
  Sáu kiểm tra chưa đạt đều là lỗi thanh thời gian đã có từ trước (trạng thái
  đầy, đếm ngược, thời gian còn lại, trạng thái chốt, điểm trên thanh và làm mới ở
  câu tiếp theo); xem `tests/last-run.txt`.

## Ghi chú bảo trì

- Ứng dụng không dùng thư viện ngoài hoặc framework.
- Script là classic script dùng phạm vi toàn cục; không thay đổi thứ tự nạp nếu
  chưa xử lý đầy đủ phụ thuộc.
- Khi thay đổi hành vi, cập nhật cả bốn tệp tài liệu gốc theo quy tắc trong
  `AI_CONTEXT.md`.
