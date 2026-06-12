document.addEventListener('DOMContentLoaded', () => {

    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-input');
    const chatWindow = document.getElementById('chat-window');
    
    const apiConfig = window.SAM_API_CONFIG || {};
    const RENDER_URL = apiConfig.chatUrl || 'https://sam-api-backend.onrender.com/chat';
    const API_BASE = apiConfig.apiBase || 'https://sam-api-backend.onrender.com/api';
    const PING_URL = apiConfig.pingUrl || 'https://sam-api-backend.onrender.com/ping';
    const COLD_START_MAX_WAIT_MS = 65000;
    
    let chatHistory = []; 

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchJson(url, options = {}, timeoutMs = 12000) {
        const res = await fetchWithTimeout(url, options, timeoutMs);
        if (!res.ok) {
            const err = new Error(`Request failed with status ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    async function wakeBackend(maxWaitMs = COLD_START_MAX_WAIT_MS) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
            try {
                const pingRes = await fetchWithTimeout(PING_URL, {}, 4000);
                if (pingRes.ok) return true;
            } catch (_) {}
            await sleep(2500);
        }
        return false;
    }

    const backendWarmupPromise = wakeBackend();

    const testimonialsContainer = document.getElementById('public-testimonials-container');
    if (testimonialsContainer) {
        const renderTestimonialsError = () => {
            testimonialsContainer.innerHTML = `
                <div class="text-sm text-amber-700 font-bold">
                    Temporarily unable to load testimonials. Please retry in a few seconds.
                </div>
                <button id="retry-public-testimonials" class="retro-button px-3 py-2 text-xs uppercase tracking-widest">
                    Retry now
                </button>
            `;
            const retryBtn = document.getElementById('retry-public-testimonials');
            if (retryBtn) retryBtn.addEventListener('click', loadPublicTestimonials);
        };

        const loadPublicTestimonials = async (showLoading = true) => {
            if (showLoading) {
                testimonialsContainer.innerHTML = '<div class="text-sm text-gray-500 font-bold animate-pulse">Loading testimonials...</div>';
            }
            try {
                let data;
                try {
                    data = await fetchJson(`${API_BASE}/public/testimonials`, {}, 9000);
                } catch (_) {
                    const woke = await backendWarmupPromise;
                    if (!woke) throw new Error('Backend warmup timed out');
                    data = await fetchJson(`${API_BASE}/public/testimonials`, {}, 9000);
                }
                const rows = (Array.isArray(data) ? data : [])
                    .filter(t => t && t.isPublic !== false)
                    .sort((a, b) => {
                        const sa = Number(a && a.sortOrder != null ? a.sortOrder : 0);
                        const sb = Number(b && b.sortOrder != null ? b.sortOrder : 0);
                        if (sa !== sb) return sa - sb;
                        const ta = new Date(a && (a.createdAt || a.timestamp) ? (a.createdAt || a.timestamp) : 0).getTime();
                        const tb = new Date(b && (b.createdAt || b.timestamp) ? (b.createdAt || b.timestamp) : 0).getTime();
                        return tb - ta;
                    });
                if (!rows.length) {
                    testimonialsContainer.innerHTML = '<div class="text-sm text-gray-500 font-bold">No testimonials yet. Be the first one to leave a comment in the admin panel!</div>';
                    return;
                }

                const html = rows.map(t => {
                    const safeComment = escapeHTML(t.comment);
                    const safeRelationship = escapeHTML(t.relationship);
                    return `
                        <div class="retro-panel bg-white p-6 relative flex flex-col justify-between">
                            <div class="absolute -top-3 -left-2 text-5xl text-emerald-200 font-serif leading-none">"</div>
                            <p class="text-gray-800 text-sm font-medium leading-relaxed mb-4 relative z-10 italic">
                                ${safeComment}
                            </p>
                            <div class="border-t border-gray-200 pt-3 flex justify-between items-center mt-auto">
                                <span class="text-[11px] font-black tracking-widest text-emerald-700 uppercase">
                                    ${safeRelationship}
                                </span>
                                <span class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    Anonymous
                                </span>
                            </div>
                        </div>
                    `;
                }).join('');
                testimonialsContainer.innerHTML = html;
            } catch (_) {
                // Keep already-rendered testimonials on silent background refresh failures.
                if (showLoading) renderTestimonialsError();
            }
        };

        loadPublicTestimonials();
        setInterval(() => {
            if (!document.hidden) loadPublicTestimonials(false);
        }, 30000);
    }

    function formatAIText(text) {
        let safeText = escapeHTML(text);
        safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-700 font-bold">$1</strong>');
        safeText = safeText.replace(/^(?:\*|\-)\s+(.*)$/gm, '<li class="ml-5 list-disc marker:text-emerald-500 mb-1">$1</li>');
        safeText = safeText.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, match => `<ul class="my-3">${match}</ul>`);
        safeText = safeText.replace(/\n/g, '<br>');
        safeText = safeText.replace(/<\/ul><br>/g, '</ul>').replace(/<\/li><br>/g, '</li>');
        return safeText;
    }

    function addBubble(text, isUser = true) {
        const formattedBody = isUser ? escapeHTML(text) : formatAIText(text);
        
        const html = isUser 
            ? `<div class="flex justify-end mb-5 animate-fade-in"><span class="retro-panel bg-white text-slate-800 px-6 py-4 text-sm font-bold border-l-4 border-emerald-500 max-w-[85%] shadow-md">${formattedBody}</span></div>`
            : `<div class="flex items-start mt-2 mb-5 animate-fade-in"><div class="w-10 h-10 retro-panel flex items-center justify-center text-gray-900 font-black text-[12px] flex-shrink-0 bg-emerald-200 mr-4 shadow-md">AI</div><div class="retro-panel bg-white text-gray-800 px-6 py-4 text-sm font-bold max-w-[85%] leading-relaxed shadow-md">${formattedBody}</div></div>`;
        
        chatWindow.insertAdjacentHTML('beforeend', html);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    if(chatForm) {
        const quickPromptBtns = document.querySelectorAll('.quick-prompt-btn');
        const quickPromptsContainer = document.getElementById('ai-quick-prompts');
        
        quickPromptBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const promptText = btn.textContent.trim().replace(/^"|"$/g, '');
                chatInput.value = promptText;
                
                const event = new Event('submit', { cancelable: true });
                chatForm.dispatchEvent(event);
                
                if (quickPromptsContainer) {
                    quickPromptsContainer.style.display = 'none';
                }
            });
        });

        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if(!text) return;
            addBubble(text, true); 
            chatInput.value = '';
            
            chatInput.disabled = true;
            
            const loadingId = 'loading-' + Date.now();
            const loadingHtml = `<div id="${loadingId}" class="flex items-start mt-2 mb-5 animate-fade-in"><div class="w-10 h-10 retro-panel flex items-center justify-center text-gray-900 font-black text-[12px] flex-shrink-0 bg-emerald-200 mr-4 shadow-md">AI</div><div class="retro-panel bg-white text-gray-500 px-6 py-4 text-sm font-bold max-w-[85%] leading-relaxed shadow-md animate-pulse">Thinking...</div></div>`;
            chatWindow.insertAdjacentHTML('beforeend', loadingHtml);
            chatWindow.scrollTop = chatWindow.scrollHeight;
            
            try {
                const response = await fetchWithTimeout(RENDER_URL, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ message: text, history: chatHistory }) 
                }, 75000);
                if (!response.ok) {
                    throw new Error(`Chat request failed with status ${response.status}`);
                }
                const data = await response.json();
                
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.remove();
                
                if(data.reply) {
                    addBubble(data.reply, false);
                    chatHistory.push({ role: 'User', text: text });
                    chatHistory.push({ role: 'AI', text: data.reply });
                    if (chatHistory.length > 20) chatHistory = chatHistory.slice(chatHistory.length - 20);
                }
            } catch (err) {
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.remove();
                addBubble(`🟡 Connection timeout. Please check your network and try again.`, false);
            } finally {
                chatInput.disabled = false;
                chatInput.focus();
            }
        });
    }
});
