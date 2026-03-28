/* =========================================================
 * Yihang (Sam) Wu - Main Application Logic
 * Architecture: Modular Frontend
 * ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

    // ================= 1. 全局阅读进度条 =================
    const scrollProgress = document.getElementById('scroll-progress');
    window.addEventListener('scroll', () => {
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (scrollTop / scrollHeight) * 100;
        if(scrollProgress) scrollProgress.style.height = scrolled + '%';
    });

    // ================= 2. 导航栏磨砂侦测 =================
    const navbar = document.getElementById('navbar');
    const navLogo = document.getElementById('nav-logo');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) { 
            navbar.classList.add('bg-[#0d131f]/95', 'backdrop-blur-xl', 'py-4', 'border-gray-800', 'shadow-2xl');
            navbar.classList.remove('py-6');
            if(navLogo) navLogo.classList.add('text-emerald-400');
        } else { 
            navbar.classList.remove('bg-[#0d131f]/95', 'backdrop-blur-xl', 'py-4', 'border-gray-800', 'shadow-2xl');
            navbar.classList.add('py-6');
            if(navLogo) navLogo.classList.remove('text-emerald-400');
        }
    });

    // ================= 3. 无限反复触发动画系统 =================
    const revealOptions = { threshold: 0.15, rootMargin: "0px 0px -60px 0px" };
    const revealOnScroll = new IntersectionObserver(entries => {
        entries.forEach(entry => { 
            // 进入视口加 active，离开视口移除 active (保证每次滑动都能触发)
            if (entry.isIntersecting) { 
                entry.target.classList.add('active'); 
            } else { 
                entry.target.classList.remove('active'); 
            }
        });
    }, revealOptions);
    
    // 监听所有带有 reveal 前缀的元素
    document.querySelectorAll('[class*="reveal-"]').forEach(el => revealOnScroll.observe(el));

    // ================= 4. 初始化 3D 视差引擎 =================
    if (window.VanillaTilt) {
        VanillaTilt.init(document.querySelectorAll("[data-tilt]"));
    }

    // ================= 5. AI 后端全栈连线 =================
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-input');
    const chatWindow = document.getElementById('chat-window');
    
    // 你的专属 Render 后端地址
    const RENDER_URL = 'https://sam-api-backend.onrender.com/chat';

    // UI 气泡渲染器
    function addBubble(text, isUser = true) {
        // 简单处理 Markdown 加粗和换行
        const formattedBody = text.replace(/\*\*(.*?)\*\*/g, '<b class="text-emerald-400">$1</b>').replace(/\n/g, '<br>');
        
        const html = isUser 
            ? `<div class="flex justify-end mb-3 animate-fade-in"><span class="bg-emerald-700/60 text-white px-5 py-4 rounded-2xl rounded-tr-sm text-sm max-w-[85%] font-medium tracking-wide shadow-lg nm-pressed">${formattedBody}</span></div>`
            : `<div class="flex items-start mt-4 mb-3 animate-fade-in"><div class="w-10 h-10 rounded-full nm-raised border border-emerald-500 flex items-center justify-center text-emerald-400 mr-4 flex-shrink-0 shadow-lg font-bold text-[10px]">AI</div><div class="bg-[#1e293b]/50 text-gray-200 px-6 py-4 rounded-2xl p-6 text-sm shadow-2xl max-w-[85%] border-l-4 border-emerald-500 leading-relaxed font-light drop-shadow-md nm-pressed">${formattedBody}</div></div>`;
        
        chatWindow.insertAdjacentHTML('beforeend', html);
        chatWindow.scrollTop = chatWindow.scrollHeight; // 自动滚到底部
    }

    // 拦截表单提交并发起 Fetch 请求
    if(chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if(!text) return;
            
            // 立即显示用户的问题
            addBubble(text, true); 
            chatInput.value = '';
            
            try {
                // 向 Render 发送 POST 请求
                const response = await fetch(RENDER_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ message: text }) 
                });
                
                const data = await response.json();
                
                if(data.reply) {
                    addBubble(data.reply, false);
                } else {
                    addBubble(`🔴 Error: Failed to parse backend response.`, false);
                }
            } catch (err) {
                console.error("API Error:", err);
                // 优雅地处理冷启动超时
                addBubble(`🟡 Waking up the digital brain... (Free cloud servers require ~50s for the first wake). Please wait a moment and try again.`, false);
            }
        });
    }
});
