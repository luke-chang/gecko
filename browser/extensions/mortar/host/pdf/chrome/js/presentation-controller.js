/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

class PresentationController {
  constructor(viewport) {
    this._mouseScrollTimeStamp = 0;
    this._mouseScrollDelta = 0;

    this._viewport = viewport;
    viewport.onFullscreenChange = this._onViewportFullscreenChange.bind(this);
  }

  _onViewportFullscreenChange(fullscreen) {
    if (fullscreen) {
      window.addEventListener('wheel', this);
      window.addEventListener('mousedown', this, true);
      window.addEventListener('mousemove', this, true);
    } else {
      window.removeEventListener('wheel', this);
      window.removeEventListener('mousedown', this, true);
      window.removeEventListener('mousemove', this, true);
    }
  }

  _normalizeWheelEventDelta(evt) {
    let MOUSE_PIXELS_PER_LINE = 30;
    let MOUSE_LINES_PER_PAGE = 30;

    let delta = Math.sqrt(evt.deltaX * evt.deltaX + evt.deltaY * evt.deltaY);
    let angle = Math.atan2(evt.deltaY, evt.deltaX);
    if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
      // All that is left-up oriented has to change the sign.
      delta = -delta;
    }

    // Converts delta to per-page units
    if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
      delta /= MOUSE_PIXELS_PER_LINE * MOUSE_LINES_PER_PAGE;
    } else if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta /= MOUSE_LINES_PER_PAGE;
    }
    return delta;
  }

  _handleMouseWheel(evt) {
    evt.stopImmediatePropagation();
    evt.preventDefault();

    let MOUSE_SCROLL_COOLDOWN_TIME = 50;
    let PAGE_SWITCH_THRESHOLD = 0.1;

    let currentTime = Date.now();

    // If we've already switched page, avoid accidentally switching again.
    if (currentTime > this._mouseScrollTimeStamp &&
        currentTime - this._mouseScrollTimeStamp < MOUSE_SCROLL_COOLDOWN_TIME) {
      return;
    }

    let delta = this._normalizeWheelEventDelta(evt);

    // If the scroll direction changed, reset the accumulated scroll delta.
    if ((this._mouseScrollDelta > 0 && delta < 0) ||
        (this._mouseScrollDelta < 0 && delta > 0)) {
      this._mouseScrollDelta = 0;
      this._mouseScrollTimeStamp = 0;
    }
    this._mouseScrollDelta += delta;

    if (Math.abs(this._mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
      let success = this._mouseScrollDelta > 0 ? this._goToPreviousPage()
                                               : this._goToNextPage();
      this._mouseScrollDelta = 0;
      this._mouseScrollTimeStamp = success ? currentTime : 0;
    }
  }

  _handleMouseDown(evt) {
    if (evt.button !== 0) {
      return;
    }

    evt.stopImmediatePropagation();
    evt.preventDefault();

    if (evt.shiftKey) {
      this._goToPreviousPage();
    } else {
      this._goToNextPage();
    }
  }

  _goToPreviousPage() {
    if (this._viewport.page <= 0) {
      return false;
    }
    this._viewport.page--;
    return true;
  }

  _goToNextPage() {
    if (this._viewport.page >= this._viewport.pageCount - 1) {
      return false;
    }
    this._viewport.page++;
    return true;
  }

  handleEvent(evt) {
    switch(evt.type) {
      case 'wheel':
        this._handleMouseWheel(evt);
        break;
      case 'mousedown':
        this._handleMouseDown(evt);
        break;
      case 'mousemove':
        evt.stopImmediatePropagation();
        break;
    }
  }
}
