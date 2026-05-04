(function () {
    const apiConfig = window.SAM_API_CONFIG || {};
    const API_BASE = apiConfig.apiBase || 'https://sam-api-backend.onrender.com/api';

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

    async function fetchJson(url, options = {}, timeoutMs = 15000) {
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

    const SSRN_SHIELD_OF_TIME = 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6593378';

    /**
     * Fixed display order for the publications catalog (lower = higher on page).
     * @param {Record<string, unknown>} p
     */
    function publicationCatalogRank(p) {
        const t = String((p && p.title) || '').toLowerCase();
        if (/shield of time/.test(t)) return 0;
        if (/deconstructing the application-centric/.test(t)) return 1;
        if (/just-in-time|atomic services/i.test(t)) return 1;
        return 50;
    }

    /**
     * Merge canonical status + read link for known papers when API data lags.
     * @param {Record<string, unknown>} p
     */
    function enrichPublication(p) {
        if (!p || typeof p !== 'object') return p;
        const title = String(p.title || '');
        const link = String(p.link || '');
        const isShield =
            /shield of time/i.test(title) ||
            /non-simulatable physical causality/i.test(title) ||
            /4593378|6593378/.test(link);
        if (!isShield) return p;
        return {
            ...p,
            venue: 'SSRN working paper · IEEE journal submission — under review',
            link: SSRN_SHIELD_OF_TIME,
            _readLabel: 'Read preprint on SSRN',
            _statusHtml:
                '<p class="text-xs font-bold text-gray-700 mt-2 leading-relaxed border-l-4 border-emerald-500 pl-3">A public working paper is available on SSRN. The archival IEEE journal version is still under peer review and is not yet the version of record.</p>',
        };
    }

    function imgSrcForAttr(u) {
        if (!u || typeof u !== 'string') return '';
        const t = u.trim();
        if (t.startsWith('data:image/')) return t.replace(/"/g, '%22');
        if (/^https?:\/\//i.test(t)) return escapeHTML(t);
        return '';
    }

    function momentsPhotoGrid(urls) {
        const safe = (urls || []).filter(Boolean);
        const n = safe.length;
        if (!n) return '';

        let gridClass = 'moments-photo-grid gap-1.5 ';
        if (n === 1) gridClass += 'moments-photo-grid--1';
        else if (n === 2) gridClass += 'grid grid-cols-2';
        else if (n === 3) gridClass += 'grid grid-cols-3';
        else if (n === 4) gridClass += 'grid grid-cols-2 grid-rows-2';
        else gridClass += 'grid grid-cols-3';

        const cells = safe.map((u) => {
            const src = imgSrcForAttr(u);
            if (!src) return '';
            return `
            <div class="moments-thumb border-2 border-gray-900 bg-gray-100 overflow-hidden">
                <img src="${src}" alt="" class="w-full h-full object-cover cursor-zoom-in" loading="lazy" decoding="async">
            </div>`;
        }).join('');
        return `<div class="${gridClass}">${cells}</div>`;
    }

    function buildMomentArticle(post, opts) {
        const avatarUrl = (opts && opts.avatarUrl) || 'f702013468e4d300dc33d4c1bfd12f82.jpg';
        const name = (opts && opts.displayName) || 'Sam Wu';
        const dateStr = formatDisplayDate(post);
        const text = escapeHTML(post.text || '').replace(/\n/g, '<br>');
        return `
            <article class="moments-card retro-panel p-4 md:p-5 bg-white">
                <div class="flex gap-3 md:gap-4">
                    <div class="w-12 h-12 md:w-14 md:h-14 flex-shrink-0 retro-panel p-0.5 bg-emerald-50 overflow-hidden">
                        <img src="${escapeHTML(avatarUrl)}" alt="" class="w-full h-full object-cover border border-gray-900" width="56" height="56">
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span class="font-black text-gray-900 text-sm md:text-base">${escapeHTML(name)}</span>
                            <time class="text-[11px] md:text-xs font-bold text-gray-400 tracking-wide">${escapeHTML(dateStr)}</time>
                        </div>
                        ${text ? `<div class="moments-text mt-3 text-sm text-gray-800 leading-relaxed">${text}</div>` : ''}
                        ${momentsPhotoGrid(post.images)}
                    </div>
                </div>
            </article>
        `;
    }

    window.SAM_PUBLIC_CONTENT = {
        API_BASE,
        escapeHTML,
        fetchJson,
        buildMomentArticle,

        async loadPublications(container) {
            if (!container) return;
            container.innerHTML = '<p class="text-sm text-gray-500 font-bold animate-pulse">Loading publications…</p>';
            try {
                const rows = await fetchJson(`${API_BASE}/public/publications`);
                container.innerHTML = '';
                if (!rows || !rows.length) {
                    container.innerHTML = '<p class="text-sm text-gray-500 font-bold">No publications listed yet.</p>';
                    return;
                }
                const ordered = rows
                    .map((r, i) => ({ r, i }))
                    .sort((a, b) => {
                        const ra = publicationCatalogRank(a.r);
                        const rb = publicationCatalogRank(b.r);
                        if (ra !== rb) return ra - rb;
                        return a.i - b.i;
                    })
                    .map((x) => x.r);
                ordered.forEach((raw) => {
                    const p = enrichPublication(raw);
                    const title = escapeHTML(p.title || '');
                    const meta = [p.authors, p.venue, p.year].filter(Boolean).map(escapeHTML).join(' · ');
                    const status = p._statusHtml || '';
                    const abs = p.abstract ? `<p class="text-sm text-gray-600 mt-2 leading-relaxed">${escapeHTML(p.abstract)}</p>` : '';
                    const readLabel = escapeHTML(p._readLabel || 'Open link');
                    const link = p.link
                        ? `<a href="${escapeHTML(p.link)}" target="_blank" rel="noopener noreferrer" class="inline-block mt-3 retro-button px-4 py-2 text-xs uppercase tracking-widest">${readLabel}</a>`
                        : '';
                    container.insertAdjacentHTML('beforeend', `
                        <div class="retro-panel p-5 md:p-6 bg-white motion-safe">
                            <h3 class="text-lg font-black text-gray-900 leading-snug">${title}</h3>
                            ${meta ? `<p class="text-xs font-bold text-emerald-800 uppercase tracking-widest mt-2">${meta}</p>` : ''}
                            ${status}
                            ${abs}
                            ${link}
                        </div>
                    `);
                });
            } catch (_) {
                container.innerHTML = '<p class="text-sm text-red-600 font-bold">Could not load publications. Please try again later.</p>';
            }
        },

        async loadMomentsFeed(container, opts) {
            if (!container) return;
            container.innerHTML = '<p class="text-sm text-gray-500 font-bold animate-pulse">Loading moments…</p>';
            try {
                let rows = await fetchJson(`${API_BASE}/public/blog`);
                rows = (Array.isArray(rows) ? rows : []).sort((a, b) => {
                    const ay = Number(a && a.displayYear ? a.displayYear : 0);
                    const by = Number(b && b.displayYear ? b.displayYear : 0);
                    if (ay !== by) return by - ay;
                    const am = Number(a && a.displayMonth ? a.displayMonth : 0);
                    const bm = Number(b && b.displayMonth ? b.displayMonth : 0);
                    if (am !== bm) return bm - am;
                    const ad = Number(a && a.displayDay ? a.displayDay : 0);
                    const bd = Number(b && b.displayDay ? b.displayDay : 0);
                    if (ad !== bd) return bd - ad;
                    const at = new Date(a && (a.createdAt || a.timestamp) ? (a.createdAt || a.timestamp) : 0).getTime();
                    const bt = new Date(b && (b.createdAt || b.timestamp) ? (b.createdAt || b.timestamp) : 0).getTime();
                    return bt - at;
                });
                const limit = opts && opts.limit ? Number(opts.limit) : 0;
                if (limit > 0) rows = rows.slice(0, limit);
                container.innerHTML = '';
                if (!rows || !rows.length) {
                    container.innerHTML = '<p class="text-sm text-gray-500 font-bold">No moments yet.</p>';
                    return;
                }
                rows.forEach((post) => {
                    container.insertAdjacentHTML('beforeend', buildMomentArticle(post, opts));
                });
            } catch (_) {
                container.innerHTML = '<p class="text-sm text-red-600 font-bold">Could not load moments. Please try again later.</p>';
            }
        }
    };
})();
