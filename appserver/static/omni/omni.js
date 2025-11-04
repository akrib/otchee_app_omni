var scriptName = 'Omni_Downtime';
var scriptVersion = '0.3.3';
console.log('%c %s', 'background: #222; color: #bada55', scriptName + ' Version: ' + scriptVersion);
var app_path = 'otchee_app_omni';
var viewName = '';

require(['splunkjs/mvc/utils'], function (SplunkUtil) {
  viewName = SplunkUtil.getPageInfo().page;
  require.config({
    paths: {
      'jquery-ui': '../app/' + app_path + '/omni/lib/jquery-ui.min',
    },
    shim: {
      'jquery-ui': {
        deps: ['jquery'],
      },
    },
  });

require([
    'underscore',
    'jquery',
    'splunkjs/mvc',
    'splunkjs/mvc/searchmanager',
    'jquery-ui',
    'css!../app/' + app_path + '/omni/lib/semantic.min.css',
    'css!../app/' + app_path + '/omni/lib/jquery-ui.min.css',
    'splunkjs/mvc/simplexml/ready!',
  ], function (_, $, mvc, SearchManager) {
    /* déclaration des variables globales */
    const LOGTITLE = 'Downtime';
    const UPDATE_FORM = true;
    var spacing = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    var numberTabs = 1;
  /* recupere la valeur de l'objet html debug */
  /* si iln'existe pas defini la variable a 0 */
    var debugMode = $('#debug').html() || 0;
    /* recuperation du composant token */
    var token = mvc.Components.get('default', {
        create: true,
    });/* OMNI_DONE */

        /* Fonction de mise a jour du panneau de description des downtimes */
        /* WIP
    token.on('change:selection_desc', function (model, selection_desc, options) {
        var selectionDescHtml = '<table id="selection_desc_table" width="100%">';
        var count = (selection_desc.match(/\<\/span\>\#/g) || []).length;
        log(count,"desc_count");
        if(count == 4){
        
        }
        var arr = selection_desc.split('#');
        for(let i=0; i < arr.length ; i++){
            let obj = arr[i].split(':');
            selectionDescHtml += ''
            + '<tr><td>'
            + obj[0]
            + '</td><td width=100/><td>'
            + obj[1]
            + '</td></tr>';
        }
        selectionDescHtml += '</table>';
        if (isNotNull(selectionDescHtml)) {
        $('#selection_desc').html(selectionDescHtml);
        }
    });

        /* fonction d'initialisation de la page */
    $(document).ready(function () {
        createUserInterface();
        var downtimeID = getToken('DT_ID');
        var dashboardType = $('#dashboardType').html();
        if (dashboardType == 'add') {
        createAddDashboard();
        }else if(dashboardType == 'update'){
        if(isNotNull(downtimeID)){
            log('downtimeID isNotNull');
            createUpdateDashbord(downtimeID);
            }else{
            log('createUpdateDashbord downtimeID isNull');
            }
        }else if(dashboardType == 'delete'){
            if(isNotNull(downtimeID)){
            log('downtimeID isNotNull');
                createDeleteDashboard(downtimeID);
            }else{
                log('createDeleteDashbord downtimeID isNull');
            }
        }else{
            log('dashboardType isNull');
        }
    });/* OMNI_DONE */

        /* fonction permettant d'ajouter une periode */
        /* supplémentaire lorque l'on click sur le   */
        /* bouton '+' dans l'interface utilisateur   */
    $(document).on('click', '#tAdd', function () {

        appendPeriodTab('tabs', 'Periode ' + numberTabs);
        $('[id^=selectable]').selectable();
        applyDatepickerUI();
    });/* OMNI_DONE */

        /* fonction permettant de supprimer une periode */
        /* lorque l'on click sur le bouton 'x' dans     */
        /* l'interface utilisateur                      */
    $(document).on('click', '.btnx', function () {
        var cur = $(this).attr('id');
        cur = cur.replace('btnx', 'tab');
        $('#' + cur).remove();
        cur = 'content-' + cur;
        $('#' + cur).remove();
        numberTabs -= 1;
    });/* OMNI_DONE */

        /* Fonction qui met en focus la periode sélectionée */
    $(document).on('click', '.tab', function () {
        $('.tab-content').removeClass('current');
        var cur = 'content-' + $(this).attr('id');
        $('#' + cur).addClass('current');
    });/* OMNI_DONE */

        /* Fonction de validation des data et enregistrement dans le kvstore  */
    $(document).on('click', 'input#VALID_button', function () {
        log("", 'in : click input#VALID_button'); 
        sendData('valid');
    });/* OMNI_DONE */

        /* Fonction appellé quand on click sur le bouton de 'Test' */
        /* Test les conditions de validation des champs            */
    $(document).on('click', 'input#TEST_button', function () {
        /* sans lancer les requetes           
        log("", 'in : click input#TEST_button');               
        sendData('test');
    });

        $(document).on('click', 'input#CANCEL_button', function () {
        /* Fonction appellé quand on click sur le bouton de 'Annuler' */
        /* la fonction recharge completement la page                  */
        window.location.href = '/app/' + app_path + '/' + viewName;
    });/* OMNI_DONE */


    /* Fonction de création des div necessaire  */
    /* a la création de l'interface utilisateur */
    function createUserInterface() {
        if(isNotNull($('#downtime > .Omni_base').val())){
            log('skip this function','User Interface Already exist');
            return;
        }

        log('','in : createUserInterface');
        var userName = Splunk.util.getConfigValue('USERNAME');
        
        log(userName,'userName');
        var dashboardType = $('#dashboardType').html();
        
        log(dashboardType,'dashboardType');
    
        var html = ''
            + '<div class="ui Omni_base">'
            + '<table id="Omni_table">'
            + '<tr>' 
            + '<td width="100%">';
    
        html += ''
            + '<div class="ui small form segment Omni_segment">'
            + '<div id="tabs"><div class="ui  menu tabsName Omni_tabsName">'
            +' <div class="ui label blue item Omni_itemName">'
            //+ '<i class="file outline icon" id="entry_type"/>'
            + '</div>'
            + '<a class="item tabx" id="tAdd">'
           // + '<i class="add times icon"/>'
            + '</a>' 
            +'</div>';
        html += '<div id="content" class="Omni_content"> </div>';
    
        html += '</div></div>';
    
        html += ''
            + '<label>Commentaire ou num&eacute;ro de ticket</label>'
            + '</td>'
            + '</tr>'
            + '<tr>' 
            + '<td>'
            + '<textarea class="Omni_commentaire" id="commentaire" cols="300" rows="3"></textarea>'
            + '</td>' 
            + '</tr>'
            + '</table>'
            + '<input id="CANCEL_button" type="button" value="Annuler" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button"></input>'
            + '<input id="VALID_button" type="button" value="Valider" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button"></input>';
        if (debugMode == '1' || debugMode == 1) {
            html += ''
            + '<input id="TEST_button"'
                    + ' type="button"' 
                    + ' value="Test"'
                    + ' style="padding: 5px 10px; border-radius: 4px"'
                    + 'class="btn-primary Omni_button"/>';
        }
        html += ''
            + '<br/>'
            + '<center>'
            + '<div id="loadSpinner" loading_msg=" " circle_color="#A64764" />'
            + '</center>'
            + '</div>';
    
        $('#downtime').html(html);
        $('#username').html(userName);
    }/* OMNI_DONE */

        /* Fonction de création du dashboard  */
        /* se lance dans on page ready  */
        /* après createUserInterface */
    function createAddDashboard(){
        initDashboard();
        appendPeriodTab('tabs', 'Periode 1');
        applyDatepickerUI();
        $('[id^=selectable]').selectable();
    }/* OMNI_DONE */


    function updateDesciptionDiv(){
        /* fonction de recuperation des data et de formatage */
        /* des data pour le panneau de description           */
        var service_selected=getToken('service_selected');
        var kpi_selected=getToken('kpi_selected');
        var entity_selected=getToken('entity_selected');
        var selection_desc = 'Service(s):'
        + transformInVisualTags(service_selected)
        + '#Kpi(s):'
        + transformInVisualTags(kpi_selected)
        + '#Entity(s):'
        + transformInVisualTags(entity_selected)
        + '#hide:hide';

        var selectionDescHtml = '<table id="selection_desc_table" width="100%">';
        var count = (selection_desc.match(/\<\/span\>\#/g) || []).length;
        log(count,"desc_count");
        var arr = selection_desc.split('#');
        for(let i=0; i < arr.length ; i++){
            let obj = arr[i].split(':');
            selectionDescHtml += ''
              + '<tr><td>'
              + obj[0]
              + '</td><td width=100/><td>'
              + obj[1]
              + '</td></tr>';
        }
        selectionDescHtml += '</table>';
        if (isNotNull(selectionDescHtml)) {
          $('#selection_desc').html(selectionDescHtml);
        }
    }


        /* fonction de chargement des informations         */
        /* pour le dashboard de modification d'un downtime */
    function createUpdateDashbord(downtimeID){
        log(downtimeID, 'in : createUpdateDashbord');
        var query = createQueryWithDowntimeID(downtimeID);
        var epoch = (new Date).getTime();
        var existingDowntimeSearch = new SearchManager({
            id: 'existingDowntimeSearch' + epoch,
            preview: false,
            cache: false,
            search: mvc.tokenSafe(query),
        });

        existingDowntimeSearch.on('search:done', function (properties) {
            log(properties, 'existingDowntimeSearch search:done');
            if (properties.content.resultCount == 0) {
            log(existingDowntimeSearch, 'existingDowntimeSearch resultCount == 0');
            } else {
            var myResults = this.data('results', {
                count: 0
                });
            myResults.on('data', function () {
                var downtimeData = myResults.data().rows;
                fillDashboard(downtimeData,"update");
            });
            }
        });

        existingDowntimeSearch.on('search:failed', function(properties) {
            log(properties, 'existingDowntimeSearch search:failed');
        });
    }

        /* fonction de chargement des informations         */
        /* pour le dashboard de suppression d'un downtime */
    function createDeleteDashboard(downtimeID){

        log(downtimeID, 'in : createDeleteDashbord');
        var epoch = (new Date).getTime();
        var query = createQueryWithDowntimeID(downtimeID);
        var existingDowntimeSearch = new SearchManager({
            id: 'existingDowntimeSearch' + epoch,
            preview: false,
            cache: false,
            search: mvc.tokenSafe(query),
        });
        
        existingDowntimeSearch.on('search:done', function (properties) {
            log(properties, 'existingDowntimeSearch search:done');
            if (properties.content.resultCount == 0) {
            
                log(properties, 'existingDowntimeSearch search:0 results');
            } else {
            var myResults = this.data('results', {
                count: 0
                });
            myResults.on('data', function () {
                var downtimeData = myResults.data().rows;
                fillDashboard(downtimeData,'delete');
            });
            }
        });
        existingDowntimeSearch.on('search:failed', function(properties) {
            log(properties, 'existingDowntimeSearch search:failed');
        });      

    }

        /* créer la requete de recupération des data */
        /* d'un downtime a partir d'un id            */
        
    function createQueryWithDowntimeID(downtimeID){
        log(downtimeID, 'in : createQueryWithDowntimeID');
        
        var query = ''
            + '| inputlookup omni_kv_def where ID="' + downtimeID + '"'
            + '| rename _key as key'
            + '| rex field=step_opt "(?<service_type>.)(?<kpi_type>.)(?<entity_type>.)"'
            + '| eval downtime=mvjoin(downtime,"£"),'
            + '  service=replace(mvjoin(service,";"),"\\*","%"),'
            + '  kpi=replace(mvjoin(kpi,";"),"\\*","%"),'
            + '  entity=replace(mvjoin(entity,";"),"\\*","%")'
            + '| table key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,commentary';
  
            var query2 = ''
            + '| inputlookup omni_kv_def where ID="' + downtimeID + '"'
            + '| rename _key as key'
            + '| rex field=step_opt "(?<service_type>.)(?<kpi_type>.)(?<entity_type>.)"'
            + '| eval downtime=mvjoin(downtime,"£"),'
            + '  service=mvjoin(service,";"),'
            + '  kpi=mvjoin(kpi,";"),'
            + '  entity=mvjoin(entity,";")'
            + '| table key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,commentary,version';            

        log(query2, 'createQueryWithDowntimeID query');
        return query2;
    }
        /* fonction de creation d'element html */
        /* WIP
    function createHtmlElement(htmlType, params={}, value=''){
        log([htmlType, value, params]," in : createHtmlElement");
        if(isNull(htmlType)){
            log(htmlType, "htmlType is null");
            return "";
        }
        var otherParameters = '';
        for(var itemKey in params) {
            var itemValue = params[itemKey];
            if(typeof itemValue === 'string'){
                otherParameters += itemKey + '="' + itemValue + '" ';
            }else if(Array.isArray(itemValue)){
                var tempHtml = '';
                for (index = 0; index < itemValue.length; ++index) {
                    tempHtml += itemValue[index] + ' ';
                }
                otherParameters += itemKey + '="' + tempHtml.trimEnd() + '" ';
            }
        }
        return ('<' + htmlType + ' ' + otherParameters + '>' + value + '</' + htmlType + '>'); 
    }
      
        /* Fonction de recuperation et mise a jour */
        /* des token et des champs necessaire au   */
        /* dashboard de mise a jour des dontimes   */      
         
    function fillDashboard(downtimeData,dashboardType){
        log([downtimeData,dashboardType], 'in : fillDashboard');
        const downtimeFields = {
            KEY: 0,
            DOWNTIME: 1,
            SERVICE_TYPE: 2,
            SERVICE: 3,
            KPI_TYPE: 4,
            KPI: 5,
            ENTITY_TYPE: 6,
            ENTITY: 7,
            COMMENTARY: 8,
            VERSION: 9
        }

        downtimeData.forEach(function (downtimeListData, index) {
            log([downtimeListData, index], 'in : fillDashboard => downtimeData.forEach');
            var service,service_type,kpi,kpi_type,entity,entity_type,downtime,commentary,desc;
            service = downtimeListData[downtimeFields.SERVICE];
            kpi = downtimeListData[downtimeFields.KPI];
            entity = downtimeListData[downtimeFields.ENTITY];
            service_type = downtimeListData[downtimeFields.SERVICE_TYPE];
            kpi_type = downtimeListData[downtimeFields.KPI_TYPE];
            entity_type = downtimeListData[downtimeFields.ENTITY_TYPE];
            setToken('selected_version', downtimeListData[downtimeFields.VERSION]);
            setToken('key', downtimeListData[downtimeFields.KEY]);
            log(service, 'in : service');
            setToken('service_selected', service);
            setToken('service_select_input_type', service_type, UPDATE_FORM);
            if(service_type == 2 && dashboardType == "update"){
                setToken('service_for_concat', service.replace(';', ','));
                setToken('service_concat', service, UPDATE_FORM);
                setToken('service_select_dual', '  ');
            }else{
                unsetToken('service_select_dual');
                if(service_type == 3){
                    setToken('service_text_selected', service, UPDATE_FORM);
                }
            }
            setToken('kpi_selected', kpi);
            setToken('kpi_select_input_type', kpi_type, UPDATE_FORM);     
            if(kpi_type == 2 && dashboardType == "update"){
                setToken('kpi_for_concat', kpi.replace(';', ','));
                setToken('kpi_concat', kpi, UPDATE_FORM);
                setToken('kpi_select_dual', '  ');
            }else{
                unsetToken('kpi_select_dual');
                if(kpi_type == 3){
                    setToken('kpi_text_selected', kpi, UPDATE_FORM);
                }
            }
            setToken('entity_selected', entity);
            setToken('entity_select_input_type', entity_type, UPDATE_FORM);
            if(entity_type == 2 && dashboardType == "update"){
                setToken('entity_for_concat', entity.replace(';', ','));
                setToken('entity_concat', entity, UPDATE_FORM);
                setToken('entity_select_dual', '  ');
            }else{
                unsetToken('entity_select_dual');
                if(entity_type == 3){
                    setToken('entity_text_selected', entity, UPDATE_FORM);
                }
            }

            downtime = downtimeListData[downtimeFields.DOWNTIME];
            commentary = downtimeListData[downtimeFields.COMMENTARY];
            
            if(dashboardType == "update"){
                updatePeriods(downtime,commentary);
                setToken('update_full_loading',1);
            }else if(dashboardType == "delete" ){
                setToken("downtime_selected",downtime);
                updatePeriods(downtime,commentary);
                updateDesciptionDiv();
                setToken('update_full_loading',1);
                // $('#commentaire').val(commentary);
                setToken('step_opt_for_delete', ''
                    + service_type.toString()
                    + kpi_type.toString()
                    + entity_type.toString());
                //setToken('downtime_value_for_delete',downtimeListData[downtimeFields.DOWNTIME]);
            }
        });
    }

 
    function updateUserInterfaceContentDiv(
        name,
        choice,
        beginDays = '',
        beginHours = '00:00:00',
        endDays = '',
        endHours = '24:00:00'
    ) {
    /* Fonction de création des tableau dans les perdiodes */ 
    log([name,
        choice,
        beginDays,
        beginHours,
        endDays,
        endHours],'in : updateUserInterfaceContentDiv');
        beginHours = beginHours.substr(0, 5);
        endHours = endHours.substr(0, 5);
        var table = '';
        if (choice == 'between_date') {
        table = ''
            + '<div>'
            +'<table id="omni_periode">'
            + '<tr>'
            + '<td>Date de d&eacute;but</td>'
            + '<td><input type="text" id="datepicker_begin-'+ name + '"'
            + ' readonly value="' + beginDays + '"></td>'
            + '<td>Heure de d&eacute;but</td>'
            + '<td>'
            + '<input type="text" id="begin' + name + '"'
            + ' class="inputPeriodBegin" name="begin"'
            + ' required minlength="5" maxlength="5"'
            + ' size="7" value="' + beginHours + '"></td>'
            + '</tr><tr>'
            + '<td>Date de fin</td>'
            + '<td>'
            + '<input type="text" id="datepicker_end-' + name + '"'
            + ' readonly value = "' + endDays + '"></td>'
            + '<td>Heure de fin</td>'
            + '<td><input type="text" id="end' + name + '"'
            + ' class="inputPeriodEnd" name="end"'
            + ' required minlength="5" maxlength="5"'
            + ' size="7" value="' + endHours + '"></td>'
            + '</tr>'
            + '</table></div>';
        } else if (choice == 'weekly') {
        var weekDaysArray = ['Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday'];

        table = ''
            + '<div><table id="omni_periode">'
            + '<tr><td>Jours</td><td>'
            + '<ol id="selectable_1-' + name + '">';

        for(var i=0;i<7;i++){
            table += ''
            +'<li class="ui-state-default'
            +matchDays(beginDays, weekDaysArray[i], ' ui-selected')
            +'">'+ weekDaysArray[i] + '</li>';
        }

        table += ''
            + '</ol></td>'
            + '</tr><tr>'
            + '<td>P&eacute;riode de temps</td><td>'
            + '<table>'
            + '<tr><td>D&eacute;but</td>'
            + '<td>'
            + '<input type="text" id="begin' + name + '"'
            + ' class="inputPeriodBegin" name="begin"'
            + ' required minlength="5" maxlength="5"'
            + ' size="7" value="' + beginHours + '">'
            + '</td>'
            + '</tr><tr>'
            + '<td>Fin</td>'
            + '<td>'
            + '<input type="text" id="end' + name + '"'
            + ' class="inputPeriodEnd" name="end"'
            + ' required minlength="5" maxlength="5"'
            + ' size="7" value="' + endHours + '">'
            + '</td>'
            + '</tr></table>'
            + '</td></tr>'
            + '</table></div>';
        } else if (choice == 'monthly') {
        var monthDaysArray = ['01','02','03','04','05','06',
                            '07','08','09','10','11','12',
                            '13','14','15','16','17','18',
                            '19','20','21','22','23','24',
                            '25','26','27','28','29','30',
                            '31'];

        var days = ''
            + '<table width=450>'
            + '<tr><td>'
            + '<ol id="selectable_list-' + name + '">';

            for(var j=0;j<31;j++){
            days += ''
                +'<li class="ui-state-default'
                +matchDays(beginDays, monthDaysArray[j], ' ui-selected')
                +'">'+ monthDaysArray[j] + '</li>';
            }
            days += ''
            + '</ol>' 
            + '</td>'
            + '<td></td>'
            + '<td></td>'
            + '<td></td>'
            + '<td></td>'
            + '<td></td>'
            + '</tr></table>';

        table = ''
            + '<div>'
            + '<table>'
            + '<tr>'
            + '<td>Jours</td>'
            + '<td>' + days + '</td>'
            + '</tr><tr>'
            + '<td>P&eacute;riode de temps</td>'
            + '<td>'
            + '<table>'
            + '<tr><td>D&eacute;but</td>'
            + '<td><input type="text" size="7"'
            + ' id="begin' + name + '"'
            + ' class="inputPeriodBegin" name="begin"'
            + ' value="' + beginHours + '"></td>'
            + '</tr><tr>'
            + '<td>Fin</td>'
            + '<td><input type="text" size="7"'
            + ' id="end' + name + '"'
            + ' class="inputPeriodEnd" name="end" '
            + ' value="' + endHours + '"></td>'
            + '</tr></table>'
            + '</td></tr></table>'
            + '</div>';

        } else if (cutStringForSpecialDate(choice) == 'special_date') {
        var spe = ''
            + '<select id="select_day" name="select_day">'
            + '<option value="Monday" '
            + matchDays(beginDays, 'Monday', 'selected')
            + '>Lundi</option>'
            + '<option value="Tuesday" '
            + matchDays(beginDays, 'Tuesday', 'selected')
            + '>Mardi</option>'
            + '<option value="Wednesday" '
            + matchDays(beginDays, 'Wednesday', 'selected')
            + '>Mercredi</option>'
            + '<option value="Thursday" '
            + matchDays(beginDays, 'Thursday', 'selected')
            + '>Jeudi</option>'
            + '<option value="Friday" '
            + matchDays(beginDays, 'Friday', 'selected')
            + '>Vendredi</option>'
            + '<option value="Saturday" '
            + matchDays(beginDays, 'Saturday', 'selected')
            + '>Samedi</option>'
            + '<option value="Sunday" '
            + matchDays(beginDays, 'Sunday', 'selected')
            + '>Dimanche</option>'
            + '</select>&nbsp;'
            + '<select id="select_type" name="select_type">'
            + '<option value="first" '
            + matchDays(choice, 'special_date_first_in_month', 'selected')
            + '>Premier du mois</option>'
            + '<option value="second" '
            + matchDays(choice, 'special_date_second_in_month', 'selected')
            + '>Deuxieme du mois</option>'
            + '<option value="third" '
            + matchDays(choice, 'special_date_third_in_month', 'selected')
            + '>Troisieme du mois</option>'
            + '<option value="fourth" '
            + matchDays(choice, 'special_date_fourth_in_month', 'selected')
            + '>Quatrieme du mois</option>'
            + '<option value="last" '
            + matchDays(choice, 'special_date_last_in_month', 'selected')
            + '>Dernier du mois</option>'
            + '</select>';

        table = ''
            + '<div>'
            + '<table>'
            + '<tr>'
            + '<td>Jours</td>'
            + '<td>' + spe + '</td>'
            + '</tr><tr>'
            + '<td>P&eacute;riode de temps</td>'
            + '</tr>'
            + '<table>'
            + '<tr><td>D&eacute;but</td>'
            + '<td><input type="text" size="7"'
            + ' id="begin' + name + '"'
            + ' class="inputPeriodBegin" name="begin"'
            + ' value="' + beginHours + '"></td>'
            + '</tr><tr>'
            + '<td>Fin</td>'
            + '<td><input type="text" size="7"'
            + ' id="end' + name + '"'
            + ' class="inputPeriodEnd" name="end"'
            + 'value="' + endHours + '"></td>'
            + '</tr></table>'
            + '</td></tr></table>'
            + '</div>';
        }
        return table;
    }/* OMNI_DONE */

        /* Met les noms des types en forme pour les radio button */
    function cutStringForSpecialDate(text) {
        log(text,'in : cutStringForSpecialDate');
        if(isNull(text)){
            log('Error in cutStringForSpecialDate','2');
            return '';
        }
        if (text.length > 12) {
            text = text.substr(0, 12);
        }
        return text;
    }/* OMNI_DONE */

    /* Fonction d'ajout de periode */
    function appendPeriodTab(tab, nombre,
        downtimeType = 'between_date',
        beginDays = '',
        beginHours = '00:00:00',
        endDays = '',
        endHours = '24:00:00') {
        log([tab, nombre,
        downtimeType,
        beginDays, beginHours,
        endDays, endHours],'in : appendPeriodTab');

        var radioDChecked = '';
        var radioWChecked = '';
        var radioMChecked = '';
        var radioSChecked = '';


        if(downtimeType == 'between_date'){
            radioDChecked = 'checked="checked"';
        }else if(downtimeType == 'weekly'){
            radioWChecked = 'checked="checked"';
        }else if(downtimeType == 'monthly'){
            radioMChecked = 'checked="checked"';
        }else if(cutStringForSpecialDate(downtimeType) == 'special_date'){
            radioSChecked = 'checked="checked"';
        }
        var hide = '';
        var t = $('#' + tab + ' .tabsName');
        var base = 'tab-Periode' + numberTabs.toString();

        var n = !!nombre
        ? nombre
        : 'tab ' + numberTabs.toString();

        var tn = !!nombre
        ? nombre.replace(/\s/g, '')
        : 'tab' + numberTabs.toString();

        $('.tab-content').removeClass('current');

        var form = ''
        + '<div ' +hide + '>'
        + '<form id="form-' + base + '" class=radiobasis>'
        + 'Date &agrave; date '
        + '<input type="radio" periodID="radioD"'
        + ' name="basis-' + base + '" value="between_date" '+ radioDChecked + '>'
        + spacing
        + 'Hebdomadaire '
        + '<input type="radio" periodID="radioW"'
        + ' name="basis-' + base + '" value="weekly" '+ radioWChecked + '>'
        + spacing
        + 'Mensuel '
        + '<input type="radio" periodID="radioM"'
        + ' name="basis-' + base + '" value="monthly" '+ radioMChecked + '>'
        + spacing
        + 'Sp&eacute;cifique '
        + '<input type="radio" periodID="radioS"'
        + ' name="basis-' + base + '" value="special_date" '+ radioSChecked + '>'
        + spacing
        + '</form></div><br />';

        var content = ''
        + '<div id="content-' + base + '"'
        + ' class="tab-content current" >'
        + form
        + '<div id="table-' + base + '">';

        content += updateUserInterfaceContentDiv(base,
                                        downtimeType,
                                        beginDays,
                                        beginHours,
                                        endDays,
                                        endHours);

        content += '</div></div>';
        numberTabs++;
        if (!$('#tab-' + tn).length) {
        $('#content').append(content);
        t.find('#tAdd').remove();
        var tabItem = '<a class="item tab"'
            + ' data-tab="' + tn + '"'
            + ' id="tab-' + tn + '">'
            + n
            + ' <i class="times icon btnx"'
            + ' id="btnx-' + tn + '">'
            + '</i></a>'
            + '<a class="item tabx"'
            + ' id="tAdd">'
            + '<i class="add square icon">'
            + '</i></a>';
        t.append(tabItem);
        }
        $('#tab-' + tn).click();
    }/* OMNI_DONE */

        /* Applique la mise en page des menu */
    function initDashboard() {
        log('','in : Init');
        //if ($('#downtime').html() == '') {
        createUserInterface();
        //}
        //var numberTabs = 1;
        $('body').on('change', '.radiobasis', function () {
            log('','in : Changement de type');
            var cur = $(this).attr('id').replace('form-', '');
            var selected_value = $('input[name="basis-' + cur + '"]:checked').val();
            $('#table-' + cur).html(updateUserInterfaceContentDiv(cur, selected_value));
            $('[id^=selectable]').selectable();
            applyDatepickerUI();
        });
        $('[id^=selectable]').selectable();
        applyDatepickerUI();
    }/* OMNI_DONE */

        /* Fonction de mise a jour des periodes          */
        /* pour le dashbord de mise a jour des downtimes */
        
    function updatePeriods(text,commentary){
        const periodFields = {
            TYPE: 0,
            BEGIN_DAY: 1,
            BEGIN_HOUR: 2,
            END_DAY:3,
            END_HOUR:4
        }
        log([text,commentary],'in : updatePeriods');
        initDashboard();
        var AllPeriods = text.split('£');
        log(AllPeriods,'downtime array');
        for(var periodNumber=0;periodNumber<AllPeriods.length;periodNumber++){
            var periodValue = AllPeriods[periodNumber].split('#');
            var periodNumberShowInDashboard=(periodNumber + 1).toString();
            appendPeriodTab('tabs','Periode ' + periodNumberShowInDashboard,
                            periodValue[periodFields.TYPE],
                            periodValue[periodFields.BEGIN_DAY],
                            periodValue[periodFields.END_DAY],
                            periodValue[periodFields.BEGIN_HOUR],
                            periodValue[periodFields.END_HOUR]);
            if(periodValue[periodFields.TYPE] == 'between_date'){
            applyDatepickerUI(periodValue[periodFields.BEGIN_DAY]);
            }
        }
        $('[id^=selectable]').selectable();
        try{
            $('#commentaire').val(commentary);
        }catch(error){
            log(error,'unable to write in #commentaire');
        }
    }
 
        /* fonction de mise en forme du champ downtime */
    function transformDowntimeField(
        downtimeType,
        begin_day,
        end_day,
        begin_hour,
        end_hour
    ) {

        log([downtimeType,begin_day,end_day,begin_hour,end_hour],'in : transformDowntimeField');
        //exemple d'output
        //between_date#2020-09-03#2020-09-13#00:00:00#24:00:00
        var ouputString=''
            + downtimeType
            + '#'
            + begin_day
            + '#'
            + end_day
            + '#'
            + begin_hour
            + '#'
            + end_hour
            + '';
        return ouputString;
    }/* OMNI_DONE */

        /* Fonction de création de la requete SPL */
        /* pour l'ajout du downtime dans          */
        /* le KV store omni_kv                  */
    function createAddQuery(arr) {
    log(arr,'in : createAddQuery');
        var dt_update = new Date().getTime();
        var query ='';
        var array_status = new Array();
        for(const downtime of arr['downtimeFields']){
            array_status.push('enabled');
        }
        query += '| stats count as service'
            + '| eval service=split("'
            + arr['service']
            + '",";"), '
            + 'kpi=split("'
            + arr['kpi']
            + '",";"), '
            + 'entity=split("'
            + arr['entity']
            + '",";"), '
            + 'downtime=split("'
            + arr['downtimeFields']
            + '",","),'
            + 'creator="'
            + arr['username']
            + '", '
            + 'commentary="'
            + arr['commentary']
            + '", '
            + 'version="'
            + arr['version']
            + '", '
            + 'ID="'
            + arr['ID']
            + '", '
            + 'dt_update='
            + dt_update
            + ', '
            + 'step_opt="'
            + arr['step_opt']
            + '"'
            + ', '
            +'status=split("'
            + array_status
            + '",",")'
            + '|OmniKVUpdate action="add" '
            + arr['sendEmail'];
    log(query,'ADD query');
        return query;
    }

        /* Fonction de création de la requete SPL */
        /* pour la mise a jour du downtime dans   */
        /* le KV store omni_kv                  */

    function createUpdateQuery(arr) {
        log(arr,'in : createUpdateQuery');
            var dt_update = new Date().getTime();
            var query ='';
            var array_status = new Array();
            for(const downtime of arr['downtimeFields']){
                array_status.push('enabled');
            }
                query += '| stats count as service'
                + '| eval key="'
                + arr['key']
                + '", '
                + 'service=split("'
                + arr['service']
                + '",";"), '
                + 'kpi=split("'
                + arr['kpi']
                + '",";"), '
                + 'entity=split("'
                + arr['entity']
                + '",";"), '
                + 'downtime=split("'
                + arr['downtimeFields']
                + '",","),'
                + 'creator="'
                + arr['username']
                + '", '
                + 'commentary="'
                + arr['commentary']
                + '", '
                + 'version="'
                + arr['version']
                + '", '
                + 'ID="'
                + arr['ID']
                + '", '
                + 'dt_update='
                + dt_update
                + ', '
                + 'step_opt="'
                + arr['step_opt']
                + '"'
                + ', '
                +'status=split("'
                + array_status
                + '",",")'
                + '|OmniKVUpdate action="update" '
                + arr['sendEmail'];


        log(query,'Update query');
            return query;
    }

        /* Fonction de création de la requete SPL */
        /* pour la suppression du downtime dans   */
        /* le KV store omni_kv                  */
        
    function createDeleteQuery(arr) {

    log(arr,'in : createDeleteQuery');
    var dt_update = new Date().getTime();
    var query ='';
    var array_status = new Array();
    for(const downtime of arr['downtimeFields']){
        array_status.push('disabled');
    }
        query += '| stats count as service'
        + '| eval key="'
        + arr['key']
        + '", '
        + 'service=split("'
        + arr['service']
        + '",";"), '
        + 'kpi=split("'
        + arr['kpi']
        + '",";"), '
        + 'entity=split("'
        + arr['entity']
        + '",";"), '
        + 'downtime=split("'
        + arr['downtimeFields']
        + '",","),'
        + 'creator="'
        + arr['username']
        + '", '
        + 'commentary="'
        + arr['commentary']
        + '", '
        + 'version="'
        + arr['version']
        + '", '
        + 'ID="'
        + arr['ID']
        + '", '
        + 'dt_update='
        + dt_update
        + ', '
        + 'step_opt="'
        + arr['step_opt']
        + '"'
        + ', '
        +'status=split("'
        + array_status
        + '",",")'
        + '|OmniKVUpdate action="delete" '
        + arr['sendEmail'];

    log(query,'Delete query');
        return query;
    }
        /* Fontion de récupération des informations */
        /* dans l'interface pour les ajouter au     */
        /* KVstore omni_kv                        */
    function getSelectedInDashboard() {
        log('','in : getSelectedInDashboard');
            var selected = {};
            var errorOutput = 'Impossible de valider le downtime :<br />';
            var errors = 0;
            var checkedBegin = [];
            var checkedEnd = [];
            var beginHours = [];
            var endHours = [];
            var atLeastOne = 0;
            var type = [];
            var dashboardType = $('#dashboardType').html();
            var sendingEmail,email,sendEmail;
            sendingEmail = getToken("sendingEmail");
            email = getToken("email");
            
            if(dashboardType == "delete"){
                selected['key'] = getToken('key');
                if (isNull(selected['key'])) {
                    selected['key'] = '';
                }
                selected['ID'] = getToken('DT_ID');
                if (isNull(selected['ID'])) {
                    selected['ID'] = createID();
                }

                selected['commentary'] = $('#commentaire').val();
                selected['commentary'] = transformAccents(selected['commentary']);

                if(isNotNull(sendingEmail) && checkEmail(email)){
                sendEmail =''
                    + '| table ID,result'
                    + '| transpose column_name="Champs"'
                    + '| sendemail'
                    + ' to="'+ email +'"'
                    + ' subject="Suppression de downtime"'
                    + ' sendresults=true'
                    + ' inline=true'
                    + ' format=table'
                    + ' message="Le downtime '
                    + selected['ID']
                    + ' vient d\'etre supprimer, voici le recaputilatif"';
                }else{
                    sendEmail='';
                }
                selected['sendEmail'] = sendEmail;
                selected['username'] = Splunk.util.getConfigValue('USERNAME');
                selected['lookup_name'] = 'omni_kv';
                selected['service'] = transformStringForKV(getToken('service_selected'));
                selected['kpi'] = transformStringForKV(getToken('kpi_selected'));
                selected['entity'] = transformStringForKV(getToken('entity_selected'));
                selected['step_opt'] =  getStepOpt();
                selected['downtimeFields'] = getToken('downtime_selected').split("£");

            }else{
            if(dashboardType == "add"){
                if(isNotNull(sendingEmail) && checkEmail(email)){
                sendEmail =''
                + '| table ID,service,kpi,entity,downtime,result'
                + '| transpose column_name="Champs"'
                + '| sendemail'
                + ' to="'+ email +'"'
                + ' subject="Ajout de downtime"'
                + ' sendresults=true'
                + ' inline=true'
                + ' format=table'
                + ' message="Le downtime '
                + selected['ID']
                + ' vient d\'etre soumis, voici le recaputilatif"';
                }else{
                sendEmail='';
                }
                selected['sendEmail'] = sendEmail;
                selected['version'] = getToken('selected_version');
                if (isNull(selected['version'])) {
                selected['version'] = 1;
                }
            }else if(dashboardType == "update"){
                if(isNotNull(sendingEmail) && checkEmail(email)){
                sendEmail =''
                + '| table ID,service,kpi,entity,downtime,result'
                + '| transpose column_name="Champs"'
                + '| sendemail'
                + ' to="'+ email +'"'
                + ' subject="Modification de downtime"'
                + ' sendresults=true'
                + ' inline=true'
                + ' format=table'
                + ' message="Le downtime '
                + selected['ID']
                + ' d\'etre mis a jour, voici le recaputilatif"';
                }else{
                sendEmail='';
                }
                selected['sendEmail'] = sendEmail;
                selected['version'] = parseInt(getToken('selected_version')) + 2 ;
                if (isNull(selected['version'])) {
                selected['version'] = 100;
                }
            }

            selected['key'] = getToken('key');
            if (isNull(selected['key'])) {
                selected['key'] = '';
            }  
            selected['ID'] = getToken('DT_ID');
            if (isNull(selected['ID'])) {
                selected['ID'] = createID();
            }

            selected['username'] = Splunk.util.getConfigValue('USERNAME');
            selected['lookup_name'] = 'omni_kv';
            selected['commentary'] = transformAccents($('#commentaire').val());
            selected['service'] = transformStringForKV(getToken('service_selected'));
            selected['kpi'] = transformStringForKV(getToken('kpi_selected'));
            selected['entity'] = transformStringForKV(getToken('entity_selected'));
            selected['step_opt'] = getStepOpt();

            selected['downtimeFields'] = [];
            $('[id^=content-tab-Period]').each(function () {
                var dateBegin = '';
                var dateEnd = '';
                var hoursBegin = '';
                var hoursEnd = '';
        log($(this),'Tab Element');
                if ($(this).find('[periodID=radioD]').is(':checked')) {
                dateBegin = $(this).find('[id^=datepicker_begin]').val();
                dateEnd = $(this).find('[id^=datepicker_end]').val();
                if (dateBegin.length == 10 && dateEnd.length == 10) {
                    atLeastOne = 1;
                    checkedBegin.push(dateBegin);
                    checkedEnd.push(dateEnd);
                    type.push('between_date');
                }
                } else if ($(this).find('[periodID=radioW]').is(':checked')) {
                dateBegin = [];
                dateEnd = [];
                atLeastOne = 1;
                $(this)
                    .find('.ui-selected')
                    .each(function () {
                    dateBegin.push($(this).html());
                    dateEnd.push($(this).html());
                    });
                    checkedBegin.push(dateBegin.join(';'));
                    checkedEnd.push(dateEnd.join(';'));
                    type.push('weekly');
                } else if ($(this).find('[periodID=radioM]').is(':checked')) {
                dateBegin = [];
                dateEnd = [];
                atLeastOne = 1;
                $(this)
                    .find('.ui-selected')
                    .each(function () {
                    dateBegin.push($(this).html());
                    dateEnd.push($(this).html());
                    });
                    checkedBegin.push(dateBegin.join(';'));
                    checkedEnd.push(dateEnd.join(';'));
                    type.push('monthly');
                } else if ($(this).find('[periodID=radioS]').is(':checked')) {
                atLeastOne = 1;
                dateBegin = $(this).find('#select_day').val();
                dateEnd = $(this).find('#select_day').val();
                checkedBegin.push(dateBegin);
                checkedEnd.push(dateEnd);
                var selectedType = $(this).find('#select_type').val();
                type.push('special_date_' + selectedType + '_in_month');
                }
                if (atLeastOne == 1) {
                hoursBegin = $(this).find('.inputPeriodBegin').val();
                hoursEnd = $(this).find('.inputPeriodEnd').val();
                if (!transformTimeFormat(hoursBegin)) {
                    errors += 1;
                    errorOutput +=
                    '- Au moins un des champs <b>Heure de d&eacute;but</b> ne respecte pas le format ( HH:MM )<br />';
                }
                if (!transformTimeFormat(hoursEnd)) {
                    errors += 1;
                    errorOutput +=
                    '- Au moins un des champs temps <b>Heure de fin</b> ne respecte pas le format ( HH:MM )<br />';
                }
                if (hoursBegin == hoursEnd && dateBegin == dateEnd) {
                    errors += 1;
                    errorOutput +=
                    '- Les champs temps <b>Heure de d&eacute;but</b> et </b>Heure de fin</b> ne peuvent pas etre identique<br />';
                }
                if (
                    checkEndHourBiggerThanBegin(
                    dateBegin,
                    dateEnd,
                    hoursBegin,
                    hoursEnd
                    )
                ) {
                    errors += 1;
                    errorOutput +=
                    '- Le champ <b>Heure de d&eacute;but</b> ne peux pas &ecirc;tre sup&eacute;rieur au champ <b>Heure de fin</b> si la <b>Date de d&eacutebut</b> et la <b>Date de fin</b> son identique<br />';
                }
                }
                beginHours.push(hoursBegin);
                endHours.push(hoursEnd);
                selected['downtimeFields'].push(
                transformDowntimeField(
                    type[type.length - 1],
                    transformStringForKV(transformDaysToEnglish(checkedBegin[checkedBegin.length - 1])),
                    transformStringForKV(transformDaysToEnglish(checkedEnd[checkedEnd.length - 1])),
                    beginHours[beginHours.length - 1] + ':00',
                    endHours[endHours.length - 1] + ':00'
                )
                );

            });
            if (isNull(selected['service'])) {
                errors += 1;
                errorOutput += '- Veuillez s&eacute;lectioner un ou plusieurs services<br />';
            }
            if (isNull(selected['kpi'])) {
                errors += 1;
                errorOutput += '- Veuillez s&eacute;lectioner une ou plusieurs kpi<br />';
            }
            if (isNull(selected['entity'])) {
                errors += 1;
                errorOutput += '- Veuillez s&eacute;lectioner une ou plusieurs entité <br />';
            }
            if (isNull(selected['downtimeFields'])) {
                errors += 1;
                errorOutput +=
                '- erreur de recupération des data de downtime<br />';
            }
            if (isNull(selected['commentary'])) {
                errors += 1;
                errorOutput +=
                '- Veuillez entrer un commentaire d&eacute;taill&eacute;<br />';
            }
            if (errors > 0) {
                errors += 1;
                errorOutput +=
                '- Au moins une des p&eacute;riodes ne respecte pas les pr&eacute;s-requis<br />';
            }
        }
            return [selected, errors, errorOutput];
    }

        /* Fonction de calcul et lancement de */
        /* requetes SPL dans le moteur splunk */
    function sendData(sendingType) {
        const selectedInDashboardFields = {
            DATA : 0,
            NB_ERROR: 1,
            ERROR_MSG: 2
        }
        var closingWindowLink = ''
            + '<a href="/app/'
            + app_path
            + '/'
            + viewName
            + '">Fermer la fenêtre</a>';
        var goToConsultLink = ''
            + '<a href="/app/'
            + app_path
            + '/accueil">Fermer la fenêtre</a>';
        log(sendingType,'in : sendData');
        loadSpinnerChangeMsg('Verification des données en entrée');
        loadSpinnerState('ON');
        var selectedValues = getSelectedInDashboard();
        log(selectedValues,'selectedValues');
        var selected = selectedValues[selectedInDashboardFields.DATA];
        var errors = selectedValues[selectedInDashboardFields.NB_ERROR];
        var errorOutput = selectedValues[selectedInDashboardFields.ERROR_MSG];
        var query = '';
        var dashboardType = $('#dashboardType').html();
        log(selected,'selected');
        log(errors,'errors');
        log(errorOutput,'errorOutput');
        if (errors > 0) {
        loadSpinnerState('OFF');
        setToken('modal_header', 'ERREUR');
        setToken('modal_content', errorOutput);
        $('#modal_link')[0].click();
        } else {
        /* on cache les bouton pour evité que plusieurs lancement de la fonction ai lieux */
        $('input#VALID_button').hide();
        $('input#CANCEL_button').hide();
        loadSpinnerChangeMsg('Mise à jour 0%');
        if (dashboardType == 'add') {
            query = createAddQuery(selected);
        } else if (dashboardType == 'update') {
            query = createUpdateQuery(selected);
        } else if (dashboardType == 'delete') {
            query = createDeleteQuery(selected);
        } else {
    log('ERREUR DE dashboardType:' + dashboardType);
        }
        if (sendingType == 'valid') {
            var omni_kv = new SearchManager({
            id: 'omni_kv' + selected['ID'],
            preview: false,
            cache: false,
            search: mvc.tokenSafe(query),
            });
            //attente que la requete retourne des données et traitement du schéma
            omni_kv.on('search:done', function (properties) {
    log(properties,'omni_kv search:done');

    if (dashboardType == 'add') {
        sendSavesearchThenShowOkMsg(
            'Information',
            'Mise &agrave; jour de la base des downtimes OK',
            closingWindowLink
        );
    } else if (dashboardType == 'update' || dashboardType == 'delete')  {
        sendSavesearchThenShowOkMsg(
            'Information',
            'Mise &agrave; jour de la base des downtimes OK',
            goToConsultLink
        );
    } else {
        log('ERREUR DE dashboardType:' + dashboardType);
    }
            });
        }
        }
    }
        /* Lance la requete demise a jour de l'index quotidien */
        /* des downtimes et renvois le resultats dans un       */
        /* modal pop-up                                        */
    function sendSavesearchThenShowOkMsg(header, content, footer) {

    log([header, content, footer],'in : sendSavesearchThenShowOkMsg');
        loadSpinnerChangeMsg('Mise à jour 50%');
        applySleep(1000); //attendre que le lookup applique la maj et soit utilisable
        // var epoc = new Date().getTime();
        // var updateQuery = '|savedsearch "Downtime_V2_update_index"';
        // var updateIndex = new SearchManager({
        // id: 'updateQuery' + epoc,
        // preview: false,
        // cache: false,
        // search: mvc.tokenSafe(updateQuery),
        // });
        // updateIndex.on('search:done', function (properties) {
        loadSpinnerChangeMsg('Mise à jour 100%');
        $('#modal_popup').modal({
            escapeClose: false,
            clickClose: false,
            showClose: false,
        });
        setToken('modal_header', header);
        setToken('modal_content', content);
        setToken('modal_footer', footer);
        $('#modal_link')[0].click();
        loadSpinnerState('OFF');
        // });
    }/* OMNI_DONE */

    function getStepOpt(){
        var tokenValue = getToken("step_opt_for_delete");
        if(isNotNull(tokenValue)){
            return tokenValue;
        }   
        var serviceToken, kpiToken,entityToken;
        serviceToken = getToken('service_type');
        kpiToken = getToken('kpi_type');
        entityToken = getToken('entity_type');
        if(isNotNull(serviceToken) && isNotNull(kpiToken) && isNotNull(entityToken)){
            return serviceToken.toString() 
                    + kpiToken.toString()
                    + entityToken.toString();

        }
        return "000";
    }

        /* Fonction de log dans la console javascript */
    function log(obj, titre = '', level = 0) {
        var debug = 1;
        //var debug = debugMode || 1;
        if (debug == 1) {
            tag = '';
            if(isNotNull(LOGTITLE)){
                tag += LOGTITLE + ' ';
            }
            var color;
            var tag;
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
            console.groupEnd();
        }
        
    }/* OMNI_DONE */

        /* fonction de formatage de chaine de  */
        /* caractere pour le KVstore omni_kv */
    function transformStringForKV(value) {
        try{
        value = value.replace(',', ';');
        value = value.replace('%', '*');
        }catch(error){
    log(value,'transformStringForKV error');
        }
        return value;
    }/* OMNI_DONE */

        /* fonction de création d'id unique */
    function createID() {
        log('','in : createID');
        const crypto = window.crypto || window.msCrypto;
        var array = new Uint32Array(1);
        crypto.getRandomValues(array)
        return (Date.now().toString(36) + crypto.getRandomValues(array).toString(36).substr(2, 5)).toUpperCase();
    }/* OMNI_DONE */

        /* Fonction qui applique une expression réguliere a une adresse email pour tester sa validité  */
    function checkEmail(email) {
        const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    }/* OMNI_DONE */

        /* Fonction applySleep pour empecher que les query  */
        /* ai le même epoctime et que le epoctime soit */
        /* l'identifiant unique d'un downtime          */
    function applySleep(milliseconds) {
        log(milliseconds,'in : applySleep');
        var start = new Date().getTime();
        for (var i = 0; i < 1e7; i++) {
        if (new Date().getTime() - start > milliseconds) {
            break;
        }
        }
    }/* OMNI_DONE */

        /* Fonction de formatage des data en forme de TAG */
    function transformInVisualTags(itemString){
        //log(itemString,'in transformInVisualTags');
        try{
        if(isNull(itemString)){
            return '';
        }
        // if (typeof itemString === 'string' || itemString instanceof String){
        //   log('transformInVisualTags: itemString is not a string');
        //   return '';
        // }else{

            if(itemString=='%'){
            itemString='Tous';
            }
            itemString = itemString.replace("\%","*");
            itemString = itemString.split(';');
            var outputString = '';

            for(let i=0; i < itemString.length ; i++){
            outputString += '<span class="description_item">'+itemString[i]+'</span>';
            }
            return outputString;
        // }
        }catch(error){
    log(error,'length error in transformInVisualTags');
        return '';
        }
    }/* OMNI_DONE */

        /* Fonction de remplacement des nom de jours français en anglais */
    function transformDaysToEnglish(text) {
        log(text,'in : transformDaysToEnglish');
        text = text.replace('Lundi', 'Monday');
        text = text.replace('Mardi', 'Tuesday');
        text = text.replace('Mercredi', 'Wednesday');
        text = text.replace('Jeudi', 'Thursday');
        text = text.replace('Vendredi', 'Friday');
        text = text.replace('Samedi', 'Saturday');
        text = text.replace('Dimanche', 'Sunday');
        return text;
    }/* OMNI_DONE */

        /* Fonction de validation du champs temps */
    function transformTimeFormat(timestr) {
    log(timestr,'in : transformTimeFormat');
        var regex = /^24:00|((([01][0-9])|(2[0-3])):[0-5][0-9])$/;
        return regex.test(timestr);
    }/* OMNI_DONE */

        /* Test si la date de début est plus petite que la date de fin */
    function checkEndHourBiggerThanBegin(dayBegin, dayEnd, begin, end) {
        log([dayBegin, dayEnd, begin, end],'in : checkEndHourBiggerThanBegin');
        if (String(dayBegin) == String(dayEnd)) {
        var beginSplit = begin.split(':');
        var endSplit = end.split(':');

        var dateBegin = new Date(
            parseInt('2001', 10),
            parseInt('01', 10) - 1,
            parseInt('01', 10),
            parseInt(beginSplit[0], 10),
            parseInt(beginSplit[1], 10),
            parseInt('00', 10)
        );
        var dateEnd = new Date(
            parseInt('2001', 10),
            parseInt('01', 10) - 1,
            parseInt('01', 10),
            parseInt(endSplit[0], 10),
            parseInt(endSplit[1], 10),
            parseInt('00', 10)
        );
        var valueBegin = dateBegin.valueOf();
        var valueEnd = dateEnd.valueOf();
        log(valueBegin,'checkEndHourBiggerThanBegin valueBegin');
        log(valueEnd,'checkEndHourBiggerThanBegin valueEnd');
        log(valueBegin > valueEnd,'checkEndHourBiggerThanBegin valueBegin > valueEnd');
        return (valueBegin > valueEnd) // la fin est plus petite que le debut 'ERREUR'
        } else {
        return false; // la date de debut et de fin sont differente le check ne s'applique pas
        }
    }/* OMNI_DONE */

        /* Fonction de configuration des datepicker */
    function applyDatepickerUI(minDate=getTodayDate(),div='') {
        log(minDate,'in : applyDatepickerUI');
        var dateFormat = 'yy-mm-dd';
        var from = $(div+'[id^=datepicker_begin]')
        .datepicker({
            defaultDate: 'w',
            changeMonth: true,
            numberOfMonths: 1,
            dateFormat: dateFormat,
            minDate: 0,
        })
        .on('change', function () {
            to.datepicker('option', 'minDate', getDate(this));
        });
        var to = $('[id^=datepicker_end]')
        .datepicker({
            defaultDate: 'w',
            changeMonth: true,
            numberOfMonths: 1,
            dateFormat: dateFormat,
            minDate: 0,
        })
        .on('change', function () {
            from.datepicker('option', 'maxDate', getDate(this));
        });
    }/* OMNI_DONE */

        /* Fonction qui renvoie la date d'un datePicker */
    function getDate(element) {
        log(element, 'in : getDate');
        var date;
        try {
        date = $.datepicker.parseDate(dateFormat, element.value);
        } catch (error) {
        date = null;
        }
        return date;
    }/* OMNI_DONE */

        /* fonction qui renvoi la date d'aurjourd'hui */
    function getTodayDate() {
        var today = new Date();
        var dd = String(today.getDate()).padStart(2, '0');
        /* le mois de janvier est egal a 0 */
        var mm = String(today.getMonth() + 1).padStart(2, '0'); 
        var yy = today.getFullYear();
        return yy + '-' + mm + '-' + dd;
    }/* OMNI_DONE */

        /* Fonction qui ajoute un texte arg 3      */
        /* si le texte en arg2 et trouvé dans arg1 */
    function matchDays(text, day, result) {
        log([text, day, result],'in : matchDays');
        var found = [];
        found = text.match(day);
        try {
        if (isNotNull(found)) {
            if (found[0] == day) {
            return result;
            }
        }
        } catch (error) {
        return '';
        }
    }/* OMNI_DONE */

        /* Fonction permettant de definir un token */
    function setToken(tokenName,tokenValue,updateForm=false){
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
    }/* OMNI_DONE */

        /* Fonction permettant de vider un token et de l'effacer */
    function unsetToken(tokenName){
        var defaultTokenModel = mvc.Components.get('default', {
        create: true,
        });
        var submittedTokenModel = mvc.Components.getInstance('submitted', {
        create: true,
        });
        defaultTokenModel.unset(tokenName);
        submittedTokenModel.unset(tokenName);
    }/* OMNI_DONE */

        /* Fonction permettant recuperer la valeur d'un token */
    function getToken(tokenName){
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
    }/* OMNI_DONE */

        /* Fonction qui retourne True si la variable n'est pas null */
    function isNotNull(variable){
        return !isNull(variable);
    }/* OMNI_DONE */

        /* Fonction qui retourne True si la variable est null */
    function isNull(variable){
        try{
        return(is_empty(variable) || is_null(variable) || is_undefined(variable) || is_false(variable) || is_zero(variable) || is_NaN(variable) );
        }catch(error){
        return true;
    }
    }/* OMNI_DONE */

    function is_empty(variable){
        return variable === "" && typeof variable === "string";
    }/* OMNI_DONE */

    function is_null(variable){
        return variable === null;
    }/* OMNI_DONE */

    function is_undefined(variable){
        return variable === undefined && typeof variable === "undefined";
    }/* OMNI_DONE */

    function is_false(variable){
        return variable === false && typeof variable === "boolean";
    }/* OMNI_DONE */

    function is_zero(variable){
        return variable === 0 && typeof variable === "number";
    }/* OMNI_DONE */

    function is_NaN(variable){
        return !parseFloat(variable) && variable != 0 && typeof variable === "number";
    }/* OMNI_DONE */

        /* Fonction qui retire les accents d'une chaine de caractere */
        /* et la remplace pas sa version sans accents                */
        /* puis retire les caracteres spéciaux restant               */
        /* et les remplace par un espace                             */
    function transformAccents(text){
        log(text,'in : transformAccents');
            
            var find = [
                'à',
                'á',
                'â',
                'ã',
                'ä',
                'ç',
                'è',
                'é',
                'ê',
                'ë',
                'ì',
                'í',
                'î',
                'ï',
                'ñ',
                'ò',
                'ó',
                'ô',
                'õ',
                'ö',
                'ù',
                'ú',
                'û',
                'ü',
                'ý',
                'ÿ',
                'À',
                'Á',
                'Â',
                'Ã',
                'Ä',
                'Ç',
                'È',
                'É',
                'Ê',
                'Ë',
                'Ì',
                'Í',
                'Î',
                'Ï',
                'Ñ',
                'Ò',
                'Ó',
                'Ô',
                'Õ',
                'Ö',
                'Ù',
                'Ú',
                'Û',
                'Ü',
                'Ý',
            ];
            var replace = [
                'a',
                'a',
                'a',
                'a',
                'a',
                'c',
                'e',
                'e',
                'e',
                'e',
                'i',
                'i',
                'i',
                'i',
                'n',
                'o',
                'o',
                'o',
                'o',
                'o',
                'u',
                'u',
                'u',
                'u',
                'y',
                'y',
                'A',
                'A',
                'A',
                'A',
                'A',
                'C',
                'E',
                'E',
                'E',
                'E',
                'I',
                'I',
                'I',
                'I',
                'N',
                'O',
                'O',
                'O',
                'O',
                'O',
                'U',
                'U',
                'U',
                'U',
                'Y',
            ];
            var regex;
            var regex2;
            var replaceString = '';

            for (var i = 0; i < find.length; i++) {
                regex = new RegExp(find[i], 'g');
                replaceString = text.replace(regex, replace[i]);
            }
            regex2 = new RegExp('[^a-zA-Z0-9_-]', 'g');
            replaceString = replaceString.replace(regex2, ' ');
            replaceString = replaceString.toLowerCase();
            replaceString = replaceString.trim();
            return replaceString;
    }/* OMNI_DONE */

        /* Fonction de gestion du logo de chargement  */
        /* utiliser pendant le temps de lancement des */
        /* requetes SPL pour la mise a jourdu KVstore */
    function loadSpinnerState(state){
        log(state,'in : loadSpinnerState');
        if ($('#loadSpinner').length == 0) {
            console.log(
                '%c %s',
                'background: #222; color: #FF0000',
                'loadSpinner appelé mais <div id="loadSpinner" loading_msg="" circle_color=""  /> inexistante'
            );
            return;
        }

        if (state == 'ON') {
            if ($('#loadSpinner_circle').length != 0) {
                return;
            }
            var msg = $('#loadSpinner').attr('loading_msg');
            if (msg.length == 0 || msg == undefined) {
                msg = 'Chargement en cours';
            }
            var color = $('#loadSpinner').attr('circle_color');
            if (color.length == 0 || color == undefined) {
                color = '#FF0000';
            }
            var style = ''
                + '#loadSpinner_circle {'
                + 'margin: 0 auto;'
                + 'border: 5px solid transparent;'
                + 'border-top: 5px solid '
                + color
                + ';'
                + 'border-radius: 50%;'
                + 'width: 50px;'
                + 'height: 50px;'
                + 'animation: spin 1s linear infinite;'
                + '}'
                + '@keyframes spin {'
                + '0% { transform: rotate(0deg); }'
                + '100% { transform: rotate(360deg); }'
                + '}'
                + '.progress-bar{'
                + 'visibility: hidowntimeListDataen!important;'
                + '}';
            $('#loadSpinner').append('<style>' + style + '</style>');
            $('#loadSpinner').append(
                '<center><div id="loadSpinner_msg">' + msg + '</div></center>'
            );
            $('#loadSpinner').append(
                '<center><div id="loadSpinner_circle"/></center>'
            );
        } else {
            $('#loadSpinner').html('');
        }
    }/* OMNI_DONE */

        /* Fonction permettant de changer le message */
        /* dans le div du logo de chargement         */
    function loadSpinnerChangeMsg(text){
        log(text,'in : loadSpinnerChangeMsg');
        if ($('#loadSpinner_msg').length != 0) {
        $('#loadSpinner_msg').html(text);
        }
    }/* OMNI_DONE */

});
}); /* fin du require */ 
