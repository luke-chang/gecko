/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Form Autofill field heuristics.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FormAutofillHeuristics"];

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const PREF_HEURISTICS_ENABLED = "extensions.formautofill.heuristics.enabled";

// This list should align with the same one in FormAutofillFrameScript.js.
const ALLOWED_TYPES = ["text", "email", "tel", "number"];

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

  findLabelElements(element) {
    let document = element.ownerDocument;
    let id = element.id;
    let labels = [];
    // TODO: querySelectorAll is inefficient here. However, bug 1339726 is for
    // a more efficient implementation from DOM API perspective. This function
    // should be refined after input.labels API landed.
    for (let label of document.querySelectorAll("label[for]")) {
      if (id == label.htmlFor) {
        labels.push(label);
      }
    }

    if (labels.length > 0) {
      return labels;
    }

    let parent = element.parentNode;
    if (!parent) {
      return [];
    }
    do {
      if (parent.tagName == "LABEL" &&
          parent.control == element &&
          !parent.hasAttribute("for")) {
        return [parent];
      }
      parent = parent.parentNode;
    } while (parent);

    return [];
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
