(function () {
    'use strict';

    // ====== CẤU HÌNH ======
    const CONFIG = {
        // Nội dung tiêu đề của bảng
        title: 'Thông tin',
        // Nội dung HTML bên trong bảng (có thể dùng thẻ HTML)
        content: `
            <p>Xin chào 👋</p>
            <p>Đây là bảng thông tin được tạo tự động bởi <b>1.js</b>.</p>
            <p>Bạn có thể sửa nội dung trong phần <code>CONFIG.content</code>.</p>
            <ul style="padding-left:18px; margin:8px 0;">
                <li>Click nút tròn để mở/đóng</li>
                <li>Click ra ngoài để đóng</li>
                <li>Nhấn ESC để đóng</li>
            </ul>
        `,
        // Màu nút tròn
        buttonColor: '#e74c3c',
        // Icon trong nút (emoji hoặc HTML)
        buttonIcon: '💬',
        // Vị trí: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
        position: 'bottom-left',
        // Kích thước nút tròn (px)
        buttonSize: 56,
        // Tự động mở lần đầu?
        autoOpen: false
    };

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

        /* Nút tròn */
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
        #__fab_button:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        }
        #__fab_button:active {
            transform: scale(0.96);
        }

        /* Vị trí nút */
        #__fab_button.pos-bottom-left  { bottom: 20px; left: 20px; }
        #__fab_button.pos-bottom-right { bottom: 20px; right: 20px; }
        #__fab_button.pos-top-left     { top: 20px; left: 20px; }
        #__fab_button.pos-top-right    { top: 20px; right: 20px; }

        /* Lớp nền mờ khi mở bảng */
        #__fab_backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.35);
            z-index: 999998;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.25s ease, visibility 0.25s ease;
        }
        #__fab_backdrop.show {
            opacity: 1;
            visibility: visible;
        }

        /* Bảng panel */
        #__fab_panel {
            position: fixed;
            z-index: 999999;
            width: 340px;
            max-width: calc(100vw - 40px);
            max-height: 70vh;
            overflow-y: auto;
            background: #fff;
            color: #2c3e50;
            border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.28);
            padding: 20px 22px 18px;
            transform: translateY(20px) scale(0.96);
            opacity: 0;
            visibility: hidden;
            transition: transform 0.25s ease, opacity 0.25s ease, visibility 0.25s ease;
        }
        #__fab_panel.show {
            transform: translateY(0) scale(1);
            opacity: 1;
            visibility: visible;
        }

        /* Vị trí panel tương ứng nút */
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

        /* Nút đóng */
        #__fab_close {
            position: absolute;
            top: 10px;
            right: 12px;
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: #888;
            font-size: 20px;
            line-height: 1;
            cursor: pointer;
            border-radius: 50%;
            transition: background 0.15s ease, color 0.15s ease;
        }
        #__fab_close:hover {
            background: #f1f3f5;
            color: #e74c3c;
        }

        /* Responsive */
        @media (max-width: 480px) {
            #__fab_panel { width: calc(100vw - 32px); }
        }
    `;
    document.head.appendChild(style);

    // ====== TẠO HTML ======
    const root = document.createElement('div');
    root.id = '__fab_overlay_root';
    root.innerHTML = `
        <div id="__fab_backdrop"></div>
        <button id="__fab_button" class="pos-${CONFIG.position}" title="Mở bảng thông tin" aria-label="Mở bảng thông tin">
            ${CONFIG.buttonIcon}
        </button>
        <div id="__fab_panel" class="pos-${CONFIG.position}" role="dialog" aria-modal="true" aria-labelledby="__fab_title">
            <button id="__fab_close" aria-label="Đóng">&times;</button>
            <h3 id="__fab_title">${CONFIG.title}</h3>
            <div class="__fab_body">${CONFIG.content}</div>
        </div>
    `;
    document.body.appendChild(root);

    // ====== LOGIC ======
    const btn      = document.getElementById('__fab_button');
    const panel    = document.getElementById('__fab_panel');
    const backdrop = document.getElementById('__fab_backdrop');
    const closeBtn = document.getElementById('__fab_close');

    function openPanel() {
        panel.classList.add('show');
        backdrop.classList.add('show');
    }
    function closePanel() {
        panel.classList.remove('show');
        backdrop.classList.remove('show');
    }
    function togglePanel() {
        if (panel.classList.contains('show')) closePanel();
        else openPanel();
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePanel();
    });

    closeBtn.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePanel();
    });

    // Click ra ngoài panel (không phải nút) → đóng
    document.addEventListener('click', function (e) {
        if (!panel.classList.contains('show')) return;
        if (panel.contains(e.target)) return;
        if (btn.contains(e.target)) return;
        closePanel();
    });

    if (CONFIG.autoOpen) {
        window.addEventListener('load', function () {
            setTimeout(openPanel, 400);
        });
    }

    // ====== API TOÀN CỤC (tùy chọn) ======
    window.FabOverlay = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        setTitle: (t) => { document.getElementById('__fab_title').textContent = t; },
        setContent: (html) => { panel.querySelector('.__fab_body').innerHTML = html; }
    };
})();
