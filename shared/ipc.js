/**
 * TankobanPlus — IPC Contract (Build 76, Phase 2)
 * 
 * Single source of truth for ALL IPC channel names.
 * This file is the ONLY place where IPC channel strings are defined.
 * 
 * Usage:
 *   - CHANNEL: Request channels (ipcMain.handle/on AND ipcRenderer.invoke)
 *   - EVENT: Push/event channels (webContents.send AND ipcRenderer.on)
 */

/**
 * CHANNEL — Request channels
 * Used for: ipcMain.handle(...) and ipcRenderer.invoke(...)
 */
const CHANNEL = {
  // ========================================
  // Window
  // ========================================
  
  /** Set fullscreen state. Returns: success boolean */
  WINDOW_SET_FULLSCREEN: 'window:setFullscreen',
  
  /** Toggle fullscreen state. Returns: new state boolean */
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggleFullscreen',
  
  /** Get fullscreen state. Returns: boolean */
  WINDOW_IS_FULLSCREEN: 'window:isFullscreen',

  /** Get maximized state. Returns: boolean */
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',

  /** Toggle maximized state. Returns: new state boolean */
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  
  /** Open a book in a new window. Returns: success boolean */
  WINDOW_OPEN_BOOK_IN_NEW_WINDOW: 'window:openBookInNewWindow',
  
  /** Open video shell window. Returns: success boolean */
  WINDOW_OPEN_VIDEO_SHELL: 'window:openVideoShell',
  
  /** Minimize window. Returns: void */
  WINDOW_MINIMIZE: 'window:minimize',
  
  /** Close window. Returns: void */
  WINDOW_CLOSE: 'window:close',
  
  /** BUILD14: Hide window. Returns: void */
  WINDOW_HIDE: 'window:hide',
  
  /** BUILD14: Show window. Returns: void */
  WINDOW_SHOW: 'window:show',
  
  /** Get always-on-top state. Returns: boolean */
  WINDOW_IS_ALWAYS_ON_TOP: 'window:isAlwaysOnTop',
  
  /** Toggle always-on-top state. Returns: new state boolean */
  WINDOW_TOGGLE_ALWAYS_ON_TOP: 'window:toggleAlwaysOnTop',
  
  /** Take a screenshot. Returns: { success: boolean, path?: string } */
  WINDOW_TAKE_SCREENSHOT: 'window:takeScreenshot',
  
  /** Open subtitle file dialog. Returns: { canceled: boolean, filePath?: string } */
  WINDOW_OPEN_SUBTITLE_DIALOG: 'window:openSubtitleDialog',

  // ========================================
  // Health
  // ========================================

  /** Simple ping to check main process responsiveness */
  HEALTH_PING: 'health:ping',


  // ========================================
  // Shell
  // ========================================
  
  /** Reveal path in file explorer. Returns: void */
  SHELL_REVEAL_PATH: 'shell:revealPath',

  /** Open a file with the OS default handler. Args: { path }. Returns: { ok, error? } */
  SHELL_OPEN_PATH: 'shell:openPath',

  // ========================================
  // Clipboard
  // ========================================
  
  /** Copy text to clipboard. Returns: void */
  CLIPBOARD_WRITE_TEXT: 'clipboard:writeText',

  // ========================================
  // Library
  // ========================================
  
  /** Get library state snapshot. Returns: library state object */
  LIBRARY_GET_STATE: 'library:getState',
  
  /** Start library scan. Returns: void */
  LIBRARY_SCAN: 'library:scan',
  
  /** Cancel library scan. Returns: void */
  LIBRARY_CANCEL_SCAN: 'library:cancelScan',
  
  /** Set scan ignore patterns. Returns: void */
  LIBRARY_SET_SCAN_IGNORE: 'library:setScanIgnore',
  
  /** Add root folder via dialog. Returns: { canceled: boolean, path?: string } */
  LIBRARY_ADD_ROOT_FOLDER: 'library:addRootFolder',
  
  /** Remove root folder. Returns: void */
  LIBRARY_REMOVE_ROOT_FOLDER: 'library:removeRootFolder',
  
  /** Add series folder via dialog. Returns: { canceled: boolean, path?: string } */
  LIBRARY_ADD_SERIES_FOLDER: 'library:addSeriesFolder',
  
  /** Remove series folder. Returns: void */
  LIBRARY_REMOVE_SERIES_FOLDER: 'library:removeSeriesFolder',
  
  /** Unignore a series. Returns: void */
  LIBRARY_UNIGNORE_SERIES: 'library:unignoreSeries',
  
  /** Clear all ignored series. Returns: void */
  LIBRARY_CLEAR_IGNORED_SERIES: 'library:clearIgnoredSeries',

  // ========================================
  // Books
  // ========================================

  /** Get books library state snapshot. Returns: books state object */
  BOOKS_GET_STATE: 'books:getState',

  /** Start books library scan. Returns: { ok: boolean } */
  BOOKS_SCAN: 'books:scan',

  /** Cancel running books scan. Returns: { ok: boolean } */
  BOOKS_CANCEL_SCAN: 'books:cancelScan',

  /** Set books scan ignore patterns. Returns: { ok: boolean } */
  BOOKS_SET_SCAN_IGNORE: 'books:setScanIgnore',

  /** Add books root folder via dialog. Returns: { ok: boolean, state?: object } */
  BOOKS_ADD_ROOT_FOLDER: 'books:addRootFolder',

  /** Remove books root folder. Returns: { ok: boolean, state?: object } */
  BOOKS_REMOVE_ROOT_FOLDER: 'books:removeRootFolder',

  /** Add explicit books series folder via dialog. Returns: { ok: boolean, state?: object } */
  BOOKS_ADD_SERIES_FOLDER: 'books:addSeriesFolder',

  /** Remove explicit books series folder. Returns: { ok: boolean, state?: object } */
  BOOKS_REMOVE_SERIES_FOLDER: 'books:removeSeriesFolder',

  /** Add explicit standalone book files via dialog. Returns: { ok: boolean, state?: object } */
  BOOKS_ADD_FILES: 'books:addFiles',

  /** Remove explicit standalone book file. Returns: { ok: boolean, state?: object } */
  BOOKS_REMOVE_FILE: 'books:removeFile',

  /** Open book file dialog (open without adding). Returns: { ok: boolean, book?: object } */
  BOOKS_OPEN_FILE_DIALOG: 'books:openFileDialog',

  /** Build a book object from an on-disk path. Returns: { ok: boolean, book?: object } */
  BOOKS_BOOK_FROM_PATH: 'books:bookFromPath',

  // ========================================
  // Books Edge TTS Bridge (FIX-R08)
  // ========================================

  /** Probe Edge TTS availability from main process. Returns: { ok, available, reason?, details? } */
  BOOKS_TTS_EDGE_PROBE: 'booksTtsEdge:probe',

  /** Fetch Edge voices from main process. Returns: { ok, voices: array, reason? } */
  BOOKS_TTS_EDGE_GET_VOICES: 'booksTtsEdge:getVoices',

  /** Synthesize speech via Edge transport in main process. Returns: { ok, audioBase64?, boundaries?, errorCode?, reason? } */
  BOOKS_TTS_EDGE_SYNTH: 'booksTtsEdge:synth',

  /** FIX-TTS04: Warm up Edge TTS WebSocket connection (no audio returned). Returns: { ok } */
  BOOKS_TTS_EDGE_WARMUP: 'booksTtsEdge:warmup',

  /** FIX-TTS06: Reset main-process Edge TTS instance (force fresh WebSocket on next synth). Returns: { ok } */
  BOOKS_TTS_EDGE_RESET_INSTANCE: 'booksTtsEdge:resetInstance',

  /** LISTEN_P6: Clear on-disk TTS audio cache. Returns: { ok, deletedCount? } */
  BOOKS_TTS_EDGE_CACHE_CLEAR: 'booksTtsEdge:cacheClear',

  /** LISTEN_P6: Get on-disk TTS audio cache stats. Returns: { ok, count, sizeBytes } */
  BOOKS_TTS_EDGE_CACHE_INFO: 'booksTtsEdge:cacheInfo',

  // ========================================
  // Books Progress
  // ========================================

  /** Get all books progress. Returns: object with bookId keys */
  BOOKS_PROGRESS_GET_ALL: 'booksProgress:getAll',

  /** Get progress for a book. Returns: progress object or null */
  BOOKS_PROGRESS_GET: 'booksProgress:get',

  /** Save progress for a book. Returns: { ok: boolean } */
  BOOKS_PROGRESS_SAVE: 'booksProgress:save',

  /** Clear progress for a book. Returns: { ok: boolean } */
  BOOKS_PROGRESS_CLEAR: 'booksProgress:clear',

  /** Clear all books progress. Returns: { ok: boolean } */
  BOOKS_PROGRESS_CLEAR_ALL: 'booksProgress:clearAll',

  // ========================================
  // Books Reader Settings
  // ========================================

  /** Get books reader settings. Returns: settings object */
  BOOKS_SETTINGS_GET: 'booksSettings:get',

  /** Save books reader settings. Returns: { ok: boolean } */
  BOOKS_SETTINGS_SAVE: 'booksSettings:save',

  /** Clear books reader settings. Returns: { ok: boolean } */
  BOOKS_SETTINGS_CLEAR: 'booksSettings:clear',

  // ========================================
  // Books Bookmarks (WAVE3)
  // ========================================

  /** Get all bookmarks for a book. Returns: array of bookmark objects */
  BOOKS_BOOKMARKS_GET: 'booksBookmarks:get',

  /** Save (create/update) a bookmark. Returns: { ok: boolean, bookmark?: object } */
  BOOKS_BOOKMARKS_SAVE: 'booksBookmarks:save',

  /** Delete a bookmark by id. Returns: { ok: boolean } */
  BOOKS_BOOKMARKS_DELETE: 'booksBookmarks:delete',

  /** Clear all bookmarks for a book. Returns: { ok: boolean } */
  BOOKS_BOOKMARKS_CLEAR: 'booksBookmarks:clear',

  // ========================================
  // Books Annotations (BUILD_ANNOT)
  // ========================================

  /** Get all annotations for a book. Returns: array of annotation objects */
  BOOKS_ANNOTATIONS_GET: 'booksAnnotations:get',

  /** Save (create/update) an annotation. Returns: { ok: boolean, annotation?: object } */
  BOOKS_ANNOTATIONS_SAVE: 'booksAnnotations:save',

  /** Delete an annotation by id. Returns: { ok: boolean } */
  BOOKS_ANNOTATIONS_DELETE: 'booksAnnotations:delete',

  /** Clear all annotations for a book. Returns: { ok: boolean } */
  BOOKS_ANNOTATIONS_CLEAR: 'booksAnnotations:clear',

  // ========================================
  // Books Display Names (RENAME-BOOK)
  // ========================================

  /** Get all custom display names. Returns: { [bookId]: displayName } */
  BOOKS_DISPLAY_NAMES_GET_ALL: 'booksDisplayNames:getAll',

  /** Save a custom display name for a book. Returns: { ok: boolean } */
  BOOKS_DISPLAY_NAMES_SAVE: 'booksDisplayNames:save',

  /** Clear a custom display name for a book. Returns: { ok: boolean } */
  BOOKS_DISPLAY_NAMES_CLEAR: 'booksDisplayNames:clear',

  // ========================================
  // Video Display Names (RENAME-VIDEO)
  // ========================================

  /** Get all custom video show display names. Returns: { [showId]: displayName } */
  VIDEO_DISPLAY_NAMES_GET_ALL: 'videoDisplayNames:getAll',

  /** Save a custom display name for a video show. Returns: { ok: boolean } */
  VIDEO_DISPLAY_NAMES_SAVE: 'videoDisplayNames:save',

  /** Clear a custom display name for a video show. Returns: { ok: boolean } */
  VIDEO_DISPLAY_NAMES_CLEAR: 'videoDisplayNames:clear',

  // ========================================
  // Books UI State
  // ========================================

  /** Get books UI state. Returns: UI state object */
  BOOKS_UI_GET: 'booksUi:get',

  /** Save books UI state. Returns: { ok: boolean } */
  BOOKS_UI_SAVE: 'booksUi:save',

  /** Clear books UI state. Returns: { ok: boolean } */
  BOOKS_UI_CLEAR: 'booksUi:clear',

  // ========================================
  // Books TTS Progress (LISTEN_P4)
  // ========================================

  /** Get all TTS listening progress. Returns: { byBook: { [bookId]: entry } } */
  BOOKS_TTS_PROGRESS_GET_ALL: 'booksTtsProgress:getAll',

  /** Get TTS progress for one book. Returns: entry or null */
  BOOKS_TTS_PROGRESS_GET: 'booksTtsProgress:get',

  /** Save TTS progress for a book. Returns: { ok: boolean } */
  BOOKS_TTS_PROGRESS_SAVE: 'booksTtsProgress:save',

  /** Clear TTS progress for a book. Returns: { ok: boolean } */
  BOOKS_TTS_PROGRESS_CLEAR: 'booksTtsProgress:clear',

  // ========================================
  // Video
  // ========================================
  
  /** Get video state snapshot. Returns: video state object */
  VIDEO_GET_STATE: 'video:getState',
  
  /** Get episodes for a show. Returns: array of episode objects */
  VIDEO_GET_EPISODES_FOR_SHOW: 'video:getEpisodesForShow',
  
  /** Get episodes for a root folder. Returns: array of episode objects */
  VIDEO_GET_EPISODES_FOR_ROOT: 'video:getEpisodesForRoot',
  
  
  /** Get episode objects for a list of episode IDs. Returns: { ok, episodes } */
  VIDEO_GET_EPISODES_BY_IDS: 'video:getEpisodesByIds',
  /** Start video library scan. Returns: void */
  VIDEO_SCAN: 'video:scan',

  /** Rescan a single show by its folder path. Returns: { ok: boolean } */
  VIDEO_SCAN_SHOW: 'video:scan-show',

  /** Generate auto thumbnail for a specific show. Returns: { ok, generated, reason?, path? } */
  VIDEO_GENERATE_SHOW_THUMBNAIL: 'video:generateShowThumbnail',
  
  /** Cancel video scan. Returns: void */
  VIDEO_CANCEL_SCAN: 'video:cancelScan',
  
  /** Add video folder via dialog. Returns: { canceled: boolean, path?: string } */
  VIDEO_ADD_FOLDER: 'video:addFolder',

  /** Add a single show folder (one show) via dialog. Returns: { ok: boolean, state?: object } */
  VIDEO_ADD_SHOW_FOLDER: 'video:addShowFolder',

  /** Add a show folder by path (no dialog). Args: folderPath. Returns: { ok, state? } */
  VIDEO_ADD_SHOW_FOLDER_PATH: 'video:addShowFolderPath',

  /** Remove video folder. Returns: void */
  VIDEO_REMOVE_FOLDER: 'video:removeFolder',
  
  /** Hide a video show. Returns: void */
  VIDEO_HIDE_SHOW: 'video:hideShow',
  
  /** Open video file dialog. Returns: { canceled: boolean, filePath?: string } */
  VIDEO_OPEN_FILE_DIALOG: 'video:openFileDialog',
  
  /** Open subtitle file dialog. Returns: { canceled: boolean, filePath?: string } */
  VIDEO_OPEN_SUBTITLE_FILE_DIALOG: 'video:openSubtitleFileDialog',

  
  /** Add individual video files to the video library. Returns: { ok: boolean, state?: object } */
  VIDEO_ADD_FILES: 'video:addFiles',
  
  /** Remove an individual video file from the video library. Returns: { ok: boolean, state?: object } */
  VIDEO_REMOVE_FILE: 'video:removeFile',
  
  /** Restore all hidden (removed) video shows. Returns: { ok: boolean, state?: object } */
  VIDEO_RESTORE_ALL_HIDDEN_SHOWS: 'video:restoreAllHiddenShows',
  
  /** Restore hidden (removed) video shows for a specific rootId. Returns: { ok: boolean, state?: object } */
  VIDEO_RESTORE_HIDDEN_SHOWS_FOR_ROOT: 'video:restoreHiddenShowsForRoot',

  /** Get (or queue generation of) a folder thumbnail. Returns: { ok, path?, type? } */
  VIDEO_GET_FOLDER_THUMBNAIL: 'video:getFolderThumbnail',

  /** Request folder thumbnail generation. Returns: { ok, path? } */
  VIDEO_REQUEST_FOLDER_THUMBNAIL: 'video:requestFolderThumbnail',

  // ========================================
  // Comic
  // ========================================
  
  /** Open comic file dialog. Returns: { canceled: boolean, filePaths?: string[] } */
  COMIC_OPEN_FILE_DIALOG: 'comic:openFileDialog',
  
  /** Get book metadata from file path. Returns: book object */
  COMIC_BOOK_FROM_PATH: 'comic:bookFromPath',

  // ========================================
  // Thumbnails
  // ========================================
  
  /** Get thumbnail for book. Returns: data URL or null */
  THUMBS_GET: 'thumbs:get',
  
  /** Delete thumbnail for book. Returns: void */
  THUMBS_DELETE: 'thumbs:delete',
  
  /** Check if thumbnail exists. Returns: boolean */
  THUMBS_HAS: 'thumbs:has',
  
  /** Save thumbnail for book. Returns: void */
  THUMBS_SAVE: 'thumbs:save',

  // ========================================
  // Video Posters
  // ========================================
  
  /** Get video poster for show. Returns: data URL or null */
  VIDEO_POSTER_GET: 'videoPoster:get',
  
  /** Check if video poster exists. Returns: boolean */
  VIDEO_POSTER_HAS: 'videoPoster:has',
  
  /** Delete video poster for show. Returns: void */
  VIDEO_POSTER_DELETE: 'videoPoster:delete',
  
  /** Save video poster for show. Returns: void */
  VIDEO_POSTER_SAVE: 'videoPoster:save',
  
  /** Paste video poster from clipboard. Returns: void */
  VIDEO_POSTER_PASTE: 'videoPoster:paste',

  // ========================================
  // Page Thumbnails
  // ========================================
  
  /** Check if page thumbnail exists. Returns: boolean */
  PAGE_THUMBS_HAS: 'pageThumbs:has',
  
  /** Get page thumbnail. Returns: data URL or null */
  PAGE_THUMBS_GET: 'pageThumbs:get',
  
  /** Save page thumbnail. Returns: void */
  PAGE_THUMBS_SAVE: 'pageThumbs:save',

  // ========================================
  // File Access
  // ========================================
  
  /** Read file contents. Returns: Buffer */
  FILE_READ: 'file:read',

  /** List video files in a folder. Returns: string[] */
  FILE_LIST_FOLDER_VIDEOS: 'file:list-folder-videos',

  // ========================================
  // CBR (RAR archives)
  // ========================================
  
  /** Open CBR file. Returns: { sessionId: string, entryCount: number } */
  CBR_OPEN: 'cbr:open',
  
  /** Read entry from CBR. Returns: Buffer */
  CBR_READ_ENTRY: 'cbr:readEntry',
  
  /** Close CBR session. Returns: void */
  CBR_CLOSE: 'cbr:close',

  // ========================================
  // CBZ (ZIP archives)
  // ========================================
  
  /** Open CBZ file. Returns: { sessionId: string, entryCount: number } */
  CBZ_OPEN: 'cbz:open',
  
  /** Read entry from CBZ. Returns: Buffer */
  CBZ_READ_ENTRY: 'cbz:readEntry',
  
  /** Close CBZ session. Returns: void */
  CBZ_CLOSE: 'cbz:close',

  // ========================================
  // Export
  // ========================================
  
  /** Save entry to disk via dialog. Returns: { canceled: boolean, path?: string } */
  EXPORT_SAVE_ENTRY: 'export:saveEntry',
  
  /** Copy entry to clipboard. Returns: void */
  EXPORT_COPY_ENTRY: 'export:copyEntry',

  // ========================================
  // Comic Progress
  // ========================================
  
  /** Get all comic progress. Returns: object with bookId keys */
  PROGRESS_GET_ALL: 'progress:getAll',
  
  /** Get progress for a book. Returns: progress object or null */
  PROGRESS_GET: 'progress:get',
  
  /** Save progress for a book. Returns: void */
  PROGRESS_SAVE: 'progress:save',
  
  /** Clear progress for a book. Returns: void */
  PROGRESS_CLEAR: 'progress:clear',
  
  /** Clear all comic progress. Returns: void */
  PROGRESS_CLEAR_ALL: 'progress:clearAll',

  // ========================================
  // Video Progress
  // ========================================
  
  /** Get all video progress. Returns: object with videoId keys */
  VIDEO_PROGRESS_GET_ALL: 'videoProgress:getAll',
  
  /** Get progress for a video. Returns: progress object or null */
  VIDEO_PROGRESS_GET: 'videoProgress:get',
  
  /** Save progress for a video. Returns: void */
  VIDEO_PROGRESS_SAVE: 'videoProgress:save',
  
  /** Clear progress for a video. Returns: void */
  VIDEO_PROGRESS_CLEAR: 'videoProgress:clear',
  
  /** Clear all video progress. Returns: void */
  VIDEO_PROGRESS_CLEAR_ALL: 'videoProgress:clearAll',

  // ========================================
  // Video Settings
  // ========================================
  
  /** Get video settings. Returns: settings object */
  VIDEO_SETTINGS_GET: 'videoSettings:get',
  
  /** Save video settings. Returns: void */
  VIDEO_SETTINGS_SAVE: 'videoSettings:save',
  
  /** Clear video settings. Returns: void */
  VIDEO_SETTINGS_CLEAR: 'videoSettings:clear',

  // ========================================
  // Video UI State
  // ========================================
  
  /** Get video UI state. Returns: UI state object */
  VIDEO_UI_GET: 'videoUi:get',
  
  /** Save video UI state. Returns: void */
  VIDEO_UI_SAVE: 'videoUi:save',
  
  /** Clear video UI state. Returns: void */
  VIDEO_UI_CLEAR: 'videoUi:clear',

  // ========================================
  // mpv (external process bridge)
  // ========================================
  
  /** Check if mpv is available. Returns: boolean */
  MPV_IS_AVAILABLE: 'mpv:isAvailable',
  
  /** Create mpv player instance. Returns: { playerId: string } */
  MPV_CREATE: 'mpv:create',
  
  /** Destroy mpv player. Returns: void */
  MPV_DESTROY: 'mpv:destroy',
  
  /** Load file in mpv. Returns: void */
  MPV_LOAD: 'mpv:load',
  
  /** Send command to mpv. Returns: void */
  MPV_COMMAND: 'mpv:command',
  
  /** Set mpv property. Returns: void */
  MPV_SET_PROPERTY: 'mpv:setProperty',
  
  /** Observe mpv property. Returns: void */
  MPV_OBSERVE_PROPERTY: 'mpv:observeProperty',
  
  /** Set mpv player bounds. Returns: void */
  MPV_SET_BOUNDS: 'mpv:setBounds',
  
  /** Set mpv player visibility. Returns: void */
  MPV_SET_VISIBLE: 'mpv:setVisible',

  // Holy Grail (native mpv + sharedTexture bridge)
  // ========================================

  /** Probe holy grail availability. Returns: { ok, error?, addonPath?, mpvPath?, eglPath?, glesPath?, sharedTexture? } */
  HG_PROBE: 'holyGrail:probe',

  /** Initialize holy grail GPU pipeline. Args: { width?, height? }. Returns: { ok, error?, width?, height? } */
  HG_INIT: 'holyGrail:init',

  /** Resize holy grail GPU surface. Args: { width, height }. Returns: { ok, error?, width?, height?, unchanged? } */
  HG_RESIZE: 'holyGrail:resize',

  /** Load file in holy grail player. Args: filePath. Returns: { ok, error? } */
  HG_LOAD: 'holyGrail:load',

  /** Start holy grail frame loop. Returns: { ok, error?, alreadyRunning? } */
  HG_START_FRAME_LOOP: 'holyGrail:startFrameLoop',

  /** Stop holy grail frame loop. Returns: { ok } */
  HG_STOP_FRAME_LOOP: 'holyGrail:stopFrameLoop',

  /** Send mpv command via holy grail. Args: command array. Returns: { ok, error? } */
  HG_COMMAND: 'holyGrail:command',

  /** Get holy grail mpv property. Args: name. Returns: { ok, value?, error? } */
  HG_GET_PROPERTY: 'holyGrail:getProperty',

  /** Set holy grail mpv property. Args: name, value. Returns: { ok, error? } */
  HG_SET_PROPERTY: 'holyGrail:setProperty',

  /** Get holy grail state. Returns: { ok, state?, error? } */
  HG_GET_STATE: 'holyGrail:getState',

  /** Get holy grail track list. Returns: { ok, tracks?, error? } */
  HG_GET_TRACK_LIST: 'holyGrail:getTrackList',

  /** Observe holy grail property changes. Args: name. Returns: { ok, id?, error? } */
  HG_OBSERVE_PROPERTY: 'holyGrail:observeProperty',

  /** Destroy holy grail player instance (keeps process alive). Returns: { ok } */
  HG_DESTROY: 'holyGrail:destroy',

  /** Set presentation active state (renderer visibility hint). Args: boolean. Returns: { ok, presentationActive } */
  HG_SET_PRESENTATION_ACTIVE: 'holyGrail:setPresentationActive',

  /** Get diagnostics snapshot. Returns: { ok, diagnostics } */
  HG_GET_DIAGNOSTICS: 'holyGrail:getDiagnostics',

  /** Enable/disable diagnostics. Args: boolean. Returns: { ok, diagEnabled } */
  HG_SET_DIAGNOSTICS_ENABLED: 'holyGrail:setDiagnosticsEnabled',

  /** Reset diagnostics counters. Returns: { ok } */
  HG_RESET_DIAGNOSTICS: 'holyGrail:resetDiagnostics',

  // ========================================
  // Player Core (Tankoban Pro)
  // ========================================

  /** Start playback session. Args: mediaRef, opts. Returns: { ok, state? } */
  PLAYER_START: 'player:start',

  /** Play/resume. Returns: { ok, state? } */
  PLAYER_PLAY: 'player:play',

  /** Pause. Returns: { ok, state? } */
  PLAYER_PAUSE: 'player:pause',

  /** Seek to absolute position (seconds or milliseconds). Returns: { ok, state? } */
  PLAYER_SEEK: 'player:seek',

  /** Stop playback. Args: reason?. Returns: { ok, state? } */
  PLAYER_STOP: 'player:stop',

  /** Get current Player Core state. Returns: { ok, state } */
  PLAYER_GET_STATE: 'player:getState',

  /** Launch external Qt player. Args: { filePath, startSeconds, sessionId, progressFile }. Returns: { ok } */
  PLAYER_LAUNCH_QT: 'player:launchQt',

  // ========================================
  // BUILD14: State Save/Restore for Hide-on-Play
  // ========================================

  /** Save return state before hiding. Args: { mode, showRootPath, currentFolderPath, scrollTop, selectedItemId, selectedItemPath }. Returns: { ok, statePath } */
  BUILD14_SAVE_RETURN_STATE: 'build14:saveReturnState',

  /** Get saved return state. Returns: { ok, state } */
  BUILD14_GET_RETURN_STATE: 'build14:getReturnState',

  /** Clear saved return state. Returns: { ok } */
  BUILD14_CLEAR_RETURN_STATE: 'build14:clearReturnState',

  // ========================================
  // Series Settings
  // ========================================
  
  /** Get all series settings. Returns: object with seriesId keys */
  SERIES_SETTINGS_GET_ALL: 'seriesSettings:getAll',
  
  /** Get settings for a series. Returns: settings object or null */
  SERIES_SETTINGS_GET: 'seriesSettings:get',
  
  /** Save settings for a series. Returns: void */
  SERIES_SETTINGS_SAVE: 'seriesSettings:save',
  
  /** Clear settings for a series. Returns: void */
  SERIES_SETTINGS_CLEAR: 'seriesSettings:clear',



  // ========================================
  // Books OPDS
  // ========================================

  BOOKS_OPDS_GET_FEEDS: 'booksOpds:getFeeds',
  BOOKS_OPDS_ADD_FEED: 'booksOpds:addFeed',
  BOOKS_OPDS_UPDATE_FEED: 'booksOpds:updateFeed',
  BOOKS_OPDS_REMOVE_FEED: 'booksOpds:removeFeed',
  BOOKS_OPDS_FETCH_CATALOG: 'booksOpds:fetchCatalog',

  // ========================================
  // Web Sources (BUILD_WEB)
  // ========================================

  /** Get web sources config. Returns: { ok, sources: Array<{id, name, url, color}> } */
  WEB_SOURCES_GET: 'webSources:get',

  /** Add a web source. Args: { name, url, color? }. Returns: { ok, source? } */
  WEB_SOURCES_ADD: 'webSources:add',

  /** Remove a web source by id. Returns: { ok } */
  WEB_SOURCES_REMOVE: 'webSources:remove',

  /** Update a web source. Args: { id, name?, url?, color? }. Returns: { ok } */
  WEB_SOURCES_UPDATE: 'webSources:update',

  /** Route a downloaded file via in-app destination picker. Args: { suggestedFilename }. Returns: { ok, destination?, library? } */
  WEB_DOWNLOAD_ROUTE: 'webDownload:route',

  /** Get download destination folders for each library type. Returns: { ok, books?: string, comics?: string } */
  WEB_DOWNLOAD_DESTINATIONS: 'webDownload:destinations',

  /** Download directly from a URL using in-app destination picker. Args: { url, referer?, suggestedFilename?, title? }. Returns: { ok, id } */
  WEB_DOWNLOAD_DIRECT_URL: 'webDownload:downloadDirectUrl',

  /** Get persisted download history. Returns: { ok, downloads: Array } */
  WEB_DOWNLOAD_HISTORY_GET: 'webDownload:historyGet',

  /** Clear persisted download history (keeps active downloads). Returns: { ok } */
  WEB_DOWNLOAD_HISTORY_CLEAR: 'webDownload:historyClear',

  /** Remove a single download history entry by id. Args: { id }. Returns: { ok } */
  WEB_DOWNLOAD_HISTORY_REMOVE: 'webDownload:historyRemove',

  /** Pause an active download. Args: { id }. Returns: { ok, error? } */
  WEB_DOWNLOAD_PAUSE: 'webDownload:pause',

  /** Resume a paused download. Args: { id }. Returns: { ok, error? } */
  WEB_DOWNLOAD_RESUME: 'webDownload:resume',

  /** Cancel an active download. Args: { id }. Returns: { ok, error? } */
  WEB_DOWNLOAD_CANCEL: 'webDownload:cancel',

  /** Request an in-app destination folder selection. Args: { kind?, suggestedFilename?, modeHint? }. Returns: { ok, folderPath?, library?, cancelled?, error? } */
  WEB_DOWNLOAD_PICK_FOLDER: 'webDownload:pickFolder',

  /** List subfolders for picker navigation. Args: { mode, path }. Returns: { ok, folders: Array<{name,path}> } */
  WEB_DOWNLOAD_PICKER_LIST_FOLDERS: 'webDownload:pickerListFolders',

  /** Resolve pending picker request from renderer UI. Args: { requestId, ok?, cancelled?, mode?, folderPath?, error? } */
  WEB_DOWNLOAD_PICKER_RESOLVE: 'webDownload:pickerResolve',

  // ========================================
  // Web Browser Settings
  // ========================================

  /** Get browser settings. Returns: { ok, settings } */
  WEB_BROWSER_SETTINGS_GET: 'webBrowserSettings:get',

  /** Save browser settings. Args: partial settings. Returns: { ok, settings } */
  WEB_BROWSER_SETTINGS_SAVE: 'webBrowserSettings:save',

  // ========================================
  // Web Browsing History
  // ========================================

  /** List browsing history. Args: { query?, limit?, offset?, from?, to? }. Returns: { ok, entries, total } */
  WEB_HISTORY_LIST: 'webHistory:list',

  /** Add one browsing history entry. Args: { url, title?, visitedAt?, sourceTabId? }. Returns: { ok, entry } */
  WEB_HISTORY_ADD: 'webHistory:add',

  /** Clear browsing history. Args: { from?, to? }. Returns: { ok } */
  WEB_HISTORY_CLEAR: 'webHistory:clear',

  /** Remove a browsing history entry. Args: { id }. Returns: { ok } */
  WEB_HISTORY_REMOVE: 'webHistory:remove',

  // ========================================
  // Web Session
  // ========================================

  /** Get browser session state. Returns: { ok, state } */
  WEB_SESSION_GET: 'webSession:get',

  /** Save browser session state. Args: { state }. Returns: { ok, state } */
  WEB_SESSION_SAVE: 'webSession:save',

  /** Clear browser session state. Returns: { ok } */
  WEB_SESSION_CLEAR: 'webSession:clear',

  // ========================================
  // Web Bookmarks
  // ========================================

  /** List web bookmarks. Returns: { ok, bookmarks } */
  WEB_BOOKMARKS_LIST: 'webBookmarks:list',

  /** Add a web bookmark. Args: bookmark payload. Returns: { ok, bookmark } */
  WEB_BOOKMARKS_ADD: 'webBookmarks:add',

  /** Update a web bookmark. Args: { id, ...changes }. Returns: { ok, bookmark } */
  WEB_BOOKMARKS_UPDATE: 'webBookmarks:update',

  /** Remove a web bookmark. Args: { id }. Returns: { ok } */
  WEB_BOOKMARKS_REMOVE: 'webBookmarks:remove',

  /** Toggle bookmark by URL. Args: { url, title?, folder? }. Returns: { ok, added, bookmark? } */
  WEB_BOOKMARKS_TOGGLE: 'webBookmarks:toggle',

  // ========================================
  // Web Find-In-Page
  // ========================================

  /** Find in active page. Args: { action: find|next|prev|stop, query? }. Returns: { ok, result? } */
  WEB_FIND_IN_PAGE: 'webFind:inPage',

  // ========================================
  // Web Privacy / Data
  // ========================================

  /** Clear browsing data. Args: { from?, to?, kinds? }. Returns: { ok, cleared } */
  WEB_CLEAR_BROWSING_DATA: 'webData:clear',

  /** Get browsing data usage. Returns: { ok, usage } */
  WEB_BROWSING_DATA_USAGE: 'webData:usage',

  // ========================================
  // Web Permissions
  // ========================================

  /** List per-origin permission overrides. Returns: { ok, rules } */
  WEB_PERMISSIONS_LIST: 'webPermissions:list',

  /** Set per-origin permission override. Args: { origin, permission, decision }. Returns: { ok } */
  WEB_PERMISSIONS_SET: 'webPermissions:set',

  /** Reset permission overrides. Args: { origin?, permission? }. Returns: { ok } */
  WEB_PERMISSIONS_RESET: 'webPermissions:reset',

  /** Resolve a pending runtime permission prompt. Args: { requestId, decision }. Returns: { ok } */
  WEB_PERMISSIONS_PROMPT_RESOLVE: 'webPermissions:promptResolve',

  // ========================================
  // Web Adblock
  // ========================================

  /** Get adblock status/config. Returns: { ok, ... } */
  WEB_ADBLOCK_GET: 'webAdblock:get',

  /** Enable/disable adblock. Args: { enabled }. Returns: { ok, enabled } */
  WEB_ADBLOCK_SET_ENABLED: 'webAdblock:setEnabled',

  /** Update adblock lists now. Returns: { ok, updatedAt, domains } */
  WEB_ADBLOCK_UPDATE_LISTS: 'webAdblock:updateLists',

  /** Get adblock stats. Returns: { ok, stats } */
  WEB_ADBLOCK_STATS: 'webAdblock:stats',

  // ========================================
  // Web Userscripts (extension-lite)
  // ========================================

  WEB_USERSCRIPTS_GET: 'webUserscripts:get',
  WEB_USERSCRIPTS_SET_ENABLED: 'webUserscripts:setEnabled',
  WEB_USERSCRIPTS_UPSERT: 'webUserscripts:upsert',
  WEB_USERSCRIPTS_REMOVE: 'webUserscripts:remove',
  WEB_USERSCRIPTS_SET_RULE_ENABLED: 'webUserscripts:setRuleEnabled',

  // ========================================
  // WebTorrent
  // ========================================

  /** Start a magnet download. Args: { magnetUri, referer? }. Returns: { ok, id?, error? } */
  WEB_TORRENT_START_MAGNET: 'webTorrent:startMagnet',

  /** Start a .torrent download from URL. Args: { url, referer? }. Returns: { ok, id?, error? } */
  WEB_TORRENT_START_TORRENT_URL: 'webTorrent:startTorrentUrl',

  /** Pause a torrent. Args: { id }. Returns: { ok, error? } */
  WEB_TORRENT_PAUSE: 'webTorrent:pause',

  /** Resume a torrent. Args: { id }. Returns: { ok, error? } */
  WEB_TORRENT_RESUME: 'webTorrent:resume',

  /** Cancel a torrent. Args: { id }. Returns: { ok, error? } */
  WEB_TORRENT_CANCEL: 'webTorrent:cancel',

  /** Get active torrents. Returns: { ok, torrents } */
  WEB_TORRENT_GET_ACTIVE: 'webTorrent:getActive',

  /** Get torrent history. Returns: { ok, torrents } */
  WEB_TORRENT_GET_HISTORY: 'webTorrent:getHistory',

  /** Clear torrent history. Returns: { ok } */
  WEB_TORRENT_CLEAR_HISTORY: 'webTorrent:clearHistory',

  /** Remove one torrent history entry. Args: { id }. Returns: { ok } */
  WEB_TORRENT_REMOVE_HISTORY: 'webTorrent:removeHistory',

  /** Select/deselect files in a torrent. Args: { id, selectedIndices, destinationRoot? }. Returns: { ok } */
  WEB_TORRENT_SELECT_FILES: 'webTorrent:selectFiles',

  /** Set destination root for a torrent (deferred). Args: { id, destinationRoot }. Returns: { ok } */
  WEB_TORRENT_SET_DESTINATION: 'webTorrent:setDestination',

  /** Stream a torrent file to a destination path. Args: { id, fileIndex, destinationPath }. Returns: { ok, path? } */
  WEB_TORRENT_STREAM_FILE: 'webTorrent:streamFile',

  /** Add torrent to video library. Args: { id, destinationRoot }. Returns: { ok, showPath? } */
  WEB_TORRENT_ADD_TO_VIDEO_LIBRARY: 'webTorrent:addToVideoLibrary',

  /** Cancel active torrent + remove from history. Args: { id }. Returns: { ok } */
  WEB_TORRENT_REMOVE: 'webTorrent:remove',

  /** Pause all active torrents. Returns: { ok } */
  WEB_TORRENT_PAUSE_ALL: 'webTorrent:pauseAll',

  /** Resume all paused torrents. Returns: { ok } */
  WEB_TORRENT_RESUME_ALL: 'webTorrent:resumeAll',

  /** Get peer list for a torrent. Args: { id }. Returns: { ok, peers } */
  WEB_TORRENT_GET_PEERS: 'webTorrent:getPeers',

  /** Get DHT node count. Returns: number */
  WEB_TORRENT_GET_DHT_NODES: 'webTorrent:getDhtNodes',

  /** Open folder picker for torrent save location. Returns: { ok, path? } or { ok:false, cancelled } */
  WEB_TORRENT_SELECT_SAVE_FOLDER: 'webTorrent:selectSaveFolder',

  /** Resolve metadata only (two-step add). Args: source (magnet URI or file path). Returns: { ok, resolveId, name, infoHash, totalSize, files } */
  WEB_TORRENT_RESOLVE_METADATA: 'webTorrent:resolveMetadata',

  /** Start download with user-selected files/path after metadata resolve. Args: { resolveId, savePath?, selectedFiles? }. Returns: { ok, id? } */
  WEB_TORRENT_START_CONFIGURED: 'webTorrent:startConfigured',

  /** Cancel a pending metadata resolution. Args: { resolveId }. Returns: { ok } */
  WEB_TORRENT_CANCEL_RESOLVE: 'webTorrent:cancelResolve',

  /** Show torrent save folder in OS file manager. Args: { savePath }. Returns: void */
  WEB_TORRENT_OPEN_FOLDER: 'webTorrent:openFolder',

  /** Open native OS folder picker dialog. Args: { defaultPath? }. Returns: { ok, path? } or { ok:false, cancelled } */
  WEB_PICK_SAVE_FOLDER: 'web:pickSaveFolder',

  // ========================================
  // Web Search History (omnibox suggestions)
  // ========================================

  /** Get omnibox suggestions for input. Args: input string. Returns: [{ type, text, url?, favicon? }] */
  WEB_SEARCH_SUGGEST: 'webSearch:suggest',

  /** Record a search query. Args: query string. Returns: void */
  WEB_SEARCH_ADD: 'webSearch:add',

  // ========================================
  // Torrent Search (Sources mode / Jackett)
  // ========================================

  /** Query torrent search backend. Args: { query, category, limit, page }. Returns: { ok, items?, error? } */
  TORRENT_SEARCH_QUERY: 'torrentSearch:query',

  /** Check torrent search backend health/config. Returns: { ok, ready, error?, details? } */
  TORRENT_SEARCH_HEALTH: 'torrentSearch:health',

  // ========================================
  // Web Browser Actions
  // ========================================

  /** Dispatch context menu action to a webContents. Args: { webContentsId, action, payload? }. Returns: void */
  WEB_CTX_ACTION: 'web:ctxAction',

  /** Print page to PDF. Args: { webContentsId }. Returns: { ok, path? } */
  WEB_PRINT_PDF: 'web:printPdf',

  /** Screenshot page. Args: { webContentsId }. Returns: { ok, path? } */
  WEB_CAPTURE_PAGE: 'web:capturePage',

  /** Open a downloaded file. Args: { savePath }. Returns: void */
  WEB_DOWNLOAD_OPEN_FILE: 'webDownload:openFile',

  /** Show downloaded file in OS file manager. Args: { savePath }. Returns: void */
  WEB_DOWNLOAD_SHOW_IN_FOLDER: 'webDownload:showInFolder',

  // ========================================
  // Tor Proxy (FEAT-TOR)
  // ========================================

  /** Start Tor proxy. Returns: { ok, error? } */
  TOR_PROXY_START: 'torProxy:start',

  /** Stop Tor proxy. Returns: { ok, error? } */
  TOR_PROXY_STOP: 'torProxy:stop',

  /** Get Tor proxy status. Returns: { ok, active, bootstrapProgress? } */
  TOR_PROXY_GET_STATUS: 'torProxy:getStatus',

  // ========================================
  // Audiobooks (FEAT-AUDIOBOOK)
  // ========================================

  /** Get audiobook library state snapshot. Returns: { audiobookRootFolders, audiobooks, scanning, ... } */
  AUDIOBOOK_GET_STATE: 'audiobook:getState',

  /** Start audiobook library scan. Returns: { ok: boolean } */
  AUDIOBOOK_SCAN: 'audiobook:scan',

  /** Add audiobook root folder via dialog. Returns: { ok: boolean, state?: object } */
  AUDIOBOOK_ADD_ROOT_FOLDER: 'audiobook:addRootFolder',

  /** Add single audiobook folder via dialog. Returns: { ok: boolean, state?: object } */
  AUDIOBOOK_ADD_FOLDER: 'audiobook:addFolder',

  /** Remove audiobook root folder. Returns: { ok: boolean, state?: object } */
  AUDIOBOOK_REMOVE_ROOT_FOLDER: 'audiobook:removeRootFolder',

  // ========================================
  // Audiobook Progress (FEAT-AUDIOBOOK)
  // ========================================

  /** Get all audiobook progress. Returns: { [abId]: progress } */
  AUDIOBOOK_PROGRESS_GET_ALL: 'audiobookProgress:getAll',

  /** Get progress for an audiobook. Returns: progress object or null */
  AUDIOBOOK_PROGRESS_GET: 'audiobookProgress:get',

  /** Save progress for an audiobook. Returns: { ok: boolean } */
  AUDIOBOOK_PROGRESS_SAVE: 'audiobookProgress:save',

  /** Clear progress for an audiobook. Returns: { ok: boolean } */
  AUDIOBOOK_PROGRESS_CLEAR: 'audiobookProgress:clear',

  // ========================================
  // Audiobook Chapter Pairing (FEAT-AUDIOBOOK)
  // ========================================

  /** Get chapter pairing for a book. Returns: pairing object or null */
  AUDIOBOOK_PAIRING_GET: 'audiobookPairing:get',

  /** Save chapter pairing for a book. Returns: { ok: boolean } */
  AUDIOBOOK_PAIRING_SAVE: 'audiobookPairing:save',

  /** Delete chapter pairing for a book. Returns: { ok: boolean } */
  AUDIOBOOK_PAIRING_DELETE: 'audiobookPairing:delete',

  /** Get all chapter pairings. Returns: { [bookId]: pairing } */
  AUDIOBOOK_PAIRING_GET_ALL: 'audiobookPairing:getAll',
};

/**
 * EVENT — Push/event channels
 * Used for: webContents.send(...) and ipcRenderer.on(...)
 */
const EVENT = {
  // ========================================
  // Library Events
  // ========================================
  
  /** Library state has been updated. Payload: library state object */
  LIBRARY_UPDATED: 'library:updated',
  
  /** Library scan status update. Payload: { scanning: boolean, progress?: object } */
  LIBRARY_SCAN_STATUS: 'library:scanStatus',

  // ========================================
  // Books Events
  // ========================================

  /** Books state has been updated. Payload: books state object */
  BOOKS_UPDATED: 'books:updated',

  /** Books scan status update. Payload: { scanning: boolean, progress?: object } */
  BOOKS_SCAN_STATUS: 'books:scanStatus',

  // ========================================
  // App Events
  // ========================================
  
  /** App received open files event. Payload: { paths: string[], source: string } */
  APP_OPEN_FILES: 'app:openFiles',

  /** Build14 player exited event (restore return state in renderer). */
  BUILD14_PLAYER_EXITED: 'build14:playerExited',

  // ========================================
  // Video Events
  // ========================================
  
  /** Video state has been updated. Payload: video state object */
  VIDEO_UPDATED: 'video:updated',

  /** Video progress updated (save/clear). Payload: { videoId: string, progress: object|null } or { allCleared: true } */
  VIDEO_PROGRESS_UPDATED: 'videoProgress:updated',
  
  /** Video shell should play content. Payload: play configuration object */
  VIDEO_SHELL_PLAY: 'videoShell:play',
  
  /** Video scan status update. Payload: { scanning: boolean, progress?: object } */
  VIDEO_SCAN_STATUS: 'video:scanStatus',

  /** Folder thumbnail updated. Payload: { folderPath, thumbPath, timestamp } */
  VIDEO_FOLDER_THUMBNAIL_UPDATED: 'video:folderThumbnailUpdated',

  /** Holy grail property change. Payload: { name: string, value: any } */
  HG_PROPERTY_CHANGE: 'holyGrail:propertyChange',

  /** Holy grail reached EOF. Payload: { ok?: boolean, reason?: string } */
  HG_EOF: 'holyGrail:eof',

  /** Holy grail file loaded. Payload: { ok?: boolean } */
  HG_FILE_LOADED: 'holyGrail:fileLoaded',

  /** Holy grail diagnostics snapshot. Payload: diagnostics object */
  HG_DIAGNOSTICS: 'holyGrail:diagnostics',

  // ========================================
  // Dynamic/Templated Events
  // ========================================
  
  /**
   * mpv event channel (dynamic per player).
   * @param {string} playerId - The mpv player ID
   * @returns {string} Channel name like 'mpv:event:player_1'
   */
  mpvEvent: (playerId) => `mpv:event:${playerId}`,
  


  // ========================================
  // Books OPDS Events
  // ========================================

  BOOKS_OPDS_FEEDS_UPDATED: 'booksOpds:feedsUpdated',

  // ========================================
  // Web Events (BUILD_WEB)
  // ========================================

  /** Web sources config updated. Payload: { sources: Array } */
  WEB_SOURCES_UPDATED: 'webSources:updated',

  /** Download completed. Payload: { filename, destination?, library?, error? } */
  // BUILD_WEB_PARITY
  WEB_DOWNLOAD_STARTED: 'webDownload:started',
  WEB_DOWNLOAD_PROGRESS: 'webDownload:progress',
  WEB_DOWNLOAD_COMPLETED: 'webDownload:completed',
  WEB_DOWNLOADS_UPDATED: 'webDownload:listUpdated',
  WEB_POPUP_OPEN: 'web:popupOpen',
  WEB_DOWNLOAD_PICKER_REQUEST: 'webDownload:pickerRequest',
  WEB_HISTORY_UPDATED: 'webHistory:updated',
  WEB_SESSION_UPDATED: 'webSession:updated',
  WEB_BOOKMARKS_UPDATED: 'webBookmarks:updated',
  WEB_FIND_RESULT: 'webFind:result',
  WEB_PERMISSIONS_UPDATED: 'webPermissions:updated',
  WEB_PERMISSION_PROMPT: 'webPermissions:prompt',
  WEB_ADBLOCK_UPDATED: 'webAdblock:updated',
  WEB_USERSCRIPTS_UPDATED: 'webUserscripts:updated',
  WEB_TORRENT_STARTED: 'webTorrent:started',
  WEB_TORRENT_PROGRESS: 'webTorrent:progress',
  WEB_TORRENT_COMPLETED: 'webTorrent:completed',
  WEB_TORRENTS_UPDATED: 'webTorrent:listUpdated',
  WEB_TORRENT_METADATA: 'webTorrent:metadata',
  WEB_TORRENT_STREAM_READY: 'webTorrent:streamReady',

  // FEAT-BROWSER: Events from main process for integrated browser
  /** Context menu params forwarded from webContents. Payload: { webContentsId, screenX, screenY, x, y, linkURL, srcURL, ... } */
  WEB_CTX_MENU: 'web:contextMenu',
  /** New-window request → create tab. Payload: { url, disposition } */
  WEB_CREATE_TAB: 'web:createTab',
  /** Magnet link intercepted. Payload: magnetUri string */
  WEB_MAGNET_DETECTED: 'web:magnetDetected',
  /** .torrent file downloaded to temp. Payload: filePath string */
  WEB_TORRENT_FILE_DETECTED: 'web:torrentFileDetected',

  /** Torrent search backend status changed. Payload: { ready, error?, details? } */
  TORRENT_SEARCH_STATUS_CHANGED: 'torrentSearch:statusChanged',

  // FEAT-TOR
  /** Tor proxy status changed. Payload: { active, bootstrapProgress? } */
  TOR_PROXY_STATUS_CHANGED: 'torProxy:statusChanged',

  // ========================================
  // Audiobook Events (FEAT-AUDIOBOOK)
  // ========================================

  /** Audiobook library state updated. Payload: audiobook state snapshot */
  AUDIOBOOK_UPDATED: 'audiobook:updated',

  /** Audiobook scan status update. Payload: { scanning: boolean, progress?: object } */
  AUDIOBOOK_SCAN_STATUS: 'audiobook:scanStatus',

};

// ========================================
// V2 Alias Contracts (strict-compat migration layer)
// ========================================
// New feature-scoped names point to existing channels/events.
// Existing names remain the canonical runtime values for compatibility.
const CHANNEL_V2 = Object.freeze({
  SOURCES_SEARCH_QUERY: CHANNEL.TORRENT_SEARCH_QUERY,
  SOURCES_SEARCH_HEALTH: CHANNEL.TORRENT_SEARCH_HEALTH,

  TORRENT_START_MAGNET: CHANNEL.WEB_TORRENT_START_MAGNET,
  TORRENT_START_URL: CHANNEL.WEB_TORRENT_START_TORRENT_URL,
  TORRENT_GET_ACTIVE: CHANNEL.WEB_TORRENT_GET_ACTIVE,
  TORRENT_GET_HISTORY: CHANNEL.WEB_TORRENT_GET_HISTORY,
  TORRENT_SELECT_FILES: CHANNEL.WEB_TORRENT_SELECT_FILES,
  TORRENT_SET_DESTINATION: CHANNEL.WEB_TORRENT_SET_DESTINATION,
  TORRENT_REMOVE: CHANNEL.WEB_TORRENT_REMOVE,
  TORRENT_RESOLVE_METADATA: CHANNEL.WEB_TORRENT_RESOLVE_METADATA,
  TORRENT_START_CONFIGURED: CHANNEL.WEB_TORRENT_START_CONFIGURED,

  VIDEO_GET_STATE: CHANNEL.VIDEO_GET_STATE,
  VIDEO_SETTINGS_GET: CHANNEL.VIDEO_SETTINGS_GET,
  VIDEO_SETTINGS_SAVE: CHANNEL.VIDEO_SETTINGS_SAVE,

  BROWSER_SETTINGS_GET: CHANNEL.WEB_BROWSER_SETTINGS_GET,
  BROWSER_SETTINGS_SAVE: CHANNEL.WEB_BROWSER_SETTINGS_SAVE,
});

const EVENT_V2 = Object.freeze({
  SOURCES_STATUS_CHANGED: EVENT.TORRENT_SEARCH_STATUS_CHANGED,
  TORRENT_STARTED: EVENT.WEB_TORRENT_STARTED,
  TORRENT_PROGRESS: EVENT.WEB_TORRENT_PROGRESS,
  TORRENT_COMPLETED: EVENT.WEB_TORRENT_COMPLETED,
  TORRENT_LIST_UPDATED: EVENT.WEB_TORRENTS_UPDATED,
  TORRENT_METADATA: EVENT.WEB_TORRENT_METADATA,
  VIDEO_UPDATED: EVENT.VIDEO_UPDATED,
});

const DEPRECATED_CHANNEL_ALIASES = Object.freeze({
  WEB_TORRENT_START_MAGNET: 'TORRENT_START_MAGNET',
  WEB_TORRENT_GET_ACTIVE: 'TORRENT_GET_ACTIVE',
  WEB_TORRENT_GET_HISTORY: 'TORRENT_GET_HISTORY',
  WEB_TORRENT_SELECT_FILES: 'TORRENT_SELECT_FILES',
  WEB_TORRENT_REMOVE: 'TORRENT_REMOVE',
  TORRENT_SEARCH_QUERY: 'SOURCES_SEARCH_QUERY',
  TORRENT_SEARCH_HEALTH: 'SOURCES_SEARCH_HEALTH',
  WEB_BROWSER_SETTINGS_GET: 'BROWSER_SETTINGS_GET',
  WEB_BROWSER_SETTINGS_SAVE: 'BROWSER_SETTINGS_SAVE',
});

const DEPRECATED_EVENT_ALIASES = Object.freeze({
  WEB_TORRENT_STARTED: 'TORRENT_STARTED',
  WEB_TORRENT_PROGRESS: 'TORRENT_PROGRESS',
  WEB_TORRENT_COMPLETED: 'TORRENT_COMPLETED',
  WEB_TORRENTS_UPDATED: 'TORRENT_LIST_UPDATED',
  TORRENT_SEARCH_STATUS_CHANGED: 'SOURCES_STATUS_CHANGED',
});

// Export as CommonJS for Build 74/75 compatibility
module.exports = {
  CHANNEL,
  EVENT,
  CHANNEL_V2,
  EVENT_V2,
  DEPRECATED_CHANNEL_ALIASES,
  DEPRECATED_EVENT_ALIASES,
};
