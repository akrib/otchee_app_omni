const APP_NAME = 'otchee_app_omni';
var scriptName = "modal_popup";
var scriptVersion = "1.0.0";
var Author = "Sylvain.Berthaud@otchee.fr";
console.log(
  "%c %s",
  "background: #222; color: #bada55", 
  "Chargement du script : " + scriptName + " Version: " + scriptVersion + " réussi" 
);
require.config({
    paths: {
      'jquery-modal': '../app/' + APP_NAME + '/common/assets/js/modal_popup/lib/jquery.modal_popup',
    },
    shim: {
      'jquery-modal': {
        deps: ['jquery']
      }
    }
});

  require([
      'underscore',
      'jquery',
      'splunkjs/mvc',
      'jquery-modal',
      'css!../app/' + APP_NAME + '/common/assets/js/modal_popup/lib/jquery.modal_popup.css',
      'splunkjs/mvc/simplexml/ready!'
    ], function (_, $, mvc) {
 
    $(document).ready(function () {
      var defaultTokenModel = mvc.Components.get("default");
      if ($("#modalpopup").length == 0) {
        console.log("%c %s", 'background: #222; color: #FF5733', " MODAL_POPUP ERROR : pour fonctionner le dashboard doit contenir le panneau prés construit : 'modal_popup'");
      } else {
        defaultTokenModel.on("change:modal_header", function (newTokenName, modal_header, options) {
          $("#modal_header").html(modal_header)
        });
        defaultTokenModel.on("change:modal_content", function (newTokenName, modal_content, options) {
          $("#modal_content").html(modal_content)
        });
        defaultTokenModel.on("change:modal_footer", function (newTokenName, modal_footer, options) {
          $("#modal_footer").html(modal_footer)
        });
        defaultTokenModel.on("change:modal_show", function (newTokenName, modal_show, options) {
          if(modal_show !== undefined){
            $("#modal_link")[0].click();
          }
        });
      }
    });
  });

