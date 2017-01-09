/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

class ProgressBar {
  constructor() {
    this._container = document.getElementById('loadingBar');
    this._percentage = this._container.querySelector('.progress');
  }

  show() {
    this._container.classList.remove('hidden');
  }

  hide(waitForTransition) {
    let percentage = this._percentage;
    let doHide = () => {
      this._container.classList.add('hidden');
      percentage.style.width = '';
    };
    if (!waitForTransition) {
      doHide();
    } else {
      percentage.addEventListener('transitionend', function handler() {
        percentage.removeEventListener('transitionend', handler);
        doHide();
      });
    }
  }

  setProgress(progress) {
    if (isNaN(progress) || progress < 0 || progress > 100) {
      this._percentage.classList.add('indeterminate');
      return;
    }
    this._percentage.classList.remove('indeterminate');
    this._percentage.style.width = Math.round(progress) + '%';
  }
}

class DoorHanger {
  constructor(containerId, toogleButtonId) {
    this._container = document.getElementById(containerId);
    this._toggleButton = document.getElementById(toogleButtonId);
    this._visible = false;
  }

  get visible() {
    return this._visible;
  }

  toggle(visible) {
    if (visible === undefined) {
      visible = !this._visible;
    } else if (visible === this._visible) {
      return;
    }
    this._visible = visible;
    this._toggleButton.classList.toggle('toggled', visible);
    this._container.classList.toggle('hidden', !visible);
  }
}

class SecondaryToolbar extends DoorHanger {
  constructor() {
    super('secondaryToolbar', 'secondaryToolbarToggle');
  }

  toggle(visible) {
    super.toggle(visible);

    if (this.visible) {
      window.addEventListener('click', this);
    } else {
      window.removeEventListener('click', this);
    }
  }

  handleEvent(evt) {
    // Hide automatically when a user is not clicking the toggle button. (The
    // handler of the toggle button should take care of hiding it if needed.)
    if (evt.target != this._toggleButton) {
      this.toggle();
    }
  }
}

class Findbar extends DoorHanger {
  constructor(viewport) {
    super('findbar', 'viewFind');

    let elements = ['findInput', 'findMsg', 'findResultsCount', 'findPrevious',
                    'findNext', 'findMatchCase'];

    this._elements = {};
    elements.forEach(id => {
      this._elements[id] = document.getElementById(id);
    });

    this._viewport = viewport;
    this._viewport.onFindResultsCountChanged =
      this._handleFindResultsCountChanged.bind(this);
    this._viewport.onSelectedFindResultChanged =
      this._handleSelectedFindResultChanged.bind(this);

    this._startFindTimer = null;

    this._findDirection = 0;
    this._previousSelectedIndex = -1;

    this._elements.findInput.addEventListener('input', this);
    this._elements.findPrevious.addEventListener('click', this);
    this._elements.findNext.addEventListener('click', this);
    this._elements.findMatchCase.addEventListener('click', this);
  }

  _startFind() {
    if (this._startFindTimer) {
      clearTimeout(this._startFindTimer);
    }

    let text = this._elements.findInput.value;
    if (text == '') {
      this._viewport.stopFind();
      this._updateStatus(0, true);
      return;
    }

    this._findDirection = 0;
    this._previousSelectedIndex = -1;

    this._startFindTimer = setTimeout(() => {
      this._startFindTimer = null;
      this._updateStatus(0);
      this._viewport.startFind(text, this._elements.findMatchCase.checked);
    }, 300);
  }

  _handleFindResultsCountChanged(total, finalResult) {
    this._updateStatus(total, finalResult);
  }

  _handleSelectedFindResultChanged(index) {
    if (this._findDirection > 0 && index < this._previousSelectedIndex) {
      this._updateMessage('find_reached_bottom');
    } else if(this._findDirection < 0 && index > this._previousSelectedIndex) {
      this._updateMessage('find_reached_top');
    } else {
      this._updateMessage('');
    }
    this._previousSelectedIndex = index;
  }

  _updateStatus(findResultsCount, final) {
    let notFound = false;
    let messageL10n = '';
    let status = '';

    if (!final) {
      status = 'pending';
    } else if (this._elements.findInput.value !== '' && !findResultsCount) {
      messageL10n = 'find_not_found';
      notFound = true;
    }

    this._elements.findInput.classList.toggle('notFound', notFound);
    this._elements.findInput.dataset.status = status;

    this._updateMessage(messageL10n);

    if (!findResultsCount) {
      this._elements.findResultsCount.classList.add('hidden');
    } else {
      this._elements.findResultsCount.classList.remove('hidden');
      this._elements.findResultsCount.textContent =
        findResultsCount.toLocaleString();
    }
  }

  _updateMessage(id) {
    if (id) {
      document.l10n.formatValue(id)
        .then(result => this._elements.findMsg.textContent = result);
    } else {
      this._elements.findMsg.textContent = '';
    }
  }

  toggle(visible) {
    super.toggle(visible);

    if (this.visible) {
      this._elements.findInput.select();
      this._elements.findInput.focus();
    }
  }

  findPrevious() {
    this._findDirection = -1;
    this._viewport.selectFindResult(false);
  }

  findNext() {
    this._findDirection = 1;
    this._viewport.selectFindResult(true);
  }

  handleEvent(evt) {
    switch(evt.type) {
      case 'input':
        this._startFind();
        break;
      case 'click':
        switch(evt.target.id) {
          case 'findPrevious':
            this.findPrevious();
            break;
          case 'findNext':
            this.findNext();
            break;
          case 'findMatchCase':
            this._viewport.stopFind();
            this._startFind();
            break;
        }
        break;
    }
  }
}

class ScaleSelect {
  constructor(viewport) {
    this._viewport = viewport;

    this._select = new PolyfillDropdown(document.getElementById('scaleSelect'));
    this._select.addEventListener('change', this);

    this._customScaleOption = document.getElementById('customScaleOption');
    this._customScale = 0;

    this._predefinedOption =
      Array.from(this._select.querySelectorAll('option:not([hidden])'))
        .map(elem => elem.value);
  }

  setScale(scale) {
    if (this._predefinedOption.includes(String(scale))) {
      this._customScale = 0;
      this._select.value = scale;
    } else if (!isNaN(scale)) {
      let customScale = Math.round(scale * 10000) / 100;
      if (customScale != this._customScale) {
        this._customScale = customScale;
        document.l10n.formatValue('page_scale_percent', {scale: customScale})
          .then(result => {
            this._select.value = '';
            this._customScaleOption.textContent = result;
            this._select.value = 'custom';
          });
      }
    }
  }

  handleEvent(evt) {
    switch(evt.type) {
      case 'change':
        let scale = this._select.value;
        if (!isNaN(scale)) {
          // "viewport.fitting" will be set to "none" automatically once
          // assigning a new "zoom".
          this._viewport.zoom = scale;
        } else if (scale != 'custom') {
          this._viewport.fitting = scale;
        }
        break;
    }
  }
}

class Sidebar {
  constructor(viewport, toggleButtonId) {
    this._sidebarContainer = document.getElementById('sidebarContainer');
    this._outerContainer = document.getElementById('outerContainer');
    this._toggleButton = document.getElementById(toggleButtonId);

    this._viewport = viewport;
    this._isMoving = false;
  }

  _triggerViewportResize() {
    this._viewport.invokeResize();
    if (this._isMoving) {
      window.requestAnimationFrame(this._triggerViewportResize.bind(this));
    }
  }

  toggle() {
    if (this._isMoving) {
      return;
    }
    this._isMoving = true;
    this._toggleButton.classList.toggle('toggled');
    this._outerContainer.classList.toggle('sidebarOpen');
    this._outerContainer.classList.add('sidebarMoving');

    let onTransitionEnd = evt => {
      if (evt.target === this._sidebarContainer) {
        this._isMoving = false;
        this._outerContainer.classList.remove('sidebarMoving');
        this._sidebarContainer.removeEventListener('transitionend', onTransitionEnd);
      }
    };
    this._sidebarContainer.addEventListener('transitionend', onTransitionEnd);

    window.requestAnimationFrame(this._triggerViewportResize.bind(this));
  }
}

class OutlineView extends Sidebar {
  constructor(viewport) {
    super(viewport, 'viewOutline');

    this._toggleButton.disabled = true;

    this._header = document.getElementById('outlineLabel');
    this._container = document.getElementById('outlineView');

    this._header.addEventListener('dblclick', this);
    this._viewport.onBookmarksLoaded = this._render.bind(this);
  }

  _toggleAllSubItems(root, show) {
    this._lastToggleIsShow = show;
    for (let toggler of root.querySelectorAll('.outlineItemToggler')) {
      toggler.classList.toggle('outlineItemsHidden', !show);
    }
  }

  _render(bookmarks) {
    let fragment = document.createDocumentFragment();
    let queue = [{ parent: fragment, bookmarks }];
    let hasAnyNesting = false;
    let hasBookmarks = false;

    while (queue.length > 0) {
      let levelData = queue.shift();

      for (let bookmark of levelData.bookmarks) {
        let div = document.createElement('div');
        div.className = 'outlineItem';

        // Add link
        let element = document.createElement('a');
        if (Number.isInteger(bookmark.page)) {
          element.href = '#';
          element.dataset.page = bookmark.page;
        } else if (bookmark.hasOwnProperty('uri')) {
          // TODO
        }
        element.addEventListener('click', this);
        element.textContent = bookmark.title;
        div.appendChild(element);

        hasBookmarks = true;

        if (bookmark.children.length > 0) {
          hasAnyNesting = true;

          // Add toogle button
          let toggler = document.createElement('div');
          toggler.className = 'outlineItemToggler';
          toggler.addEventListener('click', this);
          div.insertBefore(toggler, div.firstChild);

          // Add children's container
          let childrenDiv = document.createElement('div');
          childrenDiv.className = 'outlineItems';
          div.appendChild(childrenDiv);

          queue.push({ parent: childrenDiv, bookmarks: bookmark.children });
        }

        levelData.parent.appendChild(div);
      }
    }

    this._container.classList.toggle('outlineWithDeepNesting', hasAnyNesting);
    this._container.innerHTML = '';
    this._container.appendChild(fragment);

    this._toggleButton.disabled = !hasBookmarks;
    this._lastToggleIsShow = true;
  }

  handleEvent(evt) {
    let target = evt.target;

    evt.stopPropagation();
    evt.preventDefault();

    if (target.id == 'outlineLabel') {
      this._toggleAllSubItems(this._container, !this._lastToggleIsShow);
    } else if (target.classList.contains('outlineItemToggler')) {
      target.classList.toggle('outlineItemsHidden');
      if (evt.shiftKey) {
        let shouldShowAll = !target.classList.contains('outlineItemsHidden');
        this._toggleAllSubItems(target.parentNode, shouldShowAll);
      }
    } else {
      let page = evt.target.dataset.page;
      if (page !== undefined) {
        this._viewport.page = page;
      }
    }
  }
}

class Toolbar {
  constructor(viewport) {
    let elements = [
      'zoomIn', 'zoomOut', 'previous', 'next', 'pageNumber', 'numPages',
      'firstPage', 'lastPage', 'pageRotateCw', 'pageRotateCcw'
    ];

    let disabled = [
      'openFile', 'secondaryOpenFile', 'print', 'secondaryPrint',
      'toggleHandTool', 'documentProperties'
    ];

    this.ZOOM_FACTORS = [
      0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.3, 1.5, 1.7, 1.9, 2.1,
      2.4, 2.7, 3, 3.3, 3.7, 4.1, 4.6, 5.1, 5.7, 6.3, 7, 7.7, 8.5, 9.4, 10
    ];

    this._viewport = viewport;
    this._secondaryToolbar = new SecondaryToolbar();
    this._findbar = new Findbar(viewport);
    this._loadingBar = new ProgressBar();
    this._scaleSelect = new ScaleSelect(viewport);
    this._outlineView = new OutlineView(viewport);

    // Disabled Functions
    disabled.forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('toggleHandTool')
      .previousSibling.previousSibling.classList.add('hidden');
    document.getElementById('documentProperties')
      .previousSibling.previousSibling.classList.add('hidden');

    this._elements = {};
    elements.forEach(id => {
      this._elements[id] = document.getElementById(id);
    });

    let toolbarButtons =
      document.querySelectorAll('.toolbarButton, .secondaryToolbarButton');
    for (let button of toolbarButtons) {
      button.addEventListener('click', this);
    }

    this._elements.pageNumber.addEventListener('focus', this);
    this._elements.pageNumber.addEventListener('change', this);

    this._viewport.onDimensionChanged = this._updateDimensions.bind(this);
    this._viewport.onProgressChanged = this._updateProgress.bind(this);
    this._viewport.onZoomChanged = this._updateToolbar.bind(this);
    this._viewport.onPageChanged = this._updateToolbar.bind(this);

    this._updateToolbar();
  }

  _buttonClicked(id) {
    log(id);

    switch(id) {
      case 'viewOutline':
        this._outlineView.toggle();
        break;
      case 'viewFind':
        this._findbar.toggle();
        break;
      case 'firstPage':
        this._viewport.page = 0;
        break;
      case 'lastPage':
        this._viewport.page = this._viewport.pageCount - 1;
        break;
      case 'previous':
        this._viewport.page--;
        break;
      case 'next':
        this._viewport.page++;
        break;
      case 'zoomIn':
        this.zoomIn();
        break;
      case 'zoomOut':
        this.zoomOut();
        break;
      case 'download':
      case 'secondaryDownload':
        this._viewport.save();
        break;
      case 'pageRotateCw':
        this._viewport.rotateClockwise();
        break;
      case 'pageRotateCcw':
        this._viewport.rotateCounterClockwise();
        break;
      case 'presentationMode':
      case 'secondaryPresentationMode':
        this._viewport.fullscreen = true;
        break;
      case 'secondaryToolbarToggle':
        this._secondaryToolbar.toggle();
        break;
    }
  }

  _pageNumberChanged() {
    let newPage = parseFloat(this._elements.pageNumber.value);
    if (!Number.isInteger(newPage) ||
        newPage < 1 || newPage > this._viewport.pageCount) {
      this._elements.pageNumber.value = this._viewport.page + 1;
      return;
    }
    this._elements.pageNumber.value = newPage;
    this._viewport.page = newPage - 1;
  }

  _updateDimensions() {
    let pageCount = this._viewport.pageCount;
    document.l10n.formatValue('page_of', { pageCount })
      .then(page_of => this._elements.numPages.textContent = page_of);
    this._elements.pageNumber.max = pageCount;
    this._updateToolbar();
  }

  _updateToolbar() {
    let page = this._viewport.page + 1;
    let pageCount = this._viewport.pageCount;

    this._elements.pageNumber.disabled =
      this._elements.pageRotateCw.disabled =
      this._elements.pageRotateCcw.disabled = (pageCount == 0);

    this._elements.pageNumber.value = pageCount ? page : '';
    this._elements.previous.disabled =
      this._elements.firstPage.disabled = (!pageCount || page == 1);
    this._elements.next.disabled =
      this._elements.lastPage.disabled = (!pageCount || page == pageCount);

    let zoom = this._viewport.zoom;
    this._elements.zoomIn.disabled =
      (zoom >= this.ZOOM_FACTORS[this.ZOOM_FACTORS.length - 1]);
    this._elements.zoomOut.disabled = (zoom <= this.ZOOM_FACTORS[0]);

    let fitting = this._viewport.fitting;
    this._scaleSelect.setScale(fitting == 'none' ? zoom : fitting);
  }

  _updateProgress(progress) {
    this._loadingBar.show();
    this._loadingBar.setProgress(progress);

    if (progress == 100) {
      this._loadingBar.hide(true);
    }
  }

  hideDoorHangers() {
    let hadDoorHangerShown =
      this._secondaryToolbar.visible || this._findbar.visible;
    this._secondaryToolbar.toggle(false);
    this._findbar.toggle(false);
    return hadDoorHangerShown;
  }

  showFindbar() {
    this._findbar.toggle(true);
  }

  findNext() {
    this._findbar.findNext();
  }

  zoomIn() {
    let zoom = this._viewport.zoom;
    let newZoom = this.ZOOM_FACTORS.find(factor => (factor - zoom) > 0.049);
    if (!newZoom) {
      newZoom = this.ZOOM_FACTORS[this.ZOOM_FACTORS.length - 1];
    }
    this._viewport.zoom = newZoom;
  }

  zoomOut() {
    let reversedFactors = Array.from(this.ZOOM_FACTORS);
    reversedFactors.reverse();
    let zoom = this._viewport.zoom;
    let newZoom = reversedFactors.find(factor => (zoom - factor) > 0.049);
    if (!newZoom) {
      newZoom = this.ZOOM_FACTORS[0];
    }
    this._viewport.zoom = newZoom;
  }

  handleEvent(evt) {
    let target = evt.target;

    switch(evt.type) {
      case 'change':
        if (target === this._elements.pageNumber) {
          this._pageNumberChanged();
        }
        break;
      case 'focus':
        if (target === this._elements.pageNumber) {
          target.select();
        }
        break;
      case 'click':
        this._buttonClicked(target.id);
        break;
    }
  }
}
