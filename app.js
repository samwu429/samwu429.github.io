/* =========================================================
 * Yihang (Sam) Wu - App Logic (Restored Retro Brutalism)
 * ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-input');
    const chatWindow = document.getElementById('chat-window');
    const RENDER_URL = 'https://sam-api-backend.onrender.com/chat';

    function addBubble(text, isUser = true) {
        const formattedBody = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-700 font-black">$1</strong>').replace(/\n/g, '<br>');
        
        // 恢复直角复古气泡
        const html = isUser 
            ? `<div class="flex justify-end mb-5 animate-fade-in"><span class="retro-panel px-6 py-4 text-sm font-bold border-emerald-600 border-b-4 max-w-[85%]">${formattedBody}</span></div>`
            : `<div class="flex items-start mt-2 mb-5 animate-fade-in"><div class="w-10 h-10 retro-panel flex items-center justify-center text-emerald-800 mr-4 flex-shrink-0 font-black text-[12px] bg-emerald-100">AI</div><div class="retro-inset bg-white px-6 py-4 text-sm max-w-[85%] leading-relaxed font-bold text-gray-800">${formattedBody}</div></div>`;
        
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
                addBubble(`[SYSTEM WARNING] Connection timeout / Wake sequence initiated. Please wait ~50s.`, false);
            }
        });
    }
});
