# Bộ kiểm thử thủ công cho giao diện desk 6 màn hình (Manual QA Testsuite)

Trạng thái: active. Chủ sở hữu: `qa-lead`. Refs #448, #450 (mục 9: ma trận biên + xác thực).

Tài liệu này là bộ kiểm thử thủ công (manual QA testsuite) cho 6 màn hình
desk UI, dùng TRƯỚC buổi kiểm thử trực tiếp trên máy của chủ sở hữu (owner machine).
Mọi case đều viết tiếng Việt trước (Vietnamese-first); khi khẳng định câu chữ
hiển thị trên màn hình, key catalogue được nêu nguyên văn để người kiểm thử đối
chiếu cả hai locale EN/VI.

Phạm vi: chỉ tài liệu kiểm thử, không đụng tới product code, không kiểm thử
tự động, không thay đổi CI. Bản thân buổi kiểm thử tay trên máy owner là việc
riêng sau bộ này (downstream), không thuộc tài liệu này.

## 0. Cách dùng và quy ước chung

### 0.1. Môi trường kiểm thử

1. Dựng stack local theo `docs/devops/local-dev-setup.md`, mở desk UI và đăng
   nhập bằng tài khoản owner.
2. Chuẩn bị 2 trạng thái dữ liệu:
   - DB trống (fresh DB): phục vụ các case Onboarding (`QA-ONB-*`) và case
     đầu-cuối (`QA-E2E-1`).
   - DB đã seed (seeded DB): có ít nhất 1 hạng phòng + 2 phòng (1 phòng
     `vacant-dirty`, 1 phòng `vacant-inspected`), 1 khách, phục vụ các case
     Main/Book/Stay/Folio/Rooms.
3. Mỗi case chạy độc lập: đọc kỹ "Điều kiện tiên quyết" trước khi bắt đầu.

### 0.2. Cấu trúc mỗi case

Mỗi case gồm đúng 4 mục:

- **Điều kiện tiên quyết (Preconditions):** trạng thái DB, tài khoản, màn hình
  xuất phát.
- **Các bước thực hiện (Steps):** thao tác chính xác từng bước, ghi rõ đường
  dẫn màn hình (`/`, `/book`, `/stay`, `/folio`, `/rooms`, `/onboarding`).
- **Kết quả mong đợi (Expected):** điều phải quan sát được sau mỗi bước, kèm
  key catalogue nơi câu chữ được khẳng định.
- **Truy vết (AC-DSK trace):** điều kiện nghiệm thu trong
  `docs/product/acceptance-criteria.md` (mục 11) mà case này kiểm tra.

### 0.3. Ghi kết quả

Với mỗi case, người kiểm thử ghi `Đạt` / `Không đạt` kèm bằng chứng (ảnh chụp
màn hình hoặc câu chữ thực tế quan sát được). Case `Không đạt` phải ghi rõ bước
nào lệch khỏi "Kết quả mong đợi" và mở issue mới, không sửa tài liệu này tại
chỗ.

### 0.4. Vỏ chung áp dụng cho mọi màn hình (Shared shell)

Trước khi chạy case của từng màn hình, xác nhận vỏ chung đạt trên màn hình đó:

- Header xanh (teal) hiển thị đúng tên khách sạn đã cấu hình, không phải nội
  dung ví dụ của bản thiết kế (AC-DSK-1, AC-DSK-8).
- Các tab điều hướng theo đúng thứ tự canvas-manifest: Main, Stay, Onboarding,
  Rooms, Book, Folio; màn hình đang mở được làm nổi bật (AC-DSK-1,
  key `desk.shell.nav_desk`, `desk.shell.nav_stay`, `desk.shell.nav_onboarding`,
  `desk.shell.nav_rooms`, `desk.shell.nav_book`, `desk.shell.nav_folio`).
- Nút chuyển ngôn ngữ đổi TOÀN BỘ màn hình giữa EN và VI, không lẫn lộn hai
  ngôn ngữ trên cùng một màn hình (AC-DSK-1, AC-DSK-8; key `desk.shell.locale_en`,
  `desk.shell.locale_vi`).

## 1. Màn hình Main — bảng tổng quan (`/`)

### QA-MAIN-1 — Bảng Main hiển thị đủ 5 nhóm theo thiết kế

- **Điều kiện tiên quyết:** DB đã seed: hôm nay có ít nhất 1 khách đến
  (arrival), 1 khách đang ở (in-house), 1 phòng `vacant-dirty`, 1 phòng
  out-of-service có lý do và ngày.
- **Các bước thực hiện:**
  1. Mở `/` (Main).
  2. Đọc từng nhóm hiển thị trên bảng.
- **Kết quả mong đợi:**
  1. Nhóm arrivals-today liệt kê đúng khách đến hôm nay
     (`desk.today.arrivals`); nhóm in-house liệt kê đúng khách đang ở
     (`desk.today.in_house`); nhóm departures hiển thị danh sách trả phòng
     hoặc trạng thái rỗng tường minh (`desk.today.departures`,
     `desk.today.empty_departures`).
  2. Nhóm need-cleaning liệt kê phòng cần dọn kèm 2 nút thao tác
     (`desk.today.need_cleaning`, `desk.today.mark_cleaned`,
     `desk.today.mark_inspected`); nhóm out-of-service hiển thị lý do và ngày
     (`desk.today.out_of_service_detail`).
- **Truy vết:** AC-DSK-2.

### QA-MAIN-2 — Hai nút housekeeping đổi trạng thái phòng, số liệu làm mới

- **Điều kiện tiên quyết:** như QA-MAIN-1; có ít nhất 1 phòng `vacant-dirty`;
  ghi nhớ số lượng need-cleaning trước khi bấm.
- **Các bước thực hiện:**
  1. Mở `/`, tại nhóm need-cleaning bấm `desk.today.mark_cleaned` trên một
     phòng dirty.
  2. Quan sát bảng sau khi bấm; sau đó bấm `desk.today.mark_inspected` trên
     chính phòng đó.
  3. Quan sát bảng lần nữa.
- **Kết quả mong đợi:**
  1. Sau bước 1, phòng chuyển sang trạng thái clean (chờ kiểm tra), số lượng
     need-cleaning giảm đúng 1, không cần tải lại trang.
  2. Sau bước 2, phòng chuyển sang inspected (sẵn sàng gán nhận phòng), số
     lượng trên bảng làm mới khớp với thực tế.
- **Truy vết:** AC-DSK-2.

### QA-MAIN-3 — Trạng thái rỗng diễn đạt bằng lời rõ ràng

- **Điều kiện tiên quyết:** DB mà hôm nay không có arrival/in-house/departure
  nào (hoặc DB mới seed tối thiểu).
- **Các bước thực hiện:**
  1. Mở `/` và đọc toàn bộ bảng.
- **Kết quả mong đợi:** mỗi danh sách trống hiển thị một câu rỗng tường minh
  thay vì bảng trắng: `desk.today.empty_arrivals`,
  `desk.today.empty_inhouse`, `desk.today.empty_departures`,
  `desk.today.empty_dirty`, `desk.today.empty_uninspected`,
  `desk.today.empty_outoforder`.
- **Truy vết:** AC-DSK-2.

## 2. Màn hình Book — đặt phòng (`/book`)

### QA-BOOK-1 — Bố cục 2 cột đúng thiết kế

- **Điều kiện tiên quyết:** DB đã seed; đăng nhập owner; mở `/book`.
- **Các bước thực hiện:**
  1. Quan sát bố cục màn hình Book.
- **Kết quả mong đợi:** cột trái gồm thẻ khách (guest card) nằm trên thẻ báo
  giá (quote card) (`desk.book.guest_heading`, `desk.book.quote_heading`);
  cột phải là thẻ ngày/phòng/giảm giá (dates/room/discount card)
  (`desk.book.stay_heading`, `desk.book.arrival`, `desk.book.departure`,
  `desk.book.room_type`, `desk.book.discount`).
- **Truy vết:** AC-DSK-3.

### QA-BOOK-2 — Tìm khách cũ (gắn cờ returning) và đăng ký khách mới

- **Điều kiện tiên quyết:** DB có 1 khách đã có ít nhất 1 kỳ lưu trú hoàn tất;
  mở `/book`.
- **Các bước thực hiện:**
  1. Nhập tên khách cũ vào `desk.book.guest_name`, bấm `desk.book.find_button`.
  2. Nhập một tên khách chưa từng tồn tại, bấm `desk.book.find_button`, rồi
     bấm `desk.book.register_button`.
- **Kết quả mong đợi:**
  1. Khách cũ hiển thị `desk.book.guest_found` kèm số kỳ lưu trú trước đó
     (returning flag).
  2. Khách lạ hiển thị `desk.book.guest_notfound`, sau khi đăng ký hiển thị
     `desk.book.guest_new`.
- **Truy vết:** AC-DSK-3.

### QA-BOOK-3 — Lấy báo giá rồi xác nhận: có mã tham chiếu và đọc lại giá

- **Điều kiện tiên quyết:** DB đã seed hạng phòng có giá cho ngày đến/đi;
  đã chọn khách ở `/book`.
- **Các bước thực hiện:**
  1. Nhập ngày đến (`desk.book.arrival`), ngày đi (`desk.book.departure`),
     chọn hạng phòng (`desk.book.room_type`), bấm `desk.book.quote_button`.
  2. Kiểm tra thẻ báo giá (`desk.book.quote_night`, `desk.book.quote_total`,
     `desk.book.night_count`), rồi bấm `desk.book.confirm_button`.
  3. Đọc kết quả (`desk.book.reference`, `desk.book.readback`).
- **Kết quả mong đợi:** báo giá hiển thị đủ số đêm, giá từng đêm và tổng tiền;
  sau xác nhận, đặt phòng tồn tại với một mã tham chiếu duy nhất và phần đọc
  lại (`desk.book.readback`) khớp giá đã báo.
- **Truy vết:** AC-DSK-3.

### QA-BOOK-4 — Từ chối đặt phòng nêu rõ lý do

- **Điều kiện tiên quyết:** DB đã seed; mở `/book` với khách đã chọn.
- **Các bước thực hiện:**
  1. Đặt phòng vào ngày hạng phòng đã hết (sold out): kỳ vọng
     `desk.book.refused_soldout`.
  2. Đặt phòng vào ngày hạng phòng chưa có giá: kỳ vọng
     `desk.book.refused_noprice`.
  3. Đặt phòng vi phạm quy tắc lưu trú (ví dụ minimum-stay): kỳ vọng
     `desk.book.refused_restriction` nêu tên quy tắc bị vi phạm.
- **Kết quả mong đợi:** cả 3 trường hợp đều bị từ chối bằng lời rõ ràng nêu
  đúng lý do, không tạo đặt phòng nào.
- **Truy vết:** AC-DSK-3.

## 3. Màn hình Stay — nhận/trả phòng (`/stay`)

### QA-STAY-1 — Chưa chọn phòng: placeholder tường minh, nhận phòng bị chặn

- **Điều kiện tiên quyết:** DB có 1 đặt phòng đã xác nhận (confirmed) chưa nhận
  phòng; mở `/stay`.
- **Các bước thực hiện:**
  1. Chọn đặt phòng tại danh sách arrivals (`desk.stay.arrivals`).
  2. Đọc ô chọn phòng (`desk.stay.room_label`) khi chưa chọn gì.
  3. Thử bấm `desk.stay.checkin_button` khi chưa chọn phòng.
- **Kết quả mong đợi:** ô chọn phòng hiển thị placeholder tường minh kèm gợi ý
  chọn phòng sẵn sàng (`desk.stay.choose_room`, `desk.stay.room_hint`); bấm
  nhận phòng khi chưa chọn phòng bị chặn với `desk.stay.need_room` và không
  gọi gán phòng.
- **Truy vết:** AC-DSK-4.

### QA-STAY-2 — Nhận phòng với phòng sẵn sàng

- **Điều kiện tiên quyết:** như QA-STAY-1; có ít nhất 1 phòng
  `vacant-inspected` đúng hạng phòng đã đặt.
- **Các bước thực hiện:**
  1. Tại `/stay`, chọn đặt phòng, chọn phòng sẵn sàng, bấm
     `desk.stay.checkin_button`.
  2. Kiểm tra danh sách in-house (`desk.stay.in_house`) và trạng thái phòng.
- **Kết quả mong đợi:** hiển thị `desk.stay.checked_in` (hoặc
  `desk.stay.checked_in_named`); đặt phòng thành stay in-house gắn với phòng,
  phòng chuyển occupied.
- **Truy vết:** AC-DSK-4.

### QA-STAY-3 — Trả phòng: folio chưa thanh toán thì bị chặn nếu thiếu duyệt chi

- **Điều kiện tiên quyết:** 1 stay in-house có folio còn số dư mở (open balance);
  mở `/stay`.
- **Các bước thực hiện:**
  1. Chọn stay tại in-house, bấm `desk.stay.review_button`, đọc
     `desk.stay.folio_balance`.
  2. Bấm `desk.stay.checkout_button` khi chưa có phê duyệt.
  3. Ghi phê duyệt (`desk.stay.approved_by`, `desk.stay.approval_reason`,
     `desk.stay.need_approver`), xác nhận `desk.stay.approval_recorded`, rồi
     bấm trả phòng lại.
- **Kết quả mong đợi:** bước 2 bị từ chối với `desk.stay.refused_open_balance`;
  sau phê duyệt, trả phòng thành công (`desk.stay.checked_out` hoặc
  `desk.stay.checked_out_named`), stay đóng, phòng thành vacant-dirty.
- **Truy vết:** AC-DSK-4.

## 4. Màn hình Folio — bảng kê (`/folio`)

### QA-FOLIO-1 — Mở folio: một folio duy nhất, bố cục 2 thẻ

- **Điều kiện tiên quyết:** 1 stay in-house đã có folio; mở `/folio`.
- **Các bước thực hiện:**
  1. Nhập stay id (`desk.folio.stay_id`), bấm `desk.folio.open_button`.
  2. Quan sát bố cục và số dư (`desk.folio.folio_balance`).
- **Kết quả mong đợi:** đúng một folio của stay với mọi dòng charge/payment và
  số dư chạy (`desk.folio.folio_heading`, `desk.folio.folio_line`); bố cục 2
  thẻ charges/payments (`desk.folio.charge_heading`,
  `desk.folio.payment_heading`).
- **Truy vết:** AC-DSK-5.

### QA-FOLIO-2 — Ghi charge: số dư tăng đúng số tiền

- **Điều kiện tiên quyết:** như QA-FOLIO-1; folio đang mở; ghi nhớ số dư.
- **Các bước thực hiện:**
  1. Chọn loại khoản (`desk.folio.item_kind`: `desk.folio.kind_room` hoặc
     `desk.folio.kind_extra`), nhập tên khoản (`desk.folio.item_name`) và số
     tiền (`desk.folio.amount_label`), bấm `desk.folio.charge_button`.
- **Kết quả mong đợi:** hiển thị `desk.folio.charged`; dòng charge mới có đủ
  khoản, số tiền, thời gian ghi; số dư tăng đúng số tiền dòng mới.
- **Truy vết:** AC-DSK-5.

### QA-FOLIO-3 — Ghi thanh toán: số dư giảm, định dạng tiền đúng locale

- **Điều kiện tiên quyết:** folio còn số dư dương; mở `/folio`.
- **Các bước thực hiện:**
  1. Chọn phương thức (`desk.folio.method_label`: cash hoặc card), nhập số
     tiền, bấm `desk.folio.pay_button`.
  2. Bật locale toggle sang EN rồi về VI, đọc lại các số tiền trên folio.
- **Kết quả mong đợi:** hiển thị `desk.folio.paid`; payment có đủ phương thức
  và thời gian, số dư giảm đúng số tiền đã trả; số tiền định dạng đúng theo
  từng locale EN/VI.
- **Truy vết:** AC-DSK-5, AC-DSK-8.

### QA-FOLIO-4 — Lỗi nhập liệu diễn đạt bằng lời rõ ràng

- **Điều kiện tiên quyết:** mở `/folio`.
- **Các bước thực hiện:**
  1. Bấm `desk.folio.open_button` khi chưa nhập stay: kỳ vọng
     `desk.folio.need_stay`.
  2. Ghi charge thiếu thông tin: kỳ vọng `desk.folio.need_charge`; ghi payment
     thiếu thông tin: kỳ vọng `desk.folio.need_payment`.
  3. Ghi charge với khoản chưa định nghĩa: kỳ vọng
     `desk.folio.refused_unknown_item`.
- **Kết quả mong đợi:** mọi lỗi đều diễn đạt bằng lời rõ ràng nêu đúng trường
  thiếu/sai, không ghi dòng sai nào vào folio.
- **Truy vết:** AC-DSK-5.

## 5. Màn hình Rooms — sơ đồ phòng + nút housekeeping (`/rooms`)

### QA-ROOMS-1 — Sơ đồ gom theo tầng, số tổng luôn khớp số thẻ

- **Điều kiện tiên quyết:** DB đã seed phòng trên 3 tầng với đủ 5 trạng thái
  (occupied, ready/inspected, needs-cleaning, awaiting-inspection,
  out-of-service); mở `/rooms`.
- **Các bước thực hiện:**
  1. Đọc khối tổng hợp (`desk.rooms.summary_heading`) rồi đếm thẻ phòng thực
     tế theo từng tầng (`desk.rooms.floor_title`).
  2. Đọc nội dung từng thẻ phòng.
- **Kết quả mong đợi:** số tổng luôn bằng số thẻ phòng đang hiển thị; mỗi thẻ
  có chip trạng thái đúng (`desk.rooms.chip_ready`,
  `desk.rooms.chip_occupied`, `desk.rooms.chip_needs_cleaning`,
  `desk.rooms.chip_awaiting_inspection`, `desk.rooms.chip_out_of_service`),
  hạng phòng, và ghi chú trực tiếp (`desk.rooms.note_occupied` kèm khách và
  ngày trả phòng, `desk.rooms.note_out_of_service` kèm lý do và ngày,
  `desk.rooms.note_arrival` cho khách sắp đến, `desk.rooms.note_ready` cho
  phòng sẵn sàng).
- **Truy vết:** AC-DSK-6.

### QA-ROOMS-2 — Nút Mark cleaned trên từng thẻ: dirty thành clean, số tổng làm mới

- **Điều kiện tiên quyết:** như QA-ROOMS-1; có ít nhất 1 thẻ dirty; ghi nhớ số
  tổng needs-cleaning.
- **Các bước thực hiện:**
  1. Tại `/rooms`, trên một thẻ dirty bấm `desk.today.mark_cleaned`.
  2. Quan sát thẻ và khối tổng hợp sau khi bấm.
- **Kết quả mong đợi:** phòng chuyển vacant-dirty thành clean (chip
  `desk.rooms.chip_awaiting_inspection`, ghi chú
  `desk.rooms.note_awaiting_inspection`); số tổng làm mới khớp số thẻ, không
  cần tải lại trang.
- **Truy vết:** AC-DSK-6 (tái dùng vốn từ chip chung với bảng Main, AC-DSK-2).

### QA-ROOMS-3 — Nút Mark inspected trên từng thẻ; chuyển đổi bị từ chối giữ nguyên sơ đồ

- **Điều kiện tiên quyết:** như QA-ROOMS-1; có ít nhất 1 thẻ clean
  (awaiting-inspection).
- **Các bước thực hiện:**
  1. Trên một thẻ clean bấm `desk.today.mark_inspected`; quan sát thẻ và số tổng.
  2. Thử ép chuyển đổi không hợp lệ (ví dụ phòng occupied bấm dọn/kiểm tra nếu
     nút hiện, hoặc gọi sai thứ tự dirty thành inspected): quan sát sơ đồ.
- **Kết quả mong đợi:** bước 1 đưa phòng thành inspected (chip
  `desk.rooms.chip_ready`, ghi chú `desk.rooms.note_ready` sẵn sàng gán nhận
  phòng); bước 2 bị từ chối và sơ đồ giữ nguyên, không mất hay sai thẻ nào.
- **Truy vết:** AC-DSK-6.

## 6. Onboarding — trình hướng dẫn 4 bước (`/onboarding`)

### QA-ONB-0 — Cổng vào: chỉ chạy trên DB trống

- **Điều kiện tiên quyết:** (a) một DB trống hoàn toàn; (b) một DB đã seed.
- **Các bước thực hiện:**
  1. Mở app trên DB trống.
  2. Mở app (kể cả đường dẫn `/onboarding`) trên DB đã seed.
- **Kết quả mong đợi:** DB trống tự mở trình hướng dẫn với tiến trình và điều
  hướng back/continue (`desk.onboarding.title`, `desk.onboarding.intro`,
  `desk.onboarding.progress`, `desk.onboarding.continue`,
  `desk.onboarding.back`); DB đã seed không bao giờ mở trình hướng dẫn.
- **Truy vết:** AC-DSK-7.

### QA-ONB-1 — Bước 1: tên khách sạn được lưu, hiện lên header và bản in

- **Điều kiện tiên quyết:** DB trống; trình hướng dẫn đang ở bước 1
  (`desk.onboarding.step1_heading`).
- **Các bước thực hiện:**
  1. Bấm `desk.onboarding.continue` khi để trống tên: kỳ vọng
     `desk.onboarding.name_required`.
  2. Nhập tên khách sạn (`desk.onboarding.hotel_name_label`,
     `desk.onboarding.hotel_name_placeholder`), bấm tiếp tục.
  3. Kiểm tra header vỏ chung và mở một bản in (confirmation/invoice).
- **Kết quả mong đợi:** tên trống bị từ chối nêu đúng trường tên; sau khi lưu,
  tên khách sạn đã cấu hình hiện trên header thay nội dung ví dụ
  (`desk.shell.brand` đọc từ cấu hình) và trên mọi tài liệu in.
- **Truy vết:** AC-DSK-7, AC-DSK-8.

### QA-ONB-2 — Bước 2: hồ sơ khách sạn còn lại (50%)

- **Điều kiện tiên quyết:** DB trống; đã xong bước 1; đang ở bước 2
  (`desk.onboarding.step2_heading`, tiến trình 50%).
- **Các bước thực hiện:**
  1. Nhập địa chỉ/số điện thoại/email (`desk.onboarding.address_label`,
     `desk.onboarding.phone_label`, `desk.onboarding.email_label`), để trống
     múi giờ (`desk.onboarding.timezone_label`), bấm tiếp tục: kỳ vọng
     `desk.onboarding.timezone_required`, không lưu gì cho bước này.
  2. Nhập múi giờ hợp lệ, nhập retention floor không phải số nguyên hoặc số âm
     (`desk.onboarding.retention_floor_label`): kỳ vọng
     `desk.onboarding.retention_floor_invalid`; để trống retention thì giữ
     mặc định 365 ngày.
  3. Nhập hợp lệ toàn bộ, bấm tiếp tục; sau đó bấm back từ bước 3.
- **Kết quả mong đợi:** liên hệ từng mục là tùy chọn (`desk.onboarding.step2_optional_note`)
  và được lưu nguyên văn; lỗi nêu đúng trường timezone/retention, giữ người
  dùng ở bước 2; back từ bước 3 giữ nguyên giá trị đã nhập ở bước 2.
- **Truy vết:** AC-DSK-9.

### QA-ONB-3 — Bước 3: phòng và hạng phòng (75%)

- **Điều kiện tiên quyết:** DB trống; đã xong bước 2; đang ở bước 3
  (`desk.onboarding.step3_heading`, tiến trình 75%).
- **Các bước thực hiện:**
  1. Để trống tên hạng phòng, bấm tiếp tục: kỳ vọng
     `desk.onboarding.room_type_name_required`.
  2. Thêm hạng phòng hợp lệ nhưng để trống số phòng, bấm tiếp tục: kỳ vọng
     `desk.onboarding.room_number_required`.
  3. Nhập 2 phòng trùng số trong cùng đợt: kỳ vọng
     `desk.onboarding.room_number_duplicate` nêu đúng số phòng, không lưu gì.
  4. Nhập phòng không gắn hạng phòng nào đã lưu ở bước này: kỳ vọng
     `desk.onboarding.room_type_required`.
  5. Nhập hợp lệ (tên hạng phòng, sức chứa, số phòng, tầng), bấm tiếp tục;
     sau đó bấm back từ bước 4.
- **Kết quả mong đợi:** mọi lỗi nêu đúng trường thiếu/trùng/thiếu liên kết,
  giữ người dùng ở bước 3 và không lưu gì khi lỗi; sau khi lưu, phòng xuất
  hiện trong tồn kho, phòng bán được và lịch với đúng sức chứa và hạng phòng;
  back từ bước 4 giữ nguyên giá trị đã nhập ở bước 3.
- **Truy vết:** AC-DSK-10.

### QA-ONB-4 — Bước 4: tài khoản owner đầu tiên (100%)

- **Điều kiện tiên quyết:** DB trống; đã xong bước 3; đang ở bước 4
  (`desk.onboarding.step4_heading`, tiến trình 100%).
- **Các bước thực hiện:**
  1. Bấm `desk.onboarding.finish` khi để trống: kỳ vọng
     `desk.onboarding.display_name_required`, `desk.onboarding.identity_required`,
     `desk.onboarding.secret_required` nêu đúng từng trường.
  2. Nhập sign-in identity đã có người dùng: kỳ vọng
     `desk.onboarding.identity_taken`, không tạo tài khoản nào.
  3. Nhập hợp lệ (tên hiển thị, identity mới, secret; vai trò cố định owner —
     `desk.onboarding.role_owner_note`), bấm finish.
  4. Đăng nhập bằng tài khoản owner mới; tải lại app.
- **Kết quả mong đợi:** owner đăng nhập được và chỉ chạm đúng chức năng owner
  được phép; trình hướng dẫn hoàn tất về desk và không bao giờ hiện lại trên
  DB nay đã seed; back từ bước 4 (trước khi finish) giữ nguyên giá trị đã nhập.
- **Truy vết:** AC-DSK-11, AC-DSK-7 (không hiện lại).

## 7. Hành trình đầu-cuối (End-to-end) — DB trống tới dọn/kiểm tra

### QA-E2E-1 — Fresh DB -> onboarding -> rooms -> book -> check-in -> folio -> checkout -> clean/inspect

- **Điều kiện tiên quyết:** DB trống hoàn toàn; trình duyệt đã đăng xuất; đã
  biết nuclear path: `/onboarding`, `/rooms`, `/book`, `/stay`, `/folio`, `/`.
- **Các bước thực hiện:**
  1. Onboarding (DB trống): mở app, hoàn tất 4 bước (tên khách sạn ->
     hồ sơ còn lại -> 1 hạng phòng + 2 phòng, một `vacant-dirty` một
     `vacant-inspected` -> tài khoản owner), finish về desk.
  2. Rooms: mở `/rooms`, xác nhận 2 phòng mới hiện đúng tầng với chip và số
     tổng khớp.
  3. Book: mở `/book`, đăng ký khách mới, lấy báo giá cho hôm nay tới ngày mai,
     xác nhận đặt phòng, ghi lại mã tham chiếu.
  4. Check-in: mở `/stay`, chọn đặt phòng vừa tạo, chọn phòng ready, nhận phòng.
  5. Folio: mở `/folio`, mở folio của stay, ghi 1 charge
     (`desk.folio.kind_extra`), ghi 1 payment đủ để số dư về 0, đối chiếu số dư.
  6. Checkout: về `/stay`, review folio (`desk.stay.balance_zero`), trả phòng.
  7. Clean/inspect: mở `/` (hoặc `/rooms`), bấm `desk.today.mark_cleaned` rồi
     `desk.today.mark_inspected` trên phòng vừa trả; xác nhận phòng ready gán
     được cho lượt nhận phòng tiếp theo.
- **Kết quả mong đợi:**
  1. Wizard hoàn tất về desk, không hiện lại khi tải lại.
  2. Sơ đồ phòng khớp 2 phòng mới, số tổng bằng số thẻ.
  3. Đặt phòng có mã tham chiếu duy nhất, giá đọc lại khớp báo giá.
  4. Stay thành in-house gắn đúng phòng, phòng occupied.
  5. Số dư folio: tăng đúng charge, giảm đúng payment, về 0.
  6. Trả phòng thành công, stay đóng, phòng thành vacant-dirty.
  7. Phòng đi hết dirty thành clean thành inspected, sẵn sàng cho lượt nhận
     phòng tiếp theo — khép kín vòng đời.
- **Truy vết:** AC-DSK-7, AC-DSK-9, AC-DSK-10, AC-DSK-11 (onboarding) →
  AC-DSK-6 (rooms) → AC-DSK-3 (book) → AC-DSK-4 (stay + checkout) →
  AC-DSK-5 (folio) → AC-DSK-2 (clean/inspect trên Main); AC-DSK-1 và AC-DSK-8
  (vỏ chung + catalogue) kiểm tra xuyên suốt mọi bước.

## 9. Ma trận biên + xác thực (Validation + edge-case matrix, Refs #450)

Mục này mở rộng bộ kiểm thử với ma trận biên và xác thực cho 6 màn
hình desk UI, theo yêu cầu của chủ sở hữu: đầu vào sai, trùng lặp/
idempotency, overbooking, nhận phòng đồng thời, luồng trả phòng khi
phòng bẩn, hiển thị lỗi API không rò rỉ kỹ thuật, bấm đôi, tải lại/
back giữa luồng, đổi locale giữa luồng.

### 9.0. Quy ước phân loại mỗi case

Mỗi case mang một dòng **Phân loại** với đúng một trong ba giá trị:

- **Scriptable:** assertion kiểm tra được bằng guard tự động trong
  follow-up của `dev` (điều kiện + từ chối + trạng thái cuối đều quan
  sát được qua API/DOM, kèm AC-DSK trace cho guard tương lai). Người
  kiểm thử tay vẫn chạy case để lấy bằng chứng câu chữ.
- **Human-only:** chỉ người kiểm thử đánh giá được (cảm nhận UX, câu
  chữ tự nhiên, highlight màn hình đang mở, thứ tự tab, vị trí focus)
  — không viết guard cho phần này.
- **Hỗn hợp (Mixed):** liệt kê tách bạch assertion nào scriptable
  (cho guard tương lai) và điểm nào human-only.

Mọi case vẫn giữ đúng cấu trúc 4 mục (điều kiện tiên quyết, các bước,
kết quả mong đợi kèm key catalogue, truy vết AC-DSK). Quy tắc câu chữ
lỗi áp dụng chung: mọi lỗi và từ chối phải đọc thành câu rõ ràng, nêu
đúng lý do, không rò rỉ mã kỹ thuật thô (quy tắc plain-words
`FR-DSP-3`; kiểm tra đối chiếu ở cả hai locale EN/VI).

### QA-EDGE-1 — Mã đặt phòng không tồn tại (unknown booking ref)

- **Phân loại:** Scriptable (guard tương lai: nhập ref lạ → từ chối
  đúng key, không gọi gán phòng; trace AC-DSK-4).
- **Điều kiện tiên quyết:** DB đã seed; mở `/stay`.
- **Các bước thực hiện:**
  1. Tại ô mã đặt phòng (`desk.stay.booking_ref`), nhập một mã không
     tồn tại (ví dụ `NOPE-0000`), bấm nhận phòng
     (`desk.stay.checkin_button`).
  2. Đọc câu từ chối; kiểm tra danh sách in-house
     (`desk.stay.in_house`) không đổi.
- **Kết quả mong đợi:** hiển thị
  `desk.stay.refused_unknown_ref` (mã đặt phòng không tồn tại, kèm gợi
  ý kiểm tra lại mã); không tạo stay nào, không đổi trạng thái phòng
  nào.
- **Truy vết:** AC-DSK-4.

### QA-EDGE-2 — Số tiền âm (negative amounts)

- **Phân loại:** Scriptable (guard tương lai: charge/payment âm → từ
  chối đúng key, số dư giữ nguyên; trace AC-DSK-5).
- **Điều kiện tiên quyết:** 1 stay in-house đã có folio; mở `/folio`,
  mở folio của stay, ghi nhớ số dư.
- **Các bước thực hiện:**
  1. Ghi charge với số tiền âm: kỳ vọng `desk.folio.need_charge`
     (nhập tên khoản và số tiền không âm).
  2. Ghi payment với số tiền âm hoặc bằng 0: kỳ vọng
     `desk.folio.need_payment` (nhập số tiền dương).
  3. Đọc lại số dư (`desk.folio.folio_balance`).
- **Kết quả mong đợi:** cả hai thao tác đều bị chặn bằng lời rõ ràng
  nêu đúng trường số tiền; không ghi dòng sai nào vào folio, số dư
  giữ nguyên.
- **Truy vết:** AC-DSK-5.

### QA-EDGE-3 — Ngày đi trước ngày đến (departure-before-arrival)

- **Phân loại:** Scriptable (guard tương lai: khoảng ngày đảo ngược →
  từ chối nêu đúng vấn đề ngày, không tạo đặt phòng; trace AC-DSK-3).
- **Điều kiện tiên quyết:** DB đã seed hạng phòng có giá; đã chọn
  khách ở `/book`.
- **Các bước thực hiện:**
  1. Nhập ngày đến (`desk.book.arrival`) SAU ngày đi
     (`desk.book.departure`), bấm `desk.book.quote_button`.
  2. Nếu báo giá bị chặn, thử tiếp bấm `desk.book.confirm_button` (khi
     nút hiện) và đọc kết quả; kiểm tra không có mã tham chiếu mới
     (`desk.book.reference`).
- **Kết quả mong đợi:** báo giá/xác nhận bị từ chối bằng câu rõ ràng
  nêu đúng vấn đề thứ tự ngày (người kiểm thử ghi lại câu chữ thực tế
  quan sát được ở cả hai locale để đối chiếu catalogue); không tạo đặt
  phòng nào.
- **Truy vết:** AC-DSK-3.

### QA-EDGE-4 — Trường bắt buộc bỏ trống (empty required fields)

- **Phân loại:** Hỗn hợp — Scriptable: mọi lần bỏ trống đều bị chặn và
  nêu đúng tên trường (guard tương lai trace AC-DSK-3, AC-DSK-4,
  AC-DSK-5); Human-only: trường lỗi được highlight trực quan, focus
  rơi vào trường lỗi đầu tiên, thứ tự tab đi qua các trường theo đúng
  thứ tự hiển thị.
- **Điều kiện tiên quyết:** DB đã seed; mở `/book`, `/stay`, `/folio`.
- **Các bước thực hiện:**
  1. Book: bấm `desk.book.find_button` khi tên khách trống — kỳ vọng
     câu nêu đúng trường tên; bấm `desk.book.quote_button` khi chưa
     nhập ngày — kỳ vọng câu nêu đúng trường ngày; bấm
     `desk.book.confirm_button` khi chưa báo giá — kỳ vọng
     `desk.book.no_quote`.
  2. Stay: bấm nhận phòng khi chưa nhập mã đặt phòng — kỳ vọng
     `desk.stay.need_ref`; bấm khi chưa chọn phòng — kỳ vọng
     `desk.stay.need_room`.
  3. Folio: bấm `desk.folio.open_button` khi chưa nhập stay — kỳ vọng
     `desk.folio.need_stay`.
- **Kết quả mong đợi:** mỗi thao tác đều bị chặn bằng lời rõ ràng nêu
  đúng trường thiếu, không tạo bản ghi nửa vời nào; về cảm nhận,
  trường lỗi được làm nổi bật và focus/tab đi đúng thứ tự.
- **Truy vết:** AC-DSK-3, AC-DSK-4, AC-DSK-5.

### QA-EDGE-5 — Xác nhận trùng / idempotency (duplicates)

- **Phân loại:** Scriptable (guard tương lai: gửi xác nhận trùng →
  đúng một đặt phòng tồn tại; trace AC-DSK-3).
- **Điều kiện tiên quyết:** DB đã seed hạng phòng có giá cho ngày
  đến/đi; đã chọn khách và đã lấy báo giá ở `/book`.
- **Các bước thực hiện:**
  1. Bấm `desk.book.confirm_button`, ghi lại mã tham chiếu
     (`desk.book.reference`).
  2. Gửi lại cùng xác nhận (bấm lại / thử lại khi mạng chập chờn),
     rồi kiểm tra danh sách đặt phòng và số lượng bản ghi đã tạo.
- **Kết quả mong đợi:** đúng một đặt phòng tồn tại với một mã tham
  chiếu duy nhất; lần gửi trùng không tạo đặt phòng thứ hai (trả về
  cùng mã tham chiếu hoặc từ chối trùng bằng lời rõ ràng, không rò rỉ
  mã kỹ thuật).
- **Truy vết:** AC-DSK-3.

### QA-EDGE-6 — Overbooking vượt số phòng bán được

- **Phân loại:** Scriptable (guard tương lai: đặt vượt sellable units
  → `refused_soldout`, không tạo đặt phòng; trace AC-DSK-3).
- **Điều kiện tiên quyết:** hạng phòng chỉ còn đúng 1 đơn vị bán được
  cho khoảng ngày kiểm thử (đặt trước các đơn vị còn lại); mở `/book`
  với khách đã chọn.
- **Các bước thực hiện:**
  1. Đặt 1 phòng trong khoảng ngày đó: xác nhận thành công, ghi lại mã
     tham chiếu.
  2. Đặt thêm 1 phòng cùng hạng cùng khoảng ngày: đọc kết quả.
- **Kết quả mong đợi:** lần đặt thứ hai bị từ chối với
  `desk.book.refused_soldout` (hết phòng trống trong các ngày đã
  chọn); không tạo đặt phòng nào thêm.
- **Truy vết:** AC-DSK-3.

### QA-EDGE-7 — Hai lễ tân nhận phòng cùng phòng đồng thời (concurrent check-in)

- **Phân loại:** Hỗn hợp — Scriptable: đúng một check-in chiếm được
  phòng, bên còn lại nhận `refused_taken` và không tạo stay trùng
  (guard tương lai trace AC-DSK-4); Human-only: câu từ chối đọc thân
  thiện, gợi ý chọn phòng sẵn sàng khác, không đổ lỗi cho người dùng.
- **Điều kiện tiên quyết:** 2 đặt phòng đã xác nhận cùng hạng phòng;
  chỉ còn đúng 1 phòng `vacant-inspected` thuộc hạng đó; mở `/stay`
  trên 2 phiên (2 tab trình duyệt hoặc 2 máy).
- **Các bước thực hiện:**
  1. Cả hai phiên cùng chọn 2 đặt phòng khác nhau và cùng chọn chung
     một phòng sẵn sàng, rồi bấm `desk.stay.checkin_button` càng đồng
     thời càng tốt.
  2. Đọc kết quả cả hai phiên; kiểm tra trạng thái phòng và danh sách
     in-house (`desk.stay.in_house`).
- **Kết quả mong đợi:** đúng một phiên hiển thị
  `desk.stay.checked_in`/`desk.stay.checked_in_named`; phiên còn lại
  hiển thị `desk.stay.refused_taken` (phòng vừa có khách, gợi ý chọn
  phòng khác); phòng thành occupied gắn đúng một stay, không có stay
  trùng phòng.
- **Truy vết:** AC-DSK-4.

### QA-EDGE-8 — Trả phòng khi phòng bẩn (dirty-room checkout flow)

- **Phân loại:** Scriptable (guard tương lai: checkout → vacant-dirty;
  phòng dirty không được gán nhận phòng; sau clean+inspect lại gán
  được; trace AC-DSK-4, AC-DSK-6).
- **Điều kiện tiên quyết:** 1 stay in-house có folio số dư 0; mở
  `/stay`.
- **Các bước thực hiện:**
  1. Trả phòng (`desk.stay.checkout_button`): kỳ vọng
     `desk.stay.checked_out`/`desk.stay.checked_out_named`.
  2. Mở `/rooms`: kiểm tra chip phòng vừa trả là
     `desk.rooms.chip_needs_cleaning` (ghi chú
     `desk.rooms.note_needs_cleaning`).
  3. Mở `/stay` với một đặt phòng cùng hạng: xác nhận phòng bẩn KHÔNG
     xuất hiện trong danh sách phòng sẵn sàng (kỳ vọng gợi ý
     `desk.stay.room_hint` hoặc `desk.stay.no_ready_rooms` nếu không
     còn phòng sạch).
  4. Bấm `desk.today.mark_cleaned` rồi `desk.today.mark_inspected`
     trên phòng đó; thử gán nhận phòng lại.
- **Kết quả mong đợi:** phòng đi đúng vòng dirty → clean →
  inspected; khi còn bẩn thì không gán được cho nhận phòng; sau khi
  kiểm tra xong thì gán được bình thường.
- **Truy vết:** AC-DSK-4, AC-DSK-6.

### QA-EDGE-9 — Lỗi API hiển thị bằng lời rõ ràng, không rò rỉ kỹ thuật

- **Phân loại:** Hỗn hợp — Scriptable: khi API lỗi, màn hình hiển thị
  đúng key catalogue thân thiện (guard tương lai trace AC-DSK-3,
  AC-DSK-8); Human-only: câu chữ đọc tự nhiên với lễ tân, không còn
  sót mã trạng thái/mã lỗi/JSON thô trên màn hình.
- **Điều kiện tiên quyết:** DB đã seed; mở `/book` (màn hình đại diện
  cho quy tắc hiển thị lỗi, Refs FR-DSK-3 trong issue #450 tức quy tắc
  plain-words `FR-DSP-3`).
- **Các bước thực hiện:**
  1. Gây lỗi phía máy chủ khi đang thao tác Book (ví dụ dừng backend
     rồi bấm `desk.book.quote_button`, hoặc thao tác trên dữ liệu vừa
     bị xóa ở phiên khác).
  2. Đọc toàn bộ thông báo lỗi hiện trên màn hình ở locale VI rồi
     chuyển sang EN đọc lại.
- **Kết quả mong đợi:** màn hình hiển thị câu thân thiện (ví dụ
  `desk.shell.request_failed`: thao tác không thành công, gợi ý thử
  lại và báo quản lý); tuyệt đối không lộ mã HTTP, mã lỗi nội bộ,
  stack trace hay JSON thô; câu chữ đúng locale đang bật, không lẫn
  lộn hai ngôn ngữ.
- **Truy vết:** AC-DSK-3, AC-DSK-8.

### QA-EDGE-10 — Bấm đôi nút ghi (double-submit)

- **Phân loại:** Scriptable (guard tương lai: bấm đôi → đúng một tác
  vụ có hiệu lực trên mỗi màn hình; trace AC-DSK-3, AC-DSK-4,
  AC-DSK-5).
- **Điều kiện tiên quyết:** DB đã seed; có đặt phòng confirmed, stay
  in-house có folio; mở `/book`, `/stay`, `/folio`.
- **Các bước thực hiện:**
  1. Book: đã có báo giá, bấm đúp `desk.book.confirm_button`; đếm số
     đặt phòng được tạo (kỳ vọng nút chuyển trạng thái bận
     `desk.book.confirming` và chỉ một lần xác nhận có hiệu lực).
  2. Stay: bấm đúp `desk.stay.checkin_button` trên một đặt phòng +
     phòng sẵn sàng (kỳ vọng `desk.stay.checking_in`, một stay duy
     nhất; lần thứ hai nếu lọt qua phải nhận
     `desk.stay.refused_checked_in`).
  3. Folio: bấm đúp `desk.folio.charge_button` và
     `desk.folio.pay_button` (kỳ vọng `desk.folio.charging`/
     `desk.folio.paying`, mỗi loại đúng một dòng mới, số dư đổi đúng
     một lần).
- **Kết quả mong đợi:** không nút nào tạo bản ghi trùng khi bị bấm
  đôi; nút thể hiện trạng thái bận trong lúc gọi API.
- **Truy vết:** AC-DSK-3, AC-DSK-4, AC-DSK-5.

### QA-EDGE-11 — Tải lại / back giữa luồng (mid-flow refresh/back)

- **Phân loại:** Hỗn hợp — Scriptable: sau tải lại/back, không tồn tại
  bản ghi nửa vời và màn hình ở trạng thái hợp lệ (guard tương lai
  trace AC-DSK-3, AC-DSK-4, AC-DSK-7); Human-only: vị trí focus/cuộn
  hợp lý, người dùng hiểu mình đang ở bước nào (tiến trình wizard,
  gợi ý chọn phòng).
- **Điều kiện tiên quyết:** DB đã seed (cho Book/Stay) và một DB trống
  (cho wizard); mở `/book`, `/stay`, `/onboarding`.
- **Các bước thực hiện:**
  1. Book: nhập khách + ngày + hạng phòng, lấy báo giá NHƯNG chưa xác
     nhận, rồi tải lại trang: đọc lại màn hình, kiểm tra chưa có đặt
     phòng nào được tạo.
  2. Stay: chọn đặt phòng ở danh sách arrivals nhưng chưa chọn phòng,
     rồi bấm back trình duyệt và tiến lại (forward): kiểm tra màn
     hình vẫn hiển thị placeholder tường minh (`desk.stay.choose_room`,
     `desk.stay.room_hint`), không kẹt trạng thái.
  3. Onboarding (DB trống): nhập tên khách sạn ở bước 1, sang bước 2
     rồi bấm back về bước 1: kỳ vọng giá trị đã nhập được giữ; tải
     lại trang giữa bước 3: kỳ vọng wizard không tạo phòng nửa vời
     trong tồn kho.
- **Kết quả mong đợi:** không có đặt phòng/stay/phòng nửa vời nào được
  tạo bởi thao tác tải lại/back; màn hình sau điều hướng ở trạng thái
  hợp lệ, dữ liệu đã nhập hợp lệ được giữ lại, người dùng luôn biết
  mình đang ở bước nào.
- **Truy vết:** AC-DSK-3, AC-DSK-4, AC-DSK-7.

### QA-EDGE-12 — Đổi locale giữa luồng (mid-flow locale switch)

- **Phân loại:** Hỗn hợp — Scriptable: sau khi đổi locale, toàn màn
  hình đúng một ngôn ngữ và giá trị đã nhập/số tiền được giữ
  (guard tương lai trace AC-DSK-1, AC-DSK-8); Human-only: câu chữ dịch
  tự nhiên, không cắt/tràn bố cục, thứ tự tab không đổi.
- **Điều kiện tiên quyết:** DB đã seed; có stay in-house có folio;
  mở `/book`, `/folio`.
- **Các bước thực hiện:**
  1. Book: nhập khách + ngày + hạng phòng, lấy báo giá, rồi bật nút
     chuyển ngôn ngữ giữa EN và VI (`desk.shell.locale_en`,
     `desk.shell.locale_vi`): đọc lại toàn màn hình, kiểm tra giá trị
     đã nhập còn nguyên, rồi xác nhận đặt phòng và đọc
     `desk.book.readback`.
  2. Folio: mở folio, ghi 1 charge, rồi đổi locale và đọc lại các số
     tiền: kỳ vọng định dạng tiền đúng theo từng locale, số dư không
     đổi giá trị.
- **Kết quả mong đợi:** sau mỗi lần đổi, TOÀN BỘ màn hình đúng một
  ngôn ngữ (không lẫn lộn EN/VI trên cùng màn hình); mọi giá trị đã
  nhập, báo giá và số dư được giữ nguyên giá trị, chỉ đổi cách diễn
  đạt/định dạng theo locale.
- **Truy vết:** AC-DSK-1, AC-DSK-8.

## 10. Bảng truy vết AC-DSK tới case

| AC-DSK | Case kiểm tra |
|---|---|
| AC-DSK-1 — Vỏ chung đúng thứ tự tab, toggle locale toàn màn hình | Mục 0.4 (mọi màn hình) + mọi bước của QA-E2E-1; QA-EDGE-12 (đổi locale giữa luồng) |
| AC-DSK-2 — Bảng Main + 2 nút housekeeping, số liệu làm mới | QA-MAIN-1, QA-MAIN-2, QA-MAIN-3; QA-E2E-1 bước 7; QA-EDGE-8 (vòng dirty → clean → inspected) |
| AC-DSK-3 — Book bố cục 2 cột, luồng giữ nguyên | QA-BOOK-1..4; QA-E2E-1 bước 3; QA-EDGE-3, QA-EDGE-4, QA-EDGE-5, QA-EDGE-6, QA-EDGE-9, QA-EDGE-10, QA-EDGE-11 |
| AC-DSK-4 — Stay placeholder tường minh + gợi ý, chặn nhận phòng, trả phòng cần folio thanh toán | QA-STAY-1..3; QA-E2E-1 bước 4 và 6; QA-EDGE-1, QA-EDGE-4, QA-EDGE-7, QA-EDGE-8, QA-EDGE-10, QA-EDGE-11 |
| AC-DSK-5 — Folio bố cục 2 thẻ, số dư giữ nguyên | QA-FOLIO-1..4; QA-E2E-1 bước 5; QA-EDGE-2, QA-EDGE-4, QA-EDGE-10 |
| AC-DSK-6 — Sơ đồ phòng, số tổng khớp thẻ | QA-ROOMS-1..3; QA-E2E-1 bước 2; QA-EDGE-8 (phòng bẩn không gán được) |
| AC-DSK-7 — Wizard chỉ chạy lần đầu, bước 1 lưu tên khách sạn | QA-ONB-0, QA-ONB-1; QA-E2E-1 bước 1 và 4; QA-EDGE-11 (tải lại/back giữa wizard) |
| AC-DSK-8 — Catalogue VI-first, tên khách sạn là giá trị cấu hình | Mục 0.4 + QA-ONB-1 + QA-FOLIO-3; xuyên suốt QA-E2E-1; QA-EDGE-9 (lỗi API không rò rỉ kỹ thuật), QA-EDGE-12 |
| AC-DSK-9 — Bước 2: hồ sơ khách sạn còn lại qua đường config | QA-ONB-2; QA-E2E-1 bước 1 |
| AC-DSK-10 — Bước 3: phòng và hạng phòng qua đường seed | QA-ONB-3; QA-E2E-1 bước 1 |
| AC-DSK-11 — Bước 4: tài khoản owner đầu tiên qua đường admin user | QA-ONB-4; QA-E2E-1 bước 1 |

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-597
