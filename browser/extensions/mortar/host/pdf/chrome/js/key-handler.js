/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

class KeyHandler {
  constructor(viewport, toolbar) {
    this._viewport = viewport;
    this._toolbar = toolbar;
    window.addEventListener('keydown', this);
  }

  handleEvent(evt) {
    let modifiers = (evt.ctrlKey ? 1 : 0) |
                    (evt.altKey ? 2 : 0) |
                    (evt.shiftKey ? 4 : 0) |
                    (evt.metaKey ? 8 : 0);

    let handled = false;
    let ensureViewportFocused = false;

    // either CTRL or META key with optional SHIFT.
    if (!this._viewport.fullscreen && [1, 8, 5, 12].includes(modifiers)) {
      switch (evt.keyCode) {
        case KeyEvent.DOM_VK_F:
          this._toolbar.showFindbar();
          handled = true;
          break;
        case KeyEvent.DOM_VK_G:
          this._toolbar.findNext();
          handled = true;
          break;
        case KeyEvent.DOM_VK_EQUALS:
        case KeyEvent.DOM_VK_ADD:
        case KeyEvent.DOM_VK_PLUS: // German keyboard
          this._toolbar.zoomIn();
          handled = true;
          break;
        case KeyEvent.DOM_VK_SUBTRACT:
        case KeyEvent.DOM_VK_HYPHEN_MINUS: // Mac '-'
          this._toolbar.zoomOut();
          handled = true;
          break;
        case KeyEvent.DOM_VK_0:
        case KeyEvent.DOM_VK_NUMPAD0:
          this._viewport.fitting = 'auto';
          handled = true;
          break;
      }
    }

    // CTRL or META without shift
    if (modifiers === 1 || modifiers === 8) {
      switch (evt.keyCode) {
        case KeyEvent.DOM_VK_S:
          this._viewport.save();
          handled = true;
          break;
      }
    }

    if (modifiers === 0 && evt.keyCode === KeyEvent.DOM_VK_ESCAPE) {
      handled = this._toolbar.hideDoorHangers();
    }

    if (!handled && this._viewport.pageCount > 0) {
      // CTRL+ALT or Option+Command
      if (modifiers === 3 || modifiers === 10) {
        switch(evt.keyCode) {
          case KeyEvent.DOM_VK_P:
            this._viewport.fullscreen = true;
            handled = true;
            break;
          case KeyEvent.DOM_VK_G:
            document.getElementById('pageNumber').focus();
            handled = true;
            break;
        }
      }

      let activeElement = document.activeElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) ||
          this._viewport.hasFormFocused) {
        return;
      }

      let isPageFit = (this._viewport.fitting == 'page-fit');

      if (modifiers === 0) {
        switch(evt.keyCode) {
          /* Page Up */
          case KeyEvent.DOM_VK_UP:
          case KeyEvent.DOM_VK_PAGE_UP:
          case KeyEvent.DOM_VK_BACK_SPACE:
            if (!isPageFit) {
              ensureViewportFocused = true;
              break;
            }
            /* falls through if it's in page-fit mode */
          case KeyEvent.DOM_VK_LEFT:
            if (this._viewport.isHorizontalOverflow) {
              ensureViewportFocused = true;
              break;
            }
            /* falls through if there's no horizontal scrollbar */
          case KeyEvent.DOM_VK_K:
          case KeyEvent.DOM_VK_P:
            this._viewport.page--;
            ensureViewportFocused = true;
            handled = true;
            break;

          /* Page Down */
          case KeyEvent.DOM_VK_DOWN:
          case KeyEvent.DOM_VK_PAGE_DOWN:
          case KeyEvent.DOM_VK_SPACE:
            if (!isPageFit) {
              ensureViewportFocused = true;
              break;
            }
            /* falls through if it's in page-fit mode */
          case KeyEvent.DOM_VK_RIGHT:
            if (this._viewport.isHorizontalOverflow) {
              ensureViewportFocused = true;
              break;
            }
            /* falls through if there's no horizontal scrollbar */
          case KeyEvent.DOM_VK_J:
          case KeyEvent.DOM_VK_N:
            this._viewport.page++;
            ensureViewportFocused = true;
            handled = true;
            break;

          /* Home/End */
          case KeyEvent.DOM_VK_HOME:
            this._viewport.page = 0;
            ensureViewportFocused = true;
            handled = true;
            break;
          case KeyEvent.DOM_VK_END:
            this._viewport.page = this._viewport.pageCount - 1;
            ensureViewportFocused = true;
            handled = true;
            break;

          /* Rotate */
          case KeyEvent.DOM_VK_R:
            this._viewport.rotateClockwise();
            break;
        }
      } else if (modifiers === 4) { // Shift
        switch (evt.keyCode) {
          case KeyEvent.DOM_VK_SPACE:
            if (isPageFit) {
              this._viewport.page--;
              handled = true;
            }
            ensureViewportFocused = true;
            break;
          case KeyEvent.DOM_VK_R:
            this._viewport.rotateCounterClockwise();
            break;
        }
      } else if (modifiers === 1 || modifiers === 8) { // CTRL or Command
        switch(evt.keyCode) {
          case KeyEvent.DOM_VK_A:
            this._viewport.selectAll();
            ensureViewportFocused = true;
            handled = true;
            break;
        }
      }
    }

    if (ensureViewportFocused) {
      this._viewport.focus();
    }

    if (handled) {
      evt.stopImmediatePropagation();
      evt.preventDefault();
    }
  }
}
