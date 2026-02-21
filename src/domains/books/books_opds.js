// Tankoban Max - Books OPDS catalog browser
// Extracted from library.js (Phase 3, Session 8)
(function booksOpdsDomain() {
  'use strict';

  if (window.__tankoBooksOpdsBound) return;
  window.__tankoBooksOpdsBound = true;

  var B = window.__tankoBooksLibShared;
  if (!B) return;

  var api = B.api;
  var el = B.el;
  var toast = B.toast;
  var showCtx = B.showCtx;

  // ---- OPDS browser in Books sidebar ----
  var _booksOpdsFeeds = [];
  var _booksOpdsUi = {
    inited: false,
    open: false,
    loading: false,
    stack: [],
    current: null,
    selectedFeedId: null,
  };

  function _opdsEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _opdsAbs(base, href) {
    try { return new URL(String(href || ''), String(base || '')).toString(); } catch (e) { return ''; }
  }

  function _opdsHost(u) {
    try { return new URL(String(u || '')).host; } catch (e) { return ''; }
  }

  function _opdsEl(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function _opdsGetUi() {
    return {
      section: document.getElementById('booksOpdsSection'),
      list: document.getElementById('booksOpdsFeedsList'),
      header: document.getElementById('booksOpdsHeader'),
      items: document.getElementById('booksOpdsItems'),
      addBtn: document.getElementById('booksAddOpdsBtn'),
      overlay: document.getElementById('booksOpdsOverlay'),
      title: document.getElementById('booksOpdsTitle'),
      subtitle: document.getElementById('booksOpdsSubtitle'),
      breadcrumb: document.getElementById('booksOpdsBreadcrumb'),
      body: document.getElementById('booksOpdsBody'),
      closeBtn: document.getElementById('booksOpdsClose'),
      backBtn: document.getElementById('booksOpdsBack'),
      refreshBtn: document.getElementById('booksOpdsRefresh'),
      addFeedBtnOverlay: document.getElementById('booksOpdsAddFeedTop'),
    };
  }


  function ensureBooksOpdsUi() {
    if (_booksOpdsUi.inited) return _opdsGetUi();
    _booksOpdsUi.inited = true;

    if (!document.getElementById('booksOpdsInlineStyle')) {
      var style = document.createElement('style');
      style.id = 'booksOpdsInlineStyle';
      style.textContent = ''
        + '.booksOpdsOverlay{position:fixed;inset:0;background:rgba(0,0,0,.66);z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px;}'
        + '.booksOpdsOverlay.hidden{display:none;}'
        + '.booksOpdsPanel{width:min(1100px,96vw);height:min(86vh,860px);background:#141414;border:1px solid rgba(255,255,255,.1);border-radius:14px;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden;}'
        + '.booksOpdsHeaderRow{display:flex;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);}'
        + '.booksOpdsHeaderRow button{border:1px solid rgba(255,255,255,.12);background:#202020;color:#ddd;border-radius:9px;padding:6px 10px;cursor:pointer;}'
        + '.booksOpdsHeaderRow button:hover{background:#2a2a2a;}'
        + '.booksOpdsTitleWrap{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;}'
        + '.booksOpdsTitleText{font-weight:700;color:#f4f4f4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.booksOpdsSubtitleText{font-size:12px;color:#a8a8a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.booksOpdsCrumb{padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;color:#bbb;display:flex;gap:6px;align-items:center;overflow:auto hidden;white-space:nowrap;}'
        + '.booksOpdsCrumb button{background:none;border:none;color:#cfd7ff;cursor:pointer;padding:0;font:inherit;}'
        + '.booksOpdsBody{padding:12px 14px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;align-content:start;}'
        + '.booksOpdsState{grid-column:1/-1;padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#c7c7c7;background:rgba(255,255,255,.02);}'
        + '.booksOpdsCard{display:grid;grid-template-columns:72px 1fr;gap:10px;background:#1b1b1b;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;min-height:120px;}'
        + '.booksOpdsCover{width:72px;height:100px;border-radius:8px;background:#252525;object-fit:cover;border:1px solid rgba(255,255,255,.06);}'
        + '.booksOpdsMeta{min-width:0;display:flex;flex-direction:column;gap:5px;}'
        + '.booksOpdsItemTitle{color:#f3f3f3;font-weight:600;line-height:1.25;max-height:3.1em;overflow:hidden;}'
        + '.booksOpdsItemBy{color:#b5b5b5;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.booksOpdsItemInfo{color:#9f9f9f;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.booksOpdsItemDesc{color:#c7c7c7;font-size:12px;line-height:1.35;max-height:3.9em;overflow:hidden;}'
        + '.booksOpdsBtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;}'
        + '.booksOpdsBtns button{border:1px solid rgba(255,255,255,.12);background:#252525;color:#e4e4e4;border-radius:8px;padding:5px 8px;cursor:pointer;font-size:12px;}'
        + '.booksOpdsBtns button:hover{background:#313131;}'
        + '.booksOpdsBtns button.primary{background:#2c3f79;border-color:#3f5dc5;color:#eef2ff;}'
        + '.booksOpdsBtns button.primary:hover{background:#365097;}'
        + '.booksOpdsFeedRow{display:flex;align-items:center;gap:8px;width:100%;}'
        + '.booksOpdsFeedMeta{min-width:0;display:flex;flex-direction:column;align-items:flex-start;}'
        + '.booksOpdsFeedMeta small{color:#9fa4ad;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;display:block;}'
        + '.booksOpdsRowActions{display:flex;gap:6px;margin-left:auto;}'
        + '.booksOpdsRowActions button{border:1px solid rgba(255,255,255,.1);background:#222;color:#ddd;border-radius:7px;padding:3px 6px;cursor:pointer;font-size:11px;}'
        + '.booksOpdsRowActions button:hover{background:#2d2d2d;}'
        + '.booksOpdsChip{display:inline-block;padding:2px 6px;border-radius:999px;background:#252525;border:1px solid rgba(255,255,255,.08);font-size:11px;color:#cfcfcf;}'
        + '@media (max-width:740px){.booksOpdsBody{grid-template-columns:1fr;}.booksOpdsPanel{height:92vh;}.booksOpdsCard{grid-template-columns:64px 1fr;}.booksOpdsCover{width:64px;height:90px;}}';
      document.head.appendChild(style);
    }

    var downloadsSection = (el.booksDownloadsHeader && el.booksDownloadsHeader.closest) ? el.booksDownloadsHeader.closest('.sidebarSection') : null;
    var hostParent = downloadsSection && downloadsSection.parentElement ? downloadsSection.parentElement : (el.booksSourcesHeader && el.booksSourcesHeader.parentElement ? el.booksSourcesHeader.parentElement.parentElement : null);
    if (hostParent && !document.getElementById('booksOpdsSection')) {
      var section = _opdsEl('div', 'sidebarSection');
      section.id = 'booksOpdsSection';
      section.innerHTML = ''
        + '<button type="button" id="booksOpdsHeader" class="sidebarSectionHeader">\u25BE OPDS</button>'
        + '<div id="booksOpdsItems" class="sidebarSectionItems">'
        + '  <div style="display:flex; gap:8px; margin-bottom:8px;">'
        + '    <button type="button" id="booksAddOpdsBtn" class="iconBtn" title="Add OPDS feed">+</button>'
        + '  </div>'
        + '  <div id="booksOpdsFeedsList" class="folderList"></div>'
        + '  <div id="booksOpdsFeedsEmpty" class="smallMuted" style="padding:8px 4px;">No OPDS feeds yet</div>'
        + '</div>';
      if (downloadsSection) hostParent.insertBefore(section, downloadsSection);
      else hostParent.appendChild(section);
    }

    if (!document.getElementById('booksOpdsOverlay')) {
      var overlay = _opdsEl('div', 'booksOpdsOverlay hidden');
      overlay.id = 'booksOpdsOverlay';
      overlay.innerHTML = ''
        + '<div class="booksOpdsPanel" role="dialog" aria-modal="true" aria-label="OPDS catalog">'
        + '  <div class="booksOpdsHeaderRow">'
        + '    <button type="button" id="booksOpdsBack" title="Back">\u2190</button>'
        + '    <div class="booksOpdsTitleWrap">'
        + '      <div id="booksOpdsTitle" class="booksOpdsTitleText">OPDS Catalog</div>'
        + '      <div id="booksOpdsSubtitle" class="booksOpdsSubtitleText"></div>'
        + '    </div>'
        + '    <button type="button" id="booksOpdsRefresh" title="Refresh">Refresh</button>'
        + '    <button type="button" id="booksOpdsAddFeedTop" title="Add feed">Add Feed</button>'
        + '    <button type="button" id="booksOpdsClose" title="Close">\u2715</button>'
        + '  </div>'
        + '  <div id="booksOpdsBreadcrumb" class="booksOpdsCrumb"></div>'
        + '  <div id="booksOpdsBody" class="booksOpdsBody"></div>'
        + '</div>';
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeBooksOpdsOverlay();
      });
      document.body.appendChild(overlay);
    }

    var ui = _opdsGetUi();
    if (ui.header && ui.items && !ui.header.__opdsBound) {
      ui.header.__opdsBound = true;
      ui.header.addEventListener('click', function () {
        var hidden = ui.items.classList.toggle('hidden');
        ui.header.textContent = (hidden ? '\u25B8 ' : '\u25BE ') + 'OPDS';
      });
    }
    if (ui.addBtn && !ui.addBtn.__opdsBound) {
      ui.addBtn.__opdsBound = true;
      ui.addBtn.addEventListener('click', function () { addOpdsFeedPrompt(); });
    }
    if (ui.closeBtn && !ui.closeBtn.__opdsBound) {
      ui.closeBtn.__opdsBound = true;
      ui.closeBtn.addEventListener('click', function () { closeBooksOpdsOverlay(); });
    }
    if (ui.backBtn && !ui.backBtn.__opdsBound) {
      ui.backBtn.__opdsBound = true;
      ui.backBtn.addEventListener('click', function () { booksOpdsBack(); });
    }
    if (ui.refreshBtn && !ui.refreshBtn.__opdsBound) {
      ui.refreshBtn.__opdsBound = true;
      ui.refreshBtn.addEventListener('click', function () {
        if (_booksOpdsUi.current && _booksOpdsUi.current.url) openBooksOpdsUrl(_booksOpdsUi.current.url, { replace: true });
      });
    }
    if (ui.addFeedBtnOverlay && !ui.addFeedBtnOverlay.__opdsBound) {
      ui.addFeedBtnOverlay.__opdsBound = true;
      ui.addFeedBtnOverlay.addEventListener('click', function () { addOpdsFeedPrompt(); });
    }
    if (ui.body && !ui.body.__opdsBound) {
      ui.body.__opdsBound = true;
      ui.body.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button[data-opds-action]') : null;
        if (!btn) return;
        var action = String(btn.getAttribute('data-opds-action') || '');
        var href = String(btn.getAttribute('data-href') || '');
        var title = String(btn.getAttribute('data-title') || '');
        var type = String(btn.getAttribute('data-type') || '');
        if (action === 'nav' && href) {
          openBooksOpdsUrl(href, { titleHint: title });
        } else if (action === 'download' && href) {
          downloadOpdsAcquisition({ href: href, title: title, type: type });
        } else if (action === 'open-ext' && href) {
          if (api.shell && api.shell.openExternal) api.shell.openExternal(href).catch(function () {});
          else window.open(href, '_blank');
        }
      });
    }
    document.addEventListener('keydown', function (e) {
      var ui2 = _opdsGetUi();
      if (!ui2.overlay || ui2.overlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeBooksOpdsOverlay();
      }
    }, true);

    return ui;
  }

  function opdsXmlChildrenByLocal(node, localName) {
    var out = [];
    if (!node || !node.childNodes) return out;
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (!c || c.nodeType !== 1) continue;
      var n = String((c.localName || c.nodeName || '')).toLowerCase();
      if (n === String(localName || '').toLowerCase()) out.push(c);
    }
    return out;
  }

  function opdsXmlFirstDesc(node, names) {
    var want = Array.isArray(names) ? names.map(function (x) { return String(x).toLowerCase(); }) : [String(names || '').toLowerCase()];
    var all = node && node.getElementsByTagName ? node.getElementsByTagName('*') : [];
    for (var i = 0; i < all.length; i++) {
      var eln = all[i];
      var n = String((eln.localName || eln.nodeName || '')).toLowerCase();
      if (want.indexOf(n) !== -1) return eln;
    }
    return null;
  }

  function opdsXmlText(node) {
    if (!node) return '';
    return String(node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function opdsXmlChildText(node, names) {
    var want = Array.isArray(names) ? names : [names];
    for (var i = 0; i < want.length; i++) {
      var cs = opdsXmlChildrenByLocal(node, want[i]);
      if (cs.length) {
        var t = opdsXmlText(cs[0]);
        if (t) return t;
      }
    }
    return '';
  }

  function opdsLinkKind(link) {
    var rel = String(link && link.rel || '').toLowerCase();
    var type = String(link && link.type || '').toLowerCase();
    if (rel.indexOf('image') !== -1 || rel.indexOf('thumbnail') !== -1) return 'image';
    if (rel.indexOf('acquisition') !== -1) return 'acquisition';
    if (type.indexOf('application/epub+zip') !== -1 || type.indexOf('application/pdf') !== -1 || type.indexOf('comic') !== -1) return 'acquisition';
    if (type.indexOf('atom+xml') !== -1 || type.indexOf('opds+json') !== -1) return 'navigation';
    if (rel.indexOf('subsection') !== -1 || rel.indexOf('collection') !== -1 || rel === 'start' || rel === 'up' || rel === 'contents') return 'navigation';
    if (type.indexOf('html') !== -1) return 'html';
    return '';
  }

  function parseOpdsAtom(xmlText, baseUrl) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(xmlText || ''), 'application/xml');
    var pe = doc.getElementsByTagName('parsererror');
    if (pe && pe.length) throw new Error('Invalid OPDS XML');

    var feedNode = opdsXmlFirstDesc(doc, ['feed']) || doc.documentElement;
    var title = opdsXmlChildText(feedNode, ['title']) || 'OPDS';
    var subtitle = opdsXmlChildText(feedNode, ['subtitle']) || opdsXmlChildText(feedNode, ['tagline']);

    var entries = [];
    var all = doc.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var n = String((all[i].localName || all[i].nodeName || '')).toLowerCase();
      if (n === 'entry') entries.push(all[i]);
    }

    var items = [];
    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      var linksRaw = opdsXmlChildrenByLocal(entry, 'link');
      var links = linksRaw.map(function (ln) {
        return {
          href: _opdsAbs(baseUrl, ln.getAttribute('href') || ''),
          rel: String(ln.getAttribute('rel') || ''),
          type: String(ln.getAttribute('type') || ''),
          title: String(ln.getAttribute('title') || ''),
        };
      }).filter(function (x) { return !!x.href; });

      var authors = [];
      var authorNodes = opdsXmlChildrenByLocal(entry, 'author');
      for (var a = 0; a < authorNodes.length; a++) {
        var nm = opdsXmlChildText(authorNodes[a], ['name']);
        if (nm) authors.push(nm);
      }

      var summary = opdsXmlChildText(entry, ['summary']) || opdsXmlChildText(entry, ['content']) || opdsXmlChildText(entry, ['description']);
      var itemTitle = opdsXmlChildText(entry, ['title']) || 'Untitled';
      var id = opdsXmlChildText(entry, ['id']) || ('entry_' + j + '_' + itemTitle);
      var updated = opdsXmlChildText(entry, ['updated', 'published']);
      var lang = opdsXmlChildText(entry, ['language']);

      var thumb = '';
      var cover = '';
      var navLinks = [];
      var acqLinks = [];
      var htmlLinks = [];
      for (var l = 0; l < links.length; l++) {
        var kind = opdsLinkKind(links[l]);
        if (kind === 'image') {
          if (!thumb) thumb = links[l].href;
          if (String(links[l].rel || '').toLowerCase().indexOf('thumbnail') === -1) cover = cover || links[l].href;
          continue;
        }
        if (kind === 'acquisition') { acqLinks.push(links[l]); continue; }
        if (kind === 'navigation') { navLinks.push(links[l]); continue; }
        if (kind === 'html') { htmlLinks.push(links[l]); continue; }
      }
      if (!cover) cover = thumb;

      var kind = 'publication';
      if (!acqLinks.length && navLinks.length) kind = 'navigation';
      if (!acqLinks.length && !navLinks.length && htmlLinks.length) kind = 'external';
      if (!acqLinks.length && !navLinks.length && !htmlLinks.length) kind = 'unknown';

      items.push({
        id: id,
        kind: kind,
        title: itemTitle,
        authors: authors,
        summary: summary,
        published: updated,
        language: lang,
        cover: cover,
        thumbnail: thumb,
        links: links,
        navigationLinks: navLinks,
        acquisitionLinks: acqLinks,
        externalLinks: htmlLinks,
      });
    }

    var feedNavLinks = [];
    var feedLinks = opdsXmlChildrenByLocal(feedNode, 'link');
    for (var f = 0; f < feedLinks.length; f++) {
      var h = _opdsAbs(baseUrl, feedLinks[f].getAttribute('href') || '');
      if (!h) continue;
      var rec = { href: h, rel: String(feedLinks[f].getAttribute('rel') || ''), type: String(feedLinks[f].getAttribute('type') || ''), title: String(feedLinks[f].getAttribute('title') || '') };
      if (opdsLinkKind(rec) === 'navigation') feedNavLinks.push(rec);
    }

    return { type: 'atom', title: title, subtitle: subtitle, items: items, feedLinks: feedNavLinks };
  }

  function parseOpdsJson(jsonText, baseUrl) {
    var data = JSON.parse(String(jsonText || '{}'));
    var md = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
    var title = String(md.title || data.title || 'OPDS');
    var subtitle = String(md.subtitle || md.description || '');

    function normLinks(arr) {
      if (!Array.isArray(arr)) return [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var x = arr[i] || {};
        var href = _opdsAbs(baseUrl, x.href || '');
        if (!href) continue;
        out.push({ href: href, rel: Array.isArray(x.rel) ? x.rel.join(' ') : String(x.rel || ''), type: String(x.type || ''), title: String(x.title || '') });
      }
      return out;
    }

    function parsePub(p, idx) {
      p = p || {};
      var pmd = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
      var authors = [];
      var contrib = Array.isArray(pmd.author) ? pmd.author : (pmd.author ? [pmd.author] : []);
      for (var a = 0; a < contrib.length; a++) {
        var c = contrib[a];
        if (typeof c === 'string') authors.push(c);
        else if (c && c.name) authors.push(String(c.name));
      }
      var links = normLinks([].concat(Array.isArray(p.links) ? p.links : [], Array.isArray(p.images) ? p.images : []));
      var navLinks = [];
      var acqLinks = [];
      var htmlLinks = [];
      var cover = '';
      var thumb = '';
      for (var i = 0; i < links.length; i++) {
        var lk = links[i];
        var kind = opdsLinkKind(lk);
        if (kind === 'image') {
          if (!thumb) thumb = lk.href;
          if (String(lk.rel || '').toLowerCase().indexOf('thumbnail') === -1) cover = cover || lk.href;
        } else if (kind === 'acquisition') acqLinks.push(lk);
        else if (kind === 'navigation') navLinks.push(lk);
        else if (kind === 'html') htmlLinks.push(lk);
      }
      if (!cover) cover = thumb;
      return {
        id: String(pmd.identifier || ('pub_' + idx + '_' + (pmd.title || ''))),
        kind: acqLinks.length ? 'publication' : (navLinks.length ? 'navigation' : (htmlLinks.length ? 'external' : 'unknown')),
        title: String(pmd.title || 'Untitled'),
        authors: authors,
        summary: String(pmd.description || ''),
        published: String(pmd.published || ''),
        language: String(Array.isArray(pmd.language) ? (pmd.language[0] || '') : (pmd.language || '')),
        cover: cover,
        thumbnail: thumb,
        links: links,
        navigationLinks: navLinks,
        acquisitionLinks: acqLinks,
        externalLinks: htmlLinks,
      };
    }

    function parseNavItem(n, idx) {
      n = n || {};
      var links = normLinks(Array.isArray(n.links) ? n.links : [n]);
      var navLinks = [];
      var htmlLinks = [];
      var cover = '';
      var thumb = '';
      for (var i = 0; i < links.length; i++) {
        var kind = opdsLinkKind(links[i]);
        if (kind === 'navigation') navLinks.push(links[i]);
        else if (kind === 'html') htmlLinks.push(links[i]);
        else if (kind === 'image') { if (!thumb) thumb = links[i].href; if (!cover) cover = links[i].href; }
      }
      return {
        id: 'nav_' + idx + '_' + String(n.title || ''),
        kind: navLinks.length ? 'navigation' : (htmlLinks.length ? 'external' : 'unknown'),
        title: String(n.title || 'Untitled'),
        authors: [],
        summary: String(n.description || ''),
        published: '',
        language: '',
        cover: cover,
        thumbnail: thumb,
        links: links,
        navigationLinks: navLinks,
        acquisitionLinks: [],
        externalLinks: htmlLinks,
      };
    }

    var items = [];
    var pubs = Array.isArray(data.publications) ? data.publications : [];
    for (var i = 0; i < pubs.length; i++) items.push(parsePub(pubs[i], i));
    var nav = Array.isArray(data.navigation) ? data.navigation : [];
    for (var j = 0; j < nav.length; j++) items.push(parseNavItem(nav[j], j));
    var groups = Array.isArray(data.groups) ? data.groups : [];
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g] || {};
      var gp = Array.isArray(grp.publications) ? grp.publications : [];
      for (var p = 0; p < gp.length; p++) {
        var rec = parsePub(gp[p], g + '_' + p);
        if (grp.metadata && grp.metadata.title && !rec.summary) rec.summary = String(grp.metadata.title || '');
        items.push(rec);
      }
      var gn = Array.isArray(grp.navigation) ? grp.navigation : [];
      for (var n = 0; n < gn.length; n++) items.push(parseNavItem(gn[n], g + '_' + n));
    }

    return { type: 'json', title: title, subtitle: subtitle, items: items, feedLinks: normLinks(data.links) };
  }

  function parseOpdsHtml(htmlText, baseUrl) {
    var doc = new DOMParser().parseFromString(String(htmlText || ''), 'text/html');
    var title = (doc.querySelector('title') && doc.querySelector('title').textContent || 'Catalog').trim();
    var links = Array.from(doc.querySelectorAll('a[href]'));
    var items = [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = _opdsAbs(baseUrl, a.getAttribute('href') || '');
      if (!href) continue;
      var txt = String((a.textContent || '').trim() || href);
      if (txt.length > 180) txt = txt.slice(0, 180) + '\u2026';
      var img = a.querySelector('img');
      items.push({
        id: 'html_' + i,
        kind: 'navigation',
        title: txt,
        authors: [],
        summary: '',
        published: '',
        language: '',
        cover: img ? _opdsAbs(baseUrl, img.getAttribute('src') || '') : '',
        thumbnail: img ? _opdsAbs(baseUrl, img.getAttribute('src') || '') : '',
        links: [{ href: href, rel: 'alternate', type: 'text/html', title: txt }],
        navigationLinks: [{ href: href, rel: 'alternate', type: 'text/html', title: txt }],
        acquisitionLinks: [],
        externalLinks: [],
      });
      if (items.length >= 80) break;
    }
    return { type: 'html', title: title, subtitle: _opdsHost(baseUrl), items: items, feedLinks: [] };
  }

  function parseOpdsPayload(resp) {
    var body = String(resp && resp.body || '');
    var contentType = String(resp && resp.contentType || '').toLowerCase();
    var baseUrl = String(resp && resp.url || '');
    var trimmed = body.trim();
    if (!trimmed) throw new Error('Empty response');
    if (contentType.indexOf('json') !== -1 || trimmed[0] === '{') return parseOpdsJson(trimmed, baseUrl);
    if (contentType.indexOf('html') !== -1) return parseOpdsHtml(body, baseUrl);
    if (trimmed[0] === '<') {
      try { return parseOpdsAtom(body, baseUrl); }
      catch (e) {
        return parseOpdsHtml(body, baseUrl);
      }
    }
    throw new Error('Unsupported catalog format');
  }

  function opdsBestNavLink(item) {
    if (!item) return null;
    if (Array.isArray(item.navigationLinks) && item.navigationLinks.length) return item.navigationLinks[0];
    if (Array.isArray(item.externalLinks) && item.externalLinks.length) return item.externalLinks[0];
    if (Array.isArray(item.links)) {
      for (var i = 0; i < item.links.length; i++) if (item.links[i] && item.links[i].href) return item.links[i];
    }
    return null;
  }

  function opdsLabelForAcq(link) {
    var type = String(link && link.type || '').toLowerCase();
    if (type.indexOf('epub') !== -1) return 'EPUB';
    if (type.indexOf('pdf') !== -1) return 'PDF';
    if (type.indexOf('cbz') !== -1 || type.indexOf('comicbook') !== -1) return 'CBZ';
    if (type.indexOf('mobi') !== -1) return 'MOBI';
    if (type.indexOf('txt') !== -1) return 'TXT';
    return (link && link.title) ? String(link.title) : 'Download';
  }

  function opdsGuessFilename(title, mime) {
    var base = String(title || 'book').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!base) base = 'book';
    var lower = String(mime || '').toLowerCase();
    var ext = '';
    if (lower.indexOf('epub') !== -1) ext = '.epub';
    else if (lower.indexOf('pdf') !== -1) ext = '.pdf';
    else if (lower.indexOf('cbz') !== -1 || lower.indexOf('comicbook') !== -1) ext = '.cbz';
    else if (lower.indexOf('mobi') !== -1) ext = '.mobi';
    return base + ext;
  }

  function renderBooksOpdsFeeds() {
    var ui = ensureBooksOpdsUi();
    if (!ui.list) return;
    ui.list.innerHTML = '';
    var empty = document.getElementById('booksOpdsFeedsEmpty');
    if (!_booksOpdsFeeds.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    for (var i = 0; i < _booksOpdsFeeds.length; i++) {
      (function (feed) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'folderItem';
        btn.dataset.feedId = feed.id;
        btn.title = String(feed.url || '');

        var icon = document.createElement('span');
        icon.className = 'folderIcon';
        var dot = document.createElement('span');
        dot.className = 'webSourceDot';
        dot.style.background = '#5865f2';
        icon.appendChild(dot);

        var row = document.createElement('span');
        row.className = 'booksOpdsFeedRow';
        var meta = document.createElement('span');
        meta.className = 'booksOpdsFeedMeta';
        var line = document.createElement('span');
        line.className = 'folderLabel';
        line.textContent = feed.name || _opdsHost(feed.url) || feed.url;
        var sub = document.createElement('small');
        sub.textContent = _opdsHost(feed.url) || feed.url;
        meta.appendChild(line);
        meta.appendChild(sub);

        var actions = document.createElement('span');
        actions.className = 'booksOpdsRowActions';
        var openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          openBooksOpdsFeed(feed);
        });
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.textContent = '\u22EF';
        moreBtn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          showBooksOpdsFeedMenu(feed, e.clientX, e.clientY);
        });
        actions.appendChild(openBtn);
        actions.appendChild(moreBtn);

        row.appendChild(meta);
        row.appendChild(actions);

        btn.appendChild(icon);
        btn.appendChild(row);
        btn.addEventListener('click', function () { openBooksOpdsFeed(feed); });
        btn.oncontextmenu = function (e) {
          try { e.preventDefault(); } catch (err) {}
          showBooksOpdsFeedMenu(feed, e.clientX, e.clientY);
        };
        ui.list.appendChild(btn);
      })(_booksOpdsFeeds[i]);
    }
  }

  function showBooksOpdsFeedMenu(feed, x, y) {
    var items = [];
    items.push({ label: 'Open', onClick: function () { openBooksOpdsFeed(feed); } });
    items.push({ label: 'Rename', onClick: function () {
      var next = window.prompt('Feed name (optional)', String(feed.name || ''));
      if (next == null) return;
      if (!api.booksOpds || !api.booksOpds.updateFeed) return;
      api.booksOpds.updateFeed({ id: feed.id, name: String(next || '').trim() }).then(function () {
        loadBooksOpdsFeeds();
      }).catch(function () { toast('Could not rename feed'); });
    }});
    items.push({ label: 'Edit URL', onClick: function () {
      var next = window.prompt('Feed URL', String(feed.url || ''));
      if (next == null) return;
      if (!api.booksOpds || !api.booksOpds.updateFeed) return;
      api.booksOpds.updateFeed({ id: feed.id, url: String(next || '').trim() }).then(function (res) {
        if (!res || !res.ok) toast((res && res.error) || 'Could not update feed');
        loadBooksOpdsFeeds();
      }).catch(function () { toast('Could not update feed'); });
    }});
    items.push({ label: 'Remove', onClick: function () {
      if (!window.confirm('Remove this OPDS feed?')) return;
      if (!api.booksOpds || !api.booksOpds.removeFeed) return;
      api.booksOpds.removeFeed({ id: feed.id }).then(function () {
        if (_booksOpdsUi.selectedFeedId === feed.id) closeBooksOpdsOverlay();
        loadBooksOpdsFeeds();
      }).catch(function () { toast('Could not remove feed'); });
    }});
    showCtx({ x: x, y: y, items: items });
  }

  function openBooksOpdsOverlay() {
    var ui = ensureBooksOpdsUi();
    if (!ui.overlay) return;
    ui.overlay.classList.remove('hidden');
    _booksOpdsUi.open = true;
  }

  function closeBooksOpdsOverlay() {
    var ui = ensureBooksOpdsUi();
    if (!ui.overlay) return;
    ui.overlay.classList.add('hidden');
    _booksOpdsUi.open = false;
  }

  function booksOpdsBack() {
    if (_booksOpdsUi.loading) return;
    if (_booksOpdsUi.stack.length > 1) {
      _booksOpdsUi.stack.pop();
      _booksOpdsUi.current = _booksOpdsUi.stack[_booksOpdsUi.stack.length - 1] || null;
      renderBooksOpdsCatalog();
      return;
    }
    closeBooksOpdsOverlay();
  }

  function renderBooksOpdsCatalog() {
    var ui = ensureBooksOpdsUi();
    if (!ui.body) return;
    var page = _booksOpdsUi.current;
    if (!page) {
      ui.title.textContent = 'OPDS Catalog';
      ui.subtitle.textContent = '';
      ui.breadcrumb.innerHTML = '';
      ui.body.innerHTML = '<div class="booksOpdsState">No catalog loaded.</div>';
      return;
    }

    ui.title.textContent = page.title || 'OPDS Catalog';
    ui.subtitle.textContent = page.subtitle || (page.url ? _opdsHost(page.url) : '');
    if (ui.backBtn) ui.backBtn.disabled = _booksOpdsUi.loading;
    if (ui.refreshBtn) ui.refreshBtn.disabled = _booksOpdsUi.loading;

    var crumbs = [];
    for (var i = 0; i < _booksOpdsUi.stack.length; i++) {
      var c = _booksOpdsUi.stack[i];
      crumbs.push('<button type="button" data-opds-crumb="' + i + '">' + _opdsEsc(c.title || ('Level ' + (i + 1))) + '</button>');
    }
    ui.breadcrumb.innerHTML = crumbs.length ? crumbs.join('<span>\u203A</span>') : '';
    ui.breadcrumb.onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-opds-crumb]') : null;
      if (!btn) return;
      var idx = Number(btn.getAttribute('data-opds-crumb'));
      if (!isFinite(idx) || idx < 0 || idx >= _booksOpdsUi.stack.length) return;
      _booksOpdsUi.stack = _booksOpdsUi.stack.slice(0, idx + 1);
      _booksOpdsUi.current = _booksOpdsUi.stack[idx] || null;
      renderBooksOpdsCatalog();
    };

    if (_booksOpdsUi.loading) {
      ui.body.innerHTML = '<div class="booksOpdsState">Loading catalog\u2026</div>';
      return;
    }
    if (page.error) {
      ui.body.innerHTML = '<div class="booksOpdsState">' + _opdsEsc(page.error) + '</div>';
      return;
    }
    if (!Array.isArray(page.items) || !page.items.length) {
      ui.body.innerHTML = '<div class="booksOpdsState">No items found in this catalog.</div>';
      return;
    }

    var html = '';
    for (var j = 0; j < page.items.length; j++) {
      var item = page.items[j];
      var cover = item.cover || item.thumbnail || '';
      var authorLine = (item.authors && item.authors.length) ? item.authors.slice(0, 2).join(', ') : '';
      var infoParts = [];
      if (item.language) infoParts.push(String(item.language).toUpperCase());
      if (item.published) infoParts.push(item.published.replace(/^(.{10}).*$/, '$1'));
      if (item.kind) infoParts.push(item.kind);
      var infoLine = infoParts.join(' \u2022 ');
      var desc = String(item.summary || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (desc.length > 180) desc = desc.slice(0, 180) + '\u2026';

      html += '<div class="booksOpdsCard">';
      html += cover ? ('<img class="booksOpdsCover" loading="lazy" src="' + _opdsEsc(cover) + '" alt="">') : '<div class="booksOpdsCover"></div>';
      html += '<div class="booksOpdsMeta">';
      html += '<div class="booksOpdsItemTitle">' + _opdsEsc(item.title || 'Untitled') + '</div>';
      if (authorLine) html += '<div class="booksOpdsItemBy">' + _opdsEsc(authorLine) + '</div>';
      if (infoLine) html += '<div class="booksOpdsItemInfo">' + _opdsEsc(infoLine) + '</div>';
      if (desc) html += '<div class="booksOpdsItemDesc">' + _opdsEsc(desc) + '</div>';
      html += '<div class="booksOpdsBtns">';
      var nav = opdsBestNavLink(item);
      if (nav && (item.kind === 'navigation' || (item.kind === 'external' && String(nav.type || '').toLowerCase().indexOf('html') === -1))) {
        html += '<button class="primary" type="button" data-opds-action="nav" data-href="' + _opdsEsc(nav.href) + '" data-title="' + _opdsEsc(item.title || '') + '">Open</button>';
      }
      if (item.kind === 'external' && nav) {
        html += '<button type="button" data-opds-action="open-ext" data-href="' + _opdsEsc(nav.href) + '" data-title="' + _opdsEsc(item.title || '') + '">Visit</button>';
      }
      var acq = Array.isArray(item.acquisitionLinks) ? item.acquisitionLinks : [];
      for (var k = 0; k < acq.length && k < 4; k++) {
        html += '<button type="button" data-opds-action="download" data-href="' + _opdsEsc(acq[k].href) + '" data-title="' + _opdsEsc(item.title || '') + '" data-type="' + _opdsEsc(acq[k].type || '') + '">' + _opdsEsc(opdsLabelForAcq(acq[k])) + '</button>';
      }
      if (!acq.length && item.kind === 'publication' && nav) {
        html += '<button type="button" data-opds-action="nav" data-href="' + _opdsEsc(nav.href) + '" data-title="' + _opdsEsc(item.title || '') + '">Details</button>';
      }
      html += '</div></div></div>';
    }
    ui.body.innerHTML = html;
  }

  async function openBooksOpdsUrl(url, opts) {
    opts = opts || {};
    if (!api.booksOpds || !api.booksOpds.fetchCatalog) {
      toast('OPDS API not available');
      return;
    }
    ensureBooksOpdsUi();
    openBooksOpdsOverlay();

    _booksOpdsUi.loading = true;
    if (!opts.replace) {
      var tmpTitle = opts.titleHint || 'Loading\u2026';
      var placeholder = { url: String(url || ''), title: String(tmpTitle || 'Loading\u2026'), subtitle: _opdsHost(url), items: [] };
      _booksOpdsUi.stack.push(placeholder);
      _booksOpdsUi.current = placeholder;
    }
    renderBooksOpdsCatalog();

    try {
      var res = await api.booksOpds.fetchCatalog({ url: url });
      if (!res || !res.ok) throw new Error((res && (res.error || (res.status ? ('HTTP ' + res.status) : 'Request failed'))) || 'Request failed');
      var parsed = parseOpdsPayload(res);
      var page = {
        url: res.url || url,
        title: parsed.title || opts.titleHint || 'OPDS Catalog',
        subtitle: parsed.subtitle || _opdsHost(res.url || url),
        items: Array.isArray(parsed.items) ? parsed.items : [],
        feedLinks: Array.isArray(parsed.feedLinks) ? parsed.feedLinks : [],
        type: parsed.type || '',
      };
      if (opts.replace && _booksOpdsUi.stack.length) {
        _booksOpdsUi.stack[_booksOpdsUi.stack.length - 1] = page;
      } else if (!_booksOpdsUi.stack.length) {
        _booksOpdsUi.stack = [page];
      } else {
        _booksOpdsUi.stack[_booksOpdsUi.stack.length - 1] = page;
      }
      _booksOpdsUi.current = page;
      _booksOpdsUi.loading = false;
      renderBooksOpdsCatalog();
    } catch (err) {
      _booksOpdsUi.loading = false;
      var msg = String((err && err.message) || err || 'Failed to load catalog');
      if (opts.replace && _booksOpdsUi.stack.length) {
        _booksOpdsUi.stack[_booksOpdsUi.stack.length - 1] = { url: String(url || ''), title: opts.titleHint || 'OPDS Catalog', subtitle: _opdsHost(url), error: msg, items: [] };
      } else if (_booksOpdsUi.stack.length) {
        _booksOpdsUi.stack[_booksOpdsUi.stack.length - 1].error = msg;
      } else {
        _booksOpdsUi.stack = [{ url: String(url || ''), title: 'OPDS Catalog', subtitle: _opdsHost(url), error: msg, items: [] }];
      }
      _booksOpdsUi.current = _booksOpdsUi.stack[_booksOpdsUi.stack.length - 1] || null;
      renderBooksOpdsCatalog();
      toast('OPDS load failed');
    }
  }

  function openBooksOpdsFeed(feed) {
    if (!feed || !feed.url) return;
    _booksOpdsUi.selectedFeedId = feed.id || null;
    _booksOpdsUi.stack = [];
    _booksOpdsUi.current = null;
    openBooksOpdsUrl(feed.url, { titleHint: feed.name || _opdsHost(feed.url) });
  }

  function downloadOpdsAcquisition(link) {
    if (!link || !link.href) return;
    if (!api.webSources || !api.webSources.downloadFromUrl) {
      toast('Download API not available');
      return;
    }
    var suggested = opdsGuessFilename(link.title, link.type);
    api.webSources.downloadFromUrl({
      url: link.href,
      referer: _booksOpdsUi.current && _booksOpdsUi.current.url ? _booksOpdsUi.current.url : '',
      suggestedFilename: suggested,
      title: link.title || 'book',
    }).then(function (res) {
      if (!res || !res.ok) {
        toast((res && res.error) || 'Download failed to start');
        return;
      }
      toast('Download started');
    }).catch(function () {
      toast('Download failed to start');
    });
  }

  async function addOpdsFeedPrompt() {
    if (!api.booksOpds || !api.booksOpds.addFeed) {
      toast('OPDS API not available');
      return;
    }
    var url = window.prompt('Add OPDS feed URL');
    if (url == null) return;
    url = String(url || '').trim();
    if (!url) return;

    var name = '';
    try {
      if (api.booksOpds.fetchCatalog) {
        var probe = await api.booksOpds.fetchCatalog({ url: url });
        if (probe && probe.ok) {
          try {
            var parsed = parseOpdsPayload(probe);
            if (parsed && parsed.title) name = String(parsed.title || '').trim();
            url = probe.url || url;
          } catch (e) {}
        }
      }
    } catch (e) {}

    var res = await api.booksOpds.addFeed({ url: url, name: name });
    if (!res || !res.ok) {
      toast((res && res.error) || 'Could not add OPDS feed');
      return;
    }
    toast('OPDS feed added');
    await loadBooksOpdsFeeds();
    if (res.feed) openBooksOpdsFeed(res.feed);
  }

  function loadBooksOpdsFeeds() {
    ensureBooksOpdsUi();
    if (!api || !api.booksOpds || !api.booksOpds.getFeeds) return Promise.resolve();
    return api.booksOpds.getFeeds().then(function (res) {
      if (res && res.ok && Array.isArray(res.feeds)) {
        _booksOpdsFeeds = res.feeds;
        renderBooksOpdsFeeds();
      }
    }).catch(function () {});
  }

  // Auto-init: build UI + load feeds
  try { ensureBooksOpdsUi(); loadBooksOpdsFeeds(); } catch (e) {}
  try {
    if (api && api.booksOpds && typeof api.booksOpds.onFeedsUpdated === 'function') {
      api.booksOpds.onFeedsUpdated(function (data) {
        if (data && Array.isArray(data.feeds)) {
          _booksOpdsFeeds = data.feeds;
          renderBooksOpdsFeeds();
        } else {
          loadBooksOpdsFeeds();
        }
      });
    }
  } catch (e) {}

})();
