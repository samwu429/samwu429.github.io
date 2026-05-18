(function () {
    const apiConfig = window.SAM_API_CONFIG || {};
    const API_BASE = apiConfig.apiBase || 'https://sam-api-backend.onrender.com/api';

    const KIND_LABELS = {
        photo: 'Photo',
        video: 'Video',
        article: 'Article',
        note: 'Note'
    };

    function escapeHTML(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>'"]/g, (tag) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
    }

    async function fetchJson(url, options = {}, timeoutMs = 20000) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
            if (!res.ok) throw new Error(String(res.status));
            return res.json();
        } finally {
            clearTimeout(t);
        }
    }

    function pad2(n) {
        const x = Number(n);
        if (!Number.isFinite(x)) return '';
        return String(x).padStart(2, '0');
    }

    function formatDisplayDate(p) {
        const y = p.displayYear;
        const m = pad2(p.displayMonth);
        const d = pad2(p.displayDay);
        if (!y) return '';
        return `${y}-${m || '??'}-${d || '??'}`;
    }

    function excerpt(text, maxLen) {
        const max = maxLen == null ? 160 : maxLen;
        const t = String(text || '').trim().replace(/\s+/g, ' ');
        if (!t) return '';
        if (t.length <= max) return t;
        return t.slice(0, max) + '…';
    }

    function itemPageUrl(id) {
        if (!id) return 'stash.html';
        return `stash-item.html?id=${encodeURIComponent(String(id))}`;
    }

    function absoluteItemPageUrl(id) {
        try {
            return new URL(itemPageUrl(id), window.location.href).href;
        } catch (_) {
            return itemPageUrl(id);
        }
    }

    function imgSrcForAttr(u) {
        if (!u || typeof u !== 'string') return '';
        const t = u.trim();
        if (t.startsWith('data:image/')) return t.replace(/"/g, '%22');
        if (/^https?:\/\//i.test(t)) return escapeHTML(t);
        return '';
    }

    function photoGrid(urls, thumbClass) {
        const safe = (urls || []).filter(Boolean);
        const n = safe.length;
        if (!n) return '';

        const imgCls = thumbClass || 'stash-thumb-img';

        let gridClass = 'moments-photo-grid gap-1.5 ';
        if (n === 1) gridClass += 'moments-photo-grid--1';
        else if (n === 2) gridClass += 'grid grid-cols-2';
        else if (n === 3) gridClass += 'grid grid-cols-3';
        else if (n === 4) gridClass += 'grid grid-cols-2 grid-rows-2';
        else gridClass += 'grid grid-cols-3';

        const cells = safe.map((u) => {
            const src = imgSrcForAttr(u);
            if (!src) return '';
            return `<div class="moments-thumb border-2 border-gray-900 bg-gray-100 overflow-hidden">
                <img src="${src}" alt="" class="w-full h-full object-cover cursor-zoom-in ${imgCls}" loading="lazy" decoding="async">
            </div>`;
        }).join('');
        return `<div class="${gridClass}">${cells}</div>`;
    }

    function videoEmbedHtml(link) {
        const raw = String(link || '').trim();
        if (!raw) return '';

        let embed = '';
        const ytShort = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
        const ytWatch = raw.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
        const ytEmbed = raw.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
        const vimeo = raw.match(/vimeo\.com\/(\d+)/);
        const id = (ytShort && ytShort[1]) || (ytWatch && ytWatch[1]) || (ytEmbed && ytEmbed[1]);
        if (id) {
            embed = `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
        } else if (vimeo && vimeo[1]) {
            embed = `https://player.vimeo.com/video/${encodeURIComponent(vimeo[1])}`;
        }
        if (!embed) {
            return `<p class="text-sm mt-3"><a href="${escapeHTML(raw)}" target="_blank" rel="noopener noreferrer" class="underline font-bold text-emerald-800">Open video link</a></p>`;
        }
        return `<div class="stash-video-wrap"><iframe src="${escapeHTML(embed)}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }

    function buildStashListCard(item) {
        const kind = String(item.kind || 'note');
        const label = KIND_LABELS[kind] || kind;
        const dateStr = formatDisplayDate(item);
        const title = escapeHTML(item.title || '').trim();
        const bodyExcerpt = escapeHTML(excerpt(item.body, 140)).replace(/\n/g, ' ');
        const href = escapeHTML(itemPageUrl(item.id));
        const link = String(item.link || '').trim();

        let preview = '';
        if (kind === 'photo' && item.images && item.images.length) {
            const src = imgSrcForAttr(item.images[0]);
            const count = item.images.length;
            if (src) {
                preview = `<div class="stash-list-thumb mt-3 border-2 border-gray-900 overflow-hidden bg-gray-100 aspect-[4/3] max-h-48 relative">
                    <img src="${src}" alt="" class="w-full h-full object-cover" loading="lazy">
                    ${count > 1 ? `<span class="stash-list-thumb-count">${count} photos</span>` : ''}
                </div>`;
            }
        } else if (kind === 'video') {
            preview = `<p class="text-xs font-bold text-pink-900/80 mt-3 uppercase tracking-widest">▶ Video — open to play</p>`;
        } else if (kind === 'article' && link) {
            preview = `<p class="text-xs text-gray-500 mt-3 font-mono truncate">${escapeHTML(link)}</p>`;
        }

        const heading = title || bodyExcerpt || escapeHTML(label);

        return `
            <a href="${href}" class="stash-card-link group">
                <article class="stash-card retro-panel p-5 md:p-6 bg-white h-full">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span class="stash-kind-badge stash-kind-badge--${escapeHTML(kind)}">${escapeHTML(label)}</span>
                        <time class="text-[11px] font-bold text-gray-400 tracking-wide">${escapeHTML(dateStr)}</time>
                    </div>
                    <h2 class="stash-card-title pr-8">${heading}</h2>
                    ${title && bodyExcerpt ? `<p class="text-sm text-gray-600 mt-2 line-clamp-2">${bodyExcerpt}</p>` : ''}
                    ${preview}
                    <span class="stash-open-hint">Open page →</span>
                </article>
            </a>`;
    }

    function buildStashDetail(item) {
        const kind = String(item.kind || 'note');
        const label = KIND_LABELS[kind] || kind;
        const dateStr = formatDisplayDate(item);
        const title = escapeHTML(item.title || '').trim();
        const body = escapeHTML(item.body || '').replace(/\n/g, '<br>');
        const link = String(item.link || '').trim();
        const badge = `<span class="stash-kind-badge stash-kind-badge--${escapeHTML(kind)}">${escapeHTML(label)}</span>`;

        let media = '';
        if (kind === 'photo') {
            media = photoGrid(item.images, 'stash-detail-thumb');
        } else if (kind === 'video') {
            media = videoEmbedHtml(link);
        }

        let linkBlock = '';
        if (kind === 'article' && link) {
            linkBlock = `<p class="mt-6"><a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="retro-button inline-block px-5 py-2.5 text-[10px] font-black uppercase tracking-widest">Open original article</a></p>`;
        } else if (link && kind !== 'video') {
            linkBlock = `<p class="mt-4 text-sm"><a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="font-bold text-emerald-800 underline break-all">${escapeHTML(link)}</a></p>`;
        } else if (kind === 'video' && link) {
            linkBlock = `<p class="mt-4 text-xs text-gray-500 font-mono break-all"><a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="underline">Source: ${escapeHTML(link)}</a></p>`;
        }

        return `
            <header class="mb-6">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                    ${badge}
                    <time class="text-[11px] font-bold text-gray-400 tracking-wide">${escapeHTML(dateStr)}</time>
                </div>
                ${title ? `<h1 class="text-2xl md:text-3xl font-black text-gray-950 tracking-tight leading-tight">${title}</h1>` : ''}
            </header>
            <div class="retro-panel p-5 md:p-8 bg-white">
                ${body ? `<div class="text-sm md:text-base text-gray-800 leading-relaxed body-readable">${body}</div>` : ''}
                ${media}
                ${linkBlock}
            </div>`;
    }

    function sortStashRows(rows) {
        return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
            const ay = Number(a && a.displayYear ? a.displayYear : 0);
            const by = Number(b && b.displayYear ? b.displayYear : 0);
            if (ay !== by) return by - ay;
            const am = Number(a && a.displayMonth ? a.displayMonth : 0);
            const bm = Number(b && b.displayMonth ? b.displayMonth : 0);
            if (am !== bm) return bm - am;
            const ad = Number(a && a.displayDay ? a.displayDay : 0);
            const bd = Number(b && b.displayDay ? b.displayDay : 0);
            if (ad !== bd) return bd - ad;
            const at = new Date(a && a.timestamp ? a.timestamp : 0).getTime();
            const bt = new Date(b && b.timestamp ? b.timestamp : 0).getTime();
            return bt - at;
        });
    }

    async function fetchStashItem(id) {
        if (!id) return null;
        try {
            return await fetchJson(`${API_BASE}/public/stash/${encodeURIComponent(id)}`);
        } catch (_) {
            const rows = await fetchJson(`${API_BASE}/public/stash`);
            return (Array.isArray(rows) ? rows : []).find((r) => String(r.id) === String(id)) || null;
        }
    }

    window.SAM_STASH = {
        API_BASE,
        KIND_LABELS,
        fetchJson,
        itemPageUrl,
        absoluteItemPageUrl,
        buildStashListCard,
        buildStashDetail,
        sortStashRows,
        fetchStashItem,
        async loadFeed(container, filterKind) {
            if (!container) return;
            container.innerHTML = '<p class="text-sm text-gray-500 font-bold animate-pulse">Loading…</p>';
            try {
                let rows = await fetchJson(`${API_BASE}/public/stash`);
                rows = sortStashRows(rows);
                if (filterKind && filterKind !== 'all') {
                    rows = rows.filter((r) => String(r.kind) === filterKind);
                }
                container.innerHTML = '';
                if (!rows.length) {
                    container.innerHTML = '<p class="text-sm text-gray-500 font-bold">Nothing here yet.</p>';
                    return;
                }
                rows.forEach((row) => {
                    container.insertAdjacentHTML('beforeend', buildStashListCard(row));
                });
            } catch (_) {
                container.innerHTML = '<p class="text-sm text-red-600 font-bold">Could not load archive. Try again later.</p>';
            }
        },
        async loadDetail(container, id, opts) {
            if (!container || !id) return null;
            container.innerHTML = '<p class="text-sm text-gray-500 font-bold animate-pulse">Loading…</p>';
            try {
                const item = await fetchStashItem(id);
                if (!item) {
                    container.innerHTML = '<p class="text-sm text-red-600 font-bold">Item not found. <a href="stash.html" class="underline">Back to shelf</a></p>';
                    return null;
                }
                container.innerHTML = buildStashDetail(item);

                const label = KIND_LABELS[item.kind] || 'Item';
                const pageTitle = (item.title && String(item.title).trim()) || label;
                if (!opts || opts.setDocumentTitle !== false) {
                    document.title = `${pageTitle} | Loose shelf`;
                }
                return item;
            } catch (_) {
                container.innerHTML = '<p class="text-sm text-red-600 font-bold">Could not load this item.</p>';
                return null;
            }
        }
    };
})();
