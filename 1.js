/**
 * ==============================================================================
 * AI EXAM SOLVER & OVERLAY ASSISTANT (1.js)
 * Tự động trích xuất đề thi, giải bằng Google AI Studio Gemini API,
 * copy đề kèm Prompt AI và tự động làm nổi bật đáp án chính xác trên trang web.
 * ==============================================================================
 */

(function () {
    'use strict';

    // Tránh khởi tạo trùng lặp
    if (window.__FAB_OVERLAY_INITIALIZED__) return;
    window.__FAB_OVERLAY_INITIALIZED__ = true;

    // ====== CẤU HÌNH MẶC ĐỊNH ======
    const DEFAULT_CONFIG = {
        title: 'AI Exam Assistant',
        apiKey: localStorage.getItem('gemini_api_key') || '',
        model: localStorage.getItem('gemini_model') || 'gemini-2.5-flash',
        autoSelectOnPage: localStorage.getItem('auto_select_answers') !== 'false',
        buttonSize: 56,
        panelWidth: 460,
        panelHeight: 660
    };

    const AVAILABLE_MODELS = [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Khuyên dùng - Nhanh & Chuẩn)' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Ổn định)' },
        { id: 'gemini-1.5-pro',   name: 'Gemini 1.5 Pro (Suy luận sâu)' }
    ];

    const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

    // ====== TRẠNG THÁI ỨNG DỤNG ======
    const STATE = {
        examTitle: 'Bài kiểm tra',
        classCode: '',
        questions: [],          // Danh sách các câu hỏi đã chuẩn hóa
        solvedAnswers: {},      // { [qIndex]: { selected_choice, matching, explanation, type } }
        isSolving: false,
        activeTab: 'questions', // 'questions' | 'paste' | 'settings'
        filterType: 'all',      // 'all' | 'choice' | 'matching'
        autoSelect: DEFAULT_CONFIG.autoSelectOnPage,
        isPageRenderedByUs: false
    };

    // ====== TIỆN ÍCH LÀM SẠCH HTML & VĂN BẢN ======
    function cleanHtmlContent(raw) {
        if (!raw) return '';
        let text = String(raw).trim();
        const m = text.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
        if (m) text = m[1].trim();

        text = text.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');
        text = text.replace(/<\?xml[\s\S]*?\?>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<w:[^>]+>[\s\S]*?<\/w:[^>]+>/gi, '');
        text = text.replace(/<m:[^>]+>[\s\S]*?<\/m:[^>]+>/gi, '');
        text = text.replace(/<xml[^>]*>[\s\S]*?<\/xml>/gi, '');
        return text.trim();
    }

    function htmlToPlainText(htmlStr) {
        if (!htmlStr) return '';
        let txt = cleanHtmlContent(htmlStr);

        // Chuyển thẻ img công thức thành văn bản
        txt = txt.replace(/<img[^>]+>/gi, (tag) => {
            const titleM = tag.match(/title=["']([^"']+)["']/i);
            if (titleM && titleM[1]) return ` [${titleM[1]}] `;
            const altM = tag.match(/alt=["']([^"']+)["']/i);
            if (altM && altM[1]) return ` [${altM[1]}] `;
            const srcM = tag.match(/src=["']([^"']+)["']/i);
            if (srcM && srcM[1]) return ` [Ảnh: ${srcM[1]}] `;
            return ' [Hình ảnh] ';
        });

        txt = txt.replace(/<br\s*\/?>/gi, '\n')
                 .replace(/<\/p>/gi, '\n')
                 .replace(/<\/div>/gi, '\n')
                 .replace(/<\/blockquote>/gi, '\n')
                 .replace(/&nbsp;/gi, ' ')
                 .replace(/&lt;/gi, '<')
                 .replace(/&gt;/gi, '>')
                 .replace(/&amp;/gi, '&')
                 .replace(/<[^>]+>/g, '');

        return txt.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    }

    function extractImageUrls(htmlStr) {
        if (!htmlStr) return [];
        const urls = [];
        const re = /<img[^>]+src=["']([^"']+)["']/gi;
        let match;
        while ((match = re.exec(htmlStr)) !== null) {
            const src = match[1].trim();
            if (src && !src.startsWith('data:') && !src.includes('latex.codecogs.com')) {
                urls.push(src);
            }
        }
        return urls;
    }

    // ====== TRÍCH XUẤT CÂU HỎI TỪ TRANG WEB ======
    function extractQuestionsFromScripts() {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
            const text = s.textContent || s.innerText || '';
            const initIdx = text.indexOf('initializeTest');
            if (initIdx !== -1) {
                const jsonStart = text.indexOf('[{', initIdx);
                if (jsonStart !== -1) {
                    let depth = 0;
                    let bracketEnd = -1;
                    let inStr = false;
                    let esc = false;
                    for (let i = jsonStart; i < text.length; i++) {
                        const ch = text[i];
                        if (esc) { esc = false; continue; }
                        if (ch === '\\') { esc = true; continue; }
                        if (ch === '"') { inStr = !inStr; continue; }
                        if (!inStr) {
                            if (ch === '[') depth++;
                            else if (ch === ']') {
                                depth--;
                                if (depth === 0) { bracketEnd = i; break; }
                            }
                        }
                    }
                    if (bracketEnd !== -1) {
                        try {
                            const jsonStr = text.substring(jsonStart, bracketEnd + 1);
                            const raw = JSON.parse(jsonStr);
                            if (Array.isArray(raw) && raw.length > 0) {
                                return normalizeQuestions(raw);
                            }
                        } catch (err) {
                            console.warn('[1.js] Parse JSON câu hỏi thất bại:', err);
                        }
                    }
                }
            }
        }
        return null;
    }

    // Fallback trích xuất từ DOM (khi là trang ExamResult hoặc đề đã render sẵn)
    function extractQuestionsFromDOM() {
        const questionCards = document.querySelectorAll('.card.border-secondary.border, .exam-question-card');
        if (!questionCards.length) return null;

        const list = [];
        questionCards.forEach((card, idx) => {
            const examBodies = card.querySelectorAll('.exam-content, .card-body');
            let contentHtml = '';
            const choices = [];
            const matchingItems = [];

            examBodies.forEach(body => {
                const mdReaders = body.querySelectorAll('textarea.md-reader');
                if (mdReaders.length) {
                    mdReaders.forEach(ta => contentHtml += (ta.value || ta.textContent || '') + '\n');
                } else {
                    contentHtml += body.innerHTML;
                }

                // Choices
                const choiceInputs = body.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                choiceInputs.forEach((inp, cIdx) => {
                    const label = body.querySelector(`label[for="${inp.id}"]`) || inp.parentElement;
                    const letter = LETTERS[cIdx] || `(${cIdx + 1})`;
                    choices.push({
                        id: inp.value || inp.id || `c_${idx}_${cIdx}`,
                        letter: letter,
                        content_html: label ? label.innerHTML : '',
                        content_plain: label ? label.innerText.trim() : '',
                        images: []
                    });
                });

                // Matching selects
                const selects = body.querySelectorAll('select');
                if (selects.length) {
                    selects.forEach((sel, sIdx) => {
                        matchingItems.push({
                            id: sel.id || `m_${idx}_${sIdx}`,
                            index: sIdx + 1,
                            content_html: `Mục ${sIdx + 1}`,
                            content_plain: `Mục ${sIdx + 1}`,
                            selectElement: sel
                        });
                    });
                }
            });

            const qType = matchingItems.length ? 'matching' : 'choice';
            list.push({
                index: idx + 1,
                id: card.id || `q_${idx + 1}`,
                type: qType,
                type_label: qType === 'choice' ? 'Trắc nghiệm' : 'Ghép đôi',
                content_html: cleanHtmlContent(contentHtml),
                content_plain: htmlToPlainText(contentHtml),
                images: extractImageUrls(contentHtml),
                choices: choices,
                matching_items: matchingItems,
                matching_options: []
            });
        });

        return list.length ? list : null;
    }

    // Chuẩn hóa danh sách câu hỏi
    function normalizeQuestions(rawList) {
        return rawList.map((q, idx) => {
            const qIndex = idx + 1;
            const qId = q.id || `q_${qIndex}`;
            const rawType = (q.type || 'choice').toLowerCase();
            const rawContent = q.content || '';
            const cleanedContent = cleanHtmlContent(rawContent);
            const plainContent = htmlToPlainText(cleanedContent);
            const images = extractImageUrls(rawContent);

            const choices = [];
            if (Array.isArray(q.multiChooseAnswer)) {
                q.multiChooseAnswer.forEach((c, cIdx) => {
                    const cRaw = c.content || '';
                    const cClean = cleanHtmlContent(cRaw);
                    const cPlain = htmlToPlainText(cClean);
                    const letter = LETTERS[cIdx] || `(${cIdx + 1})`;
                    choices.push({
                        id: c.id || `${qId}_c${cIdx}`,
                        letter: letter,
                        content_html: cClean,
                        content_plain: cPlain,
                        images: extractImageUrls(cRaw),
                        hint: c.hint || ''
                    });
                });
            }

            const matchingItems = [];
            if (Array.isArray(q.questionMatching)) {
                q.questionMatching.forEach((m, mIdx) => {
                    const mRaw = m.questionMatchingContent || '';
                    const mClean = cleanHtmlContent(mRaw);
                    matchingItems.push({
                        id: m.id || `${qId}_m${mIdx}`,
                        index: mIdx + 1,
                        content_html: mClean,
                        content_plain: htmlToPlainText(mClean)
                    });
                });
            }

            const matchingOptions = [];
            if (Array.isArray(q.answerMatching)) {
                q.answerMatching.forEach(opt => {
                    const val = opt.answerMatchingValue || '';
                    const cnt = opt.answerMatchingContent || '';
                    if (val && val !== '----- Bỏ trống -----') {
                        matchingOptions.push({ value: val, content: cnt });
                    }
                });
            }

            let qType = 'choice';
            let typeLabel = 'Trắc nghiệm';
            if (rawType === 'matching' || matchingItems.length > 0) {
                qType = 'matching';
                typeLabel = 'Ghép đôi';
            } else if (rawType === 'essay' || (!choices.length && !matchingItems.length)) {
                qType = 'essay';
                typeLabel = 'Tự luận';
            }

            return {
                index: qIndex,
                id: qId,
                type: qType,
                type_label: typeLabel,
                mark: q.mark || 0.0,
                session: q.sessionNumber || '',
                content_html: cleanedContent,
                content_plain: plainContent,
                images: images,
                choices: choices,
                matching_items: matchingItems,
                matching_options: matchingOptions,
                is_radio: q.isRadio !== false
            };
        });
    }

    // ====== TỰ ĐỘNG HIỂN THỊ ĐỀ TRÊN TRANG NẾU CHƯA CÓ ======
    function ensureExamRenderedOnPage() {
        const divError = document.getElementById('div-error');
        const divContent = document.getElementById('div-content');
        const examContainer = document.getElementById('div-exam-content');
        const navContainer = document.getElementById('question-navigation-buttons');

        if (!examContainer) return;

        // Nếu container đang trống và trang báo lỗi hoặc ẩn content
        if (examContainer.children.length === 0 && STATE.questions.length > 0) {
            if (divError) divError.style.display = 'none';
            if (divContent) divContent.classList.remove('d-none');

            STATE.isPageRenderedByUs = true;
            examContainer.innerHTML = '';

            STATE.questions.forEach(q => {
                const card = document.createElement('div');
                card.className = 'card border mb-4 __rendered_q_card';
                card.id = `__rendered_q_${q.index}`;
                card.dataset.index = q.index;
                card.style.borderRadius = '10px';
                card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';

                let bodyHtml = `
                    <div class="card-header bg-light d-flex justify-content-between align-items-center py-2 px-3">
                        <strong class="text-primary">Câu hỏi ${q.index} <span class="badge bg-secondary ms-1">${q.type_label}</span></strong>
                        <span class="text-muted small">Điểm: ${q.mark || '1.0'}</span>
                    </div>
                    <div class="card-body px-3 py-3">
                        <div class="mb-3 fs-15 text-dark" style="line-height: 1.6;">${q.content_html}</div>
                `;

                if (q.images && q.images.length) {
                    bodyHtml += `<div class="mb-3">`;
                    q.images.forEach(img => {
                        bodyHtml += `<img src="${img}" style="max-width:100%; height:auto; border-radius:6px; margin:4px 0;" alt="Đề bài"/>`;
                    });
                    bodyHtml += `</div>`;
                }

                if (q.type === 'choice') {
                    bodyHtml += `<div class="choices-container d-flex flex-column gap-2 mt-2">`;
                    q.choices.forEach(c => {
                        bodyHtml += `
                            <div class="form-check p-2 border rounded __choice_option_row" id="__opt_row_${c.id}" data-q-index="${q.index}" data-choice-letter="${c.letter}" data-choice-id="${c.id}" style="cursor:pointer; transition: all 0.2s ease;">
                                <input class="form-check-input ms-1 me-2" type="radio" name="q_choice_${q.index}" id="__inp_${c.id}" value="${c.id}" style="cursor:pointer;">
                                <label class="form-check-label w-100" for="__inp_${c.id}" style="cursor:pointer;">
                                    <b>${c.letter}.</b> ${c.content_html}
                                </label>
                            </div>
                        `;
                    });
                    bodyHtml += `</div>`;
                } else if (q.type === 'matching') {
                    bodyHtml += `<div class="matching-container mt-2">`;
                    bodyHtml += `<div class="table-responsive"><table class="table table-sm table-bordered align-middle">`;
                    bodyHtml += `<thead class="table-light"><tr><th style="width:50px;">#</th><th>Nội dung</th><th style="width:200px;">Lựa chọn</th></tr></thead><tbody>`;

                    q.matching_items.forEach((m, mIdx) => {
                        let optHtml = `<option value="">-- Chọn đáp án --</option>`;
                        q.matching_options.forEach(opt => {
                            optHtml += `<option value="${opt.value}">${opt.content}</option>`;
                        });
                        bodyHtml += `
                            <tr class="__matching_row" data-q-index="${q.index}" data-m-index="${mIdx + 1}" data-m-id="${m.id}">
                                <td class="text-center fw-bold">${mIdx + 1}</td>
                                <td>${m.content_html}</td>
                                <td>
                                    <select class="form-select form-select-sm __matching_select" id="__sel_${m.id}" data-q-index="${q.index}" data-m-index="${mIdx + 1}">
                                        ${optHtml}
                                    </select>
                                </td>
                            </tr>
                        `;
                    });
                    bodyHtml += `</tbody></table></div></div>`;
                }

                bodyHtml += `</div>`;
                card.innerHTML = bodyHtml;
                examContainer.appendChild(card);
            });

            // Gắn sự kiện chọn câu trả lời
            examContainer.querySelectorAll('.__choice_option_row').forEach(row => {
                row.addEventListener('click', () => {
                    const radio = row.querySelector('input[type="radio"]');
                    if (radio) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            });

            // Render thanh số câu hỏi bên trái
            if (navContainer) {
                navContainer.innerHTML = '';
                STATE.questions.forEach(q => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn btn-outline-secondary btn-sm m-1 __nav_q_btn';
                    btn.id = `__nav_btn_${q.index}`;
                    btn.dataset.index = q.index;
                    btn.textContent = q.index;
                    btn.style.width = '38px';
                    btn.style.height = '38px';
                    btn.style.fontWeight = '600';

                    btn.addEventListener('click', () => {
                        const targetCard = document.getElementById(`__rendered_q_${q.index}`);
                        if (targetCard) {
                            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            targetCard.style.outline = '3px solid #3b82f6';
                            setTimeout(() => { targetCard.style.outline = ''; }, 1200);
                        }
                    });
                    navContainer.appendChild(btn);
                });
            }
        }
    }

    // ====== HÀM LÀM NỔI BẬT ĐÁP ÁN TRÊN TRANG WEB ======
    function highlightAnswersOnWebPage(answers) {
        if (!answers || !answers.length) return;

        answers.forEach(ans => {
            const qIndex = ans.question_index;
            const q = STATE.questions.find(item => item.index === qIndex);
            if (!q) return;

            // Đổi màu nút số câu bên trái
            const navBtn = document.getElementById(`__nav_btn_${qIndex}`) || document.getElementById(`btn-question-${qIndex}`);
            if (navBtn) {
                navBtn.style.backgroundColor = '#10b981';
                navBtn.style.borderColor = '#059669';
                navBtn.style.color = '#ffffff';
                navBtn.style.fontWeight = 'bold';
            }

            // Xử lý câu hỏi trắc nghiệm (Choice)
            if (q.type === 'choice') {
                const letter = (ans.selected_choice || '').trim().toUpperCase();
                const matchedChoice = q.choices.find(c => c.letter.toUpperCase() === letter);
                const targetChoiceId = matchedChoice ? matchedChoice.id : null;

                // 1. Thử tìm trên giao diện do script tự render
                if (targetChoiceId) {
                    const row = document.getElementById(`__opt_row_${targetChoiceId}`);
                    if (row) {
                        applyHighlightToElement(row, `✅ ĐÁP ÁN ĐÚNG (${letter})`);
                        if (STATE.autoSelect) {
                            const radio = row.querySelector('input[type="radio"]');
                            if (radio) {
                                radio.checked = true;
                                radio.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }
                }

                // 2. Thử tìm trên giao diện gốc của FPT EduNext / EOS
                const allRadios = document.querySelectorAll(`input[type="radio"], input[type="checkbox"]`);
                allRadios.forEach(inp => {
                    const isMatch = (targetChoiceId && (inp.value === targetChoiceId || inp.id === targetChoiceId)) ||
                                    (inp.name && inp.name.includes(`_${qIndex}`) && inp.value === letter);
                    if (isMatch) {
                        const parent = inp.closest('.form-check, .choice-item, tr, div') || inp.parentElement;
                        if (parent) {
                            applyHighlightToElement(parent, `✅ ĐÁP ÁN ĐÚNG (${letter})`);
                            if (STATE.autoSelect) {
                                inp.checked = true;
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }
                });

                // 3. Fallback: Tìm theo nội dung text đáp án
                if (matchedChoice && matchedChoice.content_plain) {
                    const candidateDivs = document.querySelectorAll('.exam-content, .card-body');
                    candidateDivs.forEach(div => {
                        if (div.innerText && div.innerText.includes(matchedChoice.content_plain)) {
                            const labels = div.querySelectorAll('label, p, span, div');
                            labels.forEach(lbl => {
                                if (lbl.innerText && lbl.innerText.trim() === matchedChoice.content_plain.trim()) {
                                    applyHighlightToElement(lbl, `✅ ĐÁP ÁN ĐÚNG (${letter})`);
                                }
                            });
                        }
                    });
                }
            }

            // Xử lý câu hỏi Ghép đôi (Matching)
            else if (q.type === 'matching' && Array.isArray(ans.matching)) {
                ans.matching.forEach(pair => {
                    const mIdx = pair.item_index;
                    const val = String(pair.matched_value || '').trim();

                    // Tìm select tự render
                    const sel = document.querySelector(`select.__matching_select[data-q-index="${qIndex}"][data-m-index="${mIdx}"]`);
                    if (sel) {
                        sel.value = val;
                        sel.style.border = '2px solid #10b981';
                        sel.style.backgroundColor = '#ecfdf5';
                        sel.style.color = '#065f46';
                        sel.style.fontWeight = 'bold';
                        const row = sel.closest('tr');
                        if (row) applyHighlightToElement(row, `✅ Ghép: ${val}`);
                    }

                    // Tìm select trên giao diện gốc
                    const allSelects = document.querySelectorAll('select');
                    allSelects.forEach(s => {
                        Array.from(s.options).forEach(opt => {
                            if (opt.value === val || opt.textContent.trim() === val) {
                                if (STATE.autoSelect) {
                                    s.value = opt.value;
                                    s.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                                s.style.border = '2px solid #10b981';
                                s.style.backgroundColor = '#ecfdf5';
                            }
                        });
                    });
                });
            }
        });
    }

    function applyHighlightToElement(el, badgeText) {
        if (!el) return;
        el.style.backgroundColor = '#ecfdf5';
        el.style.border = '2px solid #10b981';
        el.style.borderRadius = '8px';
        el.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.4)';
        el.style.position = 'relative';

        const oldBadge = el.querySelector('.__ai_highlight_badge');
        if (oldBadge) oldBadge.remove();

        const badge = document.createElement('span');
        badge.className = '__ai_highlight_badge';
        badge.style.display = 'inline-flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '4px';
        badge.style.background = '#059669';
        badge.style.color = '#ffffff';
        badge.style.fontSize = '12px';
        badge.style.fontWeight = '700';
        badge.style.padding = '2px 8px';
        badge.style.borderRadius = '12px';
        badge.style.marginLeft = '8px';
        badge.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        badge.textContent = badgeText;

        el.appendChild(badge);
    }

    // ====== HÀM TẠO PROMPT AI TỔNG THỂ ======
    function buildExamPrompt(questions) {
        let p = `Bạn là một chuyên gia khảo thí, giải thuật và toán rời rạc đại học xuất sắc.\n`;
        p += `Dưới đây là danh sách toàn bộ ${questions.length} câu hỏi trong đề thi.\n`;
        p += `Nhiệm vụ của bạn là giải TẤT CẢ các câu hỏi một cách TUYỆT ĐỐI CHÍNH XÁC.\n\n`;
        p += `YÊU CẦU ĐỊNH DẠNG ĐẦU RA BẮT BUỘC:\n`;
        p += `Trả về DUY NHẤT một khối JSON thuần túy (không kèm theo lời chào hay văn bản thừa bên ngoài) theo đúng cấu trúc sau để hệ thống tự động làm nổi bật đáp án:\n\n`;
        p += `{\n`;
        p += `  "answers": [\n`;
        p += `    {\n`;
        p += `      "question_index": 1,\n`;
        p += `      "type": "choice",\n`;
        p += `      "selected_choice": "A",\n`;
        p += `      "selected_text": "nội dung chính xác của đáp án A",\n`;
        p += `      "explanation": "Giải thích ngắn gọn súc tích lý do chọn"\n`;
        p += `    },\n`;
        p += `    {\n`;
        p += `      "question_index": 2,\n`;
        p += `      "type": "matching",\n`;
        p += `      "matching": [\n`;
        p += `        { "item_index": 1, "matched_value": "3" },\n`;
        p += `        { "item_index": 2, "matched_value": "1" }\n`;
        p += `      ],\n`;
        p += `      "explanation": "Giải thích cách ghép"\n`;
        p += `    }\n`;
        p += `  ]\n`;
        p += `}\n\n`;
        p += `=== NỘI DUNG ĐỀ THI (${questions.length} CÂU) ===\n\n`;

        questions.forEach(q => {
            p += `----------------------------------------\n`;
            p += `[CÂU HỎI ${q.index}] (${q.type_label})\n`;
            p += `Nội dung: ${q.content_plain}\n`;

            if (q.images && q.images.length) {
                p += `Hình ảnh đính kèm: ${q.images.join(', ')}\n`;
            }

            if (q.type === 'choice' && q.choices.length) {
                p += `Các phương án lựa chọn:\n`;
                q.choices.forEach(c => {
                    p += `  ${c.letter}. ${c.content_plain}\n`;
                });
            } else if (q.type === 'matching' && q.matching_items.length) {
                p += `Các mục cần ghép đôi:\n`;
                q.matching_items.forEach((m, idx) => {
                    p += `  ${idx + 1}. ${m.content_plain}\n`;
                });
                if (q.matching_options && q.matching_options.length) {
                    const pool = q.matching_options.map(o => o.content).join(', ');
                    p += `Tập lựa chọn có sẵn: [${pool}]\n`;
                }
            }
            p += `\n`;
        });

        return p;
    }

    // ====== HÀM GIẢI BẰNG GEMINI API ======
    async function solveAllWithGeminiAPI() {
        const apiKey = (DEFAULT_CONFIG.apiKey || '').trim();
        if (!apiKey) {
            switchTab('settings');
            showToast('⚠️ Vui lòng nhập Google AI Studio API Key trước khi giải!', 'error');
            const keyInp = document.getElementById('__fab_key_input');
            if (keyInp) keyInp.focus();
            return;
        }

        if (!STATE.questions.length) {
            showToast('❌ Không tìm thấy câu hỏi nào để giải!', 'error');
            return;
        }

        STATE.isSolving = true;
        updateUIState();
        showStatusBox(`⏳ Đang gửi toàn bộ ${STATE.questions.length} câu hỏi lên Google AI Studio (${DEFAULT_CONFIG.model})...`, 'info');

        const promptText = buildExamPrompt(STATE.questions);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_CONFIG.model}:generateContent?key=${apiKey}`;

        const payload = {
            contents: [
                {
                    parts: [
                        { text: promptText }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                responseMimeType: 'application/json'
            }
        };

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                const errMsg = errData.error?.message || `HTTP ${resp.status}: ${resp.statusText}`;

                // Fallback tự động nếu model 2.5 báo 404
                if (DEFAULT_CONFIG.model === 'gemini-2.5-flash' && resp.status === 404) {
                    showStatusBox('⚠️ Model 2.5 không khả dụng, đang tự động chuyển sang gemini-1.5-flash...', 'info');
                    DEFAULT_CONFIG.model = 'gemini-1.5-flash';
                    return await solveAllWithGeminiAPI();
                }

                throw new Error(errMsg);
            }

            const data = await resp.json();
            const candidates = data.candidates || [];
            if (!candidates.length) throw new Error('Mô hình không trả về kết quả nào.');

            const parts = candidates[0].content?.parts || [];
            if (!parts.length) throw new Error('Phần phản hồi rỗng từ mô hình.');

            const rawText = parts[0].text;
            const parsedAnswers = parseAIResponseText(rawText);

            if (!parsedAnswers || !parsedAnswers.length) {
                throw new Error('Không phân tích được định dạng đáp án JSON từ phản hồi của AI.');
            }

            applyAnswers(parsedAnswers);
            showStatusBox(`✅ Đã giải thành công ${parsedAnswers.length}/${STATE.questions.length} câu hỏi!`, 'success');
            showToast(`🎉 Đã giải xong ${parsedAnswers.length} câu hỏi bằng AI!`, 'success');
            switchTab('questions');

        } catch (err) {
            console.error('[1.js] Lỗi Gemini API:', err);
            showStatusBox(`❌ Lỗi: ${err.message}`, 'error');
            showToast(`Lỗi Gemini API: ${err.message}`, 'error');
        } finally {
            STATE.isSolving = false;
            updateUIState();
        }
    }

    // ====== HÀM PARSER KẾT QUẢ AI ĐA ĐỊNH DẠNG ======
    function parseAIResponseText(text) {
        if (!text) return null;
        let clean = text.trim();

        // 1. Gỡ bỏ khối mã markdown ```json ... ```
        clean = clean.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

        // 2. Thử phân tích cú pháp JSON
        try {
            let obj = null;
            try {
                obj = JSON.parse(clean);
            } catch (e) {
                const startObj = clean.indexOf('{');
                const endObj = clean.lastIndexOf('}');
                if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
                    try {
                        obj = JSON.parse(clean.substring(startObj, endObj + 1));
                    } catch (e2) {}
                }
                if (!obj) {
                    const startArr = clean.indexOf('[');
                    const endArr = clean.lastIndexOf(']');
                    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
                        try {
                            obj = JSON.parse(clean.substring(startArr, endArr + 1));
                        } catch (e3) {}
                    }
                }
            }

            if (obj) {
                if (Array.isArray(obj)) return obj;
                if (Array.isArray(obj.answers)) return obj.answers;
                if (typeof obj === 'object') {
                    const arr = [];
                    Object.keys(obj).forEach(k => {
                        const idx = parseInt(k, 10);
                        if (!isNaN(idx)) {
                            const val = obj[k];
                            if (typeof val === 'string') {
                                arr.push({ question_index: idx, type: 'choice', selected_choice: val });
                            } else if (Array.isArray(val)) {
                                const matching = val.map((v, i) => ({ item_index: i + 1, matched_value: String(v) }));
                                arr.push({ question_index: idx, type: 'matching', matching: matching });
                            } else if (typeof val === 'object') {
                                arr.push({ question_index: idx, ...val });
                            }
                        }
                    });
                    if (arr.length) return arr;
                }
            }
        } catch (err) {}

        // 3. Fallback: Phân tích bằng Regex dòng văn bản thuần
        const answers = [];
        const lines = clean.split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // Dạng Choice: Câu 1: A hoặc 1. B
            const choiceM = line.match(/(?:Câu\s*(\d+)|Q(\d+)|^(\d+))\s*[:.]\s*([A-L])\b/i);
            if (choiceM) {
                const qIdx = parseInt(choiceM[1] || choiceM[2] || choiceM[3], 10);
                const letter = choiceM[4].toUpperCase();
                answers.push({
                    question_index: qIdx,
                    type: 'choice',
                    selected_choice: letter,
                    explanation: line
                });
                return;
            }

            // Dạng Matching: Câu 2: 1->1, 2->3, 3->2
            const matchQ = line.match(/(?:Câu\s*(\d+)|Q(\d+)|^(\d+))\s*[:.]\s*(.*)/i);
            if (matchQ) {
                const qIdx = parseInt(matchQ[1] || matchQ[2] || matchQ[3], 10);
                const rest = matchQ[4];
                const pairMatches = [...rest.matchAll(/(\d+)\s*(?:->|[-:=])\s*([A-Za-z0-9_-]+)/g)];
                if (pairMatches.length > 0) {
                    const matching = pairMatches.map(m => ({
                        item_index: parseInt(m[1], 10),
                        matched_value: m[2]
                    }));
                    answers.push({
                        question_index: qIdx,
                        type: 'matching',
                        matching: matching,
                        explanation: line
                    });
                }
            }
        });

        return answers.length ? answers : null;
    }

    // ====== ÁP DỤNG ĐÁP ÁN VÀO HỆ THỐNG ======
    function applyAnswers(answersList) {
        if (!Array.isArray(answersList)) return;

        answersList.forEach(ans => {
            const qIdx = ans.question_index;
            if (qIdx) {
                STATE.solvedAnswers[qIdx] = ans;
            }
        });

        // 1. Làm nổi bật trên trang web
        highlightAnswersOnWebPage(answersList);

        // 2. Làm nổi bật trong giao diện Overlay
        renderQuestionsList();
        updateUIState();
    }

    // ====== TẠO GIAO DIỆN OVERLAY (HTML + CSS) ======
    const style = document.createElement('style');
    style.textContent = `
        #__fab_overlay_root, #__fab_overlay_root * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        #__fab_button {
            position: fixed;
            z-index: 9999998;
            width: ${DEFAULT_CONFIG.buttonSize}px;
            height: ${DEFAULT_CONFIG.buttonSize}px;
            border-radius: 50%;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #ffffff;
            border: 2px solid rgba(255,255,255,0.4);
            cursor: move;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            box-shadow: 0 8px 24px rgba(16, 185, 129, 0.45);
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
            user-select: none;
            bottom: 24px;
            left: 24px;
            touch-action: none;
        }
        #__fab_button:hover {
            transform: scale(1.08);
            box-shadow: 0 12px 30px rgba(16, 185, 129, 0.6);
        }
        #__fab_button:active { transform: scale(0.95); }

        #__fab_badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: #ef4444;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 10px;
            border: 2px solid #fff;
            pointer-events: none;
        }

        #__fab_panel {
            position: fixed;
            z-index: 9999999;
            width: ${DEFAULT_CONFIG.panelWidth}px;
            max-width: calc(100vw - 32px);
            height: ${DEFAULT_CONFIG.panelHeight}px;
            max-height: calc(100vh - 60px);
            background: #0f172a;
            color: #f8fafc;
            border-radius: 16px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            bottom: 92px;
            left: 24px;
            transform: translateY(20px) scale(0.96);
            opacity: 0;
            visibility: hidden;
            transition: transform 0.25s ease, opacity 0.25s ease, visibility 0.25s ease;
            resize: both;
            min-width: 320px;
            min-height: 400px;
        }
        #__fab_panel.show {
            transform: translateY(0) scale(1);
            opacity: 1;
            visibility: visible;
        }

        /* Header */
        .__fab_header {
            padding: 14px 18px;
            background: #1e293b;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            user-select: none;
        }
        .__fab_title_box {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .__fab_title {
            font-size: 16px;
            font-weight: 700;
            color: #38bdf8;
            margin: 0;
        }
        .__fab_status_pill {
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 12px;
            background: #064e3b;
            color: #6ee7b7;
            border: 1px solid #059669;
        }
        .__fab_close_btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 20px;
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
            transition: color 0.15s, background 0.15s;
        }
        .__fab_close_btn:hover { color: #f8fafc; background: rgba(255,255,255,0.1); }

        /* Toolbar */
        .__fab_toolbar {
            padding: 10px 14px;
            background: #131d31;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .__fab_btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 9px 12px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.15s ease;
            text-align: center;
        }
        .__fab_btn:active { transform: scale(0.97); }
        .__fab_btn_primary {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .__fab_btn_primary:hover { filter: brightness(1.1); }
        .__fab_btn_secondary {
            background: #1e293b;
            color: #cbd5e1;
            border-color: #334155;
        }
        .__fab_btn_secondary:hover { background: #334155; color: #fff; }
        .__fab_btn_amber {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: #fff;
        }
        .__fab_btn_amber:hover { filter: brightness(1.1); }

        /* Subbar */
        .__fab_subbar {
            padding: 8px 14px;
            background: #0f172a;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
        }
        .__fab_quick_nav {
            display: flex;
            gap: 4px;
            overflow-x: auto;
            padding: 6px 14px;
            background: #131d31;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            white-space: nowrap;
        }
        .__fab_quick_num {
            min-width: 28px;
            height: 28px;
            border-radius: 6px;
            background: #1e293b;
            color: #94a3b8;
            border: 1px solid #334155;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .__fab_quick_num:hover { background: #334155; color: #fff; }
        .__fab_quick_num.solved {
            background: #10b981;
            border-color: #059669;
            color: #fff;
        }

        /* Body & Content Area */
        .__fab_content_area {
            flex: 1;
            overflow-y: auto;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        /* Question Cards inside overlay */
        .__fab_q_card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 10px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: border-color 0.15s;
        }
        .__fab_q_card.has-answer {
            border-color: #10b981;
            background: #142334;
        }
        .__fab_q_header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
        }
        .__fab_q_num { font-weight: 700; color: #38bdf8; }
        .__fab_q_text {
            font-size: 13px;
            line-height: 1.5;
            color: #e2e8f0;
            white-space: pre-line;
        }
        .__fab_choices_list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 4px;
        }
        .__fab_choice_item {
            padding: 7px 10px;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 6px;
            font-size: 12.5px;
            color: #cbd5e1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            line-height: 1.4;
        }
        .__fab_choice_item.is-correct {
            background: rgba(16, 185, 129, 0.18);
            border: 1.5px solid #10b981;
            color: #6ee7b7;
            font-weight: 700;
        }
        .__fab_choice_badge {
            background: #059669;
            color: #fff;
            font-size: 10.5px;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .__fab_explanation_box {
            margin-top: 6px;
            padding: 8px 10px;
            background: rgba(30, 41, 59, 0.8);
            border-left: 3px solid #38bdf8;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.45;
            color: #94a3b8;
        }

        /* Status box */
        .__fab_status_box {
            padding: 10px 12px;
            border-radius: 8px;
            font-size: 12.5px;
            line-height: 1.4;
            display: none;
            margin-bottom: 6px;
        }
        .__fab_status_box.show { display: block; }
        .__fab_status_box.info    { background: rgba(56, 189, 248, 0.15); border: 1px solid #0284c7; color: #7dd3fc; }
        .__fab_status_box.success { background: rgba(16, 185, 129, 0.15); border: 1px solid #059669; color: #6ee7b7; }
        .__fab_status_box.error   { background: rgba(239, 68, 68, 0.15); border: 1px solid #dc2626; color: #fca5a5; }

        /* Panels: Settings / Paste */
        .__fab_form_group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 12px;
        }
        .__fab_form_group label { font-size: 13px; font-weight: 600; color: #cbd5e1; }
        .__fab_input, .__fab_textarea, .__fab_select {
            width: 100%;
            padding: 9px 12px;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 8px;
            color: #f8fafc;
            font-size: 13px;
            outline: none;
        }
        .__fab_input:focus, .__fab_textarea:focus, .__fab_select:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
        }
        .__fab_textarea {
            height: 220px;
            resize: vertical;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            line-height: 1.45;
        }

        /* Toast notification */
        .__fab_toast {
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 10000000;
            padding: 10px 18px;
            border-radius: 10px;
            background: #1e293b;
            color: #fff;
            font-size: 13.5px;
            font-weight: 600;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.15);
            display: flex;
            align-items: center;
            gap: 8px;
            transform: translateY(20px);
            opacity: 0;
            transition: all 0.25s ease;
            pointer-events: none;
        }
        .__fab_toast.show {
            transform: translateY(0);
            opacity: 1;
        }
        .__fab_toast.success { border-left: 4px solid #10b981; }
        .__fab_toast.error   { border-left: 4px solid #ef4444; }
    `;
    document.head.appendChild(style);

    // ====== TẠO CẤU TRÚC DOM CHO OVERLAY ======
    const root = document.createElement('div');
    root.id = '__fab_overlay_root';
    root.innerHTML = `
        <button id="__fab_button" title="Kéo để di chuyển / Nhấp để mở AI Assistant (Phím tắt: F2)" aria-label="Mở trợ lý AI">
            🤖
            <span id="__fab_badge">25</span>
        </button>

        <div id="__fab_panel" role="dialog" aria-modal="true">
            <div class="__fab_header" id="__fab_header_drag">
                <div class="__fab_title_box">
                    <h3 class="__fab_title">✨ AI Exam Assistant</h3>
                    <span class="__fab_status_pill" id="__fab_header_pill">0/25 Câu</span>
                </div>
                <button class="__fab_close_btn" id="__fab_close_btn" title="Đóng">&times;</button>
            </div>

            <div class="__fab_toolbar">
                <button type="button" class="__fab_btn __fab_btn_primary" id="__fab_solve_api_btn">
                    <span>⚡ Giải bằng API</span>
                </button>
                <button type="button" class="__fab_btn __fab_btn_secondary" id="__fab_copy_prompt_btn">
                    <span>📋 Copy Đề + Prompt</span>
                </button>
                <button type="button" class="__fab_btn __fab_btn_amber" id="__fab_paste_tab_btn">
                    <span>📥 Nhập Đáp Án AI</span>
                </button>
                <button type="button" class="__fab_btn __fab_btn_secondary" id="__fab_settings_tab_btn">
                    <span>⚙️ Cài đặt</span>
                </button>
            </div>

            <div class="__fab_subbar">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#94a3b8; font-size:12px;">
                    <input type="checkbox" id="__fab_auto_select_toggle" ${STATE.autoSelect ? 'checked' : ''}>
                    <span>Tự động chọn vào bài</span>
                </label>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="__fab_btn __fab_btn_secondary" id="__fab_questions_tab_btn" style="padding:3px 8px; font-size:11px;">
                        📄 Đề thi
                    </button>
                    <button type="button" class="__fab_btn __fab_btn_secondary" id="__fab_reset_btn" style="padding:3px 8px; font-size:11px; color:#f87171;">
                        🗑️ Xóa đáp án
                    </button>
                </div>
            </div>

            <div class="__fab_quick_nav" id="__fab_quick_nav"></div>

            <div style="padding: 0 14px; margin-top:8px;">
                <div class="__fab_status_box" id="__fab_status_box"></div>
            </div>

            <div class="__fab_content_area" id="__fab_content_area"></div>
        </div>

        <div class="__fab_toast" id="__fab_toast"></div>
    `;
    document.body.appendChild(root);

    // ====== THAM CHIẾU PHẦN TỬ ======
    const fabBtn = document.getElementById('__fab_button');
    const fabPanel = document.getElementById('__fab_panel');
    const headerDrag = document.getElementById('__fab_header_drag');
    const closeBtn = document.getElementById('__fab_close_btn');
    const solveApiBtn = document.getElementById('__fab_solve_api_btn');
    const copyPromptBtn = document.getElementById('__fab_copy_prompt_btn');
    const pasteTabBtn = document.getElementById('__fab_paste_tab_btn');
    const settingsTabBtn = document.getElementById('__fab_settings_tab_btn');
    const questionsTabBtn = document.getElementById('__fab_questions_tab_btn');
    const resetBtn = document.getElementById('__fab_reset_btn');
    const autoSelectToggle = document.getElementById('__fab_auto_select_toggle');
    const contentArea = document.getElementById('__fab_content_area');
    const quickNav = document.getElementById('__fab_quick_nav');
    const statusBox = document.getElementById('__fab_status_box');
    const headerPill = document.getElementById('__fab_header_pill');
    const fabBadge = document.getElementById('__fab_badge');

    // ====== XỬ LÝ KÉO THẢ (DRAG & DROP) CHO NÚT NỔI VÀ BẢNG ======
    function makeDraggable(element, handle) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        let hasMoved = false;

        const targetHandle = handle || element;

        targetHandle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;

            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            element.style.bottom = 'auto';
            element.style.right = 'auto';
            element.style.left = `${initialLeft}px`;
            element.style.top = `${initialTop}px`;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                hasMoved = true;
            }

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // Giới hạn trong màn hình
            newLeft = Math.max(10, Math.min(window.innerWidth - element.offsetWidth - 10, newLeft));
            newTop = Math.max(10, Math.min(window.innerHeight - element.offsetHeight - 10, newTop));

            element.style.left = `${newLeft}px`;
            element.style.top = `${newTop}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        return () => hasMoved;
    }

    const wasFabMoved = makeDraggable(fabBtn);
    makeDraggable(fabPanel, headerDrag);

    // ====== HÀM ĐIỀU KHIỂN PANEL ======
    function togglePanel() {
        if (fabPanel.classList.contains('show')) closePanel();
        else openPanel();
    }
    function openPanel() {
        fabPanel.classList.add('show');
        renderTabContent();
    }
    function closePanel() {
        fabPanel.classList.remove('show');
    }
    function switchTab(tabName) {
        STATE.activeTab = tabName;
        renderTabContent();
    }

    // ====== RENDER GIAO DIỆN THEO TAB ======
    function renderTabContent() {
        if (STATE.activeTab === 'questions') {
            renderQuestionsList();
        } else if (STATE.activeTab === 'settings') {
            renderSettingsTab();
        } else if (STATE.activeTab === 'paste') {
            renderPasteTab();
        }
        updateUIState();
    }

    function renderQuestionsList() {
        contentArea.innerHTML = '';

        if (!STATE.questions.length) {
            contentArea.innerHTML = `
                <div style="text-align:center; padding:30px 10px; color:#94a3b8;">
                    <p style="font-size:28px; margin-bottom:8px;">🔍</p>
                    <p>Đang tìm kiếm câu hỏi trên trang web...</p>
                    <button type="button" class="__fab_btn __fab_btn_secondary" id="__fab_reload_extract_btn" style="margin: 0 auto;">
                        🔄 Thử trích xuất lại
                    </button>
                </div>
            `;
            const reloadBtn = document.getElementById('__fab_reload_extract_btn');
            if (reloadBtn) reloadBtn.addEventListener('click', initExtraction);
            return;
        }

        STATE.questions.forEach(q => {
            const solved = STATE.solvedAnswers[q.index];
            const card = document.createElement('div');
            card.className = `__fab_q_card ${solved ? 'has-answer' : ''}`;
            card.id = `__fab_card_${q.index}`;

            let cardHtml = `
                <div class="__fab_q_header">
                    <span class="__fab_q_num">Câu ${q.index} (${q.type_label})</span>
                    ${solved ? `<span style="color:#10b981; font-weight:700; font-size:12px;">✅ Đã có đáp án</span>` : `<span style="color:#64748b; font-size:11px;">Chưa giải</span>`}
                </div>
                <div class="__fab_q_text">${q.content_plain}</div>
            `;

            if (q.type === 'choice' && q.choices.length) {
                cardHtml += `<div class="__fab_choices_list">`;
                const correctLetter = solved ? (solved.selected_choice || '').trim().toUpperCase() : null;

                q.choices.forEach(c => {
                    const isCorrect = correctLetter && c.letter.toUpperCase() === correctLetter;
                    cardHtml += `
                        <div class="__fab_choice_item ${isCorrect ? 'is-correct' : ''}">
                            <span><b>${c.letter}.</b> ${c.content_plain}</span>
                            ${isCorrect ? `<span class="__fab_choice_badge">ĐÁP ÁN AI</span>` : ''}
                        </div>
                    `;
                });
                cardHtml += `</div>`;
            } else if (q.type === 'matching' && q.matching_items.length) {
                cardHtml += `<div class="__fab_choices_list">`;
                q.matching_items.forEach((m, mIdx) => {
                    let matchedVal = '';
                    if (solved && Array.isArray(solved.matching)) {
                        const pair = solved.matching.find(p => p.item_index === (mIdx + 1));
                        if (pair) matchedVal = pair.matched_value;
                    }
                    cardHtml += `
                        <div class="__fab_choice_item ${matchedVal ? 'is-correct' : ''}">
                            <span><b>${mIdx + 1}.</b> ${m.content_plain}</span>
                            ${matchedVal ? `<span class="__fab_choice_badge">Ghép: ${matchedVal}</span>` : `<span style="color:#64748b;">(chưa ghép)</span>`}
                        </div>
                    `;
                });
                cardHtml += `</div>`;
            }

            if (solved && solved.explanation) {
                cardHtml += `
                    <div class="__fab_explanation_box">
                        <strong style="color:#38bdf8;">💡 Giải thích từ AI:</strong><br>
                        ${solved.explanation}
                    </div>
                `;
            }

            card.innerHTML = cardHtml;
            contentArea.appendChild(card);
        });
    }

    function renderSettingsTab() {
        contentArea.innerHTML = `
            <div style="padding: 4px;">
                <h4 style="margin:0 0 14px; font-size:15px; color:#38bdf8;">⚙️ Cấu hình Google AI Studio API</h4>

                <div class="__fab_form_group">
                    <label>Gemini API Key (<a href="https://aistudio.google.com/api-keys" target="_blank" style="color:#38bdf8; text-decoration:none;">Lấy key miễn phí tại đây ↗</a>):</label>
                    <input type="password" class="__fab_input" id="__fab_key_input" placeholder="Dán khóa API (AIzaSy...)" value="${DEFAULT_CONFIG.apiKey}">
                    <span style="font-size:11px; color:#64748b;">Khóa API được lưu cục bộ trên trình duyệt (LocalStorage) của bạn.</span>
                </div>

                <div class="__fab_form_group">
                    <label>Mô hình AI (Model):</label>
                    <select class="__fab_select" id="__fab_model_select">
                        ${AVAILABLE_MODELS.map(m => `<option value="${m.id}" ${m.id === DEFAULT_CONFIG.model ? 'selected' : ''}>${m.name}</option>`).join('')}
                    </select>
                </div>

                <div class="__fab_form_group" style="margin-top:10px;">
                    <button type="button" class="__fab_btn __fab_btn_primary" id="__fab_save_settings_btn">
                        💾 Lưu cấu hình
                    </button>
                </div>

                <hr style="border:0; border-top:1px solid rgba(255,255,255,0.08); margin:18px 0;">

                <div style="font-size:12px; color:#94a3b8; line-height:1.6;">
                    <p><b>Hướng dẫn sử dụng:</b></p>
                    <p>1. <b>Giải bằng API:</b> Nhập API Key ở trên và bấm nút "⚡ Giải bằng API" trên thanh công cụ để tự động gửi toàn bộ đề và nhận đáp án ngay lập tức.</p>
                    <p>2. <b>Dán vào ChatGPT/Claude:</b> Bấm "📋 Copy Đề + Prompt" -> Dán vào chat -> Copy kết quả -> Bấm "📥 Nhập Đáp Án AI" để dán ngược lại vào overlay.</p>
                </div>
            </div>
        `;

        document.getElementById('__fab_save_settings_btn').addEventListener('click', () => {
            const keyVal = document.getElementById('__fab_key_input').value.trim();
            const modelVal = document.getElementById('__fab_model_select').value;

            DEFAULT_CONFIG.apiKey = keyVal;
            DEFAULT_CONFIG.model = modelVal;
            localStorage.setItem('gemini_api_key', keyVal);
            localStorage.setItem('gemini_model', modelVal);

            showToast('✅ Đã lưu cấu hình API Key!', 'success');
            switchTab('questions');
        });
    }

    function renderPasteTab() {
        contentArea.innerHTML = `
            <div style="padding: 4px;">
                <h4 style="margin:0 0 8px; font-size:15px; color:#f59e0b;">📥 Dán câu trả lời từ AI Chat</h4>
                <p style="font-size:12px; color:#94a3b8; margin:0 0 12px; line-height:1.4;">
                    Dán toàn bộ kết quả nhận được từ ChatGPT, Claude hoặc Gemini vào ô bên dưới. Hệ thống sẽ tự động phân tích và làm nổi bật tất cả đáp án đúng trên trang thi:
                </p>

                <div class="__fab_form_group">
                    <textarea class="__fab_textarea" id="__fab_paste_input" placeholder='Dán nội dung JSON hoặc văn bản AI vào đây... Ví dụ:&#10;{&#10;  "answers": [&#10;    { "question_index": 1, "selected_choice": "E" },&#10;    { "question_index": 2, "matching": [{ "item_index": 1, "matched_value": "1" }] }&#10;  ]&#10;}'></textarea>
                </div>

                <div style="display:flex; gap:8px;">
                    <button type="button" class="__fab_btn __fab_btn_primary" id="__fab_apply_paste_btn" style="flex:1;">
                        ⚡ Kích hoạt & Làm nổi bật đáp án
                    </button>
                    <button type="button" class="__fab_btn __fab_btn_secondary" id="__fab_clear_paste_btn">
                        Xóa ô
                    </button>
                </div>
            </div>
        `;

        document.getElementById('__fab_apply_paste_btn').addEventListener('click', () => {
            const textVal = document.getElementById('__fab_paste_input').value.trim();
            if (!textVal) {
                showToast('⚠️ Vui lòng dán câu trả lời vào ô!', 'error');
                return;
            }

            const answers = parseAIResponseText(textVal);
            if (!answers || !answers.length) {
                showToast('❌ Không nhận diện được định dạng đáp án. Vui lòng kiểm tra lại text!', 'error');
                return;
            }

            applyAnswers(answers);
            showToast(`✅ Đã làm nổi bật ${answers.length} câu hỏi thành công!`, 'success');
            showStatusBox(`✅ Đã nạp thành công ${answers.length}/${STATE.questions.length} đáp án từ văn bản!`, 'success');
            switchTab('questions');
        });

        document.getElementById('__fab_clear_paste_btn').addEventListener('click', () => {
            document.getElementById('__fab_paste_input').value = '';
        });
    }

    // ====== CẬP NHẬT TRẠNG THÁI GIAO DIỆN ======
    function updateUIState() {
        const total = STATE.questions.length;
        const solvedCount = Object.keys(STATE.solvedAnswers).length;

        if (fabBadge) {
            fabBadge.textContent = solvedCount > 0 ? `${solvedCount}/${total}` : `${total}`;
            fabBadge.style.backgroundColor = solvedCount > 0 ? '#10b981' : '#ef4444';
        }

        if (headerPill) {
            headerPill.textContent = `${solvedCount}/${total} Đã giải`;
            headerPill.style.backgroundColor = solvedCount > 0 ? '#064e3b' : '#334155';
            headerPill.style.color = solvedCount > 0 ? '#6ee7b7' : '#cbd5e1';
        }

        if (solveApiBtn) {
            if (STATE.isSolving) {
                solveApiBtn.disabled = true;
                solveApiBtn.innerHTML = `<span>⏳ Đang giải...</span>`;
            } else {
                solveApiBtn.disabled = false;
                solveApiBtn.innerHTML = `<span>⚡ Giải bằng API</span>`;
            }
        }

        if (quickNav) {
            quickNav.innerHTML = '';
            STATE.questions.forEach(q => {
                const isSolved = Boolean(STATE.solvedAnswers[q.index]);
                const numBtn = document.createElement('div');
                numBtn.className = `__fab_quick_num ${isSolved ? 'solved' : ''}`;
                numBtn.textContent = q.index;
                numBtn.title = `Câu ${q.index}: ${isSolved ? 'Đã có đáp án' : 'Chưa giải'}`;

                numBtn.addEventListener('click', () => {
                    const card = document.getElementById(`__fab_card_${q.index}`);
                    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    const pageCard = document.getElementById(`__rendered_q_${q.index}`) || document.getElementById(`question-card-${q.index}`);
                    if (pageCard) pageCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });

                quickNav.appendChild(numBtn);
            });
        }
    }

    function showStatusBox(msg, type) {
        if (!statusBox) return;
        statusBox.className = `__fab_status_box show ${type || 'info'}`;
        statusBox.textContent = msg;
    }

    function showToast(msg, type) {
        const toast = document.getElementById('__fab_toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.className = `__fab_toast show ${type || 'success'}`;
        setTimeout(() => {
            toast.className = '__fab_toast';
        }, 3200);
    }

    // ====== KHỞI TẠO VÀ TRÍCH XUẤT ĐỀ BÀI ======
    function initExtraction() {
        let questions = extractQuestionsFromScripts();

        if (!questions || !questions.length) {
            questions = extractQuestionsFromDOM();
        }

        if (questions && questions.length > 0) {
            STATE.questions = questions;
            console.log(`[1.js] ✅ Đã trích xuất thành công ${questions.length} câu hỏi từ trang web.`);
            ensureExamRenderedOnPage();
            updateUIState();
            renderTabContent();
        } else {
            setTimeout(() => {
                const retryQ = extractQuestionsFromScripts() || extractQuestionsFromDOM();
                if (retryQ && retryQ.length > 0) {
                    STATE.questions = retryQ;
                    ensureExamRenderedOnPage();
                    updateUIState();
                    renderTabContent();
                }
            }, 600);
        }
    }

    // ====== GẮN SỰ KIỆN NÚT VÀ PHÍM TẮT ======
    fabBtn.addEventListener('click', () => {
        if (!wasFabMoved()) {
            togglePanel();
        }
    });

    closeBtn.addEventListener('click', closePanel);

    solveApiBtn.addEventListener('click', () => {
        solveAllWithGeminiAPI();
    });

    copyPromptBtn.addEventListener('click', async () => {
        if (!STATE.questions.length) {
            showToast('❌ Không tìm thấy câu hỏi nào để copy!', 'error');
            return;
        }

        const prompt = buildExamPrompt(STATE.questions);
        try {
            await navigator.clipboard.writeText(prompt);
            showToast(`📋 Đã sao chép toàn bộ ${STATE.questions.length} câu hỏi kèm Prompt AI!`, 'success');
            showStatusBox(`✅ Đã copy toàn bộ đề thi (${prompt.length} ký tự). Hãy dán (Ctrl+V) vào ChatGPT, Claude hoặc Gemini!`, 'success');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = prompt;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(`📋 Đã sao chép toàn bộ đề kèm Prompt AI!`, 'success');
        }
    });

    pasteTabBtn.addEventListener('click', () => switchTab('paste'));
    settingsTabBtn.addEventListener('click', () => switchTab('settings'));
    questionsTabBtn.addEventListener('click', () => switchTab('questions'));

    autoSelectToggle.addEventListener('change', (e) => {
        STATE.autoSelect = e.target.checked;
        localStorage.setItem('auto_select_answers', String(STATE.autoSelect));
        showToast(STATE.autoSelect ? 'Đã bật tự động chọn đáp án' : 'Đã tắt tự động chọn đáp án', 'info');
        if (STATE.autoSelect) {
            highlightAnswersOnWebPage(Object.values(STATE.solvedAnswers));
        }
    });

    resetBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn xóa tất cả đáp án đã giải?')) return;
        STATE.solvedAnswers = {};
        document.querySelectorAll('.__ai_highlight_badge').forEach(b => b.remove());
        document.querySelectorAll('.__choice_option_row, .__rendered_q_card, tr, label, div').forEach(el => {
            el.style.backgroundColor = '';
            el.style.border = '';
            el.style.boxShadow = '';
        });
        document.querySelectorAll('.__nav_q_btn').forEach(btn => {
            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        });
        updateUIState();
        renderTabContent();
        showToast('Đã xóa tất cả đáp án.', 'info');
    });

    // Phím tắt bàn phím: F2 hoặc Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2' || e.key === '`') {
            e.preventDefault();
            togglePanel();
        } else if (e.key === 'Escape' && fabPanel.classList.contains('show')) {
            closePanel();
        }
    });

    // Khởi chạy khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtraction);
    } else {
        initExtraction();
    }

    // ====== API TOÀN CỤC ======
    window.FabOverlay = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        getQuestions: () => STATE.questions,
        solveWithAPI: solveAllWithGeminiAPI,
        copyPrompt: () => copyPromptBtn.click(),
        applyAnswers: applyAnswers
    };
})();
