/* =========================================================
 * Yihang (Sam) Wu - App Logic
 * ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    console.log("System Initialized: Multi-page Neumorphic Architecture.");

    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-input');
    const chatWindow = document.getElementById('chat-window');
    
    // Render Backend URL
    const RENDER_URL = 'https://sam-api-backend.onrender.com/chat';
    const API_BASE = 'https://sam-api-backend.onrender.com/api';
    
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

    // Pre-wake the backend on load
    fetch('https://sam-api-backend.onrender.com/ping').catch(() => {});

    // Load Public Testimonials
    const testimonialsContainer = document.getElementById('public-testimonials-container');
    if (testimonialsContainer) {
        fetch(`${API_BASE}/public/testimonials`)
            .then(res => res.json())
            .then(data => {
                testimonialsContainer.innerHTML = ''; 
                if (!data || data.length === 0) {
                    testimonialsContainer.innerHTML = '<div class="text-sm text-gray-500 font-bold">No testimonials yet. Be the first one to leave a comment in the admin panel!</div>';
                    return;
                }
                
                data.forEach(t => {
                    const safeComment = escapeHTML(t.comment);
                    const safeRelationship = escapeHTML(t.relationship);
                    const html = `
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
                    testimonialsContainer.insertAdjacentHTML('beforeend', html);
                });
            })
            .catch(err => {
                testimonialsContainer.innerHTML = '<div class="text-sm text-red-500 font-bold">Failed to load testimonials. Please try again later.</div>';
            });
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
        // Handle Quick Prompts
        const quickPromptBtns = document.querySelectorAll('.quick-prompt-btn');
        const quickPromptsContainer = document.getElementById('ai-quick-prompts');
        
        quickPromptBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Extract text without quotes
                const promptText = btn.textContent.trim().replace(/^"|"$/g, '');
                chatInput.value = promptText;
                
                // Trigger form submission
                const event = new Event('submit', { cancelable: true });
                chatForm.dispatchEvent(event);
                
                // Hide quick prompts after first use to keep UI clean
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
            const loadingHtml = `<div id="${loadingId}" class="flex items-start mt-2 mb-5 animate-fade-in"><div class="w-10 h-10 retro-panel flex items-center justify-center text-gray-900 font-black text-[12px] flex-shrink-0 bg-emerald-200 mr-4 shadow-md">AI</div><div class="retro-panel bg-white text-gray-500 px-6 py-4 text-sm font-bold max-w-[85%] leading-relaxed shadow-md animate-pulse">Thinking / Waking up server...</div></div>`;
            chatWindow.insertAdjacentHTML('beforeend', loadingHtml);
            chatWindow.scrollTop = chatWindow.scrollHeight;
            
            try {
                const response = await fetch(RENDER_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ message: text, history: chatHistory }) 
                });
                const data = await response.json();
                
                document.getElementById(loadingId).remove();
                
                if(data.reply) {
                    addBubble(data.reply, false);
                    chatHistory.push({ role: 'User', text: text });
                    chatHistory.push({ role: 'AI', text: data.reply });
                    if (chatHistory.length > 20) chatHistory = chatHistory.slice(chatHistory.length - 20);
                }
            } catch (err) {
                document.getElementById(loadingId).remove();
                addBubble(`🟡 Connection timeout. The server might be performing a deep cold start. Please wait a moment and try again.`, false);
            } finally {
                chatInput.disabled = false;
                chatInput.focus();
            }
        });
    }
});
