(function () {
    'use strict';

    // ====== CẤU HÌNH ======
    const CONFIG = {
        title: 'Thông tin',
        content: `
            <p>Xin chào 👋</p>
            <p>Đây là bảng thông tin được tạo tự động bởi <b>1.js</b>.</p>
            <p>Bạn có thể sửa nội dung trong phần <code>CONFIG.content</code>.</p>
        `,
        buttonColor: '#e74c3c',
        buttonIcon: '💬',
        position: 'bottom-left',
        buttonSize: 56,
        autoOpen: false
    };

    // URL pattern cần nhận diện
    const EXAM_RESULT_PATTERN = /exam\.fpt\.edu\.vn\/QuizProgress\/Result\/ExamResult/i;

    // ====== TRÁNH TẠO TRÙNG ======
    if (document.getElementById('__fab_overlay_root')) return;

    // ====== TẠO CSS ======
    const style = document.createElement('style');
    style.textContent = `
        #__fab_overlay_root, #__fab_overlay_root * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                         "Helvetica Neue", Arial, "Poppins", sans-serif;
        }

        #__fab_button {
            position: fixed;
            z-index: 999998;
            width: ${CONFIG.buttonSize}px;
            height: ${CONFIG.buttonSize}px;
            border-radius: 50%;
            background: ${CONFIG.buttonColor};
            color: #fff;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${Math.round(CONFIG.buttonSize * 0.45)}px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }
        #__fab_button:hover { transform: scale(1.08); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
        #__fab_button:active { transform: scale(0.96); }

        #__fab_button.pos-bottom-left  { bottom: 20px; left: 20px; }
        #__fab_button.pos-bottom-right { bottom: 20px; right: 20px; }
        #__fab_button.pos-top-left     { top: 20px; left: 20px; }
        #__fab_button.pos-top-right    { top: 20px; right: 20px; }

        #__fab_backdrop {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.35);
            z-index: 999998;
            opacity: 0; visibility: hidden;
            transition: opacity 0.25s ease, visibility 0.25s ease;
        }
        #__fab_backdrop.show { opacity: 1; visibility: visible; }

        #__fab_panel {
            position: fixed;
            z-index: 999999;
            width: 360px;
            max-width: calc(100vw - 40px);
            max-height: 75vh;
            overflow-y: auto;
            background: #fff;
            color: #2c3e50;
            border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.28);
            padding: 20px 22px 18px;
            transform: translateY(20px) scale(0.96);
            opacity: 0; visibility: hidden;
            transition: transform 0.25s ease, opacity 0.25s ease, visibility 0.25s ease;
        }
        #__fab_panel.show { transform: translateY(0) scale(1); opacity: 1; visibility: visible; }

        #__fab_panel.pos-bottom-left  { bottom: ${CONFIG.buttonSize + 32}px; left: 20px; }
        #__fab_panel.pos-bottom-right { bottom: ${CONFIG.buttonSize + 32}px; right: 20px; }
        #__fab_panel.pos-top-left     { top: ${CONFIG.buttonSize + 32}px; left: 20px; }
        #__fab_panel.pos-top-right    { top: ${CONFIG.buttonSize + 32}px; right: 20px; }

        #__fab_panel h3 {
            margin: 0 0 10px;
            font-size: 17px;
            font-weight: 700;
            color: #2c3e50;
            padding-right: 28px;
        }
        #__fab_panel .__fab_body {
            font-size: 14px;
            line-height: 1.55;
            color: #444;
        }
        #__fab_panel .__fab_body p { margin: 6px 0; }
        #__fab_panel .__fab_body code {
            background: #f1f3f5;
            padding: 1px 5px;
            border-radius: 4px;
            font-size: 12.5px;
        }

        #__fab_close {
            position: absolute;
            top: 10px; right: 12px;
            width: 28px; height: 28px;
            border: none; background: transparent;
            color: #888; font-size: 20px; line-height: 1;
            cursor: pointer; border-radius: 50%;
            transition: background 0.15s ease, color 0.15s ease;
        }
        #__fab_close:hover { background: #f1f3f5; color: #e74c3c; }

        /* Nút lựa chọn hành động */
        .__fab_action_btn {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 12px 14px;
            margin: 8px 0;
            background: #f8f9fa;
            border: 1px solid #e1e4e8;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14.5px;
            color: #2c3e50;
            font-weight: 600;
            transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
            text-align: left;
        }
        .__fab_action_btn:hover {
            background: #eef3ff;
            border-color: #4a90e2;
            transform: translateX(2px);
        }
        .__fab_action_btn:active { transform: scale(0.98); }
        .__fab_action_btn .__icon { font-size: 18px; }

        .__fab_preview {
            margin-top: 10px;
            padding: 10px 12px;
            background: #f8f9fa;
            border: 1px solid #e1e4e8;
            border-radius: 8px;
            max-height: 260px;
            overflow: auto;
            font-size: 12.5px;
            line-height: 1.5;
            color: #333;
            white-space: pre-wrap;
            word-break: break-word;
            display: none;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .__fab_preview.show { display: block; }

        .__fab_status {
            margin-top: 10px;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            display: none;
        }
        .__fab_status.show { display: block; }
        .__fab_status.success { background: #e6f9ed; color: #1a7f37; border: 1px solid #b7e4c7; }
        .__fab_status.error   { background: #fdecea; color: #b3261e; border: 1px solid #f5c2c0; }
        .__fab_status.info    { background: #eaf3ff; color: #1c5fa8; border: 1px solid #bcd9f5; }

        @media (max-width: 480px) {
            #__fab_panel { width: calc(100vw - 32px); }
        }
    `;
    document.head.appendChild(style);

    // ====== KIỂM TRA URL ======
    const isExamResultPage = EXAM_RESULT_PATTERN.test(window.location.href);

    // ====== TẠO HTML ======
    const root = document.createElement('div');
    root.id = '__fab_overlay_root';

    const panelBodyHTML = isExamResultPage
        ? `
            <p><b>Trang kết quả bài thi</b> — chọn hành động:</p>
            <button type="button" class="__fab_action_btn" id="__fab_extract_btn">
                <span class="__icon">📋</span>
                <span>Trích xuất đề bài</span>
            </button>
            <button type="button" class="__fab_action_btn" id="__fab_preview_btn">
                <span class="__icon">👁️</span>
                <span>Xem trước nội dung</span>
            </button>
            <pre class="__fab_preview" id="__fab_preview_box"></pre>
            <div class="__fab_status" id="__fab_status_box"></div>
        `
        : CONFIG.content;

    root.innerHTML = `
        <div id="__fab_backdrop"></div>
        <button id="__fab_button" class="pos-${CONFIG.position}" title="Mở bảng thông tin" aria-label="Mở bảng thông tin">
            ${CONFIG.buttonIcon}
        </button>
        <div id="__fab_panel" class="pos-${CONFIG.position}" role="dialog" aria-modal="true" aria-labelledby="__fab_title">
            <button id="__fab_close" aria-label="Đóng">&times;</button>
            <h3 id="__fab_title">${isExamResultPage ? 'Trích xuất đề bài' : CONFIG.title}</h3>
            <div class="__fab_body">${panelBodyHTML}</div>
        </div>
    `;
    document.body.appendChild(root);

    // ====== THAM CHIẾU DOM ======
    const btn      = document.getElementById('__fab_button');
    const panel    = document.getElementById('__fab_panel');
    const backdrop = document.getElementById('__fab_backdrop');
    const closeBtn = document.getElementById('__fab_close');

    function openPanel()  { panel.classList.add('show'); backdrop.classList.add('show'); }
    function closePanel() { panel.classList.remove('show'); backdrop.classList.remove('show'); }
    function togglePanel() {
        if (panel.classList.contains('show')) closePanel();
        else openPanel();
    }

    btn.addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });
    closeBtn.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePanel();
    });

    document.addEventListener('click', function (e) {
        if (!panel.classList.contains('show')) return;
        if (panel.contains(e.target)) return;
        if (btn.contains(e.target)) return;
        closePanel();
    });

    if (CONFIG.autoOpen) {
        window.addEventListener('load', function () { setTimeout(openPanel, 400); });
    }

    // ====== HÀM TRÍCH XUẤT ĐỀ BÀI ======
    function extractExamContent() {
        // Lấy tất cả card câu hỏi
        const questionCards = document.querySelectorAll('.card.border-secondary.border');

        if (!questionCards.length) {
            // fallback: thử tìm theo cấu trúc khác
            return extractFallback();
        }

        const lines = [];
        lines.push('===== ĐỀ BÀI TRÍCH XUẤT =====');
        lines.push('Nguồn: ' + window.location.href);
        lines.push('Thời gian: ' + new Date().toLocaleString('vi-VN'));
        lines.push('');

        questionCards.forEach(function (card, idx) {
            // Tiêu đề câu hỏi
            const titleEl = card.querySelector('.card-title');
            const title = titleEl ? titleEl.textContent.trim() : ('Câu hỏi ' + (idx + 1));

            // Phần nội dung câu hỏi: card-body có class exam-content
            const examBodies = card.querySelectorAll('.exam-content');

            lines.push('----------------------------------------');
            lines.push('### ' + title);
            lines.push('----------------------------------------');

            examBodies.forEach(function (body) {
                // 1) Nếu có textarea.md-reader → lấy nội dung
                const mdReaders = body.querySelectorAll('textarea.md-reader');
                if (mdReaders.length) {
                    mdReaders.forEach(function (ta) {
                        const text = stripHtml(ta.value || ta.textContent || '');
                        if (text) lines.push(text);
                    });
                    return;
                }

                // 2) Nếu có select (câu hỏi matching)
                const selects = body.querySelectorAll('select');
                if (selects.length) {
                    // Tìm các cặp (label/ảnh) và select tương ứng
                    const rows = body.querySelectorAll('.row');
                    if (rows.length) {
                        rows.forEach(function (row) {
                            const cols = row.querySelectorAll('[class*="col-"]');
                            let leftText = '';
                            let selectEl = null;

                            cols.forEach(function (col) {
                                // Text hoặc ảnh bên trái
                                const img = col.querySelector('img');
                                if (img) {
                                    leftText += (img.getAttribute('title') || img.getAttribute('alt') || img.src || '').trim();
                                }
                                const txt = stripHtml(col.textContent || '');
                                if (txt) leftText += (leftText ? ' ' : '') + txt;

                                // Select bên phải
                                const sel = col.querySelector('select');
                                if (sel) selectEl = sel;
                            });

                            leftText = leftText.trim();
                            let answerText = '';
                            if (selectEl) {
                                const selectedOpt = selectEl.options[selectEl.selectedIndex];
                                answerText = selectedOpt ? selectedOpt.textContent.trim() : '';
                            }

                            if (leftText || answerText) {
                                lines.push('  • ' + leftText + '  =>  ' + (answerText || '-----'));
                            }
                        });
                    } else {
                        selects.forEach(function (sel) {
                            const selectedOpt = sel.options[sel.selectedIndex];
                            const answerText = selectedOpt ? selectedOpt.textContent.trim() : '';
                            lines.push('  • => ' + (answerText || '-----'));
                        });
                    }
                    return;
                }

                // 3) Fallback: lấy text của cả body
                const text = stripHtml(body.innerHTML);
                if (text) lines.push(text);
            });

            lines.push('');
        });

        return lines.join('\n');
    }

    // Fallback nếu không tìm thấy card theo cấu trúc trên
    function extractFallback() {
        const lines = [];
        lines.push('===== ĐỀ BÀI TRÍCH XUẤT (fallback) =====');
        lines.push('Nguồn: ' + window.location.href);
        lines.push('');

        // Lấy tất cả textarea.md-reader
        const mdReaders = document.querySelectorAll('textarea.md-reader');
        if (mdReaders.length) {
            mdReaders.forEach(function (ta, i) {
                const text = stripHtml(ta.value || ta.textContent || '');
                if (text) {
                    lines.push('--- Mục ' + (i + 1) + ' ---');
                    lines.push(text);
                    lines.push('');
                }
            });
        } else {
            // Lấy toàn bộ text trong .content-page
            const content = document.querySelector('.content-page') || document.body;
            lines.push(stripHtml(content.innerText || content.textContent || ''));
        }

        return lines.join('\n');
    }

    // Loại bỏ HTML tag, giữ lại text + xuống dòng cơ bản
    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = String(html)
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/\s*p\s*>/gi, '\n')
            .replace(/<\s*\/\s*div\s*>/gi, '\n')
            .replace(/<\s*\/\s*li\s*>/gi, '\n')
            .replace(/<\s*li[^>]*>/gi, '- ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
        const text = tmp.textContent || tmp.innerText || '';
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    // Copy vào clipboard (có fallback cho http)
    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* ignore, fallback bên dưới */ }

        // Fallback dùng textarea + execCommand
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }

    // Hiển thị status
    function showStatus(msg, type) {
        const box = document.getElementById('__fab_status_box');
        if (!box) return;
        box.className = '__fab_status show ' + (type || 'info');
        box.textContent = msg;
    }

    // ====== GẮN SỰ KIỆN CHO CÁC NÚT (chỉ khi ở trang ExamResult) ======
    if (isExamResultPage) {
        const extractBtn = document.getElementById('__fab_extract_btn');
        const previewBtn = document.getElementById('__fab_preview_btn');
        const previewBox = document.getElementById('__fab_preview_box');

        if (extractBtn) {
            extractBtn.addEventListener('click', async function () {
                try {
                    showStatus('Đang trích xuất...', 'info');
                    const content = extractExamContent();

                    if (!content || content.trim().length < 20) {
                        showStatus('Không tìm thấy nội dung đề bài trên trang này.', 'error');
                        return;
                    }

                    const ok = await copyToClipboard(content);
                    if (ok) {
                        showStatus('✅ Đã copy toàn bộ đề bài vào clipboard! (' + content.length + ' ký tự)', 'success');
                    } else {
                        showStatus('⚠️ Không thể copy tự động. Hãy dùng nút "Xem trước" rồi copy thủ công.', 'error');
                    }
                } catch (err) {
                    console.error('[1.js] extract error:', err);
                    showStatus('Lỗi khi trích xuất: ' + err.message, 'error');
                }
            });
        }

        if (previewBtn) {
            previewBtn.addEventListener('click', function () {
                try {
                    const content = extractExamContent();
                    if (!content || content.trim().length < 20) {
                        showStatus('Không tìm thấy nội dung đề bài.', 'error');
                        return;
                    }
                    previewBox.textContent = content;
                    previewBox.classList.add('show');
                    showStatus('Xem trước bên dưới. Bạn có thể bôi đen và copy thủ công.', 'info');
                } catch (err) {
                    console.error('[1.js] preview error:', err);
                    showStatus('Lỗi khi xem trước: ' + err.message, 'error');
                }
            });
        }
    }

    // ====== API TOÀN CỤC ======
    window.FabOverlay = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        setTitle: (t) => { document.getElementById('__fab_title').textContent = t; },
        setContent: (html) => { panel.querySelector('.__fab_body').innerHTML = html; },
        extractExamContent: extractExamContent,
        copyToClipboard: copyToClipboard
    };
})();
