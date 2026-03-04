'use strict';

module.exports = {
  name: 'feature-book-reader',
  section: 'book',
  ownership: 'EPUB/PDF/TXT books library and reader modules including annotations and TTS.',
  current: {
    renderer: ['src/domains/books/library.js', 'src/domains/books/reader'],
    main: [
      'main/domains/books/index.js',
      'main/domains/booksProgress/index.js',
      'main/domains/booksBookmarks/index.js',
      'main/domains/booksAnnotations/index.js',
      'main/domains/booksSettings/index.js',
      'main/domains/booksTtsEdge/index.js',
      'main/domains/booksTtsProgress/index.js',
      'main/domains/booksOpds/index.js',
    ],
    preload: ['preload/namespaces/books.js', 'preload/namespaces/books_metadata.js'],
  },
};

