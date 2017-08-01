/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Defines a handler object to represent forms that autofill can handle.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FormAutofillHandler", "FormAutofillHeuristics"];

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://formautofill/FormAutofillUtils.jsm");

const PREF_HEURISTICS_ENABLED = "extensions.formautofill.heuristics.enabled";

// This list should align with the same one in FormAutofillFrameScript.js.
const ALLOWED_TYPES = ["text", "email", "tel", "number"];

const FIELD_NAME_INFO = Object.assign({}, FormAutofillUtils.FIELD_NAME_INFO);
const AUTOFILL_FIELDS_THRESHOLD = FormAutofillUtils.AUTOFILL_FIELDS_THRESHOLD;

this.log = null;
FormAutofillUtils.defineLazyLogGetter(this, this.EXPORTED_SYMBOLS[0]);

/**
 * Handles profile autofill for a DOM Form element.
 * @param {FormLike} form Form that need to be auto filled
 */
function FormAutofillHandler(form) {
  this.form = form;
  this.fieldDetails = [];
  this.winUtils = this.form.rootElement.ownerGlobal.QueryInterface(Ci.nsIInterfaceRequestor)
    .getInterface(Ci.nsIDOMWindowUtils);
}

FormAutofillHandler.prototype = {
  /**
   * DOM Form element to which this object is attached.
   */
  form: null,

  _formFieldCount: 0,

  /**
   * Array of collected data about relevant form fields.  Each item is an object
   * storing the identifying details of the field and a reference to the
   * originally associated element from the form.
   *
   * The "section", "addressType", "contactType", and "fieldName" values are
   * used to identify the exact field when the serializable data is received
   * from the backend.  There cannot be multiple fields which have
   * the same exact combination of these values.
   *
   * A direct reference to the associated element cannot be sent to the user
   * interface because processing may be done in the parent process.
   */
  fieldDetails: null,

  /**
   * Similiar to `fieldDetails`, and `addressFieldDetails` contains the address
   * records only.
   */
  addressFieldDetails: null,

  /**
   * Similiar to `fieldDetails`, and `creditCardFieldDetails` contains the
   * Credit Card records only.
   */
  creditCardFieldDetails: null,

  get isValidAddressForm() {
    return this.addressFieldDetails.length > AUTOFILL_FIELDS_THRESHOLD;
  },

  get isValidCreditCardForm() {
    return this.creditCardFieldDetails.some(i => i.fieldName == "cc-number");
  },

  /**
   * String of the filled profile's guid.
   */
  filledProfileGUID: null,

  /**
   * A WindowUtils reference of which Window the form belongs
   */
  winUtils: null,

  /**
   * Enum for form autofill MANUALLY_MANAGED_STATES values
   */
  fieldStateEnum: {
    // not themed
    NORMAL: null,
    // highlighted
    AUTO_FILLED: "-moz-autofill",
    // highlighted && grey color text
    PREVIEW: "-moz-autofill-preview",
  },

  get isFormChangedSinceLastCollection() {
    // When the number of form controls is the same with last collection, it
    // can be recognized as there is no element changed. However, we should
    // improve the function to detect the element changes. e.g. a tel field
    // is changed from type="hidden" to type="tel".
    return this._formFieldCount != this.form.elements.length;
  },

  /**
   * Set fieldDetails from the form about fields that can be autofilled.
   *
   * @returns {Object}
   *          An object containing addressFieldDetails and creditCardFieldDetails
   *          for the later use.
   */
  collectFormFields() {
    this._cacheValue.allFieldNames = null;
    this._formFieldCount = this.form.elements.length;
    let fieldDetails = FormAutofillHeuristics.getFormInfo(this.form);
    this.fieldDetails = fieldDetails ? fieldDetails : [];

    this.addressFieldDetails = this.fieldDetails.filter(
      detail => this.isAddressField(detail.fieldName)
    );
    this.creditCardFieldDetails = this.fieldDetails.filter(
      detail => this.isCreditCardField(detail.fieldName)
    );

    return {
      addressFieldDetails: this.isValidAddressForm ? this.addressFieldDetails : null,
      creditCardFieldDetails: this.isValidCreditCardForm ? this.creditCardFieldDetails : null,
    };
  },

  getFieldDetailByName(fieldName) {
    return this.fieldDetails.find(detail => detail.fieldName == fieldName);
  },

  _cacheValue: {
    allFieldNames: null,
    oneLineStreetAddress: null,
  },

  get allFieldNames() {
    if (!this._cacheValue.allFieldNames) {
      this._cacheValue.allFieldNames = this.fieldDetails.map(record => record.fieldName);
    }
    return this._cacheValue.allFieldNames;
  },

  _getOneLineStreetAddress(address) {
    if (!this._cacheValue.oneLineStreetAddress) {
      this._cacheValue.oneLineStreetAddress = {};
    }
    if (!this._cacheValue.oneLineStreetAddress[address]) {
      this._cacheValue.oneLineStreetAddress[address] = FormAutofillUtils.toOneLineAddress(address);
    }
    return this._cacheValue.oneLineStreetAddress[address];
  },

  _addressTransformer(profile) {
    if (profile["street-address"]) {
      // "-moz-street-address-one-line" is used by the labels in
      // ProfileAutoCompleteResult.
      profile["-moz-street-address-one-line"] = this._getOneLineStreetAddress(profile["street-address"]);
      let streetAddressDetail = this.getFieldDetailByName("street-address");
      if (streetAddressDetail &&
          (streetAddressDetail.elementWeakRef.get() instanceof Ci.nsIDOMHTMLInputElement)) {
        profile["street-address"] = profile["-moz-street-address-one-line"];
      }

      let waitForConcat = [];
      for (let f of ["address-line3", "address-line2", "address-line1"]) {
        waitForConcat.unshift(profile[f]);
        if (this.getFieldDetailByName(f)) {
          if (waitForConcat.length > 1) {
            profile[f] = FormAutofillUtils.toOneLineAddress(waitForConcat);
          }
          waitForConcat = [];
        }
      }
    }
  },

  getAdaptedProfiles(originalProfiles) {
    for (let profile of originalProfiles) {
      this._addressTransformer(profile);
    }
    return originalProfiles;
  },

  /**
   * Processes form fields that can be autofilled, and populates them with the
   * profile provided by backend.
   *
   * @param {Object} profile
   *        A profile to be filled in.
   * @param {Object} focusedInput
   *        A focused input element which is skipped for filling.
   */
  autofillFormFields(profile, focusedInput) {
    log.debug("profile in autofillFormFields:", profile);

    this.filledProfileGUID = profile.guid;
    for (let fieldDetail of this.addressFieldDetails) {
      // Avoid filling field value in the following cases:
      // 1. the focused input which is filled in FormFillController.
      // 2. a non-empty input field
      // 3. the invalid value set
      // 4. value already chosen in select element

      let element = fieldDetail.elementWeakRef.get();
      if (!element) {
        continue;
      }

      let value = profile[fieldDetail.fieldName];
      if (element instanceof Ci.nsIDOMHTMLInputElement && !element.value && value) {
        if (element !== focusedInput) {
          element.setUserInput(value);
        }
        this.changeFieldState(fieldDetail, "AUTO_FILLED");
      } else if (element instanceof Ci.nsIDOMHTMLSelectElement) {
        let option = FormAutofillUtils.findSelectOption(element, profile, fieldDetail.fieldName);
        if (!option) {
          continue;
        }
        // Do not change value or dispatch events if the option is already selected.
        // Use case for multiple select is not considered here.
        if (!option.selected) {
          option.selected = true;
          element.dispatchEvent(new element.ownerGlobal.UIEvent("input", {bubbles: true}));
          element.dispatchEvent(new element.ownerGlobal.Event("change", {bubbles: true}));
        }
        // Autofill highlight appears regardless if value is changed or not
        this.changeFieldState(fieldDetail, "AUTO_FILLED");
      }

      // Unlike using setUserInput directly, FormFillController dispatches an
      // asynchronous "DOMAutoComplete" event with an "input" event follows right
      // after. So, we need to suppress the first "input" event fired off from
      // focused input to make sure the latter change handler won't be affected
      // by auto filling.
      if (element === focusedInput) {
        const suppressFirstInputHandler = e => {
          if (e.isTrusted) {
            e.stopPropagation();
            element.removeEventListener("input", suppressFirstInputHandler);
          }
        };

        element.addEventListener("input", suppressFirstInputHandler);
      }
      element.previewValue = "";
    }

    // Handle the highlight style resetting caused by user's correction afterward.
    log.debug("register change handler for filled form:", this.form);
    const onChangeHandler = e => {
      let hasFilledFields;

      if (!e.isTrusted) {
        return;
      }

      for (let fieldDetail of this.addressFieldDetails) {
        let element = fieldDetail.elementWeakRef.get();

        if (!element) {
          return;
        }

        if (e.target == element || (e.target == element.form && e.type == "reset")) {
          this.changeFieldState(fieldDetail, "NORMAL");
        }

        hasFilledFields |= (fieldDetail.state == "AUTO_FILLED");
      }

      // Unregister listeners and clear guid once no field is in AUTO_FILLED state.
      if (!hasFilledFields) {
        this.form.rootElement.removeEventListener("input", onChangeHandler);
        this.form.rootElement.removeEventListener("reset", onChangeHandler);
        this.filledProfileGUID = null;
      }
    };

    this.form.rootElement.addEventListener("input", onChangeHandler);
    this.form.rootElement.addEventListener("reset", onChangeHandler);
  },

  /**
   * Populates result to the preview layers with given profile.
   *
   * @param {Object} profile
   *        A profile to be previewed with
   */
  previewFormFields(profile) {
    log.debug("preview profile in autofillFormFields:", profile);

    for (let fieldDetail of this.addressFieldDetails) {
      let element = fieldDetail.elementWeakRef.get();
      let value = profile[fieldDetail.fieldName] || "";

      // Skip the field that is null
      if (!element) {
        continue;
      }

      if (element instanceof Ci.nsIDOMHTMLSelectElement) {
        // Unlike text input, select element is always previewed even if
        // the option is already selected.
        let option = FormAutofillUtils.findSelectOption(element, profile, fieldDetail.fieldName);
        element.previewValue = option ? option.text : "";
        this.changeFieldState(fieldDetail, option ? "PREVIEW" : "NORMAL");
      } else {
        // Skip the field if it already has text entered
        if (element.value) {
          continue;
        }
        element.previewValue = value;
        this.changeFieldState(fieldDetail, value ? "PREVIEW" : "NORMAL");
      }
    }
  },

  /**
   * Clear preview text and background highlight of all fields.
   */
  clearPreviewedFormFields() {
    log.debug("clear previewed fields in:", this.form);

    for (let fieldDetail of this.addressFieldDetails) {
      let element = fieldDetail.elementWeakRef.get();
      if (!element) {
        log.warn(fieldDetail.fieldName, "is unreachable");
        continue;
      }

      element.previewValue = "";

      // We keep the state if this field has
      // already been auto-filled.
      if (fieldDetail.state === "AUTO_FILLED") {
        continue;
      }

      this.changeFieldState(fieldDetail, "NORMAL");
    }
  },

  /**
   * Change the state of a field to correspond with different presentations.
   *
   * @param {Object} fieldDetail
   *        A fieldDetail of which its element is about to update the state.
   * @param {string} nextState
   *        Used to determine the next state
   */
  changeFieldState(fieldDetail, nextState) {
    let element = fieldDetail.elementWeakRef.get();

    if (!element) {
      log.warn(fieldDetail.fieldName, "is unreachable while changing state");
      return;
    }
    if (!(nextState in this.fieldStateEnum)) {
      log.warn(fieldDetail.fieldName, "is trying to change to an invalid state");
      return;
    }

    for (let [state, mmStateValue] of Object.entries(this.fieldStateEnum)) {
      // The NORMAL state is simply the absence of other manually
      // managed states so we never need to add or remove it.
      if (!mmStateValue) {
        continue;
      }

      if (state == nextState) {
        this.winUtils.addManuallyManagedState(element, mmStateValue);
      } else {
        this.winUtils.removeManuallyManagedState(element, mmStateValue);
      }
    }

    fieldDetail.state = nextState;
  },

  /**
   * Return the profile that is converted from fieldDetails and only non-empty fields
   * are included.
   *
   * @returns {Object} The new profile that convert from details with trimmed result.
   */
  createProfile() {
    let profile = {};

    this.addressFieldDetails.forEach(detail => {
      let element = detail.elementWeakRef.get();
      // Remove the unnecessary spaces
      let value = element && element.value.trim();
      if (!value) {
        return;
      }

      profile[detail.fieldName] = value;
    });

    return profile;
  },

  isAddressField(fieldName) {
    return !!FIELD_NAME_INFO[fieldName] && !this.isCreditCardField(fieldName);
  },

  isCreditCardField(fieldName) {
    return FIELD_NAME_INFO[fieldName] == "creditCard";
  },
};

/**
 * Returns the autocomplete information of fields according to heuristics.
 */
this.FormAutofillHeuristics = {
  FIELD_GROUPS: {
    NAME: [
      "name",
      "given-name",
      "additional-name",
      "family-name",
    ],
    ADDRESS: [
      "organization",
      "street-address",
      "address-line1",
      "address-line2",
      "address-line3",
      "address-level2",
      "address-level1",
      "postal-code",
      "country",
    ],
    TEL: ["tel"],
    EMAIL: ["email"],
  },

  RULES: null,

  getFormInfo(form) {
    let fieldDetails = [];
    if (form.autocomplete == "off") {
      return [];
    }
    for (let element of form.elements) {
      // Exclude elements to which no autocomplete field has been assigned.
      let info = this.getInfo(element, fieldDetails);
      if (!info) {
        continue;
      }

      // Store the association between the field metadata and the element.
      if (fieldDetails.some(f => f.section == info.section &&
                                 f.addressType == info.addressType &&
                                 f.contactType == info.contactType &&
                                 f.fieldName == info.fieldName)) {
        // A field with the same identifier already exists.
        continue;
      }

      let formatWithElement = {
        section: info.section,
        addressType: info.addressType,
        contactType: info.contactType,
        fieldName: info.fieldName,
        elementWeakRef: Cu.getWeakReference(element),
      };

      fieldDetails.push(formatWithElement);
    }

    this.clearLabelMap();

    return fieldDetails;
  },

  /**
   * Get the autocomplete info (e.g. fieldName) determined by the regexp
   * (this.RULES) matching to a feature string. The result is based on the
   * existing field names to prevent duplicating predictions
   * (e.g. address-line[1-3).
   *
   * @param {string} string a feature string to be determined.
   * @param {Array<string>} existingFieldNames the array of exising field names
   *                        in a form.
   * @returns {Object}
   *          Provide the predicting result including the field name.
   *
   */
  _matchStringToFieldName(string, existingFieldNames) {
    let result = {
      fieldName: "",
      section: "",
      addressType: "",
      contactType: "",
    };
    if (this.RULES.email.test(string)) {
      result.fieldName = "email";
      return result;
    }
    if (this.RULES.tel.test(string)) {
      result.fieldName = "tel";
      return result;
    }
    for (let fieldName of this.FIELD_GROUPS.ADDRESS) {
      if (this.RULES[fieldName].test(string)) {
        // If "address-line1" or "address-line2" exist already, the string
        // could be satisfied with "address-line2" or "address-line3".
        if ((fieldName == "address-line1" &&
            existingFieldNames.includes("address-line1")) ||
            (fieldName == "address-line2" &&
            existingFieldNames.includes("address-line2"))) {
          continue;
        }
        result.fieldName = fieldName;
        return result;
      }
    }
    for (let fieldName of this.FIELD_GROUPS.NAME) {
      if (this.RULES[fieldName].test(string)) {
        result.fieldName = fieldName;
        return result;
      }
    }
    return null;
  },

  _isFieldEligibleForAutofill(element, autocomplete, type) {
    if (autocomplete == "off") {
      return false;
    }

    let tagName = element.tagName;
    if (tagName == "INPUT") {
      if (!ALLOWED_TYPES.includes(type)) {
        return false;
      }
    } else if (tagName != "SELECT") {
      return false;
    }

    return true;
  },

  getInfo(element, fieldDetails) {
    let autocomplete = element.autocomplete;
    let type = element.type;

    if (!this._isFieldEligibleForAutofill(element, autocomplete, type)) {
      return null;
    }

    // An input[autocomplete="on"] will not be early return here since it stll
    // needs to find the field name.
    if (autocomplete != "on") {
      let info = element.getAutocompleteInfo();
      if (info && info.fieldName) {
        return info;
      }
    }

    if (!this._prefEnabled) {
      return null;
    }

    // "email" type of input is accurate for heuristics to determine its Email
    // field or not. However, "tel" type is used for ZIP code for some web site
    // (e.g. HomeDepot, BestBuy), so "tel" type should be not used for "tel"
    // prediction.
    if (type == "email") {
      return {
        fieldName: "email",
        section: "",
        addressType: "",
        contactType: "",
      };
    }

    let existingFieldNames = fieldDetails ? fieldDetails.map(i => i.fieldName) : [];

    for (let elementString of [element.id, element.name]) {
      let fieldNameResult = this._matchStringToFieldName(elementString,
                                                         existingFieldNames);
      if (fieldNameResult) {
        return fieldNameResult;
      }
    }
    let labels = this.findLabelElements(element);
    if (!labels || labels.length == 0) {
      return null;
    }
    for (let label of labels) {
      let strings = this.extractLabelStrings(label);
      for (let string of strings) {
        let fieldNameResult = this._matchStringToFieldName(string,
                                                           existingFieldNames);
        if (fieldNameResult) {
          return fieldNameResult;
        }
      }
    }

    return null;
  },

  // The tag name list is from Chromium except for "STYLE":
  // eslint-disable-next-line max-len
  // https://cs.chromium.org/chromium/src/components/autofill/content/renderer/form_autofill_util.cc?l=216&rcl=d33a171b7c308a64dc3372fac3da2179c63b419e
  EXCLUDED_TAGS: ["SCRIPT", "NOSCRIPT", "OPTION", "STYLE"],
  /**
   * Extract all strings of an element's children to an array.
   * "element.textContent" is a string which is merged of all children nodes,
   * and this function provides an array of the strings contains in an element.
   *
   * @param  {Object} element
   *         A DOM element to be extracted.
   * @returns {Array}
   *          All strings in an element.
   */
  extractLabelStrings(element) {
    let strings = [];
    let _extractLabelStrings = (el) => {
      if (this.EXCLUDED_TAGS.includes(el.tagName)) {
        return;
      }

      if (el.nodeType == Ci.nsIDOMNode.TEXT_NODE ||
          el.childNodes.length == 0) {
        let trimmedText = el.textContent.trim();
        if (trimmedText) {
          strings.push(trimmedText);
        }
        return;
      }

      for (let node of el.childNodes) {
        if (node.nodeType != Ci.nsIDOMNode.ELEMENT_NODE &&
            node.nodeType != Ci.nsIDOMNode.TEXT_NODE) {
          continue;
        }
        _extractLabelStrings(node);
      }
    };
    _extractLabelStrings(element);
    return strings;
  },

  generateLabelMap(doc) {
    let mappedLabels = {};
    let unmappedLabels = [];

    for (let label of doc.getElementsByTagName("label")) {
      let id = label.htmlFor;
      if (!id) {
        let control = label.control;
        if (!control) {
          continue;
        }
        id = control.id;
      }
      if (id) {
        if (!mappedLabels[id]) {
          mappedLabels[id] = [label];
        } else {
          mappedLabels[id].push(label);
        }
      } else {
        unmappedLabels.push(label);
      }
    }

    this._mappedLabels = mappedLabels;
    this._unmappedLabels = unmappedLabels;
  },

  clearLabelMap() {
    delete this._mappedLabels;
    delete this._unmappedLabels;
  },

  findLabelElements(element) {
    if (!this._mappedLabels) {
      this.generateLabelMap(element.ownerDocument);
    }

    let id = element.id;
    let labels = this._mappedLabels[id];
    if (labels) {
      return labels;
    }
    return this._unmappedLabels.filter(label => label.control == element);
  },
};

XPCOMUtils.defineLazyGetter(this.FormAutofillHeuristics, "RULES", () => {
  let sandbox = {};
  let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                       .getService(Ci.mozIJSSubScriptLoader);
  const HEURISTICS_REGEXP = "chrome://formautofill/content/heuristicsRegexp.js";
  scriptLoader.loadSubScript(HEURISTICS_REGEXP, sandbox, "utf-8");
  return sandbox.HeuristicsRegExp.RULES;
});

XPCOMUtils.defineLazyGetter(this.FormAutofillHeuristics, "_prefEnabled", () => {
  return Services.prefs.getBoolPref(PREF_HEURISTICS_ENABLED);
});
