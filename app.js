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

    // Pre-wake the backend on load
    fetch('https://sam-api-backend.onrender.com/ping').catch(() => {});

    function addBubble(text, isUser = true) {
        const formattedBody = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-700 font-bold">$1</strong>').replace(/\n/g, '<br>');
        
        // 气泡采用物理高低差
        const html = isUser 
            ? `<div class="flex justify-end mb-5 animate-fade-in"><span class="retro-panel bg-white text-slate-800 px-6 py-4 text-sm font-bold border-l-4 border-emerald-500 max-w-[85%] shadow-md">${formattedBody}</span></div>`
            : `<div class="flex items-start mt-2 mb-5 animate-fade-in"><div class="w-10 h-10 retro-panel flex items-center justify-center text-gray-900 font-black text-[12px] flex-shrink-0 bg-emerald-200 mr-4 shadow-md">AI</div><div class="retro-panel bg-white text-gray-800 px-6 py-4 text-sm font-bold max-w-[85%] leading-relaxed shadow-md">${formattedBody}</div></div>`;
        
        chatWindow.insertAdjacentHTML('beforeend', html);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    if(chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if(!text) return;
            addBubble(text, true); 
            chatInput.value = '';
            
            try {
                const response = await fetch(RENDER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
                const data = await response.json();
                if(data.reply) addBubble(data.reply, false);
            } catch (err) {
                // 警示文字颜色调整，适配亮色背景
                addBubble(`🟡 I am waking up my digital assistant... (Free API tier requires ~50s for first wake). Please wait a moment and try again.`, false);
            }
        });
    }
});
