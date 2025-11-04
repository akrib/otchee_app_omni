var scriptName = 'Omni_Journal';
var scriptVersion = '1.0.0';
console.log('%c %s', 'background: #222; color: #bada55', scriptName+' Version: ' + scriptVersion);
var app_path = 'otchee_app_omni';
var viewName = '';
require([
    'underscore',
    'jquery',
    'splunkjs/mvc',
    'splunkjs/mvc/tableview',
    'splunkjs/mvc/chartview',
    'splunkjs/mvc/searchmanager',
    'css!../app/' + app_path + '/omni/lib/jquery-ui.min.css',
    'css!../app/' + app_path + '/omni/omni_journal.css',
    'splunkjs/mvc/simplexml/ready!'
  ], function (_, $, mvc, TableView) {
    var debugMode = 1;
    const LOGTITLE = 'Downtime';
    
  var CustomRangeRenderer = TableView.BaseCellRenderer.extend({
      canRender: function (cell) {
        // Enable this custom cell renderer for both the active_hist_searches and the active_realtime_searches field
        return _(['O','ID','DATE','ACTION', 'SERVICE', 'KPI', 'ENTITY', 'COMMENTAIRE', 'VERSION','FOREIGN_UPDATE']).contains(cell.field);
      },

      render: function ($td, cell) {
        // Add a class to the cell based on the returned value
        var value = cell.value;
        //console.log(cell);
        if (cell.field === 'O') {
          if (parseInt(value) == 1) {
            $td.addClass('range-cell').addClass('range-owner');
          }
          if (parseInt(value) == 0) {
            $td.addClass('range-cell').addClass('range-other');
          }
          $td.text(value).addClass('string');
        }
        if (cell.field === 'FOREIGN_UPDATE') {
          if (parseInt(value) == 1) {
            $td.addClass('range-cell').addClass('range-update');
          }
          if (parseInt(value) == 0) {
            $td.addClass('range-cell').addClass('range-nochange');
          }
          $td.text(value).addClass('string');
        }
        if (cell.field === 'ACTION') {
          if (value == 'add') {
            $td.addClass('range-cell').addClass('range-add');
          }
          if (value == 'update') {
            $td.addClass('range-cell').addClass('range-modify');
          }
          if (value == 'delete') {
            $td.addClass('range-cell').addClass('range-delete');
          }
          if (value == 'obsolete') {
            $td.addClass('range-cell').addClass('range-obsolete');
          }
          $td.text(value).addClass('string');
        }
        if (cell.field === 'COMMENTAIRE') {
          $td.addClass('range-cell').addClass('hide');
          //$td.text(value).addClass('string');
        }
        if (cell.field === 'SERVICE') {
          $td.addClass('range-cell').addClass('hide');
          //$td.text(value).addClass('string');
        }
        if (cell.field === 'KPI') {
          $td.addClass('range-cell').addClass('hide');
          //$td.text(value).addClass('string');
        }
        if (cell.field === 'ENTITY') {
          $td.addClass('range-cell').addClass('hide');
          //$td.text(value).addClass('string');
        }
        if (cell.field === 'VERSION') {
          $td.addClass('range-cell').addClass('maintenance_version');
          $td.text(value).addClass('string');
        }
        if (cell.field === 'ID') {
          $td.addClass('range-cell').addClass('maintenance_id');
          $td.text(value).addClass('string');
        }
        if (cell.field === 'DATE') {
          $td.addClass('range-cell').addClass('maintenance_date');
          $td.text(value).addClass('string');
        }
      }
    });


  ///////////////////////////////////////////////////////////////////////////////////
  ////////////// ROW EXPANSION //////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////

  var EventSearchBasedRowExpansionRenderer = TableView.BaseRowExpansionRenderer.extend({
      canRender: function (rowData) {
        // Since more than one row expansion renderer can be registered we let each decide if they can handle that
        // data
        // Here we will always handle it.
        return true;
      },
      render: function ($container, rowData) {
        var service = _(rowData.cells).find(function(cell) {
            return cell.field === 'SERVICE';
        });// end of var clientCell...
        var kpi = _(rowData.cells).find(function(cell) {
            return cell.field === 'KPI';
        });// end of var siteCell...
        var entity = _(rowData.cells).find(function(cell) {
          return cell.field === 'ENTITY';
        });// end of var hostCell...
        var commentary = _(rowData.cells).find(function(cell) {
          return cell.field === 'COMMENTAIRE';
      });// end of var ipCell...
        $container.append("<div><span><table width='100%'>"
        + "<tr><td class='dataexpansion'><h2 class='title-search'>Maintenance Information</h2></td><td></td></tr>"
        + "<tr><td><b class='search-bold'>Service</b>: </td><td>" +  itemize(service.value) + "</td></tr>"
        + "<tr><td><b class='search-bold'>KPI</b>: </td><td>" + itemize(kpi.value) + "</td></tr>"
        + "<tr><td><b class='search-bold'>Entity</b>: </td><td>" + itemize(entity.value) + "</td></tr>"
        + "<tr><td><b class='search-bold'>Commentaires(s)</b>: </td><td>" + commentary.value + "</td></tr>"
        + "</td></tr></table></span></div>");
      }
    });


    var tableElement = mvc.Components.getInstance("highlight");
    tableElement.getVisualization(function(tableView) {   
      // Add custom cell renderer, the table will re-render automatically.
      tableView.addCellRenderer(new CustomRangeRenderer());
      tableView.addRowExpansionRenderer(new EventSearchBasedRowExpansionRenderer());
      tableView.render();
    });

    function itemize(itemString){
    /* Fonction de formatage des data en forme de TAG */
    //log(itemString,'in itemize');
    try{
      if(isNull(itemString)){
        return '';
      }
    if(itemString=='%' || itemString=='*'){
      itemString='Tous';
    }
    itemString = itemString.replace("\%","*");
    itemString = itemString.split(';');
    var outputString = '';

    for(let i=0; i < itemString.length ; i++){
      outputString += '<span class="description_item">'+itemString[i]+'</span>';
    }
    return outputString;
    }catch(error){
/*###########*/log(error,'length error in itemize');
    return '';
    }
  }
  function log(obj, titre = '', level = 0) {
    tag = '';
    if(isNotNull(LOGTITLE)){
      tag += LOGTITLE + ' ';
    }
    /* Fonction de log dans la console javascript */
    var debug = debugMode || 1;
    var color;
    var tag;
    if (debug == 1) {
      if (level == 0) {
        color = '#FFFFFF';
        tag += 'Info';
      } else if (level == 1) {
        color = '#FFFF00';
        tag = 'Warn';
      } else if (level == 2) {
        color = '#FF0000';
        tag = 'Crit';
      } else {
        color = '#DDDDDD';
        tag = '';
      }
      console.groupCollapsed(
        '%c %s',
        'background: #000000; color: ' + color,
        tag + '--' + titre + '--'
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


