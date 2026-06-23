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

    function folderPageUrl(id) {
        if (!id) return 'stash.html';
        return `stash.html?folder=${encodeURIComponent(String(id))}`;
    }

    function absoluteFolderPageUrl(id) {
        try {
            return new URL(folderPageUrl(id), window.location.href).href;
        } catch (_) {
            return folderPageUrl(id);
        }
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

    // Only allow http(s) link targets (blocks javascript: and other schemes).
    function safeHttpUrl(u) {
        const t = String(u || '').trim();
        return /^https?:\/\//i.test(t) ? t : '';
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
            const safeRaw = safeHttpUrl(raw);
            if (!safeRaw) return '';
            return `<p class="text-sm mt-3"><a href="${escapeHTML(safeRaw)}" target="_blank" rel="noopener noreferrer" class="underline font-bold text-emerald-800">Open video link</a></p>`;
        }
        return `<div class="stash-video-wrap"><iframe src="${escapeHTML(embed)}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }

    function apiBase() {
        return (window.SAM_API_CONFIG && window.SAM_API_CONFIG.apiBase) || 'https://sam-api-backend.onrender.com/api';
    }

    function stashMediaStreamUrl(item) {
        const id = String(item.mediaGridId || '').trim();
        if (!id) return '';
        return `${apiBase()}/public/stash/media/${encodeURIComponent(id)}`;
    }

    function isUploadedVideo(media) {
        return /^data:video\//i.test(String(media || '').trim());
    }

    function isUploadedPdf(media) {
        return /^data:application\/pdf/i.test(String(media || '').trim());
    }

    function itemHasUploadedVideo(item) {
        if (isUploadedVideo(item.mediaData)) return true;
        if (!item.mediaGridId) return false;
        const mime = String(item.mediaMime || '').toLowerCase();
        return mime.startsWith('video/') || String(item.kind || '') === 'video';
    }

    function itemHasUploadedPdf(item) {
        if (isUploadedPdf(item.mediaData)) return true;
        if (!item.mediaGridId) return false;
        const mime = String(item.mediaMime || '').toLowerCase();
        return mime.includes('pdf') || item.kind === 'article' || item.kind === 'note';
    }

    function stashMediaSrc(item) {
        const stream = stashMediaStreamUrl(item);
        if (stream) return stream;
        return mediaSrcForAttr(item.mediaData);
    }

    function mediaSrcForAttr(u) {
        if (!u || typeof u !== 'string') return '';
        const t = u.trim();
        if (/^data:(video|application)\//i.test(t)) return t.replace(/"/g, '%22');
        return '';
    }

    function videoPlayerHtml(item) {
        const link = String(item.link || '').trim();
        if (itemHasUploadedVideo(item)) {
            const src = escapeHTML(stashMediaSrc(item));
            if (src) {
                return `<div class="stash-video-wrap stash-video-wrap--native"><video class="stash-video-native" controls playsinline preload="metadata" src="${src}"></video></div>`;
            }
        }
        return videoEmbedHtml(link);
    }

    function pdfViewerHtml(item) {
        if (!itemHasUploadedPdf(item)) return '';
        const src = escapeHTML(stashMediaSrc(item));
        if (!src) return '';
        const name = escapeHTML(item.mediaName || 'Document.pdf');
        return `
            <div class="stash-pdf-wrap mt-4">
                <p class="text-xs font-bold text-gray-600 mb-2 uppercase tracking-widest">${name}</p>
                <iframe class="stash-pdf-frame" src="${src}" title="${name}"></iframe>
                <a href="${src}" download="${name}" class="retro-button inline-block mt-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest">Download PDF</a>
            </div>`;
    }

    function folderCoverZoomHtml(cover, wrapClass) {
        if (!cover) return '';
        const safeSrc = escapeHTML(cover);
        const cls = wrapClass ? ` ${wrapClass}` : '';
        return `<button type="button" class="stash-folder-cover-zoom${cls}" data-cover-src="${safeSrc}" aria-label="View cover image">
            <img src="${safeSrc}" alt="" class="w-full h-full object-cover" loading="lazy" decoding="async">
            <span class="stash-folder-cover-zoom-hint" aria-hidden="true">View</span>
        </button>`;
    }

    function buildFolderCard(folder, stats) {
        const name = escapeHTML((folder.name || '').trim() || 'Folder');
        const bodyExcerpt = escapeHTML(excerpt(folder.body, 100)).replace(/\n/g, ' ');
        const href = escapeHTML(folderPageUrl(folder.id));
        const cover = imgSrcForAttr(folder.coverImage);
        const subCount = stats && stats.subfolders != null ? Number(stats.subfolders) : 0;
        const itemCount = stats && stats.items != null ? Number(stats.items) : 0;
        const meta = [];
        if (subCount) meta.push(`${subCount} folder${subCount === 1 ? '' : 's'}`);
        if (itemCount) meta.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
        const metaText = meta.length ? escapeHTML(meta.join(' · ')) : '';

        const coverHtml = cover
            ? `<div class="stash-folder-card-cover border-b-2 border-gray-900 aspect-[16/10] overflow-hidden bg-gray-100">
                <img src="${cover}" alt="" class="w-full h-full object-cover" loading="lazy" decoding="async">
               </div>`
            : `<div class="stash-folder-card-cover stash-folder-card-cover--empty border-b-2 border-gray-900 aspect-[16/10] flex items-center justify-center bg-emerald-50">
                <span class="text-3xl font-black text-emerald-900/30 uppercase tracking-widest" aria-hidden="true">Dir</span>
               </div>`;

        return `
            <a href="${href}" class="stash-folder-card-link group">
                <article class="stash-folder-card retro-panel bg-white h-full overflow-hidden">
                    ${coverHtml}
                    <div class="p-4 md:p-5">
                        <h2 class="stash-folder-card-title">${name}</h2>
                        ${bodyExcerpt ? `<p class="text-sm text-gray-600 mt-2 line-clamp-2">${bodyExcerpt}</p>` : ''}
                        ${metaText ? `<p class="text-[11px] font-bold text-gray-400 mt-3 uppercase tracking-wide">${metaText}</p>` : ''}
                        <span class="stash-folder-open-hint">Open folder →</span>
                    </div>
                </article>
            </a>`;
    }

    function buildFolderHeader(folder) {
        const name = escapeHTML((folder.name || '').trim() || 'Folder');
        const body = escapeHTML(folder.body || '').replace(/\n/g, '<br>');
        const cover = imgSrcForAttr(folder.coverImage);
        const coverHtml = cover
            ? folderCoverZoomHtml(cover, 'stash-folder-header-cover border-2 border-gray-900 overflow-hidden bg-gray-100 flex-shrink-0 w-full sm:w-40 md:w-48 aspect-[4/3] sm:aspect-square')
            : '';
        return `
            <header class="stash-folder-header retro-panel p-5 md:p-6 bg-white mb-8">
                <div class="flex flex-col sm:flex-row gap-5 md:gap-6">
                    ${coverHtml}
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500 mb-2">Folder</p>
                        <h1 class="text-2xl md:text-3xl font-black text-gray-950 tracking-tight leading-tight">${name}</h1>
                        ${body ? `<div class="text-sm text-gray-700 mt-3 leading-relaxed body-readable">${body}</div>` : ''}
                    </div>
                </div>
            </header>`;
    }

    function buildBreadcrumb(folders, currentFolderId) {
        const byId = new Map((folders || []).map((f) => [String(f.id), f]));
        const crumbs = [];
        let cursor = currentFolderId ? String(currentFolderId) : '';
        const guard = new Set();
        while (cursor && byId.has(cursor) && !guard.has(cursor)) {
            guard.add(cursor);
            const f = byId.get(cursor);
            crumbs.unshift({ id: f.id, name: (f.name || '').trim() || 'Folder' });
            cursor = String(f.parentId || '');
        }
        const parts = [`<a href="stash.html" class="stash-crumb-link">Shelf</a>`];
        crumbs.forEach((c, i) => {
            const isLast = i === crumbs.length - 1;
            const label = escapeHTML(c.name);
            if (isLast) {
                parts.push(`<span class="stash-crumb-current" aria-current="page">${label}</span>`);
            } else {
                parts.push(`<a href="${escapeHTML(folderPageUrl(c.id))}" class="stash-crumb-link">${label}</a>`);
            }
        });
        return `<nav class="stash-breadcrumb mb-6" aria-label="Folder path">${parts.join('<span class="stash-crumb-sep" aria-hidden="true">/</span>')}</nav>`;
    }

    function folderStatsMap(folders, items) {
        const stats = new Map();
        (folders || []).forEach((f) => {
            const pid = String(f.parentId || '');
            if (!stats.has(pid)) stats.set(pid, { subfolders: 0, items: 0 });
            stats.get(pid).subfolders += 1;
        });
        (items || []).forEach((it) => {
            const fid = String(it.folderId || '');
            if (!stats.has(fid)) stats.set(fid, { subfolders: 0, items: 0 });
            stats.get(fid).items += 1;
        });
        return stats;
    }

    async function fetchStashFolders() {
        return fetchJson(`${API_BASE}/public/stash/folders`);
    }

    async function fetchStashFolder(id) {
        if (!id) return null;
        try {
            return await fetchJson(`${API_BASE}/public/stash/folders/${encodeURIComponent(id)}`);
        } catch (_) {
            const rows = await fetchStashFolders();
            return (Array.isArray(rows) ? rows : []).find((r) => String(r.id) === String(id)) || null;
        }
    }

    function sortFolders(rows) {
        return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
            const ao = Number(a && a.sortOrder != null ? a.sortOrder : 0);
            const bo = Number(b && b.sortOrder != null ? b.sortOrder : 0);
            if (ao !== bo) return ao - bo;
            const an = String(a && a.name ? a.name : '').toLowerCase();
            const bn = String(b && b.name ? b.name : '').toLowerCase();
            if (an !== bn) return an.localeCompare(bn);
            const at = new Date(a && a.timestamp ? a.timestamp : 0).getTime();
            const bt = new Date(b && b.timestamp ? b.timestamp : 0).getTime();
            return bt - at;
        });
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
            preview = itemHasUploadedVideo(item)
                ? `<p class="text-xs font-bold text-pink-900/80 mt-3 uppercase tracking-widest">▶ Uploaded video — open to play</p>`
                : `<p class="text-xs font-bold text-pink-900/80 mt-3 uppercase tracking-widest">▶ Video — open to play</p>`;
        } else if ((kind === 'article' || kind === 'note') && itemHasUploadedPdf(item)) {
            preview = `<p class="text-xs font-bold text-indigo-900/80 mt-3 uppercase tracking-widest">📄 PDF attached</p>`;
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
        const link = safeHttpUrl(item.link);
        const badge = `<span class="stash-kind-badge stash-kind-badge--${escapeHTML(kind)}">${escapeHTML(label)}</span>`;

        let media = '';
        if (kind === 'photo') {
            media = photoGrid(item.images, 'stash-detail-thumb');
        } else if (kind === 'video') {
            media = videoPlayerHtml(item);
        } else if (kind === 'article' || kind === 'note') {
            media = pdfViewerHtml(item);
        }

        let linkBlock = '';
        if (kind === 'article' && link) {
            linkBlock = `<p class="mt-6"><a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="retro-button inline-block px-5 py-2.5 text-[10px] font-black uppercase tracking-widest">Open original article</a></p>`;
        } else if (link && kind !== 'video' && !itemHasUploadedPdf(item)) {
            linkBlock = `<p class="mt-4 text-sm"><a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="font-bold text-emerald-800 underline break-all">${escapeHTML(link)}</a></p>`;
        } else if (kind === 'video' && link && !itemHasUploadedVideo(item)) {
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
        folderPageUrl,
        absoluteItemPageUrl,
        absoluteFolderPageUrl,
        buildStashListCard,
        buildStashDetail,
        buildFolderCard,
        buildFolderHeader,
        buildBreadcrumb,
        sortStashRows,
        sortFolders,
        fetchStashItem,
        fetchStashFolder,
        fetchStashFolders,
        wireFolderCoverLightbox(root, opts) {
            const options = opts || {};
            const lightbox = options.lightboxEl || document.getElementById('stash-lightbox');
            const lightboxImg = options.lightboxImgEl || document.getElementById('stash-lightbox-img');
            const closeBtn = options.closeBtnEl || document.getElementById('stash-lightbox-close');
            const mount = root || document;
            if (!mount || !lightbox || !lightboxImg) return;

            const closeLightbox = () => {
                lightbox.classList.add('hidden');
                lightbox.classList.remove('flex');
                lightbox.setAttribute('aria-hidden', 'true');
                lightboxImg.src = '';
            };

            if (!mount.dataset.stashCoverLightboxWired) {
                mount.dataset.stashCoverLightboxWired = '1';
                mount.addEventListener('click', (e) => {
                    const btn = e.target.closest('.stash-folder-cover-zoom');
                    if (!btn) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const src = btn.getAttribute('data-cover-src') || (btn.querySelector('img') && btn.querySelector('img').getAttribute('src')) || '';
                    if (!src) return;
                    lightboxImg.src = src;
                    lightboxImg.alt = 'Folder cover';
                    lightbox.classList.remove('hidden');
                    lightbox.classList.add('flex');
                    lightbox.setAttribute('aria-hidden', 'false');
                });
            }

            if (closeBtn && !closeBtn.dataset.stashCoverLightboxCloseWired) {
                closeBtn.dataset.stashCoverLightboxCloseWired = '1';
                closeBtn.addEventListener('click', closeLightbox);
            }
            if (lightbox && !lightbox.dataset.stashCoverLightboxBackdropWired) {
                lightbox.dataset.stashCoverLightboxBackdropWired = '1';
                lightbox.addEventListener('click', (e) => {
                    if (e.target === lightbox) closeLightbox();
                });
            }
            if (!document.body.dataset.stashCoverLightboxEscWired) {
                document.body.dataset.stashCoverLightboxEscWired = '1';
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && lightbox && !lightbox.classList.contains('hidden')) closeLightbox();
                });
            }
        },
        async loadBrowse(opts) {
            const options = opts || {};
            const folderId = options.folderId ? String(options.folderId) : '';
            const filterKind = options.filterKind || 'all';
            const breadcrumbEl = options.breadcrumbEl || null;
            const headerEl = options.headerEl || null;
            const folderGridEl = options.folderGridEl || null;
            const feedEl = options.feedEl || null;

            const setLoading = () => {
                const msg = '<p class="text-sm text-gray-500 font-bold animate-pulse">Loading…</p>';
                if (folderGridEl) folderGridEl.innerHTML = '';
                if (feedEl) feedEl.innerHTML = msg;
            };
            setLoading();

            try {
                const [foldersRaw, itemsRaw] = await Promise.all([
                    fetchStashFolders(),
                    fetchJson(`${API_BASE}/public/stash`)
                ]);
                const folders = sortFolders(foldersRaw);
                const items = sortStashRows(itemsRaw);
                const stats = folderStatsMap(folders, items);
                const parentKey = folderId;

                if (breadcrumbEl) {
                    breadcrumbEl.innerHTML = folderId ? buildBreadcrumb(folders, folderId) : '';
                }

                let currentFolder = null;
                if (folderId) {
                    currentFolder = folders.find((f) => String(f.id) === folderId) || await fetchStashFolder(folderId);
                }
                if (headerEl) {
                    headerEl.innerHTML = currentFolder ? buildFolderHeader(currentFolder) : '';
                }
                if (options.setDocumentTitle !== false && currentFolder) {
                    const title = (currentFolder.name && String(currentFolder.name).trim()) || 'Folder';
                    document.title = `${title} | Loose shelf`;
                } else if (options.setDocumentTitle !== false && !folderId) {
                    document.title = 'Archive | Yihang Wu';
                }

                const childFolders = folders.filter((f) => String(f.parentId || '') === parentKey);
                let childItems = items.filter((it) => String(it.folderId || '') === parentKey);
                if (filterKind && filterKind !== 'all') {
                    childItems = childItems.filter((r) => String(r.kind) === filterKind);
                }

                if (folderGridEl) {
                    folderGridEl.innerHTML = '';
                    if (childFolders.length) {
                        folderGridEl.classList.remove('hidden');
                        childFolders.forEach((folder) => {
                            const folderStats = stats.get(String(folder.id)) || { subfolders: 0, items: 0 };
                            folderGridEl.insertAdjacentHTML('beforeend', buildFolderCard(folder, folderStats));
                        });
                    } else {
                        folderGridEl.classList.add('hidden');
                    }
                }

                if (feedEl) {
                    feedEl.innerHTML = '';
                    if (!childFolders.length && !childItems.length) {
                        feedEl.innerHTML = '<p class="text-sm text-gray-500 font-bold">Nothing in this folder yet.</p>';
                    } else if (!childItems.length) {
                        feedEl.innerHTML = '<p class="text-sm text-gray-500 font-bold">No items here — open a subfolder or change the filter.</p>';
                    } else {
                        childItems.forEach((row) => {
                            feedEl.insertAdjacentHTML('beforeend', buildStashListCard(row));
                        });
                    }
                }

                return { folders, items, currentFolder, childFolders, childItems };
            } catch (_) {
                if (feedEl) {
                    feedEl.innerHTML = '<p class="text-sm text-red-600 font-bold">Could not load archive. Try again later.</p>';
                }
                return null;
            }
        },
        async loadFeed(container, filterKind, folderId) {
            return this.loadBrowse({
                feedEl: container,
                filterKind,
                folderId: folderId || '',
                setDocumentTitle: false
            });
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
