/* =========================================================
 * Yihang (Sam) Wu - App Logic (Bright Theme Updated)
 * Focused on AI interaction with Light Neumorphic Styling
 * ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    console.log("System Initialized: Light Multi-page Architecture.");

    // ================= AI Backend Connection =================
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-input');
    const chatWindow = document.getElementById('chat-window');
    
    // Render Backend URL
    const RENDER_URL = 'https://sam-api-backend.onrender.com/chat';

    function addBubble(text, isUser = true) {
        // Handle bolding
        const formattedBody = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-600 font-bold">$1</strong>').replace(/\n/g, '<br>');
        
        // Light Theme Bubbles
        // User bubble: Green text, indented panel
        // AI bubble: Dark text, raised panel
        const html = isUser 
            ? `<div class="flex justify-end mb-4 animate-fade-in"><span class="nm-button font-medium text-emerald-700 px-5 py-3 rounded-2xl rounded-tr-sm text-sm max-w-[85%] border border-emerald-200">${formattedBody}</span></div>`
            : `<div class="flex items-start mt-2 mb-4 animate-fade-in"><div class="w-10 h-10 rounded-full nm-panel flex items-center justify-center text-emerald-600 mr-4 flex-shrink-0 font-bold text-[10px] border border-gray-200">AI</div><div class="nm-panel text-slate-800 px-6 py-4 rounded-2xl rounded-tl-sm text-sm max-w-[85%] leading-relaxed border border-gray-100">${formattedBody}</div></div>`;
        
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
                // Warning text color changed for light background
                addBubble(`⚠️ Server waking up (free cloud tier requires ~50s for first wake). Please wait and try again.`, false);
            }
        });
    }
});
