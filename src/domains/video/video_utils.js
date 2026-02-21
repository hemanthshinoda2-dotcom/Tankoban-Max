/* 
AI_NAV: video_utils.js
OWNERSHIP: Small pure helper utilities extracted from video.js to keep the main Videos module readable.
SAFE TO EDIT: Yes, but preserve function signatures and return types (video.js depends on them).

Exports:
- window.tankobanVideoUtils._videoGsNorm
- window.tankobanVideoUtils._videoMatchText
- window.tankobanVideoUtils._videoNatCmp
- window.tankobanVideoUtils._videoEscHtml
*/

(function(){
  const api = window.tankobanVideoUtils = window.tankobanVideoUtils || {};
  function _videoGsNorm(s){ return String(s || '').toLowerCase(); }
  function _videoMatchText(hay, needle){
    try { if (typeof matchText === 'function') return !!matchText(hay, needle); } catch {}
    return _videoGsNorm(hay).includes(_videoGsNorm(needle));
  }
  function _videoNatCmp(a, b){
    try { if (typeof naturalCompare === 'function') return naturalCompare(String(a||''), String(b||'')); } catch {}
    return String(a||'').localeCompare(String(b||''), undefined, { numeric: true, sensitivity: 'base' });
  }
  function _videoEscHtml(s){
    try { if (typeof escapeHtml === 'function') return escapeHtml(String(s || '')); } catch {}
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // Search UI functions (videoHideGlobalSearchResults, videoSetGlobalSearchSelection,
  // videoActivateGlobalSearchSelection) moved to video_search.js where they share
  // scope with videoGlobalSearchItems.

  api._videoGsNorm = _videoGsNorm;
  api._videoMatchText = _videoMatchText;
  api._videoNatCmp = _videoNatCmp;
  api._videoEscHtml = _videoEscHtml;
})(); 
