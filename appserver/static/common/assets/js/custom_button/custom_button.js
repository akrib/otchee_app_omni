const APP_NAME = 'otchee_app_omni';
var scriptName = "custom_button";
var scriptVersion = "1.0.0";
var Author = "Sylvain.Berthaud@otchee.fr";
console.log(
  "%c %s",
  "background: #222; color: #bada55", 
  "Chargement du script : " + scriptName + " Version: " + scriptVersion + " réussi" 
);
var LOGTITLE = "custom_button";
require([
  "underscore",
  "jquery",
  "splunkjs/mvc",
  "splunkjs/ready!",
  "splunkjs/mvc/simplexml/ready!",
], function (_, $, mvc) {
  function jsUcfirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
  function log(obj, titre = "", level = 0) {
    tag = "";
    if (isNotNull(LOGTITLE)) {
      tag += LOGTITLE + " ";
    }
    /* Fonction de Log dans la console javascript */
    var debug = debug || 1;
    var color;
    var tag;
    if (debug == 1) {
      if (level == 0) {
        color = "#FFFFFF";
        tag += "Info";
      } else if (level == 1) {
        color = "#FFFF00";
        tag = "Warn";
      } else if (level == 2) {
        color = "#FF0000";
        tag = "Crit";
      } else {
        color = "#DDDDDD";
        tag = "";
      }
      console.groupCollapsed(
        "%c %s",
        "background: #000000; color: " + color,
        tag + "--" + titre + "--"
      );
      if (Array.isArray(obj)) {
        try {
          console.table(obj);
        } catch (err) {
          console.error(err);
        }
      } else {
        try {
          if (level == 0) {
            console.info(obj);
          } else if (level == 1) {
            console.warn(obj);
          } else if (level == 2) {
            console.error(obj);
          } else {
            console.log(obj);
          }
        } catch (err) {
          console.error(err);
        }
      }
    }

    console.groupEnd();
  }
  function isNotNull(variable) {
    /* Fonction qui retourne True si la variable n'est pas null */
    return !isNull(variable);
  }

  function isNull(variable) {
    /* Fonction qui retourne True si la variable est null */
    if (typeof variable === "undefined" || variable === null) {
      try {
        return value == "" || value == undefined || value.length == 0;
      } catch (e) {
        return true;
      }
    } else {
      return false;
    }
  }
  // generate HTML button in a parent element
  function generateButton(id, label, parent, append, submit, vertical) {
    log({"id":id,"label": label,"parent": parent,"append": append,"submit": submit,"vertical": vertical },"in generateButton");
    var btn = document.createElement("button");
    var span;
    
    // apply id field
    if (typeof id !== "undefined" && id.length > 0) {
      btn.id = id;
      btn.name = id;
    }

    // apply label
    if (typeof label !== "undefined" && label.length > 0) {
      span = document.createElement("span");
      span.innerHTML = label;
      btn.appendChild(span);
    }

    // assign styling and insert if parent is discovered
    if (typeof parent !== "undefined" && parent.length > 0) {
      var parentID = parent[0] === "#" ? parent : "#" + parent;
      var p = $(parentID);

      // set button in its place of the parent
      if (p.length) {
        var t = p.find(".fieldset");
        if (t.length) {
          t = $(t[0]);
          if (!!append) {
            t.append(btn);
          } else {
            t.prepend(btn);
          }
        }
      }
    }
    // set button type classes and CSS
    if (!!submit) {
      btn.className = "btn btn-primary";
    } else {
      btn.className = "btn-info";
      btn.style.padding = "3px 12px";
      btn.style.borderRadius = "4px";
    }

    // set button's CSS based on it being in a
    // vertical stack of items or not
    if (!!vertical) {
      btn.style.verticalAlign = "middle";
      btn.style.margin = "5px 10px 5px 0px";
    } else {
      btn.style.verticalAlign = "top";
      btn.style.marginTop = "21px";
      btn.style.marginRight = " 10px";
    }

    return $(btn);
  }

  function setToken(tokenName, tokenValue) {
    /* Fonction permettant de definir un token */
    var defaultTokenModel = mvc.Components.get("default", {
      create: true,
    });
    var submittedTokenModel = mvc.Components.getInstance("submitted", {
      create: true,
    });
    defaultTokenModel.set(tokenName, tokenValue);
    submittedTokenModel.set(tokenName, tokenValue);
  }
  $(document).ready(function () {
    $("[id^=custom_button_").each(function (index, element) {
      // if (!$(".btn-primary").parents('[id^="custom_button"].dashboard-cell').length == 1 ) {
        if (!element.id.includes("-fieldset")) {
          log(element.id, "element.id");
          var elementId = element.id;
          elementId = elementId.replace("custom_button_", "");
          log(elementId, "elementId");
          var elementLabel = elementId.replace(/[0-9]/g, "");
          elementLabel = jsUcfirst(elementLabel);
          log(elementLabel, "elementLabel");
          // create Submit button inside of a Splunk panel named "executer"
          generateButton(
            elementId,
            elementLabel,
            "#" + element.id,
            true,
            true,
            false
          ).click(function () {
            setToken(elementId, "```bouton "+ elementId +" cliqué```");
          });
        }
      // }
    });
  });
});
