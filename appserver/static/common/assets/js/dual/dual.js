const APP_NAME = 'otchee_app_omni';
var scriptName = "dual";
var scriptVersion = "1.0.1";
var Author = "Sylvain.Berthaud@otchee.fr";
console.log(
  "%c %s",
  "background: #222; color: #bada55", 
  "Chargement du script : " + scriptName + " Version: " + scriptVersion + " réussi" 
);
// charement des pré-requis splunk et duallistbox
require.config({
  paths: {
    bootstrap_dualist:
      "../app/" + APP_NAME + "/common/assets/js/dual/duallistbox/jquery.bootstrap-duallistbox",
  },
  shim: {
    bootstrap_dualist: {
      deps: ["jquery"],
    },
  },
});
require([
  "underscore",
  "jquery",
  "splunkjs/mvc",
  "bootstrap_dualist",
  //"text!../app/slideshow/js/templates/SlideshowSetupPage.html",
  "css!../app/" + APP_NAME + "/common/assets/js/dual/duallistbox/flexboxgrid.min.css",
  "css!../app/" + APP_NAME + "/common/assets/js/dual/duallistbox/bootstrap-duallistbox.min.css",
  "splunkjs/mvc/searchmanager",
  "splunkjs/mvc/simplexml/ready!",
], function (_, $, mvc) {
  const LOGTITLE = "Dual";
  //var duallistbox = [];
  var TokenModel = mvc.Components.get("default", {
    create: true,
  });
  var dualAttr = {};
  $(".dual").each(function (index, element) {
    var input_token, output_token, refresh_token, outputCondition;
    input_token = $(element).attr("input_token");
    if ($(element).attr("output_token")) {
      output_token = $(element).attr("output_token");
    } else {
      output_token = "dual_output";
    }
    if ($(element).attr("refresh_token")) {
      refresh_token = $(element).attr("refresh_token");
    } else {
      refresh_token = "dual_refresh";
    }

    if ($(element).attr("outputCondition")) {
      outputCondition = $(element).attr("outputCondition");
    }
    
    //creation ID unique pour attribution du dual
    var dualID = "dual_listbox_" + index + "_" + createID();
    //creation du sélect dans le div
    $(element).html(
      '<select multiple="multiple" name="' +
        dualID +
        '_permissions[]" id="' +
        dualID +
        '"></select>'
    );
    dualAttr[dualID]={"input_token":input_token,
                      "output_token": output_token,
                      "refresh_token": refresh_token,
                      "outputCondition": outputCondition,
                    }
    log(dualAttr);
    //duallistbox.push(
      $("#" + dualID).bootstrapDualListbox({
        bootstrap2Compatible: true,
        preserveSelectionOnMove: "moved",
        moveOnSelect: false,
        moveOnDoubleClick: true,
      });
    //);
    refresh(dualID, output_token, outputCondition, "refresh_after_set");

    TokenModel.on("change:" + refresh_token, function (model, value, options) {
      if (value) {
        refresh(dualID, output_token, outputCondition, "refresh_token_is_not_null");
      }
    });
    //déclenchement d'une mise a jour du dual list box quand la valeur du input token change
    TokenModel.on("change:" + input_token, function (model, value, options) {
      log(value);
      var multiselect_new_items = "";
      $("#" + dualID).empty();
      if (value !== undefined) {
        log("value !== undefined");
        value.split(";").forEach(function (item) {
          item = item.split("=");
          if (item.length == 2) {
            if(isNotNull(item[1])){
              if (item[0] == "selected") {
                multiselect_new_items +=
                  '<option value="' +
                  item[1] +
                  '" selected="selected">' +
                  item[1] +
                  "</option>";
              } else {
                multiselect_new_items +=
                  '<option value="' + item[1] + '">' + item[1] + "</option>";
              }
            }
          } else {
            if (checkOutputCondition(dualID, outputCondition)) {
              unsetToken(output_token);
            }
          }
        });
        $("#" + dualID).append(multiselect_new_items);
        refresh(dualID, output_token, outputCondition, "refresh_after_add_input");

         $("div.box1.col-md-6 > div > button").click(function () {
           $(".form-control.filter").val("");
           refresh(dualID, output_token,"refresh_after_filter_move_to_selcted");
         });

         $("div.box2.col-md-6 > div > button").click(function () {
           $(".form-control.filter").val("");
           refresh(dualID, output_token,"refresh_after_filter_move_to_non-selcted");
         });

        //mise a jour du token output_token quand la liste des séléctionés change
        $("#" + dualID).change(function () {
          refresh(
            dualID,
            output_token, 
            outputCondition,
            "refresh_after_filter_move_to_non-selcted"
          );
        });
      }
    });
  });

  function refresh(ID, token, outputCondition, desc = "") {
    send_output(ID, token, outputCondition);
    $("#" + ID).bootstrapDualListbox("refresh", true);
    log("refresh : " + desc + " : " + ID, "Refresh " + ID.toString());
  }

  function send_output(ID, token, outputCondition) {
    if (checkOutputCondition(ID, outputCondition)) {
      var tokenValue;
      if ($("#" + ID).val()) {
        tokenValue = $("#" + ID).val();
        log(tokenValue, "Value " + ID.toString());
      } else {
        tokenValue = [];
      }

      if (tokenValue.length == 0) {
        unsetToken(token);
      } else {
        unsetToken(token);
        tokenValue = tokenValue.join(";");
        setToken(token, tokenValue);
      }
    }
  }

  function checkOutputCondition(ID,outputCondition) {
    log(ID,"in : checkOutputCondition");
    var condition = outputCondition
    log(dualAttr);
    if (isNotNull(condition)) {
      condition = condition.split(",");
      if (condition.length == 2) {
        var condition_token = getToken(condition[0]);
        if (isNotNull(condition_token)){
        if (condition_token.toString() == condition[1].toString()) {
          log("(condition_token.toString() == condition[1].toString()) == true");
          outputCondition = true;
        } else {
          log("(condition_token.toString() == condition[1].toString()) == false");
          outputCondition = false;
        }
      } else {
        log("(condition.length != 2)");
        outputCondition = false;
      }
      }else{
        log("(isNotNull(condition_token) = false");
        outputCondition = false;
      }
    } else {
      log("(isNotNull(condition) = false");
      outputCondition = false;
    }
    log(outputCondition, "DualListbox outputCondition for : " + ID.toString());
    return outputCondition;
  }

  function log(obj, titre = "", level = 0) {
    tag = ""
    if(isNotNull(LOGTITLE)){
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

  function createID() {
    /* fonction de création d'id unique */
/*###########*/log('','in : createID');
    const crypto = window.crypto || window.msCrypto;
    var array = new Uint32Array(1);
    crypto.getRandomValues(array)
    return (Date.now().toString(36) + crypto.getRandomValues(array).toString(36).substr(2, 5)).toUpperCase();
  }

  function setToken(tokenName,tokenValue){
    /* Fonction permettant de definir un token */
    var defaultTokenModel = mvc.Components.get('default', {
      create: true,
    });
    var submittedTokenModel = mvc.Components.getInstance('submitted', {
      create: true,
    });
    defaultTokenModel.set(tokenName,tokenValue);
    submittedTokenModel.set(tokenName,tokenValue);
  }

  function unsetToken(tokenName){
    /* Fonction permettant de vider un token et de l'effacer */
    var defaultTokenModel = mvc.Components.get('default', {
      create: true,
    });
    var submittedTokenModel = mvc.Components.getInstance('submitted', {
      create: true,
    });
    defaultTokenModel.unset(tokenName);
    submittedTokenModel.unset(tokenName);
  }

  function getToken(tokenName){
    /* Fonction permettant recuperer la valeur d'un token */
    var defaultTokenModel = mvc.Components.get('default', {
      create: true,
    });
    var submittedTokenModel = mvc.Components.getInstance('submitted', {
      create: true,
    });
    var def = defaultTokenModel.get(tokenName);
    var sub = submittedTokenModel.get(tokenName);
    if(isNotNull(def)){
      return def;
    }else if(isNotNull(sub)){
      return sub;
    }else{
      return null;
    }
  }

  function isNotNull(variable){
    /* Fonction qui retourne True si la variable n'est pas null */
    return !isNull(variable);
  }

  function isNull(variable){
    /* Fonction qui retourne True si la variable est null */
    if(typeof variable === 'undefined' || variable === null){
      try{
        return (value == '' || value == undefined || value.length == 0);
      }catch(e){
        return true;
      }
    }else{
      return false;
    }
  }

});
