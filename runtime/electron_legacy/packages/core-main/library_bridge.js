'use strict';

function triggerLibraryRescan(ctx, library) {
  try {
    var key = String(library || '').trim().toLowerCase();
    if (!key) return;
    if (key === 'books') {
      var booksDomain = require('../../main/domains/books');
      if (booksDomain && typeof booksDomain.scan === 'function') {
        booksDomain.scan(ctx, null, {}).catch(function () {});
      }
      return;
    }
    if (key === 'comics') {
      var libraryDomain = require('../../main/domains/library');
      if (libraryDomain && typeof libraryDomain.scan === 'function') {
        libraryDomain.scan(ctx, null, {}).catch(function () {});
      }
      return;
    }
    if (key === 'videos') {
      var videoDomain = require('../../main/domains/video');
      if (videoDomain && typeof videoDomain.scan === 'function') {
        videoDomain.scan(ctx, null, {}).catch(function () {});
      }
    }
  } catch {}
}

async function addVideoShowFolderPath(ctx, showPath) {
  var p = String(showPath || '').trim();
  if (!p) return { ok: false, error: 'Missing show path' };
  try {
    var videoDomain = require('../../main/domains/video');
    if (!videoDomain || typeof videoDomain.addShowFolderPath !== 'function') {
      return { ok: false, error: 'Video domain unavailable' };
    }
    return await videoDomain.addShowFolderPath(ctx, null, p);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Failed to add show folder') };
  }
}

module.exports = {
  triggerLibraryRescan: triggerLibraryRescan,
  addVideoShowFolderPath: addVideoShowFolderPath,
};

