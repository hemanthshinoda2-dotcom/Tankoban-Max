# Third-Party Notices

This project uses or adapts code and assets from the following third-party
projects. Use of third-party names is for identification purposes only and
does not imply endorsement by any third-party project or organization.

---

## Readium CSS

- **Project:** Readium CSS
- **Source:** https://github.com/readium/readium-css
- **Copyright:** Copyright (c) 2017, Readium Foundation. All rights reserved.
- **License:** BSD-3-Clause
- **What was used:**
  - ReadiumCSS stylesheet modules (`ReadiumCSS-before.css`, `ReadiumCSS-default.css`,
    `ReadiumCSS-after.css`) distributed in `src/vendor/readiumcss/`
  - ReadiumCSS flag variable naming conventions used in `engine_foliate.js`

```
BSD 3-Clause License

Copyright (c) 2017, Readium Foundation
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## foliate-js

- **Project:** foliate-js
- **Source:** https://github.com/johnfactotum/foliate-js
- **License:** MIT
- **License file:** `src/vendor/foliate/LICENSE`
- **What was used:**
  - EPUB rendering engine (`paginator.js`, `overlayer.js`, `tts.js`, etc.) distributed in `src/vendor/foliate/`
- **Local patches:**
  - `paginator.js`: Added `scrollToAnchorCentered()` method for TTS vertical centering in scrolled mode (FIX-TTS03)
  - `paginator.js`: Added double-hit boundary guard for chapter auto-advance in scrolled mode (FIX-TTS03)
  - `paginator.js`: Changed `scrollToAnchorCentered()` scroll reason from `'selection'` to `'anchor'` to prevent native DOM selection (blue highlight glitch) during TTS (FIX-TTS08)
  - `tts.js`: Added `snapshotRanges()` method to TTS class for preload-safe word tracking (FIX-TTS04)

---

## Bundled Fonts (via ReadiumCSS)

### AccessibleDfA

- **Copyright:** Copyright (c) Orange 2015
- **License:** SIL Open Font License 1.1
- **License file:** `src/vendor/readiumcss/fonts/LICENSE-AccessibleDfa`

### iA Writer Duospace

- **Copyright:** Copyright (c) 2017 IBM Corp. (Reserved Font Name "Plex")
- **License:** SIL Open Font License 1.1 + Apache License 2.0
- **License file:** `src/vendor/readiumcss/fonts/LICENSE-IaWriterDuospace.md`
