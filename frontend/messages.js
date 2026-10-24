// Desk message catalogue loader (NFR-I18N-1, per api-spec section 1).
//
// Static copy stays inline as the no-JS fallback so the default-locale
// rendering is byte-identical with or without scripting. Elements
// carrying data-msg="key" are overwritten from the catalogue once it
// loads (a no-op for the default locale, the wiring for later ones),
// and inline scripts resolve dynamic strings through
// DeskMessages.msg(key, params, fallback). Behaviour never branches
// on resolved wording: error paths switch on envelope codes.
(function () {
  "use strict";

  var catalogue = null;
  var catalogueLocale = "en";

  function substitute(pattern, params) {
    return pattern.replace(/\{([A-Za-z0-9_]+)\}/g, function (match, name) {
      return params[name] === undefined ? match : String(params[name]);
    });
  }

  function activeLocale() {
    return catalogueLocale;
  }

  var api = {
    useCatalogue: function (obj) {
      catalogue = obj.messages;
      catalogueLocale = obj.locale;
    },
    catalogueLocale: function () {
      return catalogueLocale;
    },
    msg: function (key, params, fallback) {
      if (catalogue !== null && catalogue[key] !== undefined) {
        return substitute(catalogue[key], params || {});
      }
      return fallback === undefined ? "message-missing:" + key : fallback;
    },
    formatNumber: function (n, locale) {
      return new Intl.NumberFormat(locale || activeLocale(), { maximumFractionDigits: 0 }).format(n);
    },
    formatMoney: function (minor, currencyCode, locale) {
      var tag = locale || activeLocale();
      var amount = new Intl.NumberFormat(tag, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(minor / 100);
      return tag.toLowerCase() === "en" ? currencyCode + " " + amount : amount + " " + currencyCode;
    },
    formatDate: function (value, locale) {
      return new Intl.DateTimeFormat(locale || activeLocale(), { dateStyle: "medium" }).format(value);
    },
    applyToPage: function () {
      if (catalogue === null || typeof document === "undefined" || !document.querySelectorAll) {
        return;
      }
      var elements = document.querySelectorAll("[data-msg]");
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        var key = el.getAttribute("data-msg");
        if (catalogue[key] === undefined) {
          continue;
        }
        var textNodes = [];
        for (var j = 0; j < el.childNodes.length; j++) {
          if (el.childNodes[j].nodeType === 3) {
            textNodes.push(el.childNodes[j]);
          }
        }
        if (textNodes.length > 0) {
          textNodes[0].nodeValue = catalogue[key];
          for (var k = 1; k < textNodes.length; k++) {
            textNodes[k].nodeValue = "";
          }
        }
      }
    },
    init: function () {
      if (typeof fetch === "undefined") {
        return Promise.resolve(false);
      }
      return fetch("messages/en.json", { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) {
            return false;
          }
          return response.json().then(function (obj) {
            api.useCatalogue(obj);
            api.applyToPage();
            return true;
          });
        })
        .catch(function () {
          return false;
        });
    },
  };

  if (typeof globalThis !== "undefined") {
    globalThis.DeskMessages = api;
  }
})();
