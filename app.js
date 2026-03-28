/* =========================================================
 * Yihang (Sam) Wu - App Logic
 * 移除了所有滚动和 3D 特效，专注于 AI 交互
 * ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    console.log("System Initialized: Multi-page Neumorphic Architecture.");

    // ================= AI 后端全栈连线 =================
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-input');
    const chatWindow = document.getElementById('chat-window');
    
    // 你的专属 Render 后端地址
    const RENDER_URL = 'https://sam-api-backend.onrender.com/chat';

    function addBubble(text, isUser = true) {
        const formattedBody = text.replace(/\*\*(.*?)\*\*/g, '<b class="text-emerald-400">$1</b>').replace(/\n/g, '<br>');
        
        // 使用拟物化类名：AI 的回答是凸起的 (nm-panel)，用户的提问也是凸起的
        const html = isUser 
            ? `<div class="flex justify-end mb-4 animate-fade-in"><span class="nm-panel text-gray-300 px-5 py-3 rounded-2xl rounded-tr-sm text-sm max-w-[85%] font-medium">${formattedBody}</span></div>`
            : `<div class="flex items-start mt-2 mb-4 animate-fade-in"><div class="w-10 h-10 rounded-full nm-panel flex items-center justify-center text-emerald-400 mr-4 flex-shrink-0 font-bold text-[10px] shadow-inner border border-emerald-900/30">AI</div><div class="nm-panel text-gray-400 px-6 py-4 rounded-2xl rounded-tl-sm text-sm max-w-[85%] leading-relaxed">${formattedBody}</div></div>`;
        
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
                const response = await fetch(RENDER_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ message: text }) 
                });
                const data = await response.json();
                if(data.reply) addBubble(data.reply, false);
            } catch (err) {
                addBubble(`🟡 Server waking up (free cloud tier requires ~50s for first wake). Please wait and try again.`, false);
            }
        });
    }
});
