const APP_NAME = 'otchee_app_omni';
var scriptName = "sidebar";
var scriptVersion = "1.0.0";
var Author = "Sylvain.Berthaud@otchee.fr";
console.log(
  "%c %s",
  "background: #222; color: #bada55", 
  "Chargement du script : " + scriptName + " Version: " + scriptVersion + " réussi" 
);
require([
  "underscore",
  "jquery",
  "splunkjs/mvc",
  "splunkjs/ready!",
  "css!../app/" + APP_NAME + "/common/assets/js/sidebar/sidebar.css",
  "splunkjs/mvc/simplexml/ready!",
], function (_, $, mvc) {

 // show/hide sidebar 
  $(document).ready(function () {
      $('#sidebar').append( ""
      + "<div id='dismiss'>"
      + '<bold>&#x279C;</bold>'
      + '</div>'
      + '<div id="sidebarCollapse">'
      + '<bold>&#x279C;</bold>'
      + '</div>');
  
      $('#dismiss, .overlay').on('click', function () {
        log("click",'unset sidebar_mgmt');
        unsetToken("sidebar_mgmt");
      });
      $('#sidebarCollapse').on('click', function () {
        log("click",'set sidebar_mgmt');
        setToken("sidebar_mgmt","open");
      });
      var height_menu = $(".splunk-header").height();  
      console.log(height_menu);
      $('#sidebar').css("top", height_menu);
      var bottom_sidebar = document.documentElement.clientWidth;
      $('#sidebar').css("bottom", bottom_sidebar);
      
  
      $(window).resize(function() {
        var height_menu = $(".splunk-header").height();  
        var bottom_sidebar = document.documentElement.clientHeight;
        var top  = window.pageYOffset || document.documentElement.scrollTop;
        
        if(top>height_menu){
          height_menu=0;
        }else{
          height_menu=height_menu-top;
        }
        $('#sidebar').css("top", height_menu);
        $('#sidebar').css("bottom", bottom_sidebar);
        $('#sidebar #custom_button_Submit').css('height',bottom_sidebar-height_menu);
      
    })
    $(window).scroll(function() {
      var height_menu = $(".splunk-header").height();  
        console.log(height_menu);
        var bottom_sidebar = document.documentElement.clientHeight;
        var top  = window.pageYOffset || document.documentElement.scrollTop;
        
        if(top>height_menu){
          height_menu=0;
        }else{
          height_menu=height_menu-top;
        }
        $('#sidebar').css("top", height_menu);
        $('#sidebar').css("bottom", bottom_sidebar);
        
  
    })
    $(window).trigger('resize');
  });
  
  
  var submittedTokens = mvc.Components.getInstance('submitted', {
    create: true,
  });
  
  submittedTokens.on("change:sidebar_mgmt", function (model, sidebar_mgmt) {
    log(sidebar_mgmt,'sidebar value');
    if(isNull(sidebar_mgmt)){
      log(sidebar_mgmt,'hide sidebar');
      hideSidebar();
  
    }else{
      log(sidebar_mgmt,'show sidebar');
      showSidebar();
    }
  });
  
  
  function showSidebar(){
    $('#sidebarCollapse').addClass('active');
    $('#sidebar').addClass('active');
    $('.overlay').addClass('active');
    $('.collapse.in').toggleClass('in');
    $('a[aria-expanded=true]').attr('aria-expanded', 'false'); 
  }
  
  function hideSidebar(){
    $('#sidebar').removeClass('active');
    $('.overlay').removeClass('active');
    $('#sidebarCollapse').removeClass('active'); 
  }
  
  
  
  
  function log(obj, titre = "", level = 0) {
      tag = "";
      if (isNotNull(scriptName)) {
        tag += scriptName + " ";
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
    function setToken(tokenName,tokenValue,updateForm=false){
      /* Fonction permettant de definir un token */
      var defaultTokenModel = mvc.Components.get('default', {
      create: true,
      });
      var submittedTokenModel = mvc.Components.getInstance('submitted', {
      create: true,
      });
      defaultTokenModel.set(tokenName,tokenValue);
      submittedTokenModel.set(tokenName,tokenValue);
      if(updateForm){
          defaultTokenModel.set('form.' + tokenName,tokenValue);
          submittedTokenModel.set('form.' + tokenName,tokenValue);
      }
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
      try{
      return(is_empty(variable) || is_null(variable) || is_undefined(variable) || is_false(variable) || is_zero(variable) || is_NaN(variable) );
      }catch(error){
      return true;
  }
  }
  
  function is_empty(variable){
  return variable === "" && typeof variable === "string";
  }
  
  function is_null(variable){
  return variable === null;
  }
  
  function is_undefined(variable){
  return variable === undefined && typeof variable === "undefined";
  }
  
  function is_false(variable){
  return variable === false && typeof variable === "boolean";
  }
  
  function is_zero(variable){
  return variable === 0 && typeof variable === "number";
  }
  
  function is_NaN(variable){
  return !parseFloat(variable) && variable != 0 && typeof variable === "number";
  }
  
  });
  